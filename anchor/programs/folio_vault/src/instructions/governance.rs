//! Strategy changes by holder vote, and the gas tank that pays the keeper.
//!
//! propose (curator, posts a SOL bond) → vote (holders, weight = shares held when proposed)
//! → finalize (anyone, after voting) → passed: 48 h timelock, during which dissenters can redeem
//! as always → execute (anyone): new weights and plan go live and the bond moves to the gas tank.
//! Rejected: the bond goes back to the curator.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use super::manager::{validate_plan, validate_targets};
use super::{GasFunded, PlanPosted, ProposalCreated, ProposalFinalized, VoteCast};
use crate::errors::FolioError;
use crate::state::*;

/// Moves lamports out of an account this program owns.
fn move_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    **from.try_borrow_mut_lamports()? = from.lamports().checked_sub(amount).ok_or(FolioError::Overflow)?;
    **to.try_borrow_mut_lamports()? = to.lamports().checked_add(amount).ok_or(FolioError::Overflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct Propose<'info> {
    #[account(mut)]
    pub manager: Signer<'info>,
    #[account(seeds = [REGISTRY_SEED], bump = registry.bump)]
    pub registry: Box<Account<'info, Registry>>,
    #[account(mut, has_one = manager @ FolioError::NotManager, has_one = registry)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        init,
        payer = manager,
        space = 8 + Proposal::INIT_SPACE,
        seeds = [PROPOSAL_SEED, vault.key().as_ref(), &vault.proposal_count.to_le_bytes()],
        bump,
    )]
    pub proposal: Box<Account<'info, Proposal>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_propose(
    ctx: Context<Propose>,
    targets: Vec<Target>,
    plan: String,
    voting_days: u8,
    bond: u64,
) -> Result<()> {
    validate_plan(&plan)?;
    validate_targets(&ctx.accounts.registry, &targets)?;
    require!(
        (MIN_VOTING_DAYS..=MAX_VOTING_DAYS).contains(&voting_days),
        FolioError::InvalidVotingPeriod
    );
    require!(bond >= MIN_PROPOSAL_BOND, FolioError::BondTooSmall);
    let vault = &ctx.accounts.vault;
    require!(vault.state == VaultState::Active, FolioError::WrongState);
    require!(vault.open_proposal == 0, FolioError::ProposalAlreadyOpen);

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.manager.to_account_info(),
                to: ctx.accounts.proposal.to_account_info(),
            },
        ),
        bond,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let vault_key = vault.key();
    let id = vault.proposal_count;
    let p = &mut ctx.accounts.proposal;
    p.vault = vault_key;
    p.id = id;
    p.proposer = ctx.accounts.manager.key();
    p.targets = targets.clone();
    p.plan = plan.clone();
    p.created_at = now;
    p.voting_ends_at = now + voting_days as i64 * DAY;
    p.timelock_ends_at = 0;
    p.total_shares = vault.total_shares;
    p.yes_votes = 0;
    p.no_votes = 0;
    p.bond = bond;
    p.status = ProposalStatus::Voting;
    p.bump = ctx.bumps.proposal;
    let voting_ends_at = p.voting_ends_at;

    let vault = &mut ctx.accounts.vault;
    vault.proposal_count += 1;
    vault.open_proposal = id + 1;

    emit!(ProposalCreated { vault: vault_key, proposal: p.key(), id, targets, plan, voting_ends_at, bond });
    Ok(())
}

#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut, has_one = vault)]
    pub proposal: Box<Account<'info, Proposal>>,
    #[account(
        seeds = [POSITION_SEED, vault.key().as_ref(), voter.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == voter.key() @ FolioError::NoVotingPower,
    )]
    pub position: Box<Account<'info, Position>>,
    #[account(
        init,
        payer = voter,
        space = 8 + VoteRecord::INIT_SPACE,
        seeds = [VOTE_SEED, proposal.key().as_ref(), voter.key().as_ref()],
        bump,
    )]
    pub vote_record: Box<Account<'info, VoteRecord>>,
    pub system_program: Program<'info, System>,
}

/// One vote per holder, weighted by the shares they held when the proposal was made (deposits
/// after that do not count, so nobody can buy a vote). Not voting counts as neither.
pub fn handle_vote(ctx: Context<Vote>, approve: bool) -> Result<()> {
    let p = &ctx.accounts.proposal;
    let vault = &ctx.accounts.vault;
    require!(p.status == ProposalStatus::Voting, FolioError::VotingClosed);
    require!(vault.open_proposal == p.id + 1, FolioError::VotingClosed);
    require!(Clock::get()?.unix_timestamp < p.voting_ends_at, FolioError::VotingClosed);
    let weight = ctx.accounts.position.voting_power(vault.open_proposal);
    require!(weight > 0, FolioError::NoVotingPower);

    let p = &mut ctx.accounts.proposal;
    if approve {
        p.yes_votes = p.yes_votes.checked_add(weight).ok_or(FolioError::Overflow)?;
    } else {
        p.no_votes = p.no_votes.checked_add(weight).ok_or(FolioError::Overflow)?;
    }
    let r = &mut ctx.accounts.vote_record;
    r.proposal = p.key();
    r.voter = ctx.accounts.voter.key();
    r.approve = approve;
    r.weight = weight;
    r.bump = ctx.bumps.vote_record;

    emit!(VoteCast { vault: vault.key(), proposal: p.key(), voter: r.voter, approve, weight });
    Ok(())
}

#[derive(Accounts)]
pub struct Finalize<'info> {
    #[account(mut)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut, has_one = vault)]
    pub proposal: Box<Account<'info, Proposal>>,
    /// CHECK: receives the bond back if rejected; must be the proposer.
    #[account(mut, address = proposal.proposer @ FolioError::WrongProposer)]
    pub proposer: UncheckedAccount<'info>,
}

/// Anyone may close the vote once its period is over. Passes with a 20% quorum of the shares that
/// existed when proposed and more yes than no; then the timelock starts. Otherwise the bond is
/// refunded and the vault keeps its current strategy.
pub fn handle_finalize(ctx: Context<Finalize>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let p = &ctx.accounts.proposal;
    require!(p.status == ProposalStatus::Voting, FolioError::WrongProposalStatus);
    require!(now >= p.voting_ends_at, FolioError::VotingStillOpen);

    let passed = p.passed();
    let (yes, no, bond) = (p.yes_votes, p.no_votes, p.bond);
    let p_info = ctx.accounts.proposal.to_account_info();
    let p = &mut ctx.accounts.proposal;
    if passed {
        p.status = ProposalStatus::Queued;
        p.timelock_ends_at = now + TIMELOCK_SECS;
    } else {
        p.status = ProposalStatus::Rejected;
        p.bond = 0;
        move_lamports(&p_info, &ctx.accounts.proposer.to_account_info(), bond)?;
        ctx.accounts.vault.open_proposal = 0;
    }
    let timelock_ends_at = p.timelock_ends_at;
    emit!(ProposalFinalized {
        vault: ctx.accounts.vault.key(),
        proposal: p.key(),
        passed,
        yes_votes: yes,
        no_votes: no,
        timelock_ends_at,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Execute<'info> {
    #[account(mut)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut, has_one = vault)]
    pub proposal: Box<Account<'info, Proposal>>,
}

/// Anyone may apply a passed proposal once the timelock is over. The bond pays for the keeper's
/// rebalances under the new strategy, and the next keeper run starts a new cycle immediately.
pub fn handle_execute(ctx: Context<Execute>) -> Result<()> {
    let p = &ctx.accounts.proposal;
    require!(p.status == ProposalStatus::Queued, FolioError::WrongProposalStatus);
    require!(Clock::get()?.unix_timestamp >= p.timelock_ends_at, FolioError::TimelockActive);

    let bond = p.bond;
    let (targets, plan) = (p.targets.clone(), p.plan.clone());
    move_lamports(&ctx.accounts.proposal.to_account_info(), &ctx.accounts.vault.to_account_info(), bond)?;
    let p = &mut ctx.accounts.proposal;
    p.status = ProposalStatus::Executed;
    p.bond = 0;

    let vault = &mut ctx.accounts.vault;
    vault.targets = targets.clone();
    vault.plan = plan.clone();
    vault.plan_version += 1;
    vault.open_proposal = 0;
    vault.cycle_start = 0;
    vault.gas_tank = vault.gas_tank.checked_add(bond).ok_or(FolioError::Overflow)?;

    emit!(PlanPosted { vault: vault.key(), version: vault.plan_version, plan, targets });
    emit!(GasFunded { vault: vault.key(), amount: bond, gas_tank: vault.gas_tank });
    Ok(())
}

#[derive(Accounts)]
pub struct FundGas<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,
    #[account(mut)]
    pub vault: Box<Account<'info, Vault>>,
    pub system_program: Program<'info, System>,
}

/// Anyone (normally the curator, at launch) may top up the gas tank that pays the keeper.
pub fn handle_fund_gas(ctx: Context<FundGas>, amount: u64) -> Result<()> {
    require!(amount > 0, FolioError::Overflow);
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer { from: ctx.accounts.funder.to_account_info(), to: ctx.accounts.vault.to_account_info() },
        ),
        amount,
    )?;
    let vault = &mut ctx.accounts.vault;
    vault.gas_tank = vault.gas_tank.checked_add(amount).ok_or(FolioError::Overflow)?;
    emit!(GasFunded { vault: vault.key(), amount, gas_tank: vault.gas_tank });
    Ok(())
}

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use super::{Seeded, StateChanged, VaultCreated};
use crate::errors::FolioError;
use crate::state::*;

#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [REGISTRY_SEED], bump = registry.bump)]
    pub registry: Account<'info, Registry>,
    #[account(
        init,
        payer = payer,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, registry.key().as_ref(), &registry.vault_count.to_le_bytes()],
        bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(address = registry.settlement_mint)]
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = settlement_mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_settlement: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Open to anyone: a new vault is a `Draft` and takes only the seed until the guardian activates it.
pub fn handle_create_vault(ctx: Context<CreateVault>, name: String, manager: Pubkey) -> Result<()> {
    require!(!name.is_empty() && name.len() <= MAX_NAME_LENGTH, FolioError::InvalidName);
    let registry = &mut ctx.accounts.registry;
    let v = &mut ctx.accounts.vault;
    v.registry = registry.key();
    v.index = registry.vault_count;
    v.manager = manager;
    v.settlement_mint = registry.settlement_mint;
    v.name = name.clone();
    v.state = VaultState::Draft;
    v.total_shares = 0;
    v.plan = String::new();
    v.plan_version = 0;
    v.held = vec![registry.settlement_mint];
    v.bump = ctx.bumps.vault;
    registry.vault_count += 1;
    emit!(VaultCreated { vault: v.key(), index: v.index, manager, name });
    Ok(())
}

#[derive(Accounts)]
pub struct Seed<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(mut, has_one = settlement_mint)]
    pub vault: Account<'info, Vault>,
    #[account(
        init_if_needed,
        payer = investor,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = settlement_mint, token::authority = investor)]
    pub investor_settlement: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = settlement_mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_settlement: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

/// First deposit. 1 share = 1 settlement token by convention. Anyone can seed.
pub fn handle_seed(ctx: Context<Seed>, amount: u64) -> Result<()> {
    require!(ctx.accounts.vault.state == VaultState::Draft, FolioError::WrongState);
    let decimals = ctx.accounts.settlement_mint.decimals;

    // Count what actually arrived, so a token that takes a fee cannot mint unbacked shares.
    let before = ctx.accounts.vault_settlement.amount;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.investor_settlement.to_account_info(),
                mint: ctx.accounts.settlement_mint.to_account_info(),
                to: ctx.accounts.vault_settlement.to_account_info(),
                authority: ctx.accounts.investor.to_account_info(),
            },
        ),
        amount,
        decimals,
    )?;
    ctx.accounts.vault_settlement.reload()?;
    let received = ctx.accounts.vault_settlement.amount - before;
    let min_seed = MIN_SEED_UNITS * 10u64.pow(decimals as u32);
    require!(received >= min_seed, FolioError::BelowMinimumSeed);

    let shares = received - DEAD_SHARES;
    let vault_key = ctx.accounts.vault.key();
    let investor_key = ctx.accounts.investor.key();
    let position = &mut ctx.accounts.position;
    position.vault = vault_key;
    position.owner = investor_key;
    position.shares += shares;
    position.bump = ctx.bumps.position;

    let vault = &mut ctx.accounts.vault;
    vault.total_shares = received; // DEAD_SHARES are counted but belong to nobody
    set_state(vault, vault_key, VaultState::Seeded);
    emit!(Seeded { vault: vault_key, investor: investor_key, amount: received, shares });
    Ok(())
}

#[derive(Accounts)]
pub struct GuardianOnly<'info> {
    pub guardian: Signer<'info>,
    #[account(seeds = [REGISTRY_SEED], bump = registry.bump, has_one = guardian @ FolioError::NotGuardian)]
    pub registry: Account<'info, Registry>,
    #[account(mut, has_one = registry)]
    pub vault: Account<'info, Vault>,
}

fn transition(ctx: Context<GuardianOnly>, from: VaultState, to: VaultState) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    require!(vault.state == from, FolioError::WrongState);
    let key = vault.key();
    set_state(vault, key, to);
    Ok(())
}

/// Opens the vault to outside investors.
pub fn handle_activate(ctx: Context<GuardianOnly>) -> Result<()> {
    transition(ctx, VaultState::Seeded, VaultState::Active)
}

/// Emergency brake: stops deposits and manager trades. Redemption keeps working.
pub fn handle_pause(ctx: Context<GuardianOnly>) -> Result<()> {
    transition(ctx, VaultState::Active, VaultState::Paused)
}

pub fn handle_unpause(ctx: Context<GuardianOnly>) -> Result<()> {
    transition(ctx, VaultState::Paused, VaultState::Active)
}

pub fn set_state(vault: &mut Vault, key: Pubkey, to: VaultState) {
    emit!(StateChanged { vault: key, from: vault.state, to });
    vault.state = to;
}

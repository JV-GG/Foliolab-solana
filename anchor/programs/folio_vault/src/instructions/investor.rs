use anchor_lang::prelude::*;
use solana_instructions_sysvar as ix_sysvar;
use anchor_spl::token::Token;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use super::holdings::{load_holdings, read_token_account, vault_value};
use super::{Deposited, Redeemed};
use crate::errors::FolioError;
use crate::prices::{check_prices, PriceUpdate};
use crate::state::*;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(seeds = [REGISTRY_SEED], bump = registry.bump)]
    pub registry: Box<Account<'info, Registry>>,
    #[account(mut, has_one = registry, has_one = settlement_mint)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        init_if_needed,
        payer = investor,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump,
    )]
    pub position: Box<Account<'info, Position>>,
    pub settlement_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = settlement_mint, token::authority = investor)]
    pub investor_settlement: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = settlement_mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_settlement: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    /// CHECK: the instructions sysvar, checked by address.
    #[account(address = ix_sysvar::ID)]
    pub instructions: UncheckedAccount<'info>,
}

/// Buy shares at the fair price. The USDC stays in the vault as idle cash until the manager
/// invests it.
pub fn handle_deposit<'info>(
    ctx: Context<'info, Deposit<'info>>,
    amount: u64,
    min_shares: u64,
    prices: PriceUpdate,
) -> Result<()> {
    let a = &ctx.accounts;
    require!(a.vault.state == VaultState::Active, FolioError::WrongState);
    check_prices(&prices, &a.registry.key(), &a.registry, &a.instructions.to_account_info())?;

    // Valued before the deposit arrives, so the newcomer buys in at the current price.
    let holdings = load_holdings(&a.vault.key(), &a.vault, ctx.remaining_accounts, 2)?;
    let value_before = vault_value(&prices, &a.vault.settlement_mint, &holdings)?;
    require!(value_before > 0, FolioError::EmptyVault);

    let before = a.vault_settlement.amount;
    transfer_checked(
        CpiContext::new(
            a.token_program.key(),
            TransferChecked {
                from: a.investor_settlement.to_account_info(),
                mint: a.settlement_mint.to_account_info(),
                to: a.vault_settlement.to_account_info(),
                authority: a.investor.to_account_info(),
            },
        ),
        amount,
        a.settlement_mint.decimals,
    )?;
    ctx.accounts.vault_settlement.reload()?;
    let received = ctx.accounts.vault_settlement.amount - before;

    let shares = (received as u128)
        .checked_mul(ctx.accounts.vault.total_shares as u128)
        .ok_or(FolioError::Overflow)?
        / value_before;
    let shares = u64::try_from(shares).map_err(|_| FolioError::Overflow)?;
    require!(shares > 0, FolioError::ZeroShares);
    require!(shares >= min_shares, FolioError::SlippageTooHigh);

    let vault_key = ctx.accounts.vault.key();
    let investor_key = ctx.accounts.investor.key();
    let open_proposal = ctx.accounts.vault.open_proposal;
    let position = &mut ctx.accounts.position;
    position.vault = vault_key;
    position.owner = investor_key;
    position.snapshot_before_deposit(open_proposal);
    position.shares = position.shares.checked_add(shares).ok_or(FolioError::Overflow)?;
    position.bump = ctx.bumps.position;
    let vault = &mut ctx.accounts.vault;
    vault.total_shares = vault.total_shares.checked_add(shares).ok_or(FolioError::Overflow)?;

    emit!(Deposited {
        vault: vault_key,
        investor: investor_key,
        amount: received,
        shares,
        vault_value: u64::try_from(value_before).unwrap_or(u64::MAX),
        price_timestamp: prices.timestamp,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub owner: Signer<'info>,
    #[account(mut)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        mut,
        seeds = [POSITION_SEED, vault.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner,
    )]
    pub position: Box<Account<'info, Position>>,
    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
}

/// Burn shares and receive the same percentage of every held asset, idle USDC included. No price
/// is used, and no state blocks it: exit is always open. Mints in `forfeit` are skipped and the
/// caller's slice stays for the remaining holders: the escape hatch for a token that cannot move
/// (frozen by its issuer, say), so it never blocks exit.
pub fn handle_redeem<'info>(
    ctx: Context<'info, Redeem<'info>>,
    shares: u64,
    forfeit: Vec<Pubkey>,
) -> Result<()> {
    require!(shares > 0, FolioError::NothingToRedeem);
    require!(ctx.accounts.position.shares >= shares, FolioError::InsufficientShares);
    let vault = &ctx.accounts.vault;
    let supply = vault.total_shares;
    require!(supply > 0, FolioError::NothingToRedeem);
    require!(ctx.remaining_accounts.len() == vault.held.len() * 3, FolioError::HeldAccountsMismatch);

    let holdings = load_holdings(&vault.key(), vault, ctx.remaining_accounts, 3)?;
    let mut mints = Vec::with_capacity(holdings.len());
    let mut amounts = Vec::with_capacity(holdings.len());
    for h in &holdings {
        mints.push(*h.mint.key);
        let amount = if forfeit.contains(h.mint.key) {
            0
        } else {
            ((h.amount as u128) * (shares as u128) / (supply as u128)) as u64
        };
        amounts.push(amount);
    }

    // Burn first.
    ctx.accounts.position.shares -= shares;
    ctx.accounts.vault.total_shares -= shares;

    let vault = &ctx.accounts.vault;
    let index_bytes = vault.index.to_le_bytes();
    let seeds: &[&[u8]] = crate::vault_seeds!(vault, index_bytes);
    for (i, h) in holdings.iter().enumerate() {
        if amounts[i] == 0 {
            continue;
        }
        let recipient = &ctx.remaining_accounts[i * 3 + 2];
        require_keys_eq!(read_token_account(recipient)?.mint, *h.mint.key, FolioError::WrongRecipientAccount);
        // `load_holdings` checked the mint is owned by one of the two token programs.
        let program = *h.mint.owner;
        transfer_checked(
            CpiContext::new_with_signer(
                program,
                TransferChecked {
                    from: h.account.clone(),
                    mint: h.mint.clone(),
                    to: recipient.clone(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            amounts[i],
            h.decimals,
        )?;
    }

    emit!(Redeemed {
        vault: ctx.accounts.vault.key(),
        investor: ctx.accounts.owner.key(),
        shares,
        mints,
        amounts,
    });
    Ok(())
}

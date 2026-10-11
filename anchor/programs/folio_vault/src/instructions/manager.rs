use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use solana_instructions_sysvar as ix_sysvar;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use super::holdings::{load_holdings, read_token_account, value_of};
use super::{PlanPosted, Rebalanced};
use crate::errors::FolioError;
use crate::prices::{check_prices, PriceUpdate};
use crate::state::*;

#[derive(Accounts)]
pub struct ManagerOnly<'info> {
    pub manager: Signer<'info>,
    #[account(mut, has_one = manager @ FolioError::NotManager)]
    pub vault: Account<'info, Vault>,
}

/// Publish (or replace) the investment plan. Any text; investors read it and decide.
pub fn handle_set_plan(ctx: Context<ManagerOnly>, text: String) -> Result<()> {
    require!(!text.is_empty() && text.len() <= MAX_PLAN_LENGTH, FolioError::InvalidPlanLength);
    let vault = &mut ctx.accounts.vault;
    vault.plan = text.clone();
    vault.plan_version += 1;
    emit!(PlanPosted { vault: vault.key(), version: vault.plan_version, plan: text });
    Ok(())
}

#[derive(Accounts)]
pub struct Rebalance<'info> {
    #[account(mut)]
    pub manager: Signer<'info>,
    #[account(seeds = [REGISTRY_SEED], bump = registry.bump)]
    pub registry: Box<Account<'info, Registry>>,
    #[account(mut, has_one = manager @ FolioError::NotManager, has_one = registry)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mint::token_program = sell_token_program)]
    pub sell_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mint::token_program = buy_token_program)]
    pub buy_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = sell_mint,
        associated_token::authority = vault,
        associated_token::token_program = sell_token_program,
    )]
    pub vault_sell: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = manager,
        associated_token::mint = buy_mint,
        associated_token::authority = vault,
        associated_token::token_program = buy_token_program,
    )]
    pub vault_buy: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: checked against the registry's router allowlist.
    #[account(executable)]
    pub router: UncheckedAccount<'info>,
    pub sell_token_program: Interface<'info, TokenInterface>,
    pub buy_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    /// CHECK: the instructions sysvar, checked by address.
    #[account(address = ix_sysvar::ID)]
    pub instructions: UncheckedAccount<'info>,
}

/// Swap one held token for another through an allowlisted swap program. The route data is opaque,
/// so the vault judges the trade only by its own accounts afterwards: it sold at most `max_sell`,
/// got at least `min_buy`, lost at most 2% of value at the signed prices, nothing else it holds
/// went down, and no held account gained a delegate, close authority or new owner.
pub fn handle_rebalance<'info>(
    ctx: Context<'info, Rebalance<'info>>,
    max_sell: u64,
    min_buy: u64,
    route_data: Vec<u8>,
    prices: PriceUpdate,
) -> Result<()> {
    let a = &ctx.accounts;
    let vault_key = a.vault.key();
    let sell = a.sell_mint.key();
    let buy = a.buy_mint.key();
    let settlement = a.vault.settlement_mint;

    require!(a.vault.state == VaultState::Active, FolioError::WrongState);
    require!(a.vault.plan_version > 0, FolioError::NoPlanPosted);
    require!(a.registry.is_router(a.router.key), FolioError::RouterNotAllowed);
    require!(sell != buy && a.registry.is_asset(&buy), FolioError::AssetNotAllowed);
    require!(a.vault.held.contains(&sell), FolioError::AssetNotHeld);
    check_prices(&prices, &a.registry.key(), &a.registry, &a.instructions.to_account_info())?;

    let held_len = a.vault.held.len() * 2;
    let holdings = load_holdings(&vault_key, &a.vault, ctx.remaining_accounts, 2)?;
    let route_accounts = &ctx.remaining_accounts[held_len..];
    let sell_before = a.vault_sell.amount;
    let buy_before = a.vault_buy.amount;

    // The vault PDA signs for the router, exactly where the route lists the vault.
    let metas: Vec<AccountMeta> = route_accounts
        .iter()
        .map(|ai| AccountMeta {
            pubkey: *ai.key,
            is_signer: ai.is_signer || *ai.key == vault_key,
            is_writable: ai.is_writable,
        })
        .collect();
    let mut infos: Vec<AccountInfo<'info>> = route_accounts.to_vec();
    infos.push(a.vault.to_account_info());
    let ix = Instruction { program_id: *a.router.key, accounts: metas, data: route_data };
    let index_bytes = a.vault.index.to_le_bytes();
    let seeds: &[&[u8]] = crate::vault_seeds!(a.vault, index_bytes);
    invoke_signed(&ix, &infos, &[seeds])?;

    ctx.accounts.vault_sell.reload()?;
    ctx.accounts.vault_buy.reload()?;
    let a = &ctx.accounts;
    let sell_after = a.vault_sell.amount;
    let buy_after = a.vault_buy.amount;
    require!(buy_after >= buy_before, FolioError::CollateralDecreased);
    let sold = sell_before.saturating_sub(sell_after);
    let bought = buy_after - buy_before;
    require!(sold <= max_sell, FolioError::SellExceeded);
    require!(bought > 0 && bought >= min_buy, FolioError::BuyTooLow);

    for h in &holdings {
        let now = read_token_account(&h.account)?;
        check_untouched_authority(&now, &vault_key)?;
        if *h.mint.key != sell && *h.mint.key != buy {
            require!(now.amount >= h.amount, FolioError::CollateralDecreased);
        }
    }
    check_untouched_authority(&a.vault_buy, &vault_key)?;
    check_untouched_authority(&a.vault_sell, &vault_key)?;

    // Value sold rounds up and value bought rounds down, so rounding never hides a loss.
    let value_sold = value_of(&prices, &settlement, &sell, a.sell_mint.decimals, sold, true)?;
    let value_bought = value_of(&prices, &settlement, &buy, a.buy_mint.decimals, bought, false)?;
    require!(
        value_bought * 10_000 >= value_sold * (10_000 - MAX_TRADE_LOSS_BPS),
        FolioError::TradeLossTooHigh
    );

    // Drop first, so a full vault can still swap one stock entirely into a new one.
    let dust = 10u64.pow(a.sell_mint.decimals as u32) / DUST_DIVISOR;
    let plan_version = a.vault.plan_version;
    let vault = &mut ctx.accounts.vault;
    if sell != settlement && sell_after <= dust {
        vault.held.retain(|m| *m != sell);
    }
    if !vault.held.contains(&buy) {
        require!(vault.held.len() < MAX_ASSETS, FolioError::TooManyAssets);
        vault.held.push(buy);
    }

    emit!(Rebalanced { vault: vault_key, sell_mint: sell, buy_mint: buy, sold, bought, plan_version });
    Ok(())
}

/// The vault PDA signed the route, so a router could have approved a delegate or handed over an
/// account without moving any balance. Refuse both.
fn check_untouched_authority(account: &TokenAccount, vault: &Pubkey) -> Result<()> {
    require_keys_eq!(account.owner, *vault, FolioError::AuthorityChanged);
    require!(account.delegate.is_none(), FolioError::AuthorityChanged);
    require!(account.close_authority.is_none(), FolioError::AuthorityChanged);
    Ok(())
}

//! Folio Lab on Solana: a pooled portfolio of tokenized stocks.
//!
//! Guarantees: the manager can trade but never withdraw; any holder can always withdraw their percentage of
//! every holding (even when paused); deposits never dilute existing holders.
//!
//! Design:
//! - One program. The registry and each vault are PDAs; anyone can `create_vault`.
//! - Shares are a per-investor `Position` account, not a token, so they cannot be transferred.
//! - Prices are signed by the backend with ed25519 and checked through the Ed25519 program's
//!   instruction, which must sit directly before ours in the same transaction.
//! - `rebalance` CPIs into an allowlisted swap program (Jupiter on mainnet, `mock_router` on
//!   devnet) with the vault PDA as signer, then checks every held balance and authority.
//!
//! V2, governed index: the curator fixes target weights before activation; only the keeper
//! rebalances, and only toward those weights, at most once per 12 h cycle, paid from the vault's
//! gas tank. Changing the weights takes a holder vote (snapshot-weighted, 20% quorum, majority),
//! then a 48 h timelock in which dissenters can redeem. The proposal's SOL bond is refunded if
//! rejected and funds the gas tank if executed.

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod prices;
pub mod state;

pub use errors::*;
pub use instructions::*;
pub use prices::*;
pub use state::*;

declare_id!("9PY9RRXQuMtHXDyvWNL5ohFrsSux5SLrJhhdtuBgLUJH");

#[program]
pub mod folio_vault {
    use super::*;

    // ---- governance

    pub fn initialize_registry(
        ctx: Context<InitializeRegistry>,
        guardian: Pubkey,
        price_signer: Pubkey,
    ) -> Result<()> {
        instructions::admin::handle_initialize_registry(ctx, guardian, price_signer)
    }

    pub fn set_asset(ctx: Context<AdminOnly>, mint: Pubkey, allowed: bool) -> Result<()> {
        instructions::admin::handle_set_asset(ctx, mint, allowed)
    }

    pub fn set_router(ctx: Context<AdminOnly>, program: Pubkey, allowed: bool) -> Result<()> {
        instructions::admin::handle_set_router(ctx, program, allowed)
    }

    pub fn set_guardian(ctx: Context<AdminOnly>, guardian: Pubkey) -> Result<()> {
        instructions::admin::handle_set_guardian(ctx, guardian)
    }

    pub fn set_price_signer(ctx: Context<AdminOnly>, signer: Pubkey) -> Result<()> {
        instructions::admin::handle_set_price_signer(ctx, signer)
    }

    pub fn set_keeper(ctx: Context<AdminOnly>, keeper: Pubkey) -> Result<()> {
        instructions::admin::handle_set_keeper(ctx, keeper)
    }

    // ---- lifecycle

    pub fn create_vault(ctx: Context<CreateVault>, name: String, manager: Pubkey) -> Result<()> {
        instructions::lifecycle::handle_create_vault(ctx, name, manager)
    }

    pub fn seed(ctx: Context<Seed>, amount: u64) -> Result<()> {
        instructions::lifecycle::handle_seed(ctx, amount)
    }

    pub fn activate(ctx: Context<GuardianOnly>) -> Result<()> {
        instructions::lifecycle::handle_activate(ctx)
    }

    pub fn pause(ctx: Context<GuardianOnly>) -> Result<()> {
        instructions::lifecycle::handle_pause(ctx)
    }

    pub fn unpause(ctx: Context<GuardianOnly>) -> Result<()> {
        instructions::lifecycle::handle_unpause(ctx)
    }

    // ---- investors

    /// remaining_accounts: for each held mint in `vault.held` order, `[mint, vault_token_account]`.
    pub fn deposit<'info>(
        ctx: Context<'info, Deposit<'info>>,
        amount: u64,
        min_shares: u64,
        prices: PriceUpdate,
    ) -> Result<()> {
        instructions::investor::handle_deposit(ctx, amount, min_shares, prices)
    }

    /// remaining_accounts: for each held mint in `vault.held` order,
    /// `[mint, vault_token_account, recipient_token_account]`.
    pub fn redeem<'info>(
        ctx: Context<'info, Redeem<'info>>,
        shares: u64,
        forfeit: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::investor::handle_redeem(ctx, shares, forfeit)
    }

    // ---- manager

    /// Plan text and target weights. Only before activation.
    pub fn set_strategy(ctx: Context<ManagerOnly>, text: String, targets: Vec<Target>) -> Result<()> {
        instructions::manager::handle_set_strategy(ctx, text, targets)
    }

    // ---- keeper

    /// remaining_accounts: first `[mint, vault_token_account]` for every held mint in `vault.held`
    /// order, then exactly the accounts the router instruction expects, in its order.
    pub fn rebalance<'info>(
        ctx: Context<'info, Rebalance<'info>>,
        max_sell: u64,
        min_buy: u64,
        route_data: Vec<u8>,
        prices: PriceUpdate,
    ) -> Result<()> {
        instructions::manager::handle_rebalance(ctx, max_sell, min_buy, route_data, prices)
    }

    // ---- governance

    pub fn propose(
        ctx: Context<Propose>,
        targets: Vec<Target>,
        plan: String,
        voting_days: u8,
        bond: u64,
    ) -> Result<()> {
        instructions::governance::handle_propose(ctx, targets, plan, voting_days, bond)
    }

    pub fn vote(ctx: Context<Vote>, approve: bool) -> Result<()> {
        instructions::governance::handle_vote(ctx, approve)
    }

    pub fn finalize(ctx: Context<Finalize>) -> Result<()> {
        instructions::governance::handle_finalize(ctx)
    }

    pub fn execute(ctx: Context<Execute>) -> Result<()> {
        instructions::governance::handle_execute(ctx)
    }

    pub fn fund_gas(ctx: Context<FundGas>, amount: u64) -> Result<()> {
        instructions::governance::handle_fund_gas(ctx, amount)
    }
}

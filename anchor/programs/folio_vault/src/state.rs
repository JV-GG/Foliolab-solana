use anchor_lang::prelude::*;

pub const REGISTRY_SEED: &[u8] = b"registry";
pub const VAULT_SEED: &[u8] = b"vault";
pub const POSITION_SEED: &[u8] = b"position";

/// Most tokens a vault may hold, USDC included. Every deposit and redeem loops over them.
pub const MAX_ASSETS: usize = 10;
pub const MAX_ALLOWED_ASSETS: usize = 32;
pub const MAX_ROUTERS: usize = 4;
/// Most a trade may lose against the signed prices, in basis points (2%).
pub const MAX_TRADE_LOSS_BPS: u128 = 200;
pub const MAX_PLAN_LENGTH: usize = 1000;
pub const MAX_NAME_LENGTH: usize = 32;
pub const MAX_PRICE_AGE: i64 = 60;
/// The cluster clock can trail wall time by a few seconds; the backend signs with wall time.
pub const MAX_CLOCK_SKEW: i64 = 30;
/// Shares locked forever at seed so total supply never returns to zero. Shares use the
/// settlement token's decimals, so with USDC this is 0.001 share.
pub const DEAD_SHARES: u64 = 1_000;
pub const MIN_SEED_UNITS: u64 = 10;
/// A stock left with at most 1/DUST_DIVISOR of one token after a sell counts as sold out.
pub const DUST_DIVISOR: u64 = 1_000_000;

#[account]
#[derive(InitSpace)]
pub struct Registry {
    /// Governance. Changes allowlists, guardian and price signer.
    pub admin: Pubkey,
    /// Can activate, pause and unpause vaults without a delay.
    pub guardian: Pubkey,
    /// ed25519 key the backend signs prices with.
    pub price_signer: Pubkey,
    /// The stablecoin every vault is seeded and subscribed in. Fixed at init.
    pub settlement_mint: Pubkey,
    #[max_len(MAX_ALLOWED_ASSETS)]
    pub assets: Vec<Pubkey>,
    #[max_len(MAX_ROUTERS)]
    pub routers: Vec<Pubkey>,
    pub vault_count: u64,
    pub bump: u8,
}

impl Registry {
    pub fn is_asset(&self, mint: &Pubkey) -> bool {
        *mint == self.settlement_mint || self.assets.contains(mint)
    }
    pub fn is_router(&self, program: &Pubkey) -> bool {
        self.routers.contains(program)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum VaultState {
    Draft,
    Seeded,
    Active,
    Paused,
    Closed,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub registry: Pubkey,
    pub index: u64,
    pub manager: Pubkey,
    pub settlement_mint: Pubkey,
    #[max_len(MAX_NAME_LENGTH)]
    pub name: String,
    pub state: VaultState,
    /// All shares in existence, DEAD_SHARES included.
    pub total_shares: u64,
    /// The manager's investment plan, free text. Informational only.
    #[max_len(MAX_PLAN_LENGTH)]
    pub plan: String,
    /// Bumped by every `set_plan`; 0 means no plan yet.
    pub plan_version: u64,
    /// Mints the vault holds. USDC is always first and never leaves.
    #[max_len(MAX_ASSETS)]
    pub held: Vec<Pubkey>,
    pub bump: u8,
}

/// Signer seeds for the vault PDA. `$index_bytes` must be a local `[u8; 8]` so it outlives the CPI.
#[macro_export]
macro_rules! vault_seeds {
    ($vault:expr, $index_bytes:ident) => {
        &[
            $crate::state::VAULT_SEED,
            $vault.registry.as_ref(),
            &$index_bytes,
            &[$vault.bump],
        ]
    };
}

/// One investor's shares in one vault. Not a token, so shares cannot be transferred.
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub shares: u64,
    pub bump: u8,
}

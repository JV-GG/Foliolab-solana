use anchor_lang::prelude::*;

pub const REGISTRY_SEED: &[u8] = b"registry";
pub const VAULT_SEED: &[u8] = b"vault";
pub const POSITION_SEED: &[u8] = b"position";
pub const PROPOSAL_SEED: &[u8] = b"proposal";
pub const VOTE_SEED: &[u8] = b"vote";

// ---- governance and automation (V2)

/// One day. The `demo` feature shrinks every governance clock so a devnet demo fits in minutes.
#[cfg(not(feature = "demo"))]
pub const DAY: i64 = 86_400;
#[cfg(feature = "demo")]
pub const DAY: i64 = 60;
/// After a proposal passes, dissenting holders get this long to redeem before it takes effect.
#[cfg(not(feature = "demo"))]
pub const TIMELOCK_SECS: i64 = 48 * 3_600;
#[cfg(feature = "demo")]
pub const TIMELOCK_SECS: i64 = 120;
/// The keeper may start a rebalance cycle at most this often...
#[cfg(not(feature = "demo"))]
pub const REBALANCE_INTERVAL: i64 = 12 * 3_600;
#[cfg(feature = "demo")]
pub const REBALANCE_INTERVAL: i64 = 300;
/// ...and may send several swaps within this window of the cycle's start.
#[cfg(not(feature = "demo"))]
pub const REBALANCE_WINDOW: i64 = 15 * 60;
#[cfg(feature = "demo")]
pub const REBALANCE_WINDOW: i64 = 120;
pub const MIN_VOTING_DAYS: u8 = 1;
pub const MAX_VOTING_DAYS: u8 = 14;
/// A proposal needs votes from at least 20% of the shares that existed when it was made.
pub const QUORUM_BPS: u128 = 2_000;
/// Weights are in basis points and must sum to 100%.
pub const TOTAL_BPS: u16 = 10_000;
/// A holding must sit more than 1% of vault value above its target before the keeper sells it,
/// and a swap may overshoot a target by at most 1%.
pub const DRIFT_BAND_BPS: u128 = 100;
/// Refundable SOL bond a curator posts with a proposal. Kept if rejected, else funds the gas tank.
pub const MIN_PROPOSAL_BOND: u64 = 50_000_000; // 0.05 SOL
/// Paid from the vault's gas tank to the keeper for each rebalance swap (two signatures plus margin).
pub const KEEPER_FEE_LAMPORTS: u64 = 20_000;

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
    /// The automation key allowed to run target-weight rebalances. Defaults to the guardian.
    pub keeper: Pubkey,
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

/// One target weight: `bps` of vault value should sit in `mint`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub struct Target {
    pub mint: Pubkey,
    pub bps: u16,
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
    /// Target weights, summing to 100%. Set once before activation; afterwards only a passed
    /// proposal changes them.
    #[max_len(MAX_ASSETS)]
    pub targets: Vec<Target>,
    /// Lamports held on this account (above rent) that pay the keeper for rebalances.
    pub gas_tank: u64,
    /// Start of the current rebalance cycle (unix seconds); 0 means a new cycle may start now.
    pub cycle_start: i64,
    /// Proposals ever made; the next proposal's id.
    pub proposal_count: u64,
    /// `id + 1` of the proposal in voting or timelock, or 0 if none.
    pub open_proposal: u64,
}

impl Vault {
    pub fn target_bps(&self, mint: &Pubkey) -> u16 {
        self.targets.iter().find(|t| t.mint == *mint).map(|t| t.bps).unwrap_or(0)
    }
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
    /// `id + 1` of the open proposal for which `snapshot_shares` was recorded, or 0.
    pub snapshot_proposal: u64,
    /// Shares held just before the first deposit made while that proposal was open.
    pub snapshot_shares: u64,
}

impl Position {
    /// Voting power on the vault's open proposal `open` (`id + 1`): shares held when it was made.
    /// Deposits made after that do not count; redemptions do reduce it.
    pub fn voting_power(&self, open: u64) -> u64 {
        if self.snapshot_proposal == open {
            self.snapshot_shares.min(self.shares)
        } else {
            self.shares
        }
    }

    /// Call before adding shares: freezes this position's voting power for the open proposal.
    pub fn snapshot_before_deposit(&mut self, open: u64) {
        if open != 0 && self.snapshot_proposal != open {
            self.snapshot_proposal = open;
            self.snapshot_shares = self.shares;
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ProposalStatus {
    /// Holders are voting.
    Voting,
    /// Passed; takes effect after the timelock, during which dissenters can redeem.
    Queued,
    /// Failed quorum or majority; bond refunded.
    Rejected,
    /// New weights and plan are live; bond moved to the gas tank.
    Executed,
}

/// A curator's request to change the vault's target weights and plan.
#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub vault: Pubkey,
    pub id: u64,
    pub proposer: Pubkey,
    #[max_len(MAX_ASSETS)]
    pub targets: Vec<Target>,
    #[max_len(MAX_PLAN_LENGTH)]
    pub plan: String,
    pub created_at: i64,
    pub voting_ends_at: i64,
    /// Set when the proposal passes.
    pub timelock_ends_at: i64,
    /// Vault share supply when proposed; quorum is measured against it.
    pub total_shares: u64,
    pub yes_votes: u64,
    pub no_votes: u64,
    /// Lamports held on this account (above rent) as the curator's bond.
    pub bond: u64,
    pub status: ProposalStatus,
    pub bump: u8,
}

impl Proposal {
    pub fn passed(&self) -> bool {
        let cast = self.yes_votes as u128 + self.no_votes as u128;
        cast * 10_000 >= self.total_shares as u128 * QUORUM_BPS && self.yes_votes > self.no_votes
    }
}

/// One holder's vote on one proposal. Its existence prevents voting twice.
#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub approve: bool,
    pub weight: u64,
    pub bump: u8,
}

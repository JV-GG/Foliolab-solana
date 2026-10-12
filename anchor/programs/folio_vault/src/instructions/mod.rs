pub mod admin;
pub mod governance;
pub mod holdings;
pub mod investor;
pub mod lifecycle;
pub mod manager;

pub use admin::*;
pub use governance::*;
pub use investor::*;
pub use lifecycle::*;
pub use manager::*;

use anchor_lang::prelude::*;

use crate::state::{Target, VaultState};

#[event]
pub struct StateChanged {
    pub vault: Pubkey,
    pub from: VaultState,
    pub to: VaultState,
}

#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub index: u64,
    pub manager: Pubkey,
    pub name: String,
}

#[event]
pub struct Seeded {
    pub vault: Pubkey,
    pub investor: Pubkey,
    pub amount: u64,
    pub shares: u64,
}

#[event]
pub struct Deposited {
    pub vault: Pubkey,
    pub investor: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub vault_value: u64,
    pub price_timestamp: i64,
}

#[event]
pub struct Redeemed {
    pub vault: Pubkey,
    pub investor: Pubkey,
    pub shares: u64,
    pub mints: Vec<Pubkey>,
    pub amounts: Vec<u64>,
}

#[event]
pub struct PlanPosted {
    pub vault: Pubkey,
    pub version: u64,
    pub plan: String,
    pub targets: Vec<Target>,
}

#[event]
pub struct Rebalanced {
    pub vault: Pubkey,
    pub sell_mint: Pubkey,
    pub buy_mint: Pubkey,
    pub sold: u64,
    pub bought: u64,
    pub plan_version: u64,
}

#[event]
pub struct ProposalCreated {
    pub vault: Pubkey,
    pub proposal: Pubkey,
    pub id: u64,
    pub targets: Vec<Target>,
    pub plan: String,
    pub voting_ends_at: i64,
    pub bond: u64,
}

#[event]
pub struct VoteCast {
    pub vault: Pubkey,
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub approve: bool,
    pub weight: u64,
}

#[event]
pub struct ProposalFinalized {
    pub vault: Pubkey,
    pub proposal: Pubkey,
    pub passed: bool,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub timelock_ends_at: i64,
}

#[event]
pub struct GasFunded {
    pub vault: Pubkey,
    pub amount: u64,
    pub gas_tank: u64,
}

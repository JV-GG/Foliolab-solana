pub mod admin;
pub mod holdings;
pub mod investor;
pub mod lifecycle;
pub mod manager;

pub use admin::*;
pub use investor::*;
pub use lifecycle::*;
pub use manager::*;

use anchor_lang::prelude::*;

use crate::state::VaultState;

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

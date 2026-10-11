//! Backend-signed prices, checked by instruction introspection.
//!
//! The client puts an Ed25519 program instruction directly before ours. The runtime has already
//! verified that signature when our instruction runs, so we only check that it is the price
//! signer's key, over exactly the message these prices encode.

use anchor_lang::prelude::*;
use solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked};

use crate::errors::FolioError;
use crate::state::{Registry, MAX_CLOCK_SKEW, MAX_PRICE_AGE};

pub const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");
pub const PRICE_DOMAIN: &[u8] = b"FOLIO_LAB_PRICES_V1";

/// `prices[i]` = settlement base units for ONE WHOLE `mints[i]` token.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PriceUpdate {
    pub mints: Vec<Pubkey>,
    pub prices: Vec<u64>,
    pub timestamp: i64,
}

impl PriceUpdate {
    /// What the backend signs: domain, registry, timestamp (i64 LE), count (u8), then each
    /// `mint (32) || price (u64 LE)`. Binding the registry stops reuse across deployments.
    pub fn message(&self, registry: &Pubkey) -> Vec<u8> {
        let mut m = Vec::with_capacity(PRICE_DOMAIN.len() + 32 + 8 + 1 + self.mints.len() * 40);
        m.extend_from_slice(PRICE_DOMAIN);
        m.extend_from_slice(registry.as_ref());
        m.extend_from_slice(&self.timestamp.to_le_bytes());
        m.push(self.mints.len() as u8);
        for (mint, price) in self.mints.iter().zip(self.prices.iter()) {
            m.extend_from_slice(mint.as_ref());
            m.extend_from_slice(&price.to_le_bytes());
        }
        m
    }

    /// A held asset without a price must never count as worth zero.
    pub fn price_of(&self, mint: &Pubkey) -> Result<u64> {
        let i = self.mints.iter().position(|m| m == mint).ok_or(FolioError::MissingPrice)?;
        let p = self.prices[i];
        require!(p != 0, FolioError::ZeroPrice);
        Ok(p)
    }
}

pub fn check_prices(
    update: &PriceUpdate,
    registry_key: &Pubkey,
    registry: &Registry,
    instructions_sysvar: &AccountInfo,
) -> Result<()> {
    require!(update.mints.len() == update.prices.len(), FolioError::LengthMismatch);
    require!(update.mints.len() <= u8::MAX as usize, FolioError::LengthMismatch);

    let now = Clock::get()?.unix_timestamp;
    require!(
        update.timestamp <= now + MAX_CLOCK_SKEW && now - update.timestamp <= MAX_PRICE_AGE,
        FolioError::StalePrices
    );

    let current = load_current_index_checked(instructions_sysvar)?;
    require!(current > 0, FolioError::InvalidPriceSignature);
    let ed_index = current - 1;
    let ix = load_instruction_at_checked(ed_index as usize, instructions_sysvar)?;
    require_keys_eq!(ix.program_id, ED25519_PROGRAM_ID, FolioError::InvalidPriceSignature);

    let (pubkey, message) = parse_ed25519(&ix.data, ed_index)?;
    require!(pubkey == registry.price_signer.as_ref(), FolioError::InvalidPriceSignature);
    require!(message == update.message(registry_key).as_slice(), FolioError::InvalidPriceSignature);
    Ok(())
}

/// Returns `(public_key, message)` from a single-signature Ed25519 instruction whose data all
/// lives inside that same instruction.
fn parse_ed25519(data: &[u8], own_index: u16) -> Result<(&[u8], &[u8])> {
    let err = || error!(FolioError::InvalidPriceSignature);
    if data.len() < 16 || data[0] != 1 {
        return Err(err());
    }
    let u16_at = |o: usize| u16::from_le_bytes([data[o], data[o + 1]]);
    let sig_ix = u16_at(4);
    let pk_off = u16_at(6) as usize;
    let pk_ix = u16_at(8);
    let msg_off = u16_at(10) as usize;
    let msg_len = u16_at(12) as usize;
    let msg_ix = u16_at(14);
    // Every part must come from the Ed25519 instruction itself, not from some other instruction.
    for idx in [sig_ix, pk_ix, msg_ix] {
        if idx != u16::MAX && idx != own_index {
            return Err(err());
        }
    }
    let pk = data.get(pk_off..pk_off + 32).ok_or_else(err)?;
    let msg = data.get(msg_off..msg_off + msg_len).ok_or_else(err)?;
    Ok((pk, msg))
}

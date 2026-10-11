//! Reading the vault's held token accounts from `remaining_accounts`.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::errors::FolioError;
use crate::prices::PriceUpdate;
use crate::state::Vault;

pub fn is_token_program(key: &Pubkey) -> bool {
    *key == anchor_spl::token::ID || *key == anchor_spl::token_2022::ID
}

pub fn read_mint(ai: &AccountInfo) -> Result<Mint> {
    require!(is_token_program(ai.owner), FolioError::HeldAccountsMismatch);
    let data = ai.try_borrow_data()?;
    Mint::try_deserialize(&mut &data[..])
}

pub fn read_token_account(ai: &AccountInfo) -> Result<TokenAccount> {
    require!(is_token_program(ai.owner), FolioError::WrongVaultTokenAccount);
    let data = ai.try_borrow_data()?;
    TokenAccount::try_deserialize(&mut &data[..])
}

/// The vault's associated token account for `mint`, under the mint's own token program.
pub fn vault_ata(vault: &Pubkey, mint: &AccountInfo) -> Pubkey {
    get_associated_token_address_with_program_id(vault, mint.key, mint.owner)
}

pub struct Holding<'info> {
    pub mint: AccountInfo<'info>,
    pub account: AccountInfo<'info>,
    pub decimals: u8,
    pub amount: u64,
}

/// Checks that `accounts` holds, for every mint in `vault.held` in order, `per` accounts starting
/// with `[mint, vault_ata]`, and returns those two with the current balance.
pub fn load_holdings<'info>(
    vault_key: &Pubkey,
    vault: &Vault,
    accounts: &[AccountInfo<'info>],
    per: usize,
) -> Result<Vec<Holding<'info>>> {
    require!(accounts.len() >= vault.held.len() * per, FolioError::HeldAccountsMismatch);
    let mut out = Vec::with_capacity(vault.held.len());
    for (i, held_mint) in vault.held.iter().enumerate() {
        let mint = &accounts[i * per];
        let account = &accounts[i * per + 1];
        require_keys_eq!(*mint.key, *held_mint, FolioError::HeldAccountsMismatch);
        require_keys_eq!(*account.key, vault_ata(vault_key, mint), FolioError::WrongVaultTokenAccount);
        let decimals = read_mint(mint)?.decimals;
        let amount = read_token_account(account)?.amount;
        out.push(Holding { mint: mint.clone(), account: account.clone(), decimals, amount });
    }
    Ok(out)
}

/// `amount` of a token in settlement units: settlement at par, anything else at its signed price.
pub fn value_of(
    prices: &PriceUpdate,
    settlement: &Pubkey,
    mint: &Pubkey,
    decimals: u8,
    amount: u64,
    round_up: bool,
) -> Result<u128> {
    if mint == settlement {
        return Ok(amount as u128);
    }
    let unit = 10u128.checked_pow(decimals as u32).ok_or(FolioError::Overflow)?;
    let product = (amount as u128)
        .checked_mul(prices.price_of(mint)? as u128)
        .ok_or(FolioError::Overflow)?;
    Ok(if round_up { product.div_ceil(unit) } else { product / unit })
}

/// Settlement at par, every other held asset at its signed price, rounded up so a newcomer can
/// never buy in below the true value.
pub fn vault_value(prices: &PriceUpdate, settlement: &Pubkey, holdings: &[Holding]) -> Result<u128> {
    let mut value: u128 = 0;
    for h in holdings {
        if h.amount == 0 {
            continue; // a sold-out holding adds nothing and needs no price
        }
        value = value
            .checked_add(value_of(prices, settlement, h.mint.key, h.decimals, h.amount, true)?)
            .ok_or(FolioError::Overflow)?;
    }
    Ok(value)
}

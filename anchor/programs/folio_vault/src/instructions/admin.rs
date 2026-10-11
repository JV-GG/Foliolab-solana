use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::errors::FolioError;
use crate::state::*;

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Registry::INIT_SPACE,
        seeds = [REGISTRY_SEED],
        bump,
    )]
    pub registry: Account<'info, Registry>,
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_registry(
    ctx: Context<InitializeRegistry>,
    guardian: Pubkey,
    price_signer: Pubkey,
) -> Result<()> {
    let r = &mut ctx.accounts.registry;
    r.admin = ctx.accounts.admin.key();
    r.guardian = guardian;
    r.price_signer = price_signer;
    r.settlement_mint = ctx.accounts.settlement_mint.key();
    r.assets = Vec::new();
    r.routers = Vec::new();
    r.vault_count = 0;
    r.bump = ctx.bumps.registry;
    Ok(())
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [REGISTRY_SEED], bump = registry.bump, has_one = admin @ FolioError::NotAdmin)]
    pub registry: Account<'info, Registry>,
}

fn set_in(list: &mut Vec<Pubkey>, key: Pubkey, allowed: bool, max: usize) -> Result<()> {
    let pos = list.iter().position(|k| *k == key);
    match (allowed, pos) {
        (true, None) => {
            require!(list.len() < max, FolioError::ListFull);
            list.push(key);
        }
        (false, Some(i)) => {
            list.swap_remove(i);
        }
        _ => {}
    }
    Ok(())
}

/// The settlement mint is always allowed and cannot be listed here.
pub fn handle_set_asset(ctx: Context<AdminOnly>, mint: Pubkey, allowed: bool) -> Result<()> {
    let r = &mut ctx.accounts.registry;
    require_keys_neq!(mint, r.settlement_mint, FolioError::AssetNotAllowed);
    set_in(&mut r.assets, mint, allowed, MAX_ALLOWED_ASSETS)
}

/// A token program as "router" could be told to approve or move vault tokens directly.
pub fn handle_set_router(ctx: Context<AdminOnly>, program: Pubkey, allowed: bool) -> Result<()> {
    require!(
        !crate::instructions::holdings::is_token_program(&program) && program != crate::ID,
        FolioError::RouterNotAllowed
    );
    set_in(&mut ctx.accounts.registry.routers, program, allowed, MAX_ROUTERS)
}

pub fn handle_set_guardian(ctx: Context<AdminOnly>, guardian: Pubkey) -> Result<()> {
    ctx.accounts.registry.guardian = guardian;
    Ok(())
}

pub fn handle_set_price_signer(ctx: Context<AdminOnly>, signer: Pubkey) -> Result<()> {
    ctx.accounts.registry.price_signer = signer;
    Ok(())
}

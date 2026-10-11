//! A stand-in for Jupiter on localnet and devnet, where the real stock tokens and their liquidity
//! do not exist. It swaps at whatever rate the caller asks, from a pool it holds; the vault's own
//! balance and 2% price checks are what keep that honest, exactly as with a real router.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("FeE32TVg1Yk4DVe4jS3SELK13dQsbbDUWyY4dYKmQhjm");

pub const POOL_SEED: &[u8] = b"pool";

#[program]
pub mod mock_router {
    use super::*;

    pub fn swap(ctx: Context<Swap>, amount_in: u64, amount_out: u64) -> Result<()> {
        let a = &ctx.accounts;
        transfer_checked(
            CpiContext::new(
                a.src_token_program.key(),
                TransferChecked {
                    from: a.user_src.to_account_info(),
                    mint: a.src_mint.to_account_info(),
                    to: a.pool_src.to_account_info(),
                    authority: a.user.to_account_info(),
                },
            ),
            amount_in,
            a.src_mint.decimals,
        )?;
        let bump = [ctx.bumps.pool];
        let seeds: &[&[u8]] = &[POOL_SEED, &bump];
        transfer_checked(
            CpiContext::new_with_signer(
                a.dst_token_program.key(),
                TransferChecked {
                    from: a.pool_dst.to_account_info(),
                    mint: a.dst_mint.to_account_info(),
                    to: a.user_dst.to_account_info(),
                    authority: a.pool.to_account_info(),
                },
                &[seeds],
            ),
            amount_out,
            a.dst_mint.decimals,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Swap<'info> {
    pub user: Signer<'info>,
    #[account(mut, token::mint = src_mint, token::authority = user, token::token_program = src_token_program)]
    pub user_src: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = dst_mint, token::token_program = dst_token_program)]
    pub user_dst: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: signs for the pool's token accounts; holds nothing itself.
    #[account(seeds = [POOL_SEED], bump)]
    pub pool: UncheckedAccount<'info>,
    #[account(mut, token::mint = src_mint, token::authority = pool, token::token_program = src_token_program)]
    pub pool_src: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = dst_mint, token::authority = pool, token::token_program = dst_token_program)]
    pub pool_dst: InterfaceAccount<'info, TokenAccount>,
    pub src_mint: InterfaceAccount<'info, Mint>,
    pub dst_mint: InterfaceAccount<'info, Mint>,
    pub src_token_program: Interface<'info, TokenInterface>,
    pub dst_token_program: Interface<'info, TokenInterface>,
}

use anchor_lang::prelude::*;
use anchor_spl::token::*;

mod account;
mod error;

#[program]
pub mod escrow_anchor {
    use super::*;

    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        _escrow_bump: u8,
        _token_bump: u8,
        receive_amount: u64,
    ) -> ProgramResult {
        ctx.accounts.escrow_account.initializer = *ctx.accounts.authority.key;
        ctx.accounts.escrow_account.is_initialized = true;
        ctx.accounts.escrow_account.receive_amount = receive_amount;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(escrow_bump: u8, token_bump: u8)]
pub struct InitializeEscrow<'info> {
    #[account(signer, mut)]
    pub authority: AccountInfo<'info>,
    #[account(
        init,
        seeds = [
            b"escrow-state".as_ref(),
            authority.key.as_ref(),
            token_mint.key.as_ref()
        ],
        bump = escrow_bump,
        payer = authority,
    )]
    pub escrow_state_account: ProgramAccount<'info, account::Escrow>,
    #[account(
        init,
        token = token_mint,
        authority = authority,
        seeds = [b"escrow-token".as_ref()],
        bump = token_bump,
        payer = authority,
        space = TokenAccount::LEN,
    )]
    pub escrow_token_account: CpiAccount<'info, TokenAccount>,
    pub token_mint: AccountInfo<'info>,
    // pub tokenX_receive_account: AccountInfo<'info>,
    // Todo: check signer owns this acct?
    // pub tokenY_receive_account: AccountInfo<'info>,
    // pub tokeny_mint: AccountInfo<'info>, // check if owned by spl-token?
    pub system_program: AccountInfo<'info>,
    // pub rent: Sysvar<'info, Rent>,
    pub token_program: AccountInfo<'info>,
}

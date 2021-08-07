use anchor_lang::prelude::*;
use anchor_spl::token::*;

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
        seeds = [b"escrow-metadata".as_ref(), authority.key.as_ref()],
        bump = escrow_bump,
        payer = authority,
    )]
    pub escrow_account: ProgramAccount<'info, Escrow>,
    #[account(
        init,
        token = tokenx_mint,
        authority = authority,
        seeds = [b"escrow-token".as_ref()],
        bump = token_bump,
        payer = authority,
        space = TokenAccount::LEN,
    )]
    pub tokenx_escrow_account: CpiAccount<'info, TokenAccount>,
    pub tokenx_mint: AccountInfo<'info>,
    // pub tokenX_receive_account: AccountInfo<'info>,
    // Todo: check signer owns this acct?
    // pub tokenY_receive_account: AccountInfo<'info>,
    // pub tokeny_mint: AccountInfo<'info>, // check if owned by spl-token?
    pub system_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: AccountInfo<'info>,
}

// #[account]
// pub struct Mint {
//     pub supply: u32,
// }
//
// #[associated]
// #[derive(Default)]
// pub struct Token {
//     pub amount: u32,
//     pub authority: Pubkey, // the owner in user-space
//     pub mint: Pubkey,
// }

#[account]
#[derive(Default)]
pub struct Escrow {
    pub is_initialized: bool,
    pub initializer: Pubkey,
    pub receiver: Pubkey,
    pub receive_amount: u64,
}

// Errors

#[error]
pub enum EscrowError {
    #[msg("This is an error message clients will automatically display")]
    Hello,
}

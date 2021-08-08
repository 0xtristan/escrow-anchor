use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount, Transfer};

mod account;
mod error;

#[program]
pub mod escrow_anchor {
    use super::*;

    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        _escrow_bump: u8,
        _token_bump: u8,
        initializer_amount: u64,
        taker_amount: u64,
    ) -> ProgramResult {
        ctx.accounts.escrow_state_account.is_initialized = true;
        ctx.accounts.escrow_state_account.initializer = *ctx.accounts.initializer.key;
        ctx.accounts.escrow_state_account.taker_amount = taker_amount;

        // Check receive account is SPL token acct?
        // Transfer tokens from Initializer to `escrow_token_account`
        let token_program = ctx.accounts.token_program.clone();
        let token_accounts = Transfer {
            from: ctx
                .accounts
                .initializer_token_account
                .to_account_info()
                .clone(),
            to: ctx.accounts.escrow_token_account.to_account_info().clone(),
            authority: ctx.accounts.initializer.clone(),
        };
        let cpi_ctx = CpiContext::new(token_program, token_accounts);
        token::transfer(cpi_ctx, initializer_amount);

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(escrow_bump: u8, token_bump: u8, initializer_amount: u64)]
pub struct InitializeEscrow<'info> {
    #[account(signer, mut)]
    pub initializer: AccountInfo<'info>,
    #[account(
    mut,
    constraint = initializer_token_account.amount >= initializer_amount
    )]
    pub initializer_token_account: CpiAccount<'info, TokenAccount>,
    #[account(
    init,
    seeds = [
    b"escrow-state".as_ref(),
    initializer.key.as_ref(),
    token_mint.key.as_ref()
    ],
    bump = escrow_bump,
    payer = initializer,
    )]
    pub escrow_state_account: ProgramAccount<'info, account::Escrow>,
    #[account(
    init,
    token = token_mint,
    authority = initializer,
    seeds = [b"escrow-token".as_ref()],
    bump = token_bump,
    payer = initializer,
    space = TokenAccount::LEN,
    )]
    pub escrow_token_account: CpiAccount<'info, TokenAccount>,
    pub token_mint: AccountInfo<'info>,
    // pub tokenX_receive_account: AccountInfo<'info>,
    // Todo: check signer owns this acct?
    // pub tokenY_receive_account: AccountInfo<'info>,
    // pub tokeny_mint: AccountInfo<'info>, // check if owned by spl-token?
    pub system_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: AccountInfo<'info>,
}

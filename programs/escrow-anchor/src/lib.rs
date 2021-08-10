use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount, Transfer};

mod error;

#[program]
pub mod escrow_anchor {
    use super::*;

    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        _escrow_bump: u8,
        _escrow_state_bump: u8,
        _escrow_token_bump: u8,
        initializer_amount: u64,
        taker_amount: u64,
    ) -> ProgramResult {
        // Initialise escrow state account
        ctx.accounts.escrow_state_account.is_initialized = true;
        ctx.accounts.escrow_state_account.initializer = *ctx.accounts.initializer.key;
        ctx.accounts
            .escrow_state_account
            .initializer_token_account_receive = *ctx
            .accounts
            .initializer_token_account_receive
            .to_account_info()
            .key;
        ctx.accounts.escrow_state_account.escrow_token_account =
            *ctx.accounts.escrow_token_account.to_account_info().key;
        ctx.accounts.escrow_state_account.initializer_amount = initializer_amount;
        ctx.accounts.escrow_state_account.taker_amount = taker_amount;

        // Check receive account is SPL token acct?
        // Transfer tokens from Initializer to `escrow_token_account`
        let token_program = ctx.accounts.token_program.clone();
        let token_accounts = Transfer {
            from: ctx
                .accounts
                .initializer_token_account_send
                .to_account_info()
                .clone(),
            to: ctx.accounts.escrow_token_account.to_account_info().clone(),
            authority: ctx.accounts.initializer.clone(),
        };
        let cpi_ctx = CpiContext::new(token_program, token_accounts);
        token::transfer(cpi_ctx, initializer_amount)?;

        Ok(())
    }

    pub fn take_escrow(
        ctx: Context<TakeEscrow>,
        initializer_amount: u64,
        taker_amount: u64,
    ) -> ProgramResult {
        // Taker -> Initializer
        let token_program = ctx.accounts.token_program.clone();
        let token_accounts = Transfer {
            from: ctx
                .accounts
                .taker_token_account_send
                .to_account_info()
                .clone(),
            to: ctx
                .accounts
                .initializer_token_account_receive
                .to_account_info()
                .clone(),
            authority: ctx.accounts.taker.clone(),
        };
        let cpi_ctx = CpiContext::new(token_program, token_accounts);
        token::transfer(cpi_ctx, ctx.accounts.escrow_state_account.taker_amount)?;

        // Seeds needed to sign the token transfer with escrow PDA
        let (_pda, bump_seed) = Pubkey::find_program_address(&[b"escrow"], ctx.program_id);
        let seeds = &[&b"escrow"[..], &[bump_seed]];

        // Initializer (via Escrow PDA) -> Taker
        let token_program = ctx.accounts.token_program.clone();
        let token_accounts = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info().clone(),
            to: ctx
                .accounts
                .taker_token_account_receive
                .to_account_info()
                .clone(),
            authority: ctx.accounts.escrow_account.to_account_info().clone(),
        };
        let cpi_ctx = CpiContext::new(token_program, token_accounts);
        token::transfer(
            cpi_ctx.with_signer(&[&seeds[..]]),
            ctx.accounts.escrow_state_account.initializer_amount,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(escrow_bump: u8, escrow_state_bump: u8, escrow_token_bump: u8, initializer_amount: u64)]
pub struct InitializeEscrow<'info> {
    #[account(signer, mut)]
    pub initializer: AccountInfo<'info>,
    #[account(
    mut,
    constraint = initializer_token_account_send.amount >= initializer_amount
    )]
    pub initializer_token_account_send: CpiAccount<'info, TokenAccount>,
    pub initializer_token_account_receive: CpiAccount<'info, TokenAccount>,
    #[account(
    init,
    seeds = [b"escrow".as_ref()],
    bump = escrow_bump,
    payer = initializer
    )]
    pub escrow_account: ProgramAccount<'info, Escrow>,
    #[account(
    init,
    seeds = [
    b"escrow-state".as_ref(),
    initializer.key.as_ref(),
    token_mint.key.as_ref()
    ],
    bump = escrow_state_bump,
    payer = initializer,
    )]
    pub escrow_state_account: ProgramAccount<'info, Escrow>,
    #[account(
    init,
    token = token_mint,
    authority = escrow_account,
    seeds = [b"escrow-token".as_ref()],
    bump = escrow_token_bump,
    payer = initializer,
    space = TokenAccount::LEN,
    )]
    pub escrow_token_account: CpiAccount<'info, TokenAccount>,
    pub token_mint: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(initializer_amount: u64, taker_amount: u64)]
pub struct TakeEscrow<'info> {
    #[account(signer)]
    pub taker: AccountInfo<'info>,
    #[account(mut, constraint = taker_token_account_send.amount >= taker_amount)]
    pub taker_token_account_send: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    pub taker_token_account_receive: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    pub initializer: AccountInfo<'info>, // for rent return
    #[account(mut)]
    pub initializer_token_account_receive: CpiAccount<'info, TokenAccount>,
    pub escrow_account: AccountInfo<'info>,
    #[account(
    mut,
    constraint = escrow_state_account.is_initialized == true,
    constraint = escrow_state_account.initializer == *initializer.key,
    constraint = escrow_state_account.initializer_token_account_receive == *initializer_token_account_receive.to_account_info().key,
    constraint = escrow_state_account.escrow_token_account == *escrow_token_account.to_account_info().key,
    constraint = escrow_state_account.initializer_amount == initializer_amount,
    constraint = escrow_state_account.taker_amount == taker_amount,
    close = initializer,
    )]
    pub escrow_state_account: ProgramAccount<'info, Escrow>,
    #[account(mut)]
    pub escrow_token_account: CpiAccount<'info, TokenAccount>,
    pub token_program: AccountInfo<'info>,
}

#[account]
#[derive(Default)]
pub struct Escrow {
    pub is_initialized: bool,
    pub initializer: Pubkey,
    pub initializer_token_account_receive: Pubkey,
    pub escrow_token_account: Pubkey,
    pub initializer_amount: u64,
    pub taker_amount: u64,
}

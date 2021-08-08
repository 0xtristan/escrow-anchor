use anchor_lang::prelude::*;

#[error]
pub enum EscrowError {
    #[msg("This is an error message clients will automatically display")]
    Hello,
}

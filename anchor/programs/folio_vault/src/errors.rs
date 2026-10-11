use anchor_lang::prelude::*;

#[error_code]
pub enum FolioError {
    #[msg("Only the registry admin can do this")]
    NotAdmin,
    #[msg("Only the guardian can do this")]
    NotGuardian,
    #[msg("Only the vault manager can do this")]
    NotManager,
    #[msg("The vault is not in the right state for this")]
    WrongState,
    #[msg("Seed is below the 10 USDC minimum")]
    BelowMinimumSeed,
    #[msg("Name must be 1-32 bytes")]
    InvalidName,
    #[msg("Plan must be 1-1000 bytes")]
    InvalidPlanLength,
    #[msg("Post a plan before the first trade")]
    NoPlanPosted,
    #[msg("A held asset has no signed price")]
    MissingPrice,
    #[msg("A signed price is zero")]
    ZeroPrice,
    #[msg("Signed prices are older than 60 seconds or in the future")]
    StalePrices,
    #[msg("Price lists differ in length")]
    LengthMismatch,
    #[msg("The price signature is missing or not from the price signer")]
    InvalidPriceSignature,
    #[msg("The vault holds nothing")]
    EmptyVault,
    #[msg("Deposit buys zero shares")]
    ZeroShares,
    #[msg("Fewer shares than the minimum asked for")]
    SlippageTooHigh,
    #[msg("Nothing to redeem")]
    NothingToRedeem,
    #[msg("Not enough shares")]
    InsufficientShares,
    #[msg("The accounts passed do not match the vault's held assets")]
    HeldAccountsMismatch,
    #[msg("This token account is not the vault's account for that mint")]
    WrongVaultTokenAccount,
    #[msg("Recipient token account has the wrong mint")]
    WrongRecipientAccount,
    #[msg("Swap program is not allowlisted")]
    RouterNotAllowed,
    #[msg("Asset is not allowlisted")]
    AssetNotAllowed,
    #[msg("The vault does not hold the asset it is selling")]
    AssetNotHeld,
    #[msg("The trade sold more than allowed")]
    SellExceeded,
    #[msg("The trade bought less than the minimum")]
    BuyTooLow,
    #[msg("The trade lost more than 2% against the signed prices")]
    TradeLossTooHigh,
    #[msg("A vault balance went down that should not have")]
    CollateralDecreased,
    #[msg("A vault token account gained a delegate, close authority or new owner")]
    AuthorityChanged,
    #[msg("A vault may hold at most 10 assets")]
    TooManyAssets,
    #[msg("Too many allowlisted entries")]
    ListFull,
    #[msg("Math overflow")]
    Overflow,
}

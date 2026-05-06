use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

declare_id!("Azj7fnmacC9NQm9MoXPBJA3rhdWNHyrr22e5FvLJei4H");

#[program]
pub mod workspace {
    use super::*;

    // admin_treasury: Pubkey, Account to receive fees, 9PJ8I...3555
    // fee_per_burn: u64, SOL fee charged per burn in lamports, 5000000 = 0.005 SOL
    // premium_fee: u64, Premium fee for free burns in lamports, 100000000 = 0.1 SOL
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        admin_treasury: Pubkey,
        fee_per_burn: u64,
        premium_fee: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.bump = ctx.bumps.config;
        config.authority = ctx.accounts.authority.key();
        config.is_active = true;
        config.is_paused = false;
        config.version = 1;
        
        config.admin_treasury = admin_treasury;
        config.fee_per_burn = fee_per_burn;
        config.premium_fee = premium_fee;

        Ok(())
    }

    pub fn burn_nft(ctx: Context<BurnNft>) -> Result<()> {
        let config = &ctx.accounts.config;
        
        require!(config.is_active && !config.is_paused, ErrorCode::ConfigInactive);

        // 1. Burn 1 token from user token account
        let burn_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::burn(burn_ctx, 1)?;

        // 2. Transfer fee from user to treasury
        if config.fee_per_burn > 0 {
            let transfer_ctx = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.admin_treasury.to_account_info(),
                },
            );
            anchor_lang::system_program::transfer(transfer_ctx, config.fee_per_burn)?;
        }

        Ok(())
    }

    pub fn pay_premium_fee(ctx: Context<PayPremiumFee>) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(config.is_active && !config.is_paused, ErrorCode::ConfigInactive);

        if config.premium_fee > 0 {
            let transfer_ctx = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.admin_treasury.to_account_info(),
                },
            );
            anchor_lang::system_program::transfer(transfer_ctx, config.premium_fee)?;
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        seeds = [b"config", authority.key().as_ref()],
        bump,
        payer = authority,
        space = 8 + Config::LEN
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BurnNft<'info> {
    #[account(
        seeds = [b"config", config.authority.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = user_token_account.mint == mint.key() @ ErrorCode::InvalidMint,
        constraint = user_token_account.owner == user.key() @ ErrorCode::Unauthorized,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = config.admin_treasury @ ErrorCode::InvalidTreasury
    )]
    pub admin_treasury: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayPremiumFee<'info> {
    #[account(
        seeds = [b"config", config.authority.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        address = config.admin_treasury @ ErrorCode::InvalidTreasury
    )]
    pub admin_treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct Config {
    pub bump: u8,               // 1
    pub authority: Pubkey,      // 32
    pub is_active: bool,        // 1
    pub is_paused: bool,        // 1
    pub version: u8,            // 1
    pub admin_treasury: Pubkey, // 32
    pub fee_per_burn: u64,      // 8
    pub premium_fee: u64,       // 8
}

impl Config {
    pub const LEN: usize = 1 + 32 + 1 + 1 + 1 + 32 + 8 + 8;
}

#[error_code]
pub enum ErrorCode {
    #[msg("Config is inactive")]
    ConfigInactive,
    #[msg("Invalid treasury account")]
    InvalidTreasury,
    #[msg("Invalid token mint")]
    InvalidMint,
    #[msg("Unauthorized access")]
    Unauthorized,
}
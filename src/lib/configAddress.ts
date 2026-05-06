// ─── BurnBox Config ────────────────────────────────────────────────────────

// Admin Treasury — all burn fees are sent here (traceable on-chain)
export const ADMIN_TREASURY = "HnQPCEiCTT8fzvPpRpz5J3fxsL3vELRVuaqfVFM154Ly";

// The official Solana token burn address.
// Tokens sent here are permanently destroyed — no one holds the private key.
// Reference: https://explorer.solana.com/address/1nc1nerator11111111111111111111111111111111
export const SOLANA_BURN_ADDRESS = "1nc1nerator11111111111111111111111111111111";

// Fee constants (in SOL)
export const FEE_PER_BURN_SOL = 0.005; // charged per NFT burned
export const PREMIUM_FEE_SOL  = 0.1;  // one-time flat fee for full wallet clean

// Helius RPC endpoint
export const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=dd39f964-79fe-4373-a22b-7cac000f163b";

// Short display version of burn address for UI
export const BURN_ADDRESS_SHORT = "1nc1ne…1111";

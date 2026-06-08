use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
pub enum VaultError {
    #[error("TPM error: {0}")]
    Tpm(String),

    #[error("Crypto error: {0}")]
    Crypto(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Integrity error: {0}")]
    Integrity(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Vault not initialized")]
    NotInitialized,

    #[error(
        "Rate limited: retry after {retry_after_seconds}s ({remaining_attempts} attempts left)"
    )]
    RateLimited {
        retry_after_seconds: u64,
        remaining_attempts: u32,
    },

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Validation error: {0}")]
    Validation(String),
}

pub type VaultResult<T> = Result<T, VaultError>;

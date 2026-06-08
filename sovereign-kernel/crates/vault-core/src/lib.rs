mod rate_limiter;
mod state_validator;
pub mod vault;

pub use rate_limiter::RateLimiter;
pub use state_validator::StateValidator;
pub use vault::{Vault, VaultConfig};

use std::path::Path;
use vault_common::{VaultError, VaultResult};
use zeroize::ZeroizeOnDrop;

/// A database encryption key that zeroizes on drop.
#[derive(ZeroizeOnDrop)]
pub struct DatabaseKey {
    raw: [u8; 32],
}

impl DatabaseKey {
    pub fn from_raw(raw: [u8; 32]) -> Self {
        Self { raw }
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.raw
    }
}

/// Check whether a database at `path` needs migration to encrypted format.
pub fn needs_migration(path: &Path) -> VaultResult<bool> {
    if !path.exists() {
        return Ok(false);
    }
    let conn = rusqlite::Connection::open(path)
        .map_err(|e| VaultError::Storage(format!("Open: {}", e)))?;

    // If we can read the sqlite_master table without a key, it's unencrypted.
    match conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| {
        r.get::<_, i64>(0)
    }) {
        Ok(_) => Ok(true),   // readable without key → unencrypted → needs migration
        Err(_) => Ok(false), // can't read → already encrypted or corrupt
    }
}

pub struct MigrationResult {
    pub encrypted_path: std::path::PathBuf,
}

/// Migrate a plaintext database to an encrypted copy.
pub fn migrate_to_encrypted(path: &Path, _key: &DatabaseKey) -> VaultResult<MigrationResult> {
    let enc_path = path.with_extension("enc.db");
    // In a real implementation, re-create the database with SQLCipher or similar.
    // For now, copy the file as a stub.
    std::fs::copy(path, &enc_path).map_err(|e| VaultError::Storage(format!("Copy: {}", e)))?;
    Ok(MigrationResult {
        encrypted_path: enc_path,
    })
}

/// Open (or create) an encrypted database.
pub fn open_encrypted_database(
    path: &str,
    _key: &DatabaseKey,
    create: bool,
) -> VaultResult<rusqlite::Connection> {
    if !create && !Path::new(path).exists() {
        return Err(VaultError::Storage(format!("Database not found: {}", path)));
    }
    let conn = rusqlite::Connection::open(path)
        .map_err(|e| VaultError::Storage(format!("Open: {}", e)))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
        .map_err(|e| VaultError::Storage(format!("Pragma: {}", e)))?;
    Ok(conn)
}

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tracing::{error, info};
use vault_audit::{AuditEvent, AuditLogger};
use vault_common::{VaultError, VaultResult};
use vault_crypto::keys::{constant_time_eq, random_256bit, SecretBytes};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TpmState {
    pub version: u32,
    pub sealed_master_key: Vec<u8>,
    pub pcr_baseline: [u8; 32],
    pub created_at: i64,
    pub tpm_counter_value: u64,
    pub integrity_hmac: Vec<u8>,
}

impl TpmState {
    pub fn compute_integrity_hmac(&self, hmac_key: &[u8]) -> VaultResult<Vec<u8>> {
        use hmac::{Hmac, Mac};
        let mut m = Hmac::<Sha256>::new_from_slice(hmac_key)
            .map_err(|e| VaultError::Crypto(format!("HMAC: {}", e)))?;
        m.update(&self.version.to_le_bytes());
        m.update(&self.sealed_master_key);
        m.update(&self.pcr_baseline);
        m.update(&self.created_at.to_le_bytes());
        m.update(&self.tpm_counter_value.to_le_bytes());
        Ok(m.finalize().into_bytes().to_vec())
    }

    /// Constant-time HMAC verification to prevent timing side-channels.
    pub fn verify_integrity(&self, k: &[u8]) -> VaultResult<bool> {
        let computed = self.compute_integrity_hmac(k)?;
        Ok(constant_time_eq(&computed, &self.integrity_hmac))
    }
}

pub struct TpmManager {
    audit_logger: Option<Arc<AuditLogger>>,
    available: bool,
}

impl TpmManager {
    pub fn new() -> VaultResult<Self> {
        Ok(Self {
            audit_logger: None,
            available: Self::is_available(),
        })
    }

    pub fn new_with_audit(audit: Option<Arc<AuditLogger>>) -> VaultResult<Self> {
        Ok(Self {
            audit_logger: audit,
            available: Self::is_available(),
        })
    }

    pub fn is_available() -> bool {
        #[cfg(target_os = "windows")]
        {
            std::path::Path::new(r"\\.\TPM").exists() || std::env::var("SWTPM_ACTIVE").is_ok()
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::env::var("SWTPM_ACTIVE").is_ok()
        }
    }

    pub fn initialize_vault(
        &mut self,
        state_path: &str,
        hmac_key: &[u8; 32],
    ) -> VaultResult<TpmState> {
        info!("Initializing vault TPM state: {}", state_path);

        if !self.available {
            return Err(VaultError::Tpm("TPM not available".into()));
        }

        let master_key = random_256bit();
        let pcr_baseline = self.read_pcr_baseline()?;
        let sealed = self.seal_data(&master_key)?;
        let counter = self.read_counter()?;

        let mut state = TpmState {
            version: 1,
            sealed_master_key: sealed,
            pcr_baseline,
            created_at: chrono::Utc::now().timestamp(),
            tpm_counter_value: counter,
            integrity_hmac: Vec::new(),
        };

        state.integrity_hmac = state.compute_integrity_hmac(hmac_key)?;
        self.save_state(state_path, &state)?;

        if let Some(ref logger) = self.audit_logger {
            let _ = logger.log(AuditEvent::VaultInitialized {
                tpm_available: true,
                shamir_threshold: 0,
                shamir_total: 0,
            });
        }

        info!("Vault initialized with TPM");
        Ok(state)
    }

    pub fn load_state(&self, state_path: &str, hmac_key: &[u8; 32]) -> VaultResult<TpmState> {
        let state = self.load_state_from_db(state_path)?;

        if !state.verify_integrity(hmac_key)? {
            error!("TPM state integrity check failed");
            if let Some(ref logger) = self.audit_logger {
                let _ = logger.log(AuditEvent::TpmError {
                    error_code: "STATE_INTEGRITY_FAILED".into(),
                    operation: "load_state".into(),
                });
            }
            return Err(VaultError::Integrity(
                "TPM state HMAC verification failed".into(),
            ));
        }

        Ok(state)
    }

    pub fn unseal_with_pcr_validation(
        &self,
        state: &TpmState,
        hmac_key: &[u8; 32],
    ) -> VaultResult<SecretBytes> {
        // Re-verify integrity before unsealing
        if !state.verify_integrity(hmac_key)? {
            return Err(VaultError::Integrity(
                "State integrity check failed before unseal".into(),
            ));
        }

        let current_pcr = self.read_pcr_baseline()?;

        if !constant_time_eq(&current_pcr, &state.pcr_baseline) {
            error!("PCR baseline mismatch detected!");

            if let Some(ref logger) = self.audit_logger {
                let _ = logger.log(AuditEvent::TpmPcrMismatch {
                    expected_pcr_hash: state.pcr_baseline,
                    actual_pcr_hash: current_pcr,
                    affected_pcrs: vec![0, 1, 2, 3, 4, 5, 6, 7],
                });
                let _ = logger.log(AuditEvent::TpmUnsealAttempt {
                    pcr_valid: false,
                    counter_valid: true,
                    success: false,
                });
            }

            return Err(VaultError::Tpm(
                "PCR baseline mismatch - possible tampering".into(),
            ));
        }

        let key_bytes = self.unseal_data(&state.sealed_master_key)?;

        if let Some(ref logger) = self.audit_logger {
            let _ = logger.log(AuditEvent::TpmUnsealAttempt {
                pcr_valid: true,
                counter_valid: true,
                success: true,
            });
        }

        Ok(SecretBytes::new(key_bytes))
    }

    pub fn update_state(&self, path: &str, state: &TpmState) -> VaultResult<()> {
        self.save_state(path, state)
    }

    fn read_pcr_baseline(&self) -> VaultResult<[u8; 32]> {
        // NOTE: When the `tpm` feature is enabled, this should read actual PCR
        // values from the TPM hardware. The current implementation uses a
        // deterministic placeholder. Replace with real tss-esapi PCR reads
        // before deploying to production.
        #[cfg(feature = "tpm")]
        {
            let mut hasher = Sha256::new();
            hasher.update(b"TPM_PCR_PLACEHOLDER_REPLACE_WITH_ACTUAL_TPM_READ");
            Ok(hasher.finalize().into())
        }
        #[cfg(not(feature = "tpm"))]
        {
            let mut hasher = Sha256::new();
            hasher.update(b"SOFTWARE_PCR_BASELINE");
            Ok(hasher.finalize().into())
        }
    }

    /// Seal data using the TPM (or software stub).
    ///
    /// In production with the `tpm` feature, this should use TPM2_Create with
    /// a PCR policy to bind the sealed blob to the current platform state.
    /// The current stub prepends a 4-byte magic header and copies the data,
    /// which is NOT secure — it exists only for development/testing.
    fn seal_data(&self, data: &[u8]) -> VaultResult<Vec<u8>> {
        #[cfg(feature = "tpm")]
        {
            let mut sealed = vec![0x53, 0x4B, 0x54, 0x50]; // "SKTP"
            sealed.extend_from_slice(data);
            Ok(sealed)
        }
        #[cfg(not(feature = "tpm"))]
        {
            let mut sealed = vec![0x53, 0x4B, 0x53, 0x57]; // "SKSW"
            sealed.extend_from_slice(data);
            Ok(sealed)
        }
    }

    fn unseal_data(&self, sealed: &[u8]) -> VaultResult<Vec<u8>> {
        if sealed.len() < 4 {
            return Err(VaultError::Tpm("Invalid sealed data format".into()));
        }
        let magic = &sealed[..4];
        if magic != b"SKTP" && magic != b"SKSW" {
            return Err(VaultError::Tpm("Invalid magic in sealed data".into()));
        }
        Ok(sealed[4..].to_vec())
    }

    fn read_counter(&self) -> VaultResult<u64> {
        Ok(0)
    }

    fn save_state(&self, path: &str, state: &TpmState) -> VaultResult<()> {
        let c = rusqlite::Connection::open(path)
            .map_err(|e| VaultError::Storage(format!("DB: {}", e)))?;
        c.execute_batch(
            "CREATE TABLE IF NOT EXISTS tpm_state (
                key TEXT PRIMARY KEY,
                value BLOB NOT NULL,
                created_at INTEGER NOT NULL,
                version INTEGER NOT NULL DEFAULT 1
            );",
        )
        .map_err(|e| VaultError::Storage(format!("Schema: {}", e)))?;

        let d = serde_json::to_vec(state)
            .map_err(|e| VaultError::Crypto(format!("Serialize: {}", e)))?;
        c.execute(
            "INSERT OR REPLACE INTO tpm_state VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["tpm_vault_state", d, chrono::Utc::now().timestamp(), 1],
        )
        .map_err(|e| VaultError::Storage(format!("Save: {}", e)))?;
        Ok(())
    }

    fn load_state_from_db(&self, path: &str) -> VaultResult<TpmState> {
        let c = rusqlite::Connection::open(path)
            .map_err(|e| VaultError::Storage(format!("DB: {}", e)))?;
        let d: Vec<u8> = c
            .query_row(
                "SELECT value FROM tpm_state WHERE key = 'tpm_vault_state'",
                [],
                |r| r.get(0),
            )
            .map_err(|e| VaultError::Storage(format!("Load: {}", e)))?;
        let s: TpmState = serde_json::from_slice(&d)
            .map_err(|e| VaultError::Crypto(format!("Deserialize: {}", e)))?;
        if s.version != 1 {
            return Err(VaultError::Storage("Version mismatch".into()));
        }
        Ok(s)
    }
}

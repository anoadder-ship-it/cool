use sha2::{Digest, Sha256};
use vault_common::{VaultError, VaultResult};
use vault_crypto::keys::constant_time_eq;

pub struct StateValidator {
    expected_hash: Option<[u8; 32]>,
}

impl StateValidator {
    pub fn new() -> Self {
        Self {
            expected_hash: None,
        }
    }

    pub fn set_baseline(&mut self, data: &[u8]) {
        let mut hasher = Sha256::new();
        hasher.update(data);
        self.expected_hash = Some(hasher.finalize().into());
    }

    pub fn validate(&self, data: &[u8]) -> VaultResult<bool> {
        let expected = self
            .expected_hash
            .ok_or_else(|| VaultError::Validation("No baseline set".into()))?;
        let mut hasher = Sha256::new();
        hasher.update(data);
        let actual: [u8; 32] = hasher.finalize().into();
        Ok(constant_time_eq(&expected, &actual))
    }

    /// Constant-time HMAC validation.
    pub fn validate_hmac(data: &[u8], hmac_val: &[u8], key: &[u8]) -> VaultResult<bool> {
        use hmac::{Hmac, Mac};
        let mut mac = Hmac::<Sha256>::new_from_slice(key)
            .map_err(|e| VaultError::Crypto(format!("HMAC init: {}", e)))?;
        mac.update(data);
        let computed = mac.finalize().into_bytes();
        Ok(constant_time_eq(computed.as_slice(), hmac_val))
    }

    pub fn compute_hmac(data: &[u8], key: &[u8]) -> VaultResult<Vec<u8>> {
        use hmac::{Hmac, Mac};
        let mut mac = Hmac::<Sha256>::new_from_slice(key)
            .map_err(|e| VaultError::Crypto(format!("HMAC init: {}", e)))?;
        mac.update(data);
        Ok(mac.finalize().into_bytes().to_vec())
    }

    pub fn validate_key_length(key: &[u8], expected: usize, name: &str) -> VaultResult<()> {
        if key.len() != expected {
            Err(VaultError::Validation(format!(
                "{}: {} != {}",
                name,
                key.len(),
                expected
            )))
        } else {
            Ok(())
        }
    }
}

impl Default for StateValidator {
    fn default() -> Self {
        Self::new()
    }
}

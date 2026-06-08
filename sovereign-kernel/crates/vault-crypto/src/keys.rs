use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use subtle::ConstantTimeEq;
use vault_common::{VaultError, VaultResult};
use zeroize::ZeroizeOnDrop;

/// A wrapper that zeroizes its contents on drop.
#[derive(Clone, ZeroizeOnDrop)]
pub struct SecretBytes {
    inner: Vec<u8>,
}

impl SecretBytes {
    pub fn new(data: Vec<u8>) -> Self {
        Self { inner: data }
    }

    pub fn expose_secret(&self) -> &[u8] {
        &self.inner
    }

    pub fn len(&self) -> usize {
        self.inner.len()
    }

    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}

impl std::fmt::Debug for SecretBytes {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}

/// A 32-byte key that zeroizes on drop.
#[derive(Clone, ZeroizeOnDrop)]
pub struct SecretKey {
    inner: [u8; 32],
}

impl SecretKey {
    pub fn new(key: [u8; 32]) -> Self {
        Self { inner: key }
    }

    pub fn expose_secret(&self) -> &[u8; 32] {
        &self.inner
    }
}

impl std::fmt::Debug for SecretKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED 32B]")
    }
}

/// Generate 32 cryptographically random bytes.
pub fn random_256bit() -> [u8; 32] {
    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    buf
}

/// Generate a random 32-byte key wrapped in SecretKey.
pub fn random_key_32() -> SecretKey {
    SecretKey::new(random_256bit())
}

const NONCE_LEN: usize = 12;

/// Encrypt with AES-256-GCM. Returns `nonce || ciphertext`.
pub fn encrypt_aes_gcm(key: &[u8; 32], plaintext: &[u8], aad: &[u8]) -> VaultResult<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| VaultError::Crypto(format!("AES init: {}", e)))?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let payload = aes_gcm::aead::Payload {
        msg: plaintext,
        aad,
    };
    let ciphertext = cipher
        .encrypt(nonce, payload)
        .map_err(|e| VaultError::Crypto(format!("AES encrypt: {}", e)))?;

    let mut result = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// Decrypt AES-256-GCM. Input format: `nonce (12B) || ciphertext`.
pub fn decrypt_aes_gcm(key: &[u8; 32], data: &[u8], aad: &[u8]) -> VaultResult<SecretBytes> {
    if data.len() < NONCE_LEN {
        return Err(VaultError::Crypto("Ciphertext too short".into()));
    }

    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| VaultError::Crypto(format!("AES init: {}", e)))?;

    let payload = aes_gcm::aead::Payload {
        msg: ciphertext,
        aad,
    };
    let plaintext = cipher
        .decrypt(nonce, payload)
        .map_err(|e| VaultError::Crypto(format!("AES decrypt: {}", e)))?;

    Ok(SecretBytes::new(plaintext))
}

/// Constant-time byte comparison (prevents timing side-channels).
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.ct_eq(b).into()
}

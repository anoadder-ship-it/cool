use tempfile::TempDir;
use vault_audit::{AuditEvent, LockReason};
use vault_core::{RateLimiter, Vault, VaultConfig};
use vault_crypto::keys::{constant_time_eq, decrypt_aes_gcm, encrypt_aes_gcm, random_key_32};

#[test]
fn test_full_vault_lifecycle() {
    let dir = TempDir::new().unwrap();
    let data_dir = dir.path().join("vault-data");

    let config = VaultConfig {
        data_dir,
        max_unlock_attempts: 5,
        unlock_window_seconds: 300,
        lockout_duration_seconds: 900,
        auto_lock_timeout_seconds: Some(600),
        shamir_threshold: 3,
        shamir_total_shares: 5,
        tpm_enabled: false,
    };

    let mut vault = Vault::initialize(config).unwrap();
    assert!(!vault.is_unlocked());

    vault.lock(LockReason::Manual).unwrap();
    vault.shutdown().unwrap();
}

#[test]
fn test_rate_limiter_integration() {
    let dir = TempDir::new().unwrap();
    let db_path = dir.path().join("rl_test.db");

    let rl = RateLimiter::new(db_path, 3, 60, 300).unwrap();

    for _ in 0..3 {
        rl.check().unwrap();
        rl.record_failure().unwrap();
    }

    assert!(rl.check().is_err());
    rl.record_success().unwrap();
    assert!(rl.check().is_ok());
}

#[test]
fn test_crypto_roundtrip() {
    let key = random_key_32();
    let plaintext = b"end-to-end integration test data";
    let aad = b"integration-test-context";

    let encrypted = encrypt_aes_gcm(key.expose_secret(), plaintext, aad).unwrap();
    let decrypted = decrypt_aes_gcm(key.expose_secret(), &encrypted, aad).unwrap();

    assert_eq!(decrypted.expose_secret(), plaintext);
}

#[test]
fn test_constant_time_eq_works() {
    assert!(constant_time_eq(b"hello", b"hello"));
    assert!(!constant_time_eq(b"hello", b"world"));
    assert!(!constant_time_eq(b"short", b"longer"));
}

#[test]
fn test_audit_log_integration() {
    let dir = TempDir::new().unwrap();
    let db_path = dir.path().join("audit_int.db");

    let logger = vault_audit::AuditLogger::new(
        db_path.to_str().unwrap(),
        [0xABu8; 32],
        Some(100),
        Some(1_073_741_824),
    )
    .unwrap();

    logger
        .log(AuditEvent::ServiceStarted {
            version: "1.0.0".into(),
            build_hash: [0u8; 32],
        })
        .unwrap();

    logger
        .log(AuditEvent::VaultUnlocked {
            provider: "tpm".into(),
            shamir_shares_used: None,
            tpm_pcr_valid: Some(true),
        })
        .unwrap();

    let result = logger.verify_chain().unwrap();
    assert!(result.is_intact);
    assert_eq!(result.total_entries, 2);
}

#[test]
fn test_rate_limiter_remaining_attempts() {
    let dir = TempDir::new().unwrap();
    let db_path = dir.path().join("rl_remaining.db");

    let rl = RateLimiter::new(db_path, 5, 60, 300).unwrap();
    assert_eq!(rl.remaining_attempts().unwrap(), 5);

    rl.check().unwrap();
    rl.record_failure().unwrap();
    assert_eq!(rl.remaining_attempts().unwrap(), 4);

    rl.record_success().unwrap();
    assert_eq!(rl.remaining_attempts().unwrap(), 5);
}

#[test]
fn test_state_validator() {
    use vault_core::StateValidator;

    let mut sv = StateValidator::new();
    let data = b"test data for validation";

    sv.set_baseline(data);
    assert!(sv.validate(data).unwrap());
    assert!(!sv.validate(b"modified data").unwrap());
}

#[test]
fn test_state_validator_hmac() {
    use vault_core::StateValidator;

    let key = b"test-hmac-key-32-bytes-long!!!!!";
    let data = b"data to authenticate";

    let hmac = StateValidator::compute_hmac(data, key).unwrap();
    assert!(StateValidator::validate_hmac(data, &hmac, key).unwrap());
    assert!(!StateValidator::validate_hmac(b"tampered", &hmac, key).unwrap());
}

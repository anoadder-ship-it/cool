use chrono::Utc;
use hmac::{Hmac, Mac};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::Mutex;
use tracing::warn;
use vault_common::{VaultError, VaultResult};

// ── Event types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LockReason {
    Manual,
    AutoTimeout,
    EmergencyShutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuditEvent {
    VaultInitialized {
        tpm_available: bool,
        shamir_threshold: usize,
        shamir_total: usize,
    },
    VaultUnlocked {
        provider: String,
        shamir_shares_used: Option<usize>,
        tpm_pcr_valid: Option<bool>,
    },
    VaultLocked {
        reason: LockReason,
    },
    FailedUnlockAttempt {
        reason: String,
        attempt_number: u32,
        provider: String,
    },
    TpmError {
        error_code: String,
        operation: String,
    },
    TpmPcrMismatch {
        expected_pcr_hash: [u8; 32],
        actual_pcr_hash: [u8; 32],
        affected_pcrs: Vec<u32>,
    },
    TpmUnsealAttempt {
        pcr_valid: bool,
        counter_valid: bool,
        success: bool,
    },
    ServiceStarted {
        version: String,
        build_hash: [u8; 32],
    },
    ServiceStopped {
        reason: String,
        uptime_seconds: u64,
    },
}

// ── Chain verification result ───────────────────────────────────────────────

pub struct ChainResult {
    pub total_entries: u64,
    pub is_intact: bool,
    pub valid_entries: u64,
}

impl ChainResult {
    pub fn integrity_percentage(&self) -> f64 {
        if self.total_entries == 0 {
            return 100.0;
        }
        (self.valid_entries as f64 / self.total_entries as f64) * 100.0
    }
}

// ── AuditLogger ─────────────────────────────────────────────────────────────

pub struct AuditLogger {
    conn: Mutex<Connection>,
    machine_id: [u8; 32],
    max_events_per_window: Option<u32>,
    max_db_size: Option<u64>,
    events_in_window: Mutex<u64>,
    events_dropped: Mutex<u64>,
}

impl AuditLogger {
    pub fn new(
        path: &str,
        machine_id: [u8; 32],
        max_events_per_window: Option<u32>,
        max_db_size: Option<u64>,
    ) -> VaultResult<Self> {
        let conn = Connection::open(path)
            .map_err(|e| VaultError::Storage(format!("Audit DB open: {}", e)))?;

        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             CREATE TABLE IF NOT EXISTS audit_log (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 timestamp INTEGER NOT NULL,
                 event_type TEXT NOT NULL,
                 event_data TEXT NOT NULL,
                 prev_hash BLOB NOT NULL,
                 entry_hmac BLOB NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp);",
        )
        .map_err(|e| VaultError::Storage(format!("Audit schema: {}", e)))?;

        Ok(Self {
            conn: Mutex::new(conn),
            machine_id,
            max_events_per_window,
            max_db_size,
            events_in_window: Mutex::new(0),
            events_dropped: Mutex::new(0),
        })
    }

    pub fn log(&self, event: AuditEvent) -> VaultResult<()> {
        if let Some(max) = self.max_events_per_window {
            let mut count = self.events_in_window.lock().unwrap();
            if *count >= max as u64 {
                let mut dropped = self.events_dropped.lock().unwrap();
                *dropped += 1;
                warn!("Audit rate limit: event dropped");
                return Ok(());
            }
            *count += 1;
        }

        if let Some(max_size) = self.max_db_size {
            if let Ok(size) = self.database_size_bytes() {
                if size > max_size {
                    warn!("Audit DB size limit reached");
                    return Ok(());
                }
            }
        }

        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp();
        let event_type = self.event_type_name(&event);
        let event_data = serde_json::to_string(&event)
            .map_err(|e| VaultError::Internal(format!("Serialize event: {}", e)))?;

        let prev_hash = self.get_last_hash(&conn)?;
        let entry_hmac = self.compute_entry_hmac(now, &event_type, &event_data, &prev_hash)?;

        conn.execute(
            "INSERT INTO audit_log (timestamp, event_type, event_data, prev_hash, entry_hmac) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![now, event_type, event_data, prev_hash, entry_hmac],
        )
        .map_err(|e| VaultError::Storage(format!("Audit insert: {}", e)))?;

        Ok(())
    }

    pub fn verify_chain(&self) -> VaultResult<ChainResult> {
        let conn = self.conn.lock().unwrap();

        let total: u64 = conn
            .query_row("SELECT COUNT(*) FROM audit_log", [], |r| r.get(0))
            .map_err(|e| VaultError::Storage(format!("Count: {}", e)))?;

        if total == 0 {
            return Ok(ChainResult {
                total_entries: 0,
                is_intact: true,
                valid_entries: 0,
            });
        }

        let mut stmt = conn
            .prepare("SELECT id, timestamp, event_type, event_data, prev_hash, entry_hmac FROM audit_log ORDER BY id")
            .map_err(|e| VaultError::Storage(format!("Prepare: {}", e)))?;

        let mut valid = 0u64;
        let mut prev_hmac: Vec<u8> = vec![0u8; 32];

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Vec<u8>>(4)?,
                    row.get::<_, Vec<u8>>(5)?,
                ))
            })
            .map_err(|e| VaultError::Storage(format!("Query: {}", e)))?;

        for row in rows {
            let (_id, ts, etype, edata, stored_prev, stored_hmac) =
                row.map_err(|e| VaultError::Storage(format!("Row: {}", e)))?;

            if stored_prev == prev_hmac {
                let computed = self.compute_entry_hmac(ts, &etype, &edata, &stored_prev)?;
                if computed == stored_hmac {
                    valid += 1;
                }
            }
            prev_hmac = stored_hmac;
        }

        Ok(ChainResult {
            total_entries: total,
            is_intact: valid == total,
            valid_entries: valid,
        })
    }

    pub fn database_size_bytes(&self) -> VaultResult<u64> {
        let conn = self.conn.lock().unwrap();
        let page_count: u64 = conn
            .query_row("PRAGMA page_count", [], |r| r.get(0))
            .map_err(|e| VaultError::Storage(format!("page_count: {}", e)))?;
        let page_size: u64 = conn
            .query_row("PRAGMA page_size", [], |r| r.get(0))
            .map_err(|e| VaultError::Storage(format!("page_size: {}", e)))?;
        Ok(page_count * page_size)
    }

    pub fn rate_limit_stats(&self) -> (u64, u64) {
        let window = *self.events_in_window.lock().unwrap();
        let dropped = *self.events_dropped.lock().unwrap();
        (window, dropped)
    }

    fn event_type_name(&self, event: &AuditEvent) -> String {
        match event {
            AuditEvent::VaultInitialized { .. } => "VaultInitialized",
            AuditEvent::VaultUnlocked { .. } => "VaultUnlocked",
            AuditEvent::VaultLocked { .. } => "VaultLocked",
            AuditEvent::FailedUnlockAttempt { .. } => "FailedUnlockAttempt",
            AuditEvent::TpmError { .. } => "TpmError",
            AuditEvent::TpmPcrMismatch { .. } => "TpmPcrMismatch",
            AuditEvent::TpmUnsealAttempt { .. } => "TpmUnsealAttempt",
            AuditEvent::ServiceStarted { .. } => "ServiceStarted",
            AuditEvent::ServiceStopped { .. } => "ServiceStopped",
        }
        .to_string()
    }

    fn get_last_hash(&self, conn: &Connection) -> VaultResult<Vec<u8>> {
        let result: Option<Vec<u8>> = conn
            .query_row(
                "SELECT entry_hmac FROM audit_log ORDER BY id DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .ok();
        Ok(result.unwrap_or_else(|| vec![0u8; 32]))
    }

    fn compute_entry_hmac(
        &self,
        timestamp: i64,
        event_type: &str,
        event_data: &str,
        prev_hash: &[u8],
    ) -> VaultResult<Vec<u8>> {
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.machine_id)
            .map_err(|e| VaultError::Crypto(format!("HMAC init: {}", e)))?;
        mac.update(&timestamp.to_le_bytes());
        mac.update(event_type.as_bytes());
        mac.update(event_data.as_bytes());
        mac.update(prev_hash);
        Ok(mac.finalize().into_bytes().to_vec())
    }
}

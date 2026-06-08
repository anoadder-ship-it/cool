use std::path::PathBuf;
use vault_common::{VaultError, VaultResult};

pub struct RateLimiter {
    pool: r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
    max_attempts: u32,
    window_seconds: i64,
    lockout_seconds: i64,
}

impl RateLimiter {
    pub fn new(
        db_path: PathBuf,
        max_attempts: u32,
        window_seconds: u64,
        lockout_seconds: u64,
    ) -> VaultResult<Self> {
        let mgr = r2d2_sqlite::SqliteConnectionManager::file(&db_path);

        let pool = r2d2::Pool::builder()
            .min_idle(Some(2))
            .max_size(8)
            .build(mgr)
            .map_err(|e| VaultError::Storage(format!("RateLimiter pool: {}", e)))?;

        // Initialize schema on the first connection
        {
            let conn = pool
                .get()
                .map_err(|e| VaultError::Storage(format!("RateLimiter init conn: {}", e)))?;
            conn.execute_batch(
                "PRAGMA journal_mode=WAL;
                 PRAGMA synchronous=NORMAL;
                 PRAGMA busy_timeout=5000;
                 CREATE TABLE IF NOT EXISTS rate_limit_attempts (
                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                     timestamp INTEGER NOT NULL,
                     success INTEGER NOT NULL DEFAULT 0
                 );
                 CREATE TABLE IF NOT EXISTS rate_limit_lockout (
                     key TEXT PRIMARY KEY,
                     locked_until INTEGER NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS idx_attempts_ts
                     ON rate_limit_attempts(timestamp);",
            )
            .map_err(|e| VaultError::Storage(format!("RateLimiter schema: {}", e)))?;
        }

        Ok(Self {
            pool,
            max_attempts,
            window_seconds: window_seconds as i64,
            lockout_seconds: lockout_seconds as i64,
        })
    }

    pub fn check(&self) -> VaultResult<()> {
        let conn = self
            .pool
            .get()
            .map_err(|e| VaultError::Internal(format!("Pool: {}", e)))?;

        // Use rusqlite's transaction API instead of manual BEGIN/COMMIT.
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| VaultError::Storage(format!("Transaction: {}", e)))?;

        let result = self.check_inner(&tx);

        match &result {
            Ok(()) => {
                tx.commit()
                    .map_err(|e| VaultError::Storage(format!("Commit: {}", e)))?;
            }
            Err(_) => {
                // Transaction rolls back on drop
            }
        }
        result
    }

    fn check_inner(&self, c: &rusqlite::Connection) -> VaultResult<()> {
        let now = chrono::Utc::now().timestamp();

        // Check active lockout
        let locked: bool = c
            .query_row(
                "SELECT locked_until > ?1 FROM rate_limit_lockout WHERE key = 'global'",
                [now],
                |r| r.get(0),
            )
            .unwrap_or(false);

        if locked {
            let until: i64 = c
                .query_row(
                    "SELECT locked_until FROM rate_limit_lockout WHERE key = 'global'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(now + self.lockout_seconds);
            return Err(VaultError::RateLimited {
                retry_after_seconds: (until - now).max(0) as u64,
                remaining_attempts: 0,
            });
        }

        // Clean up expired lockouts and old attempts
        c.execute(
            "DELETE FROM rate_limit_lockout WHERE key = 'global' AND locked_until <= ?1",
            [now],
        )
        .map_err(|e| VaultError::Storage(format!("Cleanup lockout: {}", e)))?;

        c.execute(
            "DELETE FROM rate_limit_attempts WHERE timestamp < ?1",
            [now - self.window_seconds],
        )
        .map_err(|e| VaultError::Storage(format!("Cleanup attempts: {}", e)))?;

        // Count failed attempts within the window
        let failed_count: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM rate_limit_attempts WHERE success = 0 AND timestamp >= ?1",
                [now - self.window_seconds],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if failed_count >= self.max_attempts as i64 {
            c.execute(
                "INSERT OR REPLACE INTO rate_limit_lockout VALUES ('global', ?1)",
                [now + self.lockout_seconds],
            )
            .map_err(|e| VaultError::Storage(format!("Insert lockout: {}", e)))?;

            return Err(VaultError::RateLimited {
                retry_after_seconds: self.lockout_seconds as u64,
                remaining_attempts: 0,
            });
        }

        Ok(())
    }

    pub fn record_failure(&self) -> VaultResult<()> {
        let conn = self
            .pool
            .get()
            .map_err(|e| VaultError::Internal(format!("Pool: {}", e)))?;
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT INTO rate_limit_attempts (timestamp, success) VALUES (?1, 0)",
            [now],
        )
        .map_err(|e| VaultError::Storage(e.to_string()))?;
        Ok(())
    }

    /// On successful auth, clear all attempts and lockouts.
    pub fn record_success(&self) -> VaultResult<()> {
        let conn = self
            .pool
            .get()
            .map_err(|e| VaultError::Internal(format!("Pool: {}", e)))?;
        conn.execute_batch(
            "DELETE FROM rate_limit_attempts;
             DELETE FROM rate_limit_lockout WHERE key = 'global';",
        )
        .map_err(|e| VaultError::Storage(e.to_string()))?;
        Ok(())
    }

    pub fn remaining_attempts(&self) -> VaultResult<u32> {
        let conn = self
            .pool
            .get()
            .map_err(|e| VaultError::Internal(format!("Pool: {}", e)))?;
        let now = chrono::Utc::now().timestamp();

        let locked: bool = conn
            .query_row(
                "SELECT locked_until > ?1 FROM rate_limit_lockout WHERE key = 'global'",
                [now],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if locked {
            return Ok(0);
        }

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM rate_limit_attempts \
                 WHERE success = 0 AND timestamp >= ?1",
                [now - self.window_seconds],
                |r| r.get(0),
            )
            .unwrap_or(0);

        Ok(self.max_attempts.saturating_sub(count as u32))
    }
}

impl Clone for RateLimiter {
    fn clone(&self) -> Self {
        Self {
            pool: self.pool.clone(),
            max_attempts: self.max_attempts,
            window_seconds: self.window_seconds,
            lockout_seconds: self.lockout_seconds,
        }
    }
}

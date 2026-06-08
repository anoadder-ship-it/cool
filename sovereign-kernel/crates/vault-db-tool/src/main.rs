use clap::{Parser, Subcommand};
use std::env;
use std::fs;
use std::path::PathBuf;
use vault_audit::AuditLogger;
use vault_core::{migrate_to_encrypted, needs_migration, DatabaseKey};

#[derive(Parser)]
#[command(
    name = "vault-db-tool",
    version,
    about = "SovereignKernel Database Management Tool"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    NeedsMigration {
        #[arg(short, long)]
        path: PathBuf,
    },
    Migrate {
        #[arg(short, long)]
        path: PathBuf,
    },
    Create {
        #[arg(short, long)]
        path: PathBuf,
    },
    Verify {
        #[arg(short, long)]
        path: PathBuf,
    },
    AuditInfo {
        #[arg(short, long)]
        db_path: PathBuf,
    },
    DbStats {
        #[arg(short, long)]
        db_path: PathBuf,
    },
}

fn read_key_securely() -> Result<DatabaseKey, String> {
    if let Ok(key_hex) = env::var("SK_DB_KEY_HEX") {
        if key_hex.is_empty() {
            return Err("SK_DB_KEY_HEX is empty".to_string());
        }
        let bytes = hex::decode(&key_hex).map_err(|e| format!("Invalid hex key: {}", e))?;
        if bytes.len() != 32 {
            return Err(format!(
                "Key must be 32 bytes (64 hex chars), got {} bytes",
                bytes.len()
            ));
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes);
        // Clear the env var from this process's environment.
        // NOTE: env::remove_var is not thread-safe; this tool is single-threaded
        // so it is acceptable here. In a multi-threaded context, pass keys via
        // file descriptor or pipe instead.
        #[allow(unused_unsafe)]
        unsafe {
            env::remove_var("SK_DB_KEY_HEX");
        }
        return Ok(DatabaseKey::from_raw(key));
    }

    if let Ok(key_file) = env::var("SK_DB_KEY_FILE") {
        let key_hex = fs::read_to_string(&key_file)
            .map_err(|e| format!("Cannot read key file: {}", e))?
            .trim()
            .to_string();
        let bytes = hex::decode(&key_hex).map_err(|e| format!("Invalid hex key: {}", e))?;
        if bytes.len() != 32 {
            return Err(format!("Key must be 32 bytes, got {} bytes", bytes.len()));
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes);
        // Overwrite and delete the key file
        let zeros = vec![0u8; key_hex.len()];
        fs::write(&key_file, &zeros).ok();
        fs::remove_file(&key_file).ok();
        return Ok(DatabaseKey::from_raw(key));
    }

    Err("No key found. Set SK_DB_KEY_HEX or SK_DB_KEY_FILE.".to_string())
}

/// Read the machine-id key for audit operations (from env or file).
fn read_audit_key() -> Result<[u8; 32], String> {
    if let Ok(key_hex) = env::var("SK_AUDIT_KEY_HEX") {
        let bytes = hex::decode(&key_hex).map_err(|e| format!("Invalid audit key hex: {}", e))?;
        if bytes.len() != 32 {
            return Err(format!("Audit key must be 32 bytes, got {}", bytes.len()));
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes);
        return Ok(key);
    }
    Err("No audit key found. Set SK_AUDIT_KEY_HEX (64-char hex).".to_string())
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::NeedsMigration { path } => match needs_migration(&path) {
            Ok(true) => {
                println!("true");
                std::process::exit(0);
            }
            Ok(false) => {
                println!("false");
                std::process::exit(0);
            }
            Err(e) => {
                eprintln!("Error: {}", e);
                std::process::exit(1);
            }
        },
        Commands::Migrate { path } => {
            let key = read_key_securely().unwrap_or_else(|e| {
                eprintln!("Key error: {}", e);
                eprintln!("Usage: set SK_DB_KEY_HEX=<64-char-hex>");
                std::process::exit(1);
            });
            match migrate_to_encrypted(&path, &key) {
                Ok(r) => {
                    println!("Migration complete: {}", r.encrypted_path.display());
                }
                Err(e) => {
                    eprintln!("Migration failed: {}", e);
                    std::process::exit(1);
                }
            }
        }
        Commands::Create { path } => {
            let key = read_key_securely().unwrap_or_else(|e| {
                eprintln!("Key error: {}", e);
                std::process::exit(1);
            });
            match vault_core::open_encrypted_database(
                path.to_str().unwrap_or("unknown"),
                &key,
                true,
            ) {
                Ok(_) => {
                    println!("Database created: {}", path.display());
                }
                Err(e) => {
                    eprintln!("Create failed: {}", e);
                    std::process::exit(1);
                }
            }
        }
        Commands::Verify { path } => {
            let key = read_key_securely().unwrap_or_else(|e| {
                eprintln!("Key error: {}", e);
                std::process::exit(1);
            });
            match vault_core::open_encrypted_database(
                path.to_str().unwrap_or("unknown"),
                &key,
                false,
            ) {
                Ok(c) => match c.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0))
                {
                    Ok(r) if r == "ok" => {
                        println!("OK");
                        std::process::exit(0);
                    }
                    Ok(r) => {
                        println!("NOT OK: {}", r);
                        std::process::exit(1);
                    }
                    Err(e) => {
                        eprintln!("Check failed: {}", e);
                        std::process::exit(1);
                    }
                },
                Err(e) => {
                    eprintln!("Open failed: {}", e);
                    std::process::exit(1);
                }
            }
        }
        Commands::AuditInfo { db_path } => {
            let audit_key = read_audit_key().unwrap_or_else(|e| {
                eprintln!("Audit key error: {}", e);
                eprintln!("Usage: set SK_AUDIT_KEY_HEX=<64-char-hex>");
                std::process::exit(1);
            });
            let logger =
                AuditLogger::new(db_path.to_str().unwrap(), audit_key, None, None).unwrap();
            let result = logger.verify_chain().unwrap();
            println!("=== Audit Chain Info ===");
            println!("Entries: {}", result.total_entries);
            println!("Intact: {}", result.is_intact);
            println!("Integrity: {:.2}%", result.integrity_percentage());
        }
        Commands::DbStats { db_path } => {
            let audit_key = read_audit_key().unwrap_or_else(|e| {
                eprintln!("Audit key error: {}", e);
                eprintln!("Usage: set SK_AUDIT_KEY_HEX=<64-char-hex>");
                std::process::exit(1);
            });
            let logger =
                AuditLogger::new(db_path.to_str().unwrap(), audit_key, None, None).unwrap();
            let size = logger.database_size_bytes().unwrap();
            let (events_window, events_dropped) = logger.rate_limit_stats();
            println!("=== Database Statistics ===");
            println!("Path: {}", db_path.display());
            println!("Size: {} bytes ({:.2} MB)", size, size as f64 / 1_048_576.0);
            println!("Events in current window: {}", events_window);
            println!("Total dropped: {}", events_dropped);
        }
    }
}

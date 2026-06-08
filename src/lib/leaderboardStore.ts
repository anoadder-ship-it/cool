/**
 * leaderboardStore — persists burn records in localStorage AND Firestore.
 * localStorage: offline fallback for this browser.
 * Firestore: global real-time leaderboard across all users.
 *
 * Schema (localStorage key: "burnbox_records"):
 *   Array of LeaderboardEntry — one per wallet/session
 */
import { firestoreRecordBurns } from "./firebaseService";
import { truncateAddress } from "./format";

export interface LeaderboardEntry {
  wallet: string;       // full public key
  walletShort: string;  // e.g. "7xKp…4mBz"
  burned: number;       // total NFTs burned
  feeSol: number;       // total SOL paid in fees
  lastBurnAt: number;   // timestamp of most recent burn
  signatures: string[]; // all tx signatures
}

const STORAGE_KEY = "burnbox_records";
const MAX_SIGS    = 20; // cap signatures stored per wallet to avoid quota issues

// ── Read / write ──────────────────────────────────────────────────────────────

function readAll(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LeaderboardEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage quota — silently ignore
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Record a batch of burns for a wallet address */
export function recordBurns(
  walletAddress: string,
  count: number,
  feeSol: number,
  signatures: string[]
): void {
  if (!walletAddress || count <= 0) return;

  const all = readAll();
  const short = truncateAddress(walletAddress);

  const idx = all.findIndex((e) => e.wallet === walletAddress);
  if (idx >= 0) {
    all[idx].burned    += count;
    all[idx].feeSol    += feeSol;
    all[idx].lastBurnAt = Date.now();
    all[idx].signatures = [
      ...signatures,
      ...all[idx].signatures,
    ].slice(0, MAX_SIGS);
  } else {
    all.push({
      wallet:      walletAddress,
      walletShort: short,
      burned:      count,
      feeSol,
      lastBurnAt:  Date.now(),
      signatures:  signatures.slice(0, MAX_SIGS),
    });
  }

  writeAll(all);

  // Fire-and-forget to Firestore (global real-time leaderboard)
  firestoreRecordBurns(walletAddress, count, feeSol, signatures).catch(
    (err) => console.warn("[leaderboardStore] Firestore sync failed:", err)
  );
}

/** Return top N wallets sorted by total burns */
export function getTopBurners(limit = 10): LeaderboardEntry[] {
  return readAll()
    .sort((a, b) => b.burned - a.burned)
    .slice(0, limit);
}

/** Return global aggregate stats */
export function getGlobalStats(): { totalBurned: number; totalWallets: number; totalFeeSol: number } {
  const all = readAll();
  return {
    totalBurned:   all.reduce((s, e) => s + e.burned,  0),
    totalWallets:  all.length,
    totalFeeSol:   all.reduce((s, e) => s + e.feeSol,  0),
  };
}

/** Collection burn counts — derived from stored entries (approximated by wallets) */
export function getMostBurnedCollections(): Array<{ name: string; burned: number }> {
  // Without Supabase we can't track per-collection accurately from the client.
  // Return empty — the Leaderboard will show a "connect Supabase" placeholder here only.
  return [];
}
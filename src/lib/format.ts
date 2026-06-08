/**
 * Shared string formatting utilities for addresses, signatures, and SOL amounts.
 */

/** Truncate an address/pubkey to `prefix…suffix` form. */
export function truncateAddress(
  addr: string,
  prefixLen = 4,
  suffixLen = 4
): string {
  if (addr.length <= prefixLen + suffixLen + 1) return addr;
  return `${addr.slice(0, prefixLen)}…${addr.slice(-suffixLen)}`;
}

/** Truncate a transaction signature for display. */
export function truncateSignature(
  sig: string,
  prefixLen = 8,
  suffixLen = 6
): string {
  if (sig.length <= prefixLen + suffixLen + 1) return sig;
  return `${sig.slice(0, prefixLen)}…${sig.slice(-suffixLen)}`;
}

/** Format a SOL amount for display; shows "<0.0001" for tiny values. */
export function formatSol(sol: number, decimals = 4): string {
  if (sol < 0.0001) return "<0.0001";
  return sol.toFixed(decimals);
}

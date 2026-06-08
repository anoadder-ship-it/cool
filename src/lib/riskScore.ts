/**
 * Hash-based risk scoring for unscored NFTs.
 *
 * Used as a deterministic fallback when the scam detector hasn't flagged a token.
 * The hash is stable for a given mint address — same input always produces the same score.
 */

export type RiskLevel = "high" | "mid" | "low";

/** Deterministic 0–99 score derived from the mint address string. */
export function computeRiskScore(id: string): number {
  return (
    Math.abs(
      id.split("").reduce((s, c) => (s * 31 + c.charCodeAt(0)) | 0, 0)
    ) % 100
  );
}

/** Map a numeric score to a risk level with label and color class. */
export function getRiskLevel(score: number): {
  level: RiskLevel;
  label: string;
  color: string;
} {
  if (score >= 75) return { level: "high", label: "HIGH RISK", color: "text-red-400" };
  if (score >= 40) return { level: "mid", label: "MEDIUM", color: "text-yellow-400" };
  return { level: "low", label: "LOW RISK", color: "text-emerald-400" };
}

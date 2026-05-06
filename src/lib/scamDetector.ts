/**
 * ScamDetector — multi-signal scam token scoring engine.
 *
 * HOW SCORING WORKS
 * Each signal adds points to a 0–100 score. Once a threshold is passed
 * the token is labelled a scam. Signals are intentionally independent so a
 * single false-positive flag cannot condemn a legitimate token alone.
 *
 * SIGNAL GROUPS
 *  1. Helius DAS flags          → interface, burnt, ownership.frozen
 *  2. Name / description lures  → phishing URLs, prize/airdrop bait
 *  3. Metadata quality          → no image, no description, suspicious URI
 *  4. Supply characteristics    → trillion+ supply, 0-decimal dust
 *  5. Price signals             → confirmed $0 on-chain value
 *  6. Known scam addresses      → static denylist
 *
 * SEVERITY LEVELS
 *  confirmed  → score ≥ 80   → red   SCAM badge
 *  suspicious → score 45–79  → orange SUSPICIOUS badge
 *  clean      → score < 45
 */

export type ScamLevel = "confirmed" | "suspicious" | "clean";

export interface ScamResult {
  level: ScamLevel;
  score: number;       // 0–100
  reasons: string[];   // human-readable, shown in tooltip
}

// ── Known scam mint denylist ──────────────────────────────────────────────────
// Add confirmed rug/phishing mints here. These trigger instant "confirmed".
const KNOWN_SCAM_MINTS = new Set<string>([
  // example: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
]);

// ── Phishing / lure patterns (name + description) ────────────────────────────
const PHISHING_PATTERNS: RegExp[] = [
  /visit\s+\w+\.(com|io|app|xyz|net)/i,
  /claim\s+(your\s+)?(reward|prize|nft|token|sol|airdrop)/i,
  /free\s+(sol|nft|token|airdrop|mint)/i,
  /airdrop/i,
  /you\s+(won|have\s+won|are\s+eligible)/i,
  /go\s+to\s+http/i,
  /https?:\/\//i,
  /\.(com|io|xyz|app|net|org)\b/i,
  /whitelist/i,
  /presale/i,
  /\b(USDC|USDT|SOL|BTC|ETH)\s+(reward|gift|bonus|airdrop)/i,
  /limited\s+time/i,
  /act\s+now/i,
  /congratulation/i,
  /winner/i,
  /exclusive\s+(access|offer|mint)/i,
];

// ── Suspicious symbol patterns ────────────────────────────────────────────────
const SUSPICIOUS_SYMBOLS: RegExp[] = [
  /^[A-Z]{10,}$/,  // absurdly long uppercase-only symbol
  /\d{4,}/,        // many digits (fake version numbers)
];

// ── Suspicious metadata URI patterns ─────────────────────────────────────────
const SUSPICIOUS_URIS: RegExp[] = [
  /\.ru\b/i,
  /\.cn\b/i,
  /bit\.ly/i,
  /t\.me/i,
  /discord\.gg/i,
  /tinyurl/i,
  /shorturl/i,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function detectScam(asset: any): ScamResult {
  const reasons: string[] = [];
  let score = 0;

  const name        = String(asset?.content?.metadata?.name        ?? "").trim();
  const symbol      = String(asset?.content?.metadata?.symbol      ?? "").trim();
  const description = String(asset?.content?.metadata?.description ?? "").trim();
  const imageUri    = String(
    asset?.content?.links?.image ??
    asset?.content?.files?.[0]?.uri ??
    ""
  );
  const metaUri     = String(asset?.content?.json_uri ?? "");
  const mintAddress = String(asset?.id ?? "");
  const isFungible  = asset?.interface === "FungibleToken" || asset?.interface === "FungibleAsset";

  // ── Signal 1: Known scam mint ─────────────────────────────────────────────
  if (KNOWN_SCAM_MINTS.has(mintAddress)) {
    score += 100;
    reasons.push("Known scam mint address");
  }

  // ── Signal 2: Phishing lures in name or description ───────────────────────
  let phishingHit = false;
  for (const pattern of PHISHING_PATTERNS) {
    if (!phishingHit && (pattern.test(name) || pattern.test(description))) {
      score += 35;
      reasons.push(`Suspicious text: "${name.slice(0, 40)}"`);
      phishingHit = true;
    }
  }
  // URL embedded in name is almost always phishing — extra weight
  if (/https?:\/\//.test(name) || /https?:\/\//.test(description)) {
    score += 25;
    reasons.push("URL embedded in token name or description");
  }

  // ── Signal 3: Suspicious symbol ──────────────────────────────────────────
  for (const pattern of SUSPICIOUS_SYMBOLS) {
    if (pattern.test(symbol)) {
      score += 10;
      reasons.push(`Suspicious token symbol: "${symbol.slice(0, 20)}"`);
      break;
    }
  }

  // ── Signal 4: Suspicious metadata URI ────────────────────────────────────
  for (const pattern of SUSPICIOUS_URIS) {
    if (pattern.test(imageUri) || pattern.test(metaUri)) {
      score += 20;
      reasons.push("Metadata URI points to suspicious domain");
      break;
    }
  }

  // ── Signal 5: Fungible with no image or description ──────────────────────
  if (isFungible && !imageUri && !description) {
    score += 20;
    reasons.push("Fungible token with no image or description");
  }

  // ── Signal 6: Zero-value fungible with no metadata ────────────────────────
  if (isFungible && !name && asset?.token_info?.price_info?.price_per_token === 0) {
    score += 30;
    reasons.push("Zero-value fungible with no metadata");
  }

  // ── Signal 7: Absurd supply — dust spam ──────────────────────────────────
  const supply   = Number(asset?.token_info?.supply   ?? 0);
  const decimals = Number(asset?.token_info?.decimals ?? 0);
  if (supply > 0 && decimals === 0 && supply > 1_000_000_000) {
    score += 25;
    reasons.push("Extremely large supply with 0 decimals (dust spam)");
  }
  if (supply > 1_000_000_000_000_000) {
    score += 15;
    reasons.push("Quadrillion+ token supply");
  }

  // ── Signal 8: On-chain price is $0 ───────────────────────────────────────
  const pricePerToken = asset?.token_info?.price_info?.price_per_token ?? null;
  if (pricePerToken !== null && pricePerToken === 0 && isFungible) {
    score += 15;
    reasons.push("Token price is $0.00 on-chain");
  }

  // ── Signal 9: Frozen token account ───────────────────────────────────────
  if (!isFungible && asset?.ownership?.frozen === true) {
    score += 20;
    reasons.push("Token account is frozen by creator");
  }

  // ── Signal 10: Unverified NFT with no image ───────────────────────────────
  const verified = Array.isArray(asset?.grouping) &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asset.grouping.some((g: any) => g.group_key === "collection" && g.verified === true);
  if (!isFungible && !verified && !imageUri) {
    score += 10;
    reasons.push("Unverified collection with no image");
  }

  // ── Clamp ─────────────────────────────────────────────────────────────────
  score = Math.min(100, score);

  let level: ScamLevel;
  if (score >= 80)      level = "confirmed";
  else if (score >= 45) level = "suspicious";
  else                  level = "clean";

  return { level, score, reasons };
}

/** Score every asset in a list. Returns a Map<mintAddress, ScamResult>. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function detectScamBatch(assets: any[]): Map<string, ScamResult> {
  const map = new Map<string, ScamResult>();
  for (const asset of assets) {
    if (asset?.id) map.set(String(asset.id), detectScam(asset));
  }
  return map;
}

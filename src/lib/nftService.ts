import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  unpackAccount,
} from "@solana/spl-token";
import { Connection, PublicKey, type AccountInfo } from "@solana/web3.js";
import { detectScam, type ScamResult } from "./scamDetector";

export interface NFTAsset {
  id: string;             // mint address
  name: string;
  image: string;
  symbol: string;
  description: string;
  collectionSymbol: string; // ME collection slug for floor price lookups
  compressed: boolean;      // true = cNFT (Merkle tree) — burned via Bubblegum, not ATA
  isFungible: boolean;      // true = SPL fungible token (not an NFT)
  decimals: number;         // token decimals — required for burnChecked
  supply?: number;          // raw token supply (units, not adjusted for decimals)
  priceUsd?: number;        // price per token in USD from DAS
  floorSol?: number;        // enriched after Magic Eden fetch
  listedCount?: number;
  scam?: ScamResult;        // populated by detectScam() during fetch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawDasAsset?: any;        // original DAS response — kept for debugging / re-scoring
}

const HELIUS_RPC_URL =
  "https://mainnet.helius-rpc.com/?api-key=dd39f964-79fe-4373-a22b-7cac000f163b";

// Helius DAS page size — 1000 is the documented maximum
const PAGE_LIMIT = 1000;

// How many pages to fire in parallel on the first sweep
const PARALLEL_PAGES = 5;

// ─── On-chain ATA verification ────────────────────────────────────────────────
//
// Helius DAS is an off-chain index — it lags reality by minutes or hours.
// filterLiveNFTs() does a cheap batch RPC call to verify each mint still has a
// real, non-empty ATA owned by the user. Ghost NFTs are silently dropped.
//
// We use unpackAccount() from @solana/spl-token instead of AccountLayout.decode()
// because Token-2022 accounts have extension bytes after the base 165 bytes.
// AccountLayout.decode() reads amount=0 on those accounts — a silent wrong result
// that would cause us to incorrectly mark live tokens as dead.
//
// Batch size = 100 (documented getMultipleAccountsInfo limit).
// We check both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID per mint.

const VERIFY_BATCH = 100;

/**
 * Given a list of NFTs and the wallet owner address, returns only those
 * that are verifiably NOT burned.
 *
 * Strategy (fail-open — cNFTs are never filtered):
 *  - ATA exists + amount > 0  → live, keep
 *  - ATA exists + amount = 0  → ghost, remove
 *  - No ATA at all            → keep (cNFT / pNFT in Merkle tree)
 *  - RPC call fails           → keep entire batch
 */
export async function filterLiveNFTs(
  nfts: NFTAsset[],
  ownerAddress: string
): Promise<NFTAsset[]> {
  if (!nfts.length) return [];

  let owner: PublicKey;
  try {
    owner = new PublicKey(ownerAddress);
  } catch {
    console.warn("[nftService] Invalid owner address, skipping verification:", ownerAddress);
    return nfts;
  }

  const connection = new Connection(HELIUS_RPC_URL, "confirmed");
  const dead = new Set<string>();

  for (let i = 0; i < nfts.length; i += VERIFY_BATCH) {
    const slice = nfts.slice(i, i + VERIFY_BATCH);

    const legacyATAs: (PublicKey | null)[] = slice.map((n) => {
      try { return getAssociatedTokenAddressSync(new PublicKey(n.id), owner, false, TOKEN_PROGRAM_ID); }
      catch { console.warn(`[nftService] Invalid mint for legacy ATA: ${n.id}`); return null; }
    });
    const t2022ATAs: (PublicKey | null)[] = slice.map((n) => {
      try { return getAssociatedTokenAddressSync(new PublicKey(n.id), owner, false, TOKEN_2022_PROGRAM_ID); }
      catch { console.warn(`[nftService] Invalid mint for Token-2022 ATA: ${n.id}`); return null; }
    });

    const DUMMY = new PublicKey("11111111111111111111111111111111");
    const keys = [
      ...legacyATAs.map((k) => k ?? DUMMY),
      ...t2022ATAs.map((k)  => k ?? DUMMY),
    ];

    let infos: (AccountInfo<Buffer> | null)[];
    try {
      infos = await connection.getMultipleAccountsInfo(keys, "confirmed");
    } catch (err) {
      console.warn("[nftService] RPC error verifying batch, keeping all:", err instanceof Error ? err.message : err);
      continue;
    }

    const legacyInfos = infos.slice(0, slice.length);
    const t2022Infos  = infos.slice(slice.length);

    /**
     * unpackAccount() is extension-aware — it correctly reads the amount field
     * even when Token-2022 extension bytes follow the base 165-byte layout.
     * AccountLayout.decode() would read amount=0 on those accounts.
     *
     * Returns:
     *   'live'   = ATA exists with amount > 0
     *   'dead'   = ATA exists with amount = 0
     *   'absent' = no ATA on-chain (cNFT, pNFT, or already transferred)
     */
    const checkATA = (
      info: AccountInfo<Buffer> | null,
      ata: PublicKey | null,
      program: PublicKey
    ): "live" | "dead" | "absent" => {
      if (!info?.data || !ata) return "absent";
      try {
        const unpacked = unpackAccount(ata, info, program);
        return unpacked.amount > BigInt(0) ? "live" : "dead";
      } catch (err) {
        console.warn("[nftService] Failed to unpack ATA:", err instanceof Error ? err.message : err);
        return "absent";
      }
    };

    slice.forEach((nft, idx) => {
      const legacyStatus = legacyATAs[idx] !== null
        ? checkATA(legacyInfos[idx], legacyATAs[idx], TOKEN_PROGRAM_ID)
        : "absent";
      const t2022Status = t2022ATAs[idx] !== null
        ? checkATA(t2022Infos[idx], t2022ATAs[idx], TOKEN_2022_PROGRAM_ID)
        : "absent";

      // Only mark dead if an ATA EXISTS and is empty.
      // If both absent → cNFT → keep.
      const explicitlyDead =
        (legacyStatus === "dead"  && t2022Status !== "live") ||
        (t2022Status  === "dead"  && legacyStatus !== "live");

      if (explicitlyDead) dead.add(nft.id);
    });
  }

  return nfts.filter((n) => !dead.has(n.id));
}

// ─── DAS asset mapper ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapAsset = (item: any): NFTAsset => {
  const isFungible =
    item.interface === "FungibleToken" ||
    item.interface === "FungibleAsset";

  return {
    id: String(item.id ?? ""),
    name:
      item.content?.metadata?.name ??
      item.content?.metadata?.symbol ??
      item.token_info?.symbol ??
      "Unknown Token",
    image:
      item.content?.links?.image ??
      item.content?.files?.[0]?.cdn_uri ??
      item.content?.files?.[0]?.uri ??
      "",
    symbol:      item.content?.metadata?.symbol ?? item.token_info?.symbol ?? "",
    description: item.content?.metadata?.description ?? "",
    compressed:  item.compression?.compressed === true,
    isFungible,
    decimals:    Number(item.token_info?.decimals ?? 0),
    supply:      item.token_info?.supply    !== undefined ? Number(item.token_info.supply)    : undefined,
    priceUsd:    item.token_info?.price_info?.price_per_token !== undefined
      ? Number(item.token_info.price_info.price_per_token)
      : undefined,
    collectionSymbol:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      item.grouping?.find((g: any) => g.group_key === "collection")?.collection_metadata?.symbol ??
      item.content?.metadata?.symbol ??
      "",
    scam:        detectScam(item),
    rawDasAsset: item,
  };
};

/** Fetch a single page from the Helius DAS API. Returns [] on any error. */
async function fetchPage(ownerAddress: string, page: number): Promise<NFTAsset[]> {
  try {
    const res = await fetch(HELIUS_RPC_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      signal:  AbortSignal.timeout(20_000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id:      `burnbox-p${page}`,
        method:  "getAssetsByOwner",
        params: {
          ownerAddress,
          page,
          limit: PAGE_LIMIT,
          sortBy: { sortBy: "created", sortDirection: "desc" },
          displayOptions: {
            showFungible:             true,  // include SPL fungible / scam tokens
            showUnverifiedCollections: true,
            showCollectionMetadata:   true,
            showNativeBalance:        false,
            showInscription:          false,
          },
        },
      }),
    });

    if (!res.ok) {
      console.warn(`[nftService] DAS fetchPage ${page} failed: HTTP ${res.status}`);
      return [];
    }
    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = json?.result?.items ?? [];
    return items.map(mapAsset).filter((n) => n.id);
  } catch (err) {
    console.warn(`[nftService] DAS fetchPage ${page} error:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Fetches ALL NFTs + tokens for a wallet using a parallel page strategy.
 *
 * Phase 1: Fire pages 1–PARALLEL_PAGES simultaneously (covers most wallets).
 * Phase 2: Continue fetching in parallel until a short page is returned.
 *
 * onBatch is called after every completed page so the UI can stream results.
 * Each batch is verified on-chain before being surfaced (ghost NFTs dropped).
 */
export async function fetchUserNFTs(
  ownerAddress: string,
  onBatch?: (batch: NFTAsset[], totalSoFar: number) => void
): Promise<NFTAsset[]> {
  const all: NFTAsset[] = [];
  let pageBase = 1;

  while (true) {
    const pages   = Array.from({ length: PARALLEL_PAGES }, (_, i) => pageBase + i);
    const results = await Promise.all(pages.map((p) => fetchPage(ownerAddress, p)));

    let hitShortPage = false;

    for (const batch of results) {
      if (batch.length > 0) {
        // Verify on-chain before surfacing to UI (skip for fungible — they have ATAs)
        const toVerify = batch.filter((n) => !n.isFungible);
        const fungible = batch.filter((n) => n.isFungible);

        const verified = toVerify.length > 0
          ? await filterLiveNFTs(toVerify, ownerAddress)
          : [];

        const live = [...verified, ...fungible];
        if (live.length > 0) {
          all.push(...live);
          onBatch?.(live, all.length);
        }
      }
      if (batch.length < PAGE_LIMIT) {
        hitShortPage = true;
        break;
      }
    }

    if (hitShortPage) break;
    pageBase += PARALLEL_PAGES;
  }

  return all;
}

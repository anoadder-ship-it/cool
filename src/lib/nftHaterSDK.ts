/**
 * BurnBox SDK — destroys NFTs permanently.
 *
 * TWO burn paths depending on NFT type:
 *
 * ── Regular NFTs (SPL token, pNFT, Token-2022 + extensions) ─────────────────
 *   1. unpackAccount() reads ATA — handles all Token-2022 extension layouts
 *   2. TX-1: burnChecked + closeAccount  → pure burn (Phantom shows no warning)
 *   3. TX-2: SystemProgram.transfer fee  → separate, clearly-labeled SOL transfer
 *   Splitting the fee into its own tx prevents Phantom's "suspicious transfer" flag.
 *
 * ── Compressed NFTs (cNFT / Bubblegum) ──────────────────────────────────────
 *   cNFTs live in Merkle trees — they have NO token account.
 *   1. Fetch asset proof (Merkle path) from Helius DAS
 *   2. Build Bubblegum `burn` instruction
 *   3. TX-1: Bubblegum burn
 *   4. TX-2: fee transfer
 *
 * SIGNING MODEL:
 *   wallet.signTransaction() — one tx at a time, explicit user approval.
 *   We NEVER call signAllTransactions silently.
 *
 * ERROR CLASSES (surfaced to UI):
 *   NO_SOL | RATE_LIMITED | USER_REJECTED | ATA_MISSING |
 *   METADATA_ERROR | NETWORK_ERROR | TX_EXPIRED | UNKNOWN
 */

import {
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  unpackAccount,
  getMint,
} from "@solana/spl-token";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  AccountMeta,
} from "@solana/web3.js";
import type { AnchorProvider } from "@coral-xyz/anchor";
import {
  ADMIN_TREASURY,
  FEE_PER_BURN_SOL,
  PREMIUM_FEE_SOL,
  HELIUS_RPC,
} from "./configAddress";
import { explorerTxUrl } from "./explorer";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BurnRecord {
  mint: string;
  mintName?: string;
  signature: string;
  explorerUrl: string;
  burnAddress: string;
  timestamp: number;
  feeSol: number;
}

export interface BurnBatchResult {
  successCount: number;
  failCount: number;
  records: BurnRecord[];
  errors: BurnError[];
}

export interface BurnError {
  mint: string;
  message: string;
  code: BurnErrorCode;
  userFacing: string;
}

export type BurnErrorCode =
  | "NO_SOL"
  | "RATE_LIMITED"
  | "USER_REJECTED"
  | "ATA_MISSING"
  | "METADATA_ERROR"
  | "NETWORK_ERROR"
  | "TX_EXPIRED"
  | "UNKNOWN";

export interface SDKResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: BurnErrorCode;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** 1 NFT per tx — explicit user approval for each */
const CHUNK_SIZE = 1;

/** Pause between chunks — avoids RPC rate-limit */
const INTER_CHUNK_MS = 800;

// Bubblegum program — handles all cNFT operations
const BUBBLEGUM_PROGRAM_ID = new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");
// SPL Account Compression program
const SPL_ACCOUNT_COMPRESSION_ID = new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK");
// SPL Noop program (logs)
const SPL_NOOP_ID = new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");

// ─── Error parsing ────────────────────────────────────────────────────────────

function classifyError(err: unknown): { code: BurnErrorCode; userFacing: string; raw: string } {
  const msg   = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes("user rejected") ||
    lower.includes("cancelled") ||
    lower.includes("transaction cancelled") ||
    lower.includes("wallet locked")
  )
    return { code: "USER_REJECTED", userFacing: "You rejected the transaction in your wallet.", raw: msg };

  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many requests"))
    return { code: "RATE_LIMITED", userFacing: "RPC rate limit — please wait a few seconds and retry.", raw: msg };

  if (
    lower.includes("insufficient lamports") ||
    lower.includes("insufficient funds") ||
    (lower.includes("0x1") && lower.includes("lamport"))
  )
    return { code: "NO_SOL", userFacing: "Insufficient SOL. Top up your wallet and retry.", raw: msg };

  if (lower.includes("blockhash not found") || lower.includes("block height exceeded"))
    return { code: "TX_EXPIRED", userFacing: "Transaction expired (network congestion). Retrying…", raw: msg };

  if (
    lower.includes("account not found") ||
    lower.includes("no account") ||
    lower.includes("could not find account")
  )
    return { code: "ATA_MISSING", userFacing: "Token account not found — NFT may already be burned.", raw: msg };

  if (lower.includes("fetch") || lower.includes("network") || lower.includes("failed to fetch"))
    return { code: "NETWORK_ERROR", userFacing: "Network unreachable. Check your connection.", raw: msg };

  return { code: "UNKNOWN", userFacing: msg || "Unknown error. Please retry.", raw: msg };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep  = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const getATA = (mint: PublicKey, owner: PublicKey, program: PublicKey): PublicKey =>
  getAssociatedTokenAddressSync(mint, owner, false, program);
const solIx  = (from: PublicKey, to: PublicKey, lamports: number): TransactionInstruction =>
  SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports });

// ─── SDK ──────────────────────────────────────────────────────────────────────

export class BurnBoxSDK {
  private readonly connection: Connection;
  private readonly wallet: AnchorProvider["wallet"];
  private readonly treasury: PublicKey;

  constructor(provider: AnchorProvider) {
    this.connection = provider.connection;
    this.wallet     = provider.wallet;
    this.treasury   = new PublicKey(ADMIN_TREASURY);
  }

  // ── Network health ──────────────────────────────────────────────────────────

  async isNetworkHealthy(): Promise<boolean> {
    try { return (await this.connection.getSlot("finalized")) > 0; }
    catch { return false; }
  }

  async getSolBalance(account?: PublicKey): Promise<number> {
    const target = account ?? this.wallet.publicKey;
    if (!target) return 0;
    try { return (await this.connection.getBalance(target, "confirmed")) / LAMPORTS_PER_SOL; }
    catch { return 0; }
  }

  async assertBalance(nftCount: number, premium = false): Promise<void> {
    const payer = this.wallet.publicKey;
    if (!payer) throw Object.assign(new Error("Wallet not connected"), { code: "NO_SOL" });
    const bal    = await this.getSolBalance(payer);
    const fee    = premium ? PREMIUM_FEE_SOL : nftCount * FEE_PER_BURN_SOL;
    const txFees = nftCount * 0.000025;
    const need   = fee + txFees + 0.001;
    if (bal < need) {
      throw Object.assign(
        new Error(`Need ~${need.toFixed(4)} SOL (have ${bal.toFixed(4)}).`),
        { code: "NO_SOL" }
      );
    }
  }

  // ── Regular NFT burn (SPL ATA — legacy + Token-2022 + all extensions) ───────
  //
  // unpackAccount() from @solana/spl-token is extension-aware:
  // it correctly handles TransferFee, MetadataPointer, TransferHook,
  // ConfidentialTransfer, ImmutableOwner, MemoTransfer, and every other
  // Token-2022 extension that appends bytes after the base 165-byte layout.
  // AccountLayout.decode() would read amount as 0 on these accounts.

  private async getATAInfo(
    mint: PublicKey,
    payer: PublicKey
  ): Promise<{ tokenProgram: PublicKey; amount: bigint; decimals: number; userATA: PublicKey } | null> {
    const legacyATA = getATA(mint, payer, TOKEN_PROGRAM_ID);
    const t2022ATA  = getATA(mint, payer, TOKEN_2022_PROGRAM_ID);

    let infos;
    try {
      infos = await this.connection.getMultipleAccountsInfo([legacyATA, t2022ATA], "confirmed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("429") || msg.includes("rate limit")) {
        await sleep(2000);
        infos = await this.connection.getMultipleAccountsInfo([legacyATA, t2022ATA], "confirmed");
      } else { throw err; }
    }

    const [legacyInfo, t2022Info] = infos;

    // Determine which token program owns this ATA
    let tokenProgram: PublicKey;
    let rawInfo: (typeof legacyInfo);
    let userATA: PublicKey;

    if (legacyInfo) {
      tokenProgram = TOKEN_PROGRAM_ID;
      rawInfo      = legacyInfo;
      userATA      = legacyATA;
    } else if (t2022Info) {
      tokenProgram = TOKEN_2022_PROGRAM_ID;
      rawInfo      = t2022Info;
      userATA      = t2022ATA;
    } else {
      return null; // no ATA exists for either program
    }

    // unpackAccount handles base SPL layout AND every Token-2022 extension.
    // It reads the amount field correctly even when extension bytes follow it.
    let unpacked: ReturnType<typeof unpackAccount>;
    try {
      unpacked = unpackAccount(userATA, rawInfo, tokenProgram);
    } catch {
      // Malformed account data — skip this NFT
      return null;
    }

    if (unpacked.amount === BigInt(0)) return null;

    let decimals = 0;
    try {
      const mintInfo = await getMint(this.connection, mint, "confirmed", tokenProgram);
      decimals = mintInfo.decimals;
    } catch {
      decimals = 0; // NFTs are always 0 decimals — safe fallback
    }

    return { tokenProgram, amount: unpacked.amount, decimals, userATA };
  }

  // Build the burn+close transaction (no fee — purely the SPL operations).
  // Phantom shows this as a standard "burn" action with no security warnings.
  private async buildBurnTx(
    mint: PublicKey,
    payer: PublicKey,
    tokenProgram: PublicKey,
    amount: bigint,
    decimals: number
  ): Promise<Transaction> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");

    const tx      = new Transaction({ blockhash, lastValidBlockHeight, feePayer: payer });
    const userATA = getATA(mint, payer, tokenProgram);

    // burnChecked: destroys tokens directly in the ATA (no suspicious transfer)
    // closeAccount: reclaims ~0.002 SOL rent back to the owner
    tx.add(
      createBurnCheckedInstruction(userATA, mint, payer, amount, decimals, [], tokenProgram),
      createCloseAccountInstruction(userATA, payer, payer, [], tokenProgram)
    );
    return tx;
  }

  // Build the service fee transaction — a plain SOL transfer to treasury.
  // Kept separate so Phantom displays it as "send 0.005 SOL" — clear intent.
  private async buildFeeTx(payer: PublicKey): Promise<Transaction> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");

    const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: payer });
    tx.add(solIx(payer, this.treasury, Math.round(FEE_PER_BURN_SOL * LAMPORTS_PER_SOL)));
    return tx;
  }

  // ── Compressed NFT burn (Bubblegum / DAS) ───────────────────────────────────
  //
  // cNFTs have no token account — they live in a Merkle tree.
  // To burn one we need:
  //  1. The asset proof (Merkle path) from Helius DAS
  //  2. The asset's tree/leaf data (also from DAS)
  //  3. A Bubblegum `burn` instruction built from that data

  private async fetchAssetProof(mintAddress: string): Promise<{
    root: string;
    proof: string[];
    node_index: number;
    leaf: string;
    tree_id: string;
  }> {
    const res = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "burnbox-proof",
        method: "getAssetProof",
        params: { id: mintAddress },
      }),
    });
    if (!res.ok) throw new Error(`DAS proof fetch failed: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`DAS proof error: ${json.error.message}`);
    return json.result;
  }

  private async fetchAsset(mintAddress: string): Promise<{
    compression: {
      leaf_id: number;
      data_hash: string;
      creator_hash: string;
      asset_hash: string;
      tree: string;
      seq: number;
    };
  }> {
    const res = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "burnbox-asset",
        method: "getAsset",
        params: { id: mintAddress },
      }),
    });
    if (!res.ok) throw new Error(`DAS asset fetch failed: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`DAS asset error: ${json.error.message}`);
    return json.result;
  }

  /**
   * Builds a Bubblegum `burn` transaction for a compressed NFT.
   *
   * Bubblegum burn instruction layout:
   *   discriminator [8]  — sha256("global:burn")[0..8]
   *   root [32]
   *   data_hash [32]
   *   creator_hash [32]
   *   nonce u64 LE [8]   — leaf_id
   *   index u32 LE [4]   — leaf_id
   *
   * Accounts:
   *   [0] tree_authority (PDA, seeds=[merkle_tree])
   *   [1] leaf_owner (signer, writable)
   *   [2] leaf_delegate (= leaf_owner)
   *   [3] merkle_tree (writable)
   *   [4] log_wrapper (noop)
   *   [5] compression_program
   *   [6] system_program
   *   [7..N] proof path accounts
   */
  private async buildCNFTBurnTx(
    mintAddress: string,
    payer: PublicKey
  ): Promise<Transaction> {
    const [proofData, assetData] = await Promise.all([
      this.fetchAssetProof(mintAddress),
      this.fetchAsset(mintAddress),
    ]);

    const { compression } = assetData;
    const treePublicKey   = new PublicKey(compression.tree);

    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [treePublicKey.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );

    const proofAccounts: AccountMeta[] = proofData.proof.map((p) => ({
      pubkey: new PublicKey(p),
      isSigner: false,
      isWritable: false,
    }));

    // Discriminator: sha256("global:burn")[0..8]
    const discriminator = Buffer.from([116, 110, 29, 56, 107, 219, 42, 93]);

    // root comes as base58 from DAS — decode it
    const rootBytes        = new PublicKey(proofData.root).toBuffer();
    // hashes come as hex strings prefixed with 0x
    const dataHashStr    = compression.data_hash.startsWith("0x")
      ? compression.data_hash.slice(2)
      : compression.data_hash;
    const creatorHashStr = compression.creator_hash.startsWith("0x")
      ? compression.creator_hash.slice(2)
      : compression.creator_hash;
    const dataHashBytes    = Buffer.from(dataHashStr,    "hex");
    const creatorHashBytes = Buffer.from(creatorHashStr, "hex");

    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64LE(BigInt(compression.leaf_id));
    const indexBuf = Buffer.alloc(4);
    indexBuf.writeUInt32LE(compression.leaf_id);

    const data = Buffer.concat([
      discriminator,
      rootBytes,
      dataHashBytes,
      creatorHashBytes,
      nonceBuf,
      indexBuf,
    ]);

    const burnIx = new TransactionInstruction({
      programId: BUBBLEGUM_PROGRAM_ID,
      keys: [
        { pubkey: treeAuthority,             isSigner: false, isWritable: false },
        { pubkey: payer,                      isSigner: true,  isWritable: true  },
        { pubkey: payer,                      isSigner: true,  isWritable: false }, // leaf_delegate = owner
        { pubkey: treePublicKey,              isSigner: false, isWritable: true  },
        { pubkey: SPL_NOOP_ID,                isSigner: false, isWritable: false },
        { pubkey: SPL_ACCOUNT_COMPRESSION_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId,    isSigner: false, isWritable: false },
        ...proofAccounts,
      ],
      data,
    });

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");

    const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: payer });
    tx.add(burnIx);
    return tx;
  }

  // ── Sign + send ─────────────────────────────────────────────────────────────

  private async signAndSend(tx: Transaction): Promise<string> {
    const signed = await this.wallet.signTransaction(tx);
    const sig    = await this.connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });
    await this.connection.confirmTransaction(
      {
        signature: sig,
        blockhash: tx.recentBlockhash!,
        lastValidBlockHeight:
          (tx as Transaction & { lastValidBlockHeight?: number }).lastValidBlockHeight ??
          (await this.connection.getBlockHeight()) + 150,
      },
      "confirmed"
    );
    return sig;
  }

  // ── Burn one NFT — auto-routes by type ─────────────────────────────────────
  //
  // Two-tx flow for regular NFTs:
  //   TX-1: burnChecked + closeAccount  (Phantom shows "Burn NFT + Reclaim rent")
  //   TX-2: SOL transfer fee            (Phantom shows "Send 0.005 SOL to treasury")
  //
  // This prevents Phantom from merging a suspicious "burn + pay unknown address"
  // into one transaction and blocking it as malicious.

  private async burnOne(
    mint: PublicKey,
    payer: PublicKey,
    compressed: boolean
  ): Promise<{ sig: string } | BurnError> {

    // ── PATH A: Compressed NFT (cNFT / Bubblegum) ────────────────────────────
    if (compressed) {
      try {
        // TX-1: Bubblegum burn
        const burnTx = await this.buildCNFTBurnTx(mint.toString(), payer);
        const sig    = await this.signAndSend(burnTx);

        // TX-2: service fee (separate — clear intent for Phantom)
        try {
          const feeTx = await this.buildFeeTx(payer);
          await this.signAndSend(feeTx);
        } catch {
          // Fee failed — burn already succeeded; non-fatal, just log
          console.warn(`[BurnBox] Fee tx failed for cNFT ${mint.toString()}`);
        }

        return { sig };
      } catch (err) {
        const { code, userFacing, raw } = classifyError(err);

        if (code === "TX_EXPIRED") {
          try {
            await sleep(1500);
            const freshTx = await this.buildCNFTBurnTx(mint.toString(), payer);
            const sig     = await this.signAndSend(freshTx);

            try {
              const feeTx = await this.buildFeeTx(payer);
              await this.signAndSend(feeTx);
            } catch { /* non-fatal */ }

            return { sig };
          } catch (retryErr) {
            const r = classifyError(retryErr);
            return { mint: mint.toString(), message: r.raw, code: r.code, userFacing: r.userFacing };
          }
        }
        return { mint: mint.toString(), message: raw, code, userFacing };
      }
    }

    // ── PATH B: Regular SPL NFT / pNFT / Token-2022 + all extensions ─────────
    let ataData: Awaited<ReturnType<typeof this.getATAInfo>>;
    try {
      ataData = await this.getATAInfo(mint, payer);
    } catch (err) {
      const { code, userFacing, raw } = classifyError(err);
      return { mint: mint.toString(), message: raw, code, userFacing };
    }

    if (!ataData) {
      return {
        mint: mint.toString(),
        message: "No token account found",
        code: "ATA_MISSING",
        userFacing: "Token account not found — this NFT may already be burned or transferred.",
      };
    }

    const { tokenProgram, amount, decimals } = ataData;

    try {
      // TX-1: burnChecked + closeAccount — Phantom shows a clean "Burn" action
      const burnTx = await this.buildBurnTx(mint, payer, tokenProgram, amount, decimals);
      const sig    = await this.signAndSend(burnTx);

      // TX-2: service fee — shown to user as a plain SOL transfer
      try {
        const feeTx = await this.buildFeeTx(payer);
        await this.signAndSend(feeTx);
      } catch {
        console.warn(`[BurnBox] Fee tx failed for ${mint.toString()}`);
      }

      return { sig };
    } catch (err) {
      const { code, userFacing, raw } = classifyError(err);

      if (code === "TX_EXPIRED") {
        try {
          await sleep(1500);
          const freshBurnTx = await this.buildBurnTx(mint, payer, tokenProgram, amount, decimals);
          const sig         = await this.signAndSend(freshBurnTx);

          try {
            const feeTx = await this.buildFeeTx(payer);
            await this.signAndSend(feeTx);
          } catch { /* non-fatal */ }

          return { sig };
        } catch (retryErr) {
          const r = classifyError(retryErr);
          return { mint: mint.toString(), message: r.raw, code: r.code, userFacing: r.userFacing };
        }
      }
      return { mint: mint.toString(), message: raw, code, userFacing };
    }
  }

  // ── Public: burn batch ──────────────────────────────────────────────────────

  /**
   * Burns a list of NFT mints.
   * compressedSet contains the mints that are compressed (cNFT).
   * Each NFT is a pair of transactions — burn tx + fee tx — each requires
   * explicit user approval in Phantom.
   */
  async burnBatch(
    mintAddresses: string[],
    nftNames: Record<string, string> = {},
    onProgress?: (burned: number, total: number, lastSig?: string) => void,
    compressedSet: Set<string> = new Set()
  ): Promise<SDKResult<BurnBatchResult>> {
    const payer = this.wallet.publicKey;
    if (!payer) return { success: false, error: "Wallet not connected", errorCode: "NO_SOL" };
    if (!mintAddresses.length) return { success: false, error: "No NFTs selected" };

    if (!(await this.isNetworkHealthy())) {
      return {
        success: false,
        error: "Cannot reach Solana network. Check your connection.",
        errorCode: "NETWORK_ERROR",
      };
    }

    try {
      await this.assertBalance(mintAddresses.length);
    } catch (err) {
      const { userFacing } = classifyError(err);
      return { success: false, error: userFacing, errorCode: "NO_SOL" };
    }

    const mints: PublicKey[] = [];
    for (const addr of mintAddresses) {
      try { mints.push(new PublicKey(addr)); } catch { /* skip invalid */ }
    }

    const result: BurnBatchResult = {
      successCount: 0,
      failCount: 0,
      records: [],
      errors: [],
    };

    for (let i = 0; i < mints.length; i += CHUNK_SIZE) {
      const chunk = mints.slice(i, i + CHUNK_SIZE);

      for (const mint of chunk) {
        const mintStr      = mint.toString();
        const isCompressed = compressedSet.has(mintStr);
        const outcome      = await this.burnOne(mint, payer, isCompressed);

        if ("sig" in outcome) {
          result.successCount++;
          result.records.push({
            mint:        mintStr,
            mintName:    nftNames[mintStr],
            signature:   outcome.sig,
            explorerUrl: explorerTxUrl(outcome.sig),
            burnAddress: isCompressed ? "Bubblegum tree (compressed burn)" : "SPL burn (token destroyed)",
            timestamp:   Date.now(),
            feeSol:      FEE_PER_BURN_SOL,
          });
          onProgress?.(result.successCount, mints.length, outcome.sig);
        } else {
          result.failCount++;
          result.errors.push(outcome);
        }
      }

      if (i + CHUNK_SIZE < mints.length) await sleep(INTER_CHUNK_MS);
    }

    return {
      success: result.successCount > 0 || result.failCount === 0,
      data: result,
    };
  }
}

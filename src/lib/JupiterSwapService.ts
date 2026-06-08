import { VersionedTransaction } from "@solana/web3.js";
import type { PublicKey } from "@solana/web3.js";

const JUPITER_API_URL = "https://api.jup.ag/swap/v2";
const API_KEY = import.meta.env.VITE_JUPITER_API_KEY || "";

// SOL mint address (wrapped SOL)
export const SOL_MINT  = "So11111111111111111111111111111111111111112";
// USDC mint address
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface JupiterOrderResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  transaction?: string;
  lastValidBlockHeight?: number;
  requestId?: string;
}

export interface JupiterExecuteResponse {
  status: "Success" | "Failed";
  signature?: string;
  inputAmount?: string;
  outputAmount?: string;
  error?: string;
}

export interface JupiterSwapResult {
  signature: string;
  inputAmount: string;
  outputAmount: string;
  explorerUrl: string;
}

export interface SignableWallet {
  publicKey: PublicKey | null;
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) h["x-api-key"] = API_KEY;
  return h;
}

class JupiterSwapService {
  async getOrder(
    inputMint: string,
    outputMint: string,
    amount: number,
    options: { slippageBps?: number; taker?: string } = {}
  ): Promise<JupiterOrderResponse | null> {
    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: (options.slippageBps ?? 150).toString(),
      });
      if (options.taker) params.set("taker", options.taker);

      const res = await fetch(`${JUPITER_API_URL}/order?${params}`, {
        headers: headers(),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        console.warn(`[JupiterSwap] getOrder failed: HTTP ${res.status}`);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.warn("[JupiterSwap] getOrder error:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  async executeOrder(
    signedTransaction: string,
    requestId: string,
    lastValidBlockHeight?: number
  ): Promise<JupiterExecuteResponse | null> {
    try {
      const body: Record<string, unknown> = { signedTransaction, requestId };
      if (lastValidBlockHeight !== undefined)
        body.lastValidBlockHeight = lastValidBlockHeight.toString();

      const res = await fetch(`${JUPITER_API_URL}/execute`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const data: JupiterExecuteResponse = await res.json();
      if (!res.ok || data.status === "Failed") {
        console.warn("[JupiterSwap] executeOrder failed:", data.error ?? `HTTP ${res.status}`);
        return null;
      }
      return data;
    } catch (err) {
      console.warn("[JupiterSwap] executeOrder error:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Swap USDC → SOL (or any token → SOL).
   * Uses signTransaction — user approves once in their wallet.
   */
  async buySOL(
    wallet: SignableWallet,
    usdcAmountRaw: number,   // in USDC base units (6 decimals)
    slippageBps = 150
  ): Promise<JupiterSwapResult | { error: string }> {
    if (!wallet.publicKey) return { error: "Wallet not connected" };
    if (!wallet.signTransaction) return { error: "Wallet does not support signing" };

    const order = await this.getOrder(USDC_MINT, SOL_MINT, usdcAmountRaw, {
      slippageBps,
      taker: wallet.publicKey.toString(),
    });

    if (!order?.transaction || !order.requestId) {
      return { error: "Failed to get swap quote from Jupiter. Try again in a moment." };
    }

    let signedTx: VersionedTransaction;
    try {
      const tx = VersionedTransaction.deserialize(
        Buffer.from(order.transaction, "base64")
      );
      signedTx = await wallet.signTransaction(tx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel"))
        return { error: "Transaction rejected in wallet." };
      return { error: "Failed to sign transaction." };
    }

    const signedBase64 = Buffer.from(signedTx.serialize()).toString("base64");
    const result = await this.executeOrder(signedBase64, order.requestId, order.lastValidBlockHeight);

    if (!result?.signature) {
      return { error: "Swap failed on-chain. Please try again." };
    }

    return {
      signature: result.signature,
      inputAmount: result.inputAmount ?? order.inAmount,
      outputAmount: result.outputAmount ?? order.outAmount,
      explorerUrl: `https://explorer.solana.com/tx/${result.signature}?cluster=mainnet`,
    };
  }

  /** UI-only estimate — no wallet needed */
  async estimateSOLOut(usdcAmount: number): Promise<number> {
    try {
      const raw = Math.round(usdcAmount * 1_000_000);
      const order = await this.getOrder(USDC_MINT, SOL_MINT, raw);
      if (order) return parseFloat(order.outAmount) / 1e9;
      return 0;
    } catch (err) {
      console.warn("[JupiterSwap] estimateSOLOut error:", err instanceof Error ? err.message : err);
      return 0;
    }
  }
}

export const jupiterSwapService = new JupiterSwapService();

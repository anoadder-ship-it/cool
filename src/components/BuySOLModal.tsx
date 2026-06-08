/**
 * BuySOLModal — swap USDC → SOL via Jupiter when balance is too low.
 * Shown automatically when the user tries to burn without enough SOL.
 */
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ArrowDown, ExternalLink, RefreshCw,
  AlertTriangle, CheckCircle2, Loader2, Info,
} from "lucide-react";
import { jupiterSwapService } from "@/lib/JupiterSwapService";
import { useSolBalance } from "@/hooks/useSolBalance";
import { explorerTxUrl } from "@/lib/explorer";

interface BuySOLModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Amount of SOL the user needs (to pre-fill the input) */
  suggestedSol?: number;
  onSuccess?: (signature: string) => void;
}

const PRESETS = [5, 10, 20, 50]; // USDC amounts

export const BuySOLModal = ({ open, onOpenChange, suggestedSol = 0.05, onSuccess }: BuySOLModalProps) => {
  const wallet = useWallet();
  const { balance, refresh } = useSolBalance();

  // Pre-fill: suggestedSol * ~$150/SOL estimate, rounded up
  const defaultUsdc = Math.max(1, Math.ceil(suggestedSol * 160));

  const [usdcAmount, setUsdcAmount] = useState(defaultUsdc.toString());
  const [estimate,   setEstimate]   = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [swapping,   setSwapping]   = useState(false);
  const [result,     setResult]     = useState<{ sig: string; solOut: number } | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  // Live estimate as user types
  useEffect(() => {
    const amount = parseFloat(usdcAmount);
    if (!amount || amount <= 0) { setEstimate(null); return; }

    let cancelled = false;
    setEstimating(true);
    jupiterSwapService.estimateSOLOut(amount).then((sol) => {
      if (!cancelled) { setEstimate(sol); setEstimating(false); }
    });
    return () => { cancelled = true; };
  }, [usdcAmount]);

  const handleSwap = async () => {
    const amount = parseFloat(usdcAmount);
    if (!amount || amount <= 0) return;

    setSwapping(true);
    setError(null);

    const raw = Math.round(amount * 1_000_000); // USDC has 6 decimals
    const res = await jupiterSwapService.buySOL(
      { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
      raw
    );

    setSwapping(false);

    if ("error" in res) {
      setError(res.error);
    } else {
      const solOut = parseFloat(res.outputAmount) / 1e9;
      setResult({ sig: res.signature, solOut });
      onSuccess?.(res.signature);
      await refresh();
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setUsdcAmount(defaultUsdc.toString());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!swapping) { reset(); onOpenChange(v); } }}>
      <DialogContent className="bg-card border border-border/60 max-w-sm p-0 overflow-hidden">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border/40 bg-blue-950/20">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                <ArrowDown className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold uppercase tracking-wider">Buy SOL</DialogTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">via Jupiter · USDC → SOL</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-5 py-5 space-y-4">

          {result ? (
            /* ── Success ── */
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-sm uppercase tracking-wider text-emerald-400">Swap Complete</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Received <strong className="text-foreground">{result.solOut.toFixed(4)} SOL</strong>
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span>New balance:</span>
                <span className="text-foreground font-semibold">{(balance ?? 0).toFixed(4)} SOL</span>
              </div>
              <a
                href={explorerTxUrl(result.sig)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg border border-emerald-600/20 bg-emerald-950/20 text-[11px] font-mono text-emerald-400 hover:border-emerald-500/40 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View on Solana Explorer
              </a>
              <Button
                className="w-full h-9 text-xs burn-button text-white font-bold uppercase tracking-wider"
                onClick={() => { reset(); onOpenChange(false); }}
              >
                Done — Back to Burn
              </Button>
            </div>

          ) : (
            /* ── Input ── */
            <>
              {/* Balance */}
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-muted-foreground/50">Current SOL</span>
                <div className="flex items-center gap-1.5">
                  <span className={`font-semibold ${(balance ?? 0) < 0.01 ? "text-red-400" : "text-foreground"}`}>
                    {balance !== null ? `${balance.toFixed(4)} SOL` : "—"}
                  </span>
                  <button onClick={refresh} className="text-muted-foreground/30 hover:text-muted-foreground transition-colors">
                    <RefreshCw className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>

              {/* USDC input */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  USDC to spend
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={usdcAmount}
                    onChange={(e) => setUsdcAmount(e.target.value)}
                    min={0}
                    step={0.01}
                    placeholder="10"
                    className="w-full h-11 bg-secondary/40 border border-border/40 rounded-lg px-3 pr-14 text-base font-mono focus:outline-none focus:border-blue-500/40 transition-all"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-foreground/50">
                    USDC
                  </span>
                </div>
                {/* Presets */}
                <div className="flex gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setUsdcAmount(p.toString())}
                      className={`flex-1 h-6 rounded text-[10px] font-mono border transition-colors ${
                        usdcAmount === p.toString()
                          ? "border-blue-500/40 bg-blue-950/30 text-blue-400"
                          : "border-border/40 bg-secondary/30 text-muted-foreground hover:border-border"
                      }`}
                    >
                      ${p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="w-7 h-7 rounded-full bg-secondary/60 border border-border/40 flex items-center justify-center">
                  <ArrowDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                </div>
              </div>

              {/* SOL estimate */}
              <div className="rounded-lg border border-border/40 bg-secondary/30 px-4 py-3 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">You receive (est.)</span>
                <span className="font-mono text-base font-bold">
                  {estimating ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : estimate !== null ? (
                    <>{estimate.toFixed(4)} <span className="text-sm font-normal text-muted-foreground">SOL</span></>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </span>
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 text-[10px] text-muted-foreground/40 font-mono">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                <span>
                  Rate sourced from Jupiter. You sign one transaction via{" "}
                  <code className="text-muted-foreground/60">signTransaction</code>. Slippage: 1.5%.
                </span>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-red-500/20 bg-red-950/10">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-red-300/80">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-9 text-xs border-border/50 text-muted-foreground hover:text-foreground"
                  onClick={() => onOpenChange(false)}
                  disabled={swapping}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 h-9 text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white"
                  onClick={handleSwap}
                  disabled={swapping || !wallet.connected || !parseFloat(usdcAmount)}
                >
                  {swapping
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Swapping…</>
                    : <><ArrowDown className="w-3.5 h-3.5 mr-1.5" />Swap Now</>
                  }
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

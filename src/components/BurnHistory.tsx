/**
 * BurnHistory — shows every burn the user performed in this session.
 * Each record links directly to Solana Explorer so the burn is verifiable on-chain.
 */
import { ExternalLink, Flame, Clock, CheckCircle2, Copy } from "lucide-react";
import { BurnRecord } from "@/lib/nftHaterSDK";
import { ADMIN_TREASURY } from "@/lib/configAddress";
import { useState } from "react";

interface BurnHistoryProps {
  records: BurnRecord[];
}

const shortAddr = (addr: string) =>
  addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

const shortSig = (sig: string) =>
  sig.length > 12 ? `${sig.slice(0, 8)}…${sig.slice(-6)}` : sig;

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export const BurnHistory = ({ records }: BurnHistoryProps) => {
  const [copied, setCopied] = useState<string | null>(null);

  if (records.length === 0) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  // Deduplicate by signature (one sig = one tx = multiple mints possible)
  const bySignature = records.reduce<Map<string, BurnRecord[]>>((acc, r) => {
    const existing = acc.get(r.signature) ?? [];
    acc.set(r.signature, [...existing, r]);
    return acc;
  }, new Map());

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-secondary/30">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest">Burn History</span>
          <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-[10px] font-mono text-primary">
            {records.length} NFTs
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/40 font-mono">
          Verified on-chain
        </span>
      </div>

      {/* Transaction rows */}
      <div className="divide-y divide-border/20 max-h-72 overflow-y-auto">
        {Array.from(bySignature.entries()).map(([sig, recs]) => (
          <div key={sig} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/20 transition-colors group">

            {/* Icon */}
            <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Flame className="w-3 h-3 text-primary" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-foreground/90">
                  {recs.length} NFT{recs.length > 1 ? "s" : ""} burned
                </span>
                {recs.length > 1 && (
                  <span className="text-[10px] text-muted-foreground/50 font-mono truncate max-w-[120px]">
                    {recs.slice(0, 2).map((r) => shortAddr(r.mint)).join(", ")}
                    {recs.length > 2 ? ` +${recs.length - 2}` : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 font-mono">
                <Clock className="w-2.5 h-2.5" />
                {formatTime(recs[0].timestamp)}
                <span className="text-muted-foreground/30">·</span>
                <span>{shortSig(sig)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleCopy(sig)}
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                title="Copy signature"
              >
                <Copy className="w-3 h-3" />
              </button>
              {copied === sig && (
                <span className="text-[9px] text-emerald-400 font-mono absolute">✓</span>
              )}
              <a
                href={recs[0].explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 rounded border border-border/40 bg-secondary/40 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
                title="View on Solana Explorer"
              >
                <ExternalLink className="w-2.5 h-2.5" />
                Explorer
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border/20 bg-secondary/10 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/30 font-mono">
          All transactions are permanent and verifiable on Solana mainnet
        </span>
        <a
          href={`https://explorer.solana.com/address/${ADMIN_TREASURY}?cluster=mainnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-primary/50 hover:text-primary font-mono transition-colors"
        >
          View treasury →
        </a>
      </div>
    </div>
  );
};
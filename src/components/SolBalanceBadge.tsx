import { useSolBalance } from "@/hooks/useSolBalance";
import { RefreshCw, Wallet, AlertTriangle, CheckCircle2 } from "lucide-react";

/** Minimum SOL to burn 1 NFT comfortably (fee + rent + network tx cost) */
const WARN_THRESHOLD  = 0.015;  // yellow warning
const DANGER_THRESHOLD = 0.005; // red — probably can't afford even 1 burn

interface SolBalanceBadgeProps {
  /** Extra burn fees expected so the indicator can show "enough / not enough" */
  pendingFeeSol?: number;
}

export const SolBalanceBadge = ({ pendingFeeSol = 0 }: SolBalanceBadgeProps) => {
  const { balance, loading, refresh } = useSolBalance();

  if (balance === null) return null;

  const effective   = balance - pendingFeeSol;
  const isDanger    = effective < DANGER_THRESHOLD;
  const isWarn      = !isDanger && effective < WARN_THRESHOLD;
  const isOk        = !isDanger && !isWarn;

  const colorClass  = isDanger
    ? "border-red-500/40 bg-red-950/30 text-red-400"
    : isWarn
    ? "border-yellow-500/30 bg-yellow-950/20 text-yellow-400"
    : "border-border/40 bg-secondary/40 text-muted-foreground";

  const icon = isDanger
    ? <AlertTriangle className="w-3 h-3 shrink-0 text-red-400" />
    : isWarn
    ? <AlertTriangle className="w-3 h-3 shrink-0 text-yellow-400" />
    : <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-500/70" />;

  const label = isDanger
    ? "Low SOL"
    : isWarn
    ? "Low SOL"
    : null;

  return (
    <div
      className={`
        hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg border
        font-mono text-[11px] font-medium transition-colors
        ${colorClass}
      `}
      title={`Wallet balance: ${balance.toFixed(4)} SOL${pendingFeeSol > 0 ? ` · Pending fee: ${pendingFeeSol.toFixed(3)} SOL` : ""}`}
    >
      {icon}

      <span className="flex items-center gap-1">
        <span className={isOk ? "text-foreground/80" : ""}>
          {loading && balance === null
            ? "—"
            : balance < 0.0001
            ? "<0.0001"
            : balance.toFixed(3)}
        </span>
        <span className="text-muted-foreground/50">SOL</span>
      </span>

      {label && (
        <span className={`text-[9px] font-bold uppercase tracking-wider ${isDanger ? "text-red-400" : "text-yellow-400"}`}>
          · {label}
        </span>
      )}

      {/* Subtle refresh button */}
      <button
        onClick={(e) => { e.stopPropagation(); refresh(); }}
        className={`ml-0.5 opacity-40 hover:opacity-100 transition-opacity ${loading ? "animate-spin" : ""}`}
        title="Refresh balance"
        aria-label="Refresh SOL balance"
      >
        <RefreshCw className="w-2.5 h-2.5" />
      </button>
    </div>
  );
};

/** Compact version for mobile — icon-only with colour signal */
export const SolBalanceMobile = () => {
  const { balance } = useSolBalance();
  if (balance === null) return null;

  const isDanger = balance < DANGER_THRESHOLD;
  const isWarn   = !isDanger && balance < WARN_THRESHOLD;

  if (!isDanger && !isWarn) return null; // only show on mobile when there's a warning

  return (
    <div
      className={`sm:hidden flex items-center justify-center w-8 h-8 rounded-lg border ${
        isDanger
          ? "border-red-500/40 bg-red-950/30"
          : "border-yellow-500/30 bg-yellow-950/20"
      }`}
      title={`Balance: ${balance.toFixed(4)} SOL`}
    >
      <Wallet className={`w-3.5 h-3.5 ${isDanger ? "text-red-400" : "text-yellow-400"}`} />
    </div>
  );
};

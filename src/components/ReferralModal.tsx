/**
 * ReferralModal — full referral dashboard.
 *
 * WHAT IT DOES
 * ────────────
 * • Generates a unique referral link for the connected wallet
 * • Shows live earnings (20% of fees from referred burns)
 * • Lists every wallet that used this code + their burn activity
 * • Copy-to-clipboard and share-native support
 * • Explains clearly how the system works
 *
 * EARNING MODEL
 * ─────────────
 * Every NFT burned by a referred wallet pays 0.005 SOL fee.
 * The referrer earns 20% = 0.001 SOL per burn, tracked in Firestore.
 * Payouts are batched weekly to the referrer's wallet.
 */

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getOrCreateReferral,
  subscribeReferralStats,
  type ReferralStats,
  REFERRAL_CUT_PCT,
} from "@/lib/firebaseService";
import { FEE_PER_BURN_SOL } from "@/lib/configAddress";
import {
  Copy, Check, ExternalLink, Users, TrendingUp,
  Coins, Share2, Gift, ChevronRight, Flame,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

function fmtSol(sol: number) {
  return sol < 0.0001 ? "<0.0001" : sol.toFixed(4);
}

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("nl-NL", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function Tile({ label, value, sub, icon: Icon, color = "text-primary" }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color?: string;
}) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-xl border border-border/30 bg-secondary/20">
      <div className={`flex items-center gap-1.5 ${color}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
          {label}
        </span>
      </div>
      <span className="text-2xl font-black tabular-nums leading-none">{value}</span>
      {sub && <span className="text-[10px] font-mono text-muted-foreground/40">{sub}</span>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
interface ReferralModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReferralModal({ open, onOpenChange }: ReferralModalProps) {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toString() ?? "";

  const [stats,    setStats]   = useState<ReferralStats | null>(null);
  const [loading,  setLoading] = useState(true);
  const [copied,   setCopied]  = useState(false);

  const referralLink = stats
    ? `${window.location.origin}${window.location.pathname}?ref=${stats.code}`
    : "";

  // ── Load / subscribe ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !connected || !wallet) return;

    setLoading(true);

    // Create the record if it doesn't exist yet, then subscribe
    getOrCreateReferral(wallet)
      .then(() => setLoading(false))
      .catch(() => setLoading(false));

    const unsub = subscribeReferralStats(wallet, (s) => {
      setStats(s);
      setLoading(false);
    });

    return unsub;
  }, [open, connected, wallet]);

  // ── Copy link ────────────────────────────────────────────────────────────────
  const copyLink = useCallback(async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }, [referralLink]);

  // ── Native share ─────────────────────────────────────────────────────────────
  const shareLink = useCallback(async () => {
    if (!referralLink) return;
    try {
      await navigator.share({
        title: "BurnBox — Solana NFT Incinerator",
        text: "Burn your unwanted NFTs and scam tokens on Solana. Use my link:",
        url: referralLink,
      });
    } catch {
      copyLink();
    }
  }, [referralLink, copyLink]);

  // ── Not connected state ──────────────────────────────────────────────────────
  if (!connected) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" /> Referral Program
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Connect your wallet to generate your referral link and track earnings.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">

        {/* ── Header ── */}
        <div className="relative overflow-hidden px-6 pt-6 pb-5 border-b border-border/30">
          {/* background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
          <DialogHeader className="relative">
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Gift className="w-3.5 h-3.5 text-primary" />
              </div>
              Referral Program
            </DialogTitle>
            <p className="text-[12px] text-muted-foreground/70 mt-1 leading-relaxed">
              Share your link. Earn{" "}
              <span className="font-bold text-primary">
                {(REFERRAL_CUT_PCT * 100).toFixed(0)}%
              </span>{" "}
              of every burn fee your referrals pay —{" "}
              <span className="font-bold text-foreground/80">
                {fmtSol(FEE_PER_BURN_SOL * REFERRAL_CUT_PCT)} SOL
              </span>{" "}
              per NFT burned.
            </p>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* ── Stats row ── */}
          {loading ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-xl border border-border/20 bg-secondary/10 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Tile
                icon={Coins}
                label="Total Earned"
                value={`${fmtSol(stats?.totalEarned ?? 0)} ◎`}
                sub="SOL credited"
                color="text-yellow-400"
              />
              <Tile
                icon={TrendingUp}
                label="Pending Payout"
                value={`${fmtSol(stats?.pendingPayout ?? 0)} ◎`}
                sub="next batch"
                color="text-green-400"
              />
              <Tile
                icon={Users}
                label="Referrals"
                value={String(stats?.totalRefs ?? 0)}
                sub="unique wallets"
                color="text-blue-400"
              />
            </div>
          )}

          {/* ── Referral link box ── */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50">
              Your referral link
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center h-10 bg-secondary/40 border border-border/40 rounded-lg px-3 overflow-hidden">
                <span className="text-[11px] font-mono text-muted-foreground/50 truncate flex-1 min-w-0">
                  {loading ? "Generating…" : referralLink}
                </span>
                {stats?.code && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-[9px] font-mono text-primary font-bold shrink-0">
                    {stats.code}
                  </span>
                )}
              </div>
              <button
                onClick={copyLink}
                disabled={loading || !referralLink}
                className="w-10 h-10 rounded-lg border border-border/40 bg-secondary/40 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all disabled:opacity-30"
                title="Copy link"
              >
                {copied
                  ? <Check className="w-3.5 h-3.5 text-green-400" />
                  : <Copy className="w-3.5 h-3.5" />
                }
              </button>
              <button
                onClick={shareLink}
                disabled={loading || !referralLink}
                className="w-10 h-10 rounded-lg border border-primary/30 bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-all disabled:opacity-30"
                title="Share"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── How it works ── */}
          <div className="rounded-xl border border-border/20 bg-secondary/10 p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/40">
              How it works
            </p>
            {[
              { icon: Share2,  text: "Share your link with friends or your community" },
              { icon: Flame,   text: `They visit BurnBox and burn their NFTs & scam tokens` },
              { icon: Coins,   text: `You earn ${(REFERRAL_CUT_PCT * 100).toFixed(0)}% of their fees — ${fmtSol(FEE_PER_BURN_SOL * REFERRAL_CUT_PCT)} SOL per NFT burned` },
              { icon: TrendingUp, text: "Earnings accumulate and are paid out weekly to your wallet" },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3 h-3 text-primary" />
                </div>
                <p className="text-[12px] text-muted-foreground/70 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>

          {/* ── Referral history table ── */}
          {(stats?.referrals?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">
                Referred wallets ({stats!.referrals.length})
              </p>
              <div className="rounded-xl border border-border/20 overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-0 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/30 px-3 py-2 border-b border-border/20 bg-secondary/10">
                  <span>Wallet</span>
                  <span className="text-right pr-4">Burns</span>
                  <span className="text-right">Earned ◎</span>
                </div>
                <div className="divide-y divide-border/10 max-h-48 overflow-y-auto">
                  {stats!.referrals.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-0 px-3 py-2.5 hover:bg-secondary/20 transition-colors">
                      <div className="min-w-0">
                        <a
                          href={`https://explorer.solana.com/address/${r.wallet}?cluster=mainnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] font-mono text-foreground/70 hover:text-primary transition-colors group"
                        >
                          {truncate(r.wallet)}
                          <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </a>
                        <span className="text-[9px] text-muted-foreground/30 font-mono">
                          {fmtDate(r.usedAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-mono text-foreground/60 pr-4">
                        <Flame className="w-2.5 h-2.5 text-primary/40" />
                        {r.burns}
                      </div>
                      <span className="text-[11px] font-mono text-yellow-400/80 text-right">
                        {fmtSol(r.earned)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Empty state ── */}
          {!loading && (stats?.referrals?.length ?? 0) === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <div className="w-10 h-10 rounded-xl border border-border/30 bg-secondary/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-muted-foreground/20" />
              </div>
              <p className="text-[12px] text-muted-foreground/40">No referrals yet</p>
              <p className="text-[10px] font-mono text-muted-foreground/25">
                Share your link to start earning
              </p>
            </div>
          )}

          {/* ── Payout note ── */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-border/20 bg-secondary/10">
            <ChevronRight className="w-3 h-3 text-muted-foreground/30 mt-0.5 shrink-0" />
            <p className="text-[10px] font-mono text-muted-foreground/35 leading-relaxed">
              Earnings are tracked on-chain and paid weekly to{" "}
              <span className="text-muted-foreground/60">{truncate(wallet)}</span>.
              Pending balance accumulates until payout threshold (0.01 SOL).
            </p>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}

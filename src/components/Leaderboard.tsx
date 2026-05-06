/**
 * Leaderboard — real-time global data from Firestore.
 * Updates instantly via onSnapshot whenever any user burns an NFT.
 */
import { useEffect, useState } from "react";
import { Trophy, Flame, Skull, Crown, TrendingDown, ExternalLink, RefreshCw, Globe, Radio } from "lucide-react";
import { LeaderboardEntry } from "@/lib/leaderboardStore";
import { subscribeTopBurners, type GlobalStats } from "@/lib/firebaseService";
import { SOLANA_BURN_ADDRESS } from "@/lib/configAddress";

const RankBadge = ({ rank }: { rank: number }) => {
  if (rank === 1) return <Crown className="w-3.5 h-3.5 text-yellow-400" />;
  if (rank === 2) return <Trophy className="w-3.5 h-3.5 text-slate-400" />;
  if (rank === 3) return <Trophy className="w-3.5 h-3.5 text-amber-600" />;
  return <span className="w-3.5 text-center text-[11px] font-mono text-muted-foreground/60">{rank}</span>;
};

interface LeaderboardProps {
  activeUsers?: number;
}

export const Leaderboard = ({ activeUsers = 0 }: LeaderboardProps) => {
  const [entries,     setEntries]     = useState<LeaderboardEntry[]>([]);
  const [stats,       setStats]       = useState<GlobalStats>({ totalBurned: 0, totalWallets: 0, totalFeeSol: 0 });
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [isLive,      setIsLive]      = useState(false);

  useEffect(() => {
    const unsub = subscribeTopBurners(10, (newEntries, newStats) => {
      setEntries(newEntries);
      setStats(newStats);
      setLastRefresh(Date.now());
      setIsLive(true);
    });
    return () => unsub();
  }, []);

  const empty = entries.length === 0;

  return (
    <div className="w-full max-w-4xl mx-auto py-6 space-y-8 slide-up">

      {/* Title */}
      <div className="text-center space-y-1">
        <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
          Hall of <span className="text-primary fire-glow">Shame</span>
        </h2>
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
            {isLive ? (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Global real-time leaderboard &mdash; all BurnBox users
              </>
            ) : (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                Connecting to live leaderboard&hellip;
              </>
            )}
          </p>
          {activeUsers > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-green-500/20 bg-green-500/5">
              <Radio className="w-3 h-3 text-green-500" style={{ animation: "pulse 2s infinite" }} />
              <span className="text-[11px] font-mono font-semibold text-green-500">
                {activeUsers} {activeUsers === 1 ? "user" : "users"} online now
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "NFTs Burned",  value: stats.totalBurned.toLocaleString(),   icon: Flame,        color: "text-primary" },
          { label: "Wallets",      value: stats.totalWallets.toLocaleString(),   icon: Skull,        color: "text-primary" },
          { label: "SOL in Fees",  value: stats.totalFeeSol.toFixed(3),          icon: TrendingDown, color: "text-primary", unit: "SOL" },
        ].map(({ label, value, icon: Icon, color, unit }) => (
          <div key={label} className="stat-card rounded-xl border border-border/40 bg-card px-4 py-4 text-center">
            <Icon className={`w-4 h-4 ${color} mx-auto mb-2 opacity-80`} />
            <div className="font-black text-xl font-mono leading-none">
              {value}
              {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Tables */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Top Burners */}
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-secondary/30">
            <div className="flex items-center gap-2">
              <Skull className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-bold uppercase tracking-widest">Top Destroyers</span>
            </div>
            <div className="flex items-center gap-1.5">
              {isLive && (
                <span className="flex items-center gap-1 text-[9px] font-mono text-green-500/70">
                  <Globe className="w-2.5 h-2.5" />LIVE
                </span>
              )}
              <RefreshCw className="w-3 h-3 text-muted-foreground/30" />
            </div>
          </div>

          {empty ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <Flame className="w-8 h-8 text-primary/20 mb-3" />
              <p className="text-[12px] font-semibold text-muted-foreground">No burns yet</p>
              <p className="text-[10px] text-muted-foreground/40 mt-1">
                Go burn some NFTs &mdash; your wallet will appear here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {entries.map((e, i) => (
                <div key={e.wallet} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/20 transition-colors group">
                  <div className="w-5 flex justify-center shrink-0">
                    <RankBadge rank={i + 1} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[12px] font-semibold text-foreground/80 truncate">
                      {e.walletShort}
                    </p>
                    <p className="text-[9px] font-mono text-muted-foreground/30">
                      last {new Date(e.lastBurnAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="font-mono text-sm font-bold text-primary">{e.burned.toLocaleString()}</p>
                      <p className="font-mono text-[10px] text-muted-foreground/50">{e.feeSol.toFixed(3)} SOL</p>
                    </div>
                    {e.signatures[0] && (
                      <a
                        href={`https://explorer.solana.com/tx/${e.signatures[0]}?cluster=mainnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/30 hover:text-primary"
                        title="Latest tx on Explorer"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Burn address transparency */}
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-secondary/30">
            <Flame className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-widest">Burn Address Activity</span>
          </div>
          <div className="px-4 py-4 space-y-4">
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
              All NFTs burned by BurnBox are transferred to the official Solana incinerator.
              You can verify every transaction on Solana Explorer.
            </p>
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 font-mono text-[10px] text-primary/70 break-all">
              {SOLANA_BURN_ADDRESS}
            </div>
            <a
              href={`https://explorer.solana.com/address/${SOLANA_BURN_ADDRESS}?cluster=mainnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 w-full justify-center py-2.5 rounded-lg border border-primary/20 bg-secondary/20 text-[11px] font-mono text-primary/60 hover:text-primary hover:border-primary/40 transition-all"
            >
              <ExternalLink className="w-3 h-3" />
              View incinerator on Solana Explorer
            </a>

            {/* Recent tx list */}
            {entries.flatMap((e) => e.signatures).slice(0, 5).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Recent burn txs</p>
                {entries
                  .flatMap((e) => e.signatures.map((s) => ({ s, w: e.walletShort })))
                  .slice(0, 5)
                  .map(({ s, w }) => (
                    <a
                      key={s}
                      href={`https://explorer.solana.com/tx/${s}?cluster=mainnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border/20 bg-secondary/20 hover:border-primary/30 transition-colors group"
                    >
                      <Flame className="w-2.5 h-2.5 text-primary/40 shrink-0" />
                      <span className="font-mono text-[10px] text-muted-foreground/50 truncate flex-1">
                        {s.slice(0, 24)}&hellip;
                      </span>
                      <span className="text-[9px] font-mono text-muted-foreground/30 shrink-0">{w}</span>
                      <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/20 group-hover:text-primary/40 transition-colors shrink-0" />
                    </a>
                  ))}
              </div>
            )}

            {/* Last refresh timestamp */}
            <p className="text-[9px] font-mono text-muted-foreground/20 text-right">
              updated {new Date(lastRefresh).toLocaleTimeString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
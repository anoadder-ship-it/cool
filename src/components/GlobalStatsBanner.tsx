/**
 * GlobalStatsBanner — live stats bar powered by Firestore.
 *
 * Subscribes to the top-burners snapshot (same query the leaderboard uses)
 * and aggregates totals in real-time. Stats animate on mount and whenever
 * the value changes via a smooth count-up effect.
 *
 * Displayed stats:
 *  • Total NFTs burned (all-time, across all wallets)
 *  • Total unique wallets
 *  • Total SOL collected as fees
 *  • A live "burning now" pulse dot (active users count)
 */

import { useEffect, useRef, useState } from "react";
import { subscribeTopBurners, type GlobalStats } from "@/lib/firebaseService";
import { Flame, Users, Wallet, TrendingUp } from "lucide-react";

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const rafRef     = useRef<number>(0);
  const startRef   = useRef<number>(0);
  const fromRef    = useRef<number>(0);

  useEffect(() => {
    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) return;

    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed  = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out-quart
      const eased    = 1 - Math.pow(1 - progress, 4);
      const current  = from + delta * eased;
      setValue(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function StatTile({
  icon: Icon,
  label,
  value,
  suffix = "",
  color = "text-primary",
  decimals = 0,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  suffix?: string;
  color?: string;
  decimals?: number;
}) {
  const animated = useCountUp(value);

  const formatted =
    decimals > 0
      ? animated.toFixed(decimals)
      : Math.round(animated).toLocaleString();

  return (
    <div className="flex flex-col items-center gap-1 px-5 py-3 min-w-[110px]">
      <div className={`flex items-center gap-1.5 ${color}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-xl font-black tabular-nums tracking-tight leading-none">
          {formatted}
          {suffix && <span className="text-sm font-bold ml-0.5 opacity-70">{suffix}</span>}
        </span>
      </div>
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50">
        {label}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function GlobalStatsBanner({ activeUsers = 0 }: { activeUsers?: number }) {
  const [stats, setStats] = useState<GlobalStats>({
    totalBurned:  0,
    totalWallets: 0,
    totalFeeSol:  0,
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = subscribeTopBurners(200, (_entries, globalStats) => {
      setStats(globalStats);
      setReady(true);
    });
    return unsub;
  }, []);

  if (!ready) {
    // Skeleton shimmer while loading
    return (
      <div className="w-full rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-center gap-6 px-6 py-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="h-6 w-16 rounded bg-muted/30" />
              <div className="h-2.5 w-12 rounded bg-muted/20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-primary/10 bg-card/60 backdrop-blur-sm overflow-hidden shadow-[0_0_40px_hsl(var(--primary)/0.04)]">
      {/* Top accent line */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="flex flex-wrap items-center justify-center gap-0 divide-x divide-border/20">

        {/* Burning now pulse */}
        <div className="flex flex-col items-center gap-1 px-5 py-3 min-w-[110px]">
          <div className="flex items-center gap-1.5 text-green-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-xl font-black tabular-nums tracking-tight leading-none">
              {activeUsers}
            </span>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50">
            Burning Now
          </span>
        </div>

        <StatTile
          icon={Flame}
          label="NFTs Burned"
          value={stats.totalBurned}
          color="text-primary"
        />

        <StatTile
          icon={Wallet}
          label="Total SOL Fees"
          value={stats.totalFeeSol}
          suffix="◎"
          color="text-yellow-400"
          decimals={3}
        />

        <StatTile
          icon={Users}
          label="Unique Burners"
          value={stats.totalWallets}
          color="text-blue-400"
        />

        <StatTile
          icon={TrendingUp}
          label="Avg per Wallet"
          value={stats.totalWallets > 0 ? stats.totalBurned / stats.totalWallets : 0}
          color="text-purple-400"
          decimals={1}
        />
      </div>

      {/* Bottom accent line */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
    </div>
  );
}

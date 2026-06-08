/**
 * NftGrid — virtual scroll grid with rubber-band drag-to-select.
 *
 * Drag behaviour:
 *   - Press & drag on the grid background or any card image area → selection rect appears
 *   - Any card overlapping the rect is highlighted (pending)
 *   - Mouse-up commits all pending cards into the selectedIds set
 *   - Single-click on a card still toggles it as before
 *   - Popovers and buttons inside cards absorb their own pointer events
 */
import {
  useEffect, useRef, useState, useCallback, memo, forwardRef,
} from "react";
import {
  Trash2, Store, Shield, AlertTriangle, CheckCircle2, Skull, Coins, Zap,
} from "lucide-react";
import type { NFTAsset } from "@/lib/nftService";
import { NftDetailPopover } from "@/components/NftDetailPopover";
import { useDragSelect } from "@/hooks/useDragSelect";
import { computeRiskScore } from "@/lib/riskScore";

interface NftGridProps {
  nfts: NFTAsset[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  /** Called by the drag engine with all IDs that should be toggled on */
  onSelectMany?: (ids: Set<string>) => void;
  isLoading: boolean;
  isLoadingMore?: boolean;
  floorPrices?: Map<string, { floorSol: number; listedCount: number }>;
}

const PAGE_SIZE = 60;

// ─── Badge variants ───────────────────────────────────────────────────────────

type BadgeVariant = "scam" | "suspicious" | "fungible" | "high" | "mid" | "low";

interface BadgeConfig {
  badge: string;
  icon: React.ReactNode;
  label: string;
}

const BADGE_STYLES: Record<BadgeVariant, BadgeConfig> = {
  scam: {
    badge: "bg-red-950/95 border-red-500/70 text-red-300 shadow-[0_0_6px_rgba(239,68,68,0.4)]",
    icon:  <Skull      className="w-2.5 h-2.5" />,
    label: "SCAM",
  },
  suspicious: {
    badge: "bg-orange-950/90 border-orange-500/50 text-orange-300",
    icon:  <AlertTriangle className="w-2.5 h-2.5" />,
    label: "SUSPICIOUS",
  },
  fungible: {
    badge: "bg-blue-950/80 border-blue-500/30 text-blue-400",
    icon:  <Coins      className="w-2.5 h-2.5" />,
    label: "TOKEN",
  },
  high: {
    badge: "bg-red-950/80 border-red-500/40 text-red-400",
    icon:  <AlertTriangle className="w-2.5 h-2.5" />,
    label: "HIGH",
  },
  mid: {
    badge: "bg-yellow-950/80 border-yellow-500/30 text-yellow-400",
    icon:  <Shield     className="w-2.5 h-2.5" />,
    label: "MED",
  },
  low: {
    badge: "bg-emerald-950/80 border-emerald-600/30 text-emerald-400",
    icon:  <CheckCircle2 className="w-2.5 h-2.5" />,
    label: "SAFE",
  },
};

function getBadgeVariant(nft: NFTAsset): BadgeVariant {
  if (nft.scam?.level === "confirmed")  return "scam";
  if (nft.scam?.level === "suspicious") return "suspicious";
  if (nft.isFungible)                   return "fungible";
  const score = computeRiskScore(nft.id);
  if (score >= 75) return "high";
  if (score >= 40) return "mid";
  return "low";
}

// ─── Single NFT card ──────────────────────────────────────────────────────────
const NftCard = memo(forwardRef<HTMLDivElement, {
  nft: NFTAsset;
  isSelected: boolean;
  isPending: boolean;
  onToggle: (id: string) => void;
  floorData?: { floorSol: number; listedCount: number };
}>(({ nft, isSelected, isPending, onToggle, floorData }, ref) => {
  const [imgError, setImgError] = useState(false);
  const variant      = getBadgeVariant(nft);
  const { badge, icon, label } = BADGE_STYLES[variant];
  const isScam       = variant === "scam";
  const isSuspicious = variant === "suspicious";

  return (
    <div
      ref={ref}
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      data-drag-handle="true"
      onClick={() => onToggle(nft.id)}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onToggle(nft.id)}
      className={[
        "relative group cursor-pointer rounded-lg overflow-hidden border transition-all duration-100 select-none bg-card",
        isScam
          ? "border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.12)]"
          : isSuspicious
          ? "border-orange-500/30"
          : "border-border/40",
        isSelected
          ? "nft-selected !border-transparent"
          : isPending
          ? "border-primary/60 shadow-[0_0_0_2px_hsl(var(--primary)/0.25)] scale-[1.02]"
          : isScam
          ? "hover:border-red-500/70 hover:shadow-[0_0_14px_rgba(239,68,68,0.2)]"
          : isSuspicious
          ? "hover:border-orange-500/50"
          : "hover:border-primary/40 hover:shadow-[0_0_12px_hsl(var(--primary)/0.12)]",
      ].join(" ")}
    >
      {/* ── Image ── */}
      <div className="aspect-square bg-secondary/60 overflow-hidden relative">
        {nft.image && !imgError ? (
          <img
            src={nft.image}
            alt={nft.name}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            className={`w-full h-full object-cover transition-transform duration-200 ${
              isSelected
                ? "scale-105 brightness-75"
                : isPending
                ? "scale-105 brightness-90"
                : "group-hover:scale-103"
            }`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-muted-foreground/15" />
          </div>
        )}

        {/* Selected tick */}
        {isSelected && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 12 10" className="w-3.5 h-3.5 fill-none stroke-white stroke-2">
                <polyline points="1,5 4,9 11,1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        )}

        {/* Pending (drag hover) overlay */}
        {isPending && !isSelected && (
          <div className="absolute inset-0 bg-primary/10 flex items-center justify-center pointer-events-none">
            <div className="w-7 h-7 rounded-full border-2 border-primary/60 flex items-center justify-center">
              <svg viewBox="0 0 12 10" className="w-3.5 h-3.5 fill-none stroke-primary/60 stroke-2">
                <polyline points="1,5 4,9 11,1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        )}

        {/* Scam / Risk badge */}
        <div
          className={`absolute top-1 left-1 flex items-center gap-0.5 px-1 py-0.5 rounded border text-[9px] font-mono font-bold tracking-widest backdrop-blur-sm pointer-events-none ${badge}`}
          title={nft.scam?.reasons?.join(" · ") ?? label}
        >
          {icon}{label}
        </div>

        {/* Fungible token icon (only when not scam/suspicious) */}
        {nft.isFungible && !isScam && !isSuspicious && (
          <div className="absolute top-1 right-1 pointer-events-none">
            <Zap className="w-2.5 h-2.5 text-blue-400/60" />
          </div>
        )}

        {/* Detail popover */}
        <NftDetailPopover nft={nft} floorData={floorData} />
      </div>

      {/* ── Meta ── */}
      <div className="px-2 pt-1.5 pb-2 space-y-0.5">
        <p
          className="text-[11px] font-semibold leading-tight truncate text-foreground/90"
          title={nft.name}
        >
          {nft.name || "Unknown"}
        </p>

        {/* Scam reason (first signal, truncated) */}
        {(isScam || isSuspicious) && nft.scam?.reasons?.[0] && (
          <p
            className={`text-[9px] font-mono leading-tight truncate ${
              isScam ? "text-red-400/70" : "text-orange-400/60"
            }`}
            title={nft.scam.reasons.join(" · ")}
          >
            {nft.scam.reasons[0].slice(0, 38)}
          </p>
        )}

        {/* USD value for fungible tokens */}
        {nft.isFungible && nft.priceUsd !== undefined && nft.priceUsd > 0 ? (
          <div className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground">
            <span className="text-foreground/60 font-medium">${nft.priceUsd.toFixed(4)}</span>
            <span className="text-muted-foreground/40">/ token</span>
          </div>
        ) : floorData && floorData.floorSol > 0 ? (
          <div className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground">
            <Store className="w-2.5 h-2.5 shrink-0 text-muted-foreground/50" />
            <span className="text-foreground/70 font-medium">
              {floorData.floorSol < 0.001 ? "<0.001" : floorData.floorSol.toFixed(3)}
            </span>
            <span className="text-muted-foreground/50">SOL</span>
          </div>
        ) : (
          <div className="text-[9px] font-mono text-muted-foreground/30 truncate">
            {nft.collectionSymbol || nft.symbol || "—"}
          </div>
        )}
      </div>
    </div>
  );
}));

NftCard.displayName = "NftCard";

// ─── Skeleton card ────────────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="rounded-lg overflow-hidden border border-border/30 bg-card">
    <div className="aspect-square shimmer" />
    <div className="px-2 pt-1.5 pb-2 space-y-1">
      <div className="h-2.5 shimmer rounded w-3/4" />
      <div className="h-2   shimmer rounded w-1/2" />
    </div>
  </div>
);

// ─── Drag selection rectangle ─────────────────────────────────────────────────
const SelectionRect = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => (
  <div
    className="absolute pointer-events-none z-30 rounded border border-primary/50 bg-primary/10"
    style={{ left: x, top: y, width: w, height: h }}
  />
);

// ─── Main grid ────────────────────────────────────────────────────────────────
export const NftGrid = ({
  nfts,
  selectedIds,
  onToggle,
  onSelectMany,
  isLoading,
  isLoadingMore = false,
  floorPrices,
}: NftGridProps) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const cardDomRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [nfts.length]);

  const setupObserver = useCallback(() => {
    observerRef.current?.disconnect();
    if (!sentinelRef.current) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((p) => Math.min(p + PAGE_SIZE, nfts.length));
        }
      },
      { rootMargin: "500px" }
    );
    observerRef.current.observe(sentinelRef.current);
  }, [nfts.length]);

  useEffect(() => {
    setupObserver();
    return () => observerRef.current?.disconnect();
  }, [setupObserver]);

  // ── Drag-to-select ──────────────────────────────────────────────────────────
  const { containerRef, dragRect, pendingIds } = useDragSelect({
    nfts:        nfts.slice(0, visibleCount),
    cardDomRefs,
    onSelectMany: onSelectMany ?? (() => {}),
  });

  const visibleNfts = nfts.slice(0, visibleCount);

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
        {Array.from({ length: 24 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!isLoading && nfts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl border border-border/40 bg-card flex items-center justify-center mb-4">
          <Trash2 className="w-7 h-7 text-muted-foreground/20" />
        </div>
        <p className="font-semibold text-muted-foreground/50 text-sm">No NFTs or tokens found</p>
        <p className="text-[11px] text-muted-foreground/30 mt-1 font-mono">
          Your wallet looks empty — nothing to burn
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 select-none"
      >
        {/* Drag selection rectangle */}
        {dragRect && (
          <SelectionRect
            x={dragRect.x} y={dragRect.y}
            w={dragRect.w} h={dragRect.h}
          />
        )}

        {visibleNfts.map((nft) => (
          <NftCard
            key={nft.id}
            ref={(el) => {
              if (el) cardDomRefs.current.set(nft.id, el);
              else    cardDomRefs.current.delete(nft.id);
            }}
            nft={nft}
            isSelected={selectedIds.has(nft.id)}
            isPending={pendingIds.has(nft.id)}
            onToggle={onToggle}
            floorData={floorPrices?.get(nft.collectionSymbol)}
          />
        ))}
      </div>

      {/* Infinite scroll sentinel */}
      {visibleCount < nfts.length && (
        <div ref={sentinelRef} className="h-4" />
      )}

      {/* Load-more skeleton row */}
      {isLoadingMore && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Count indicator */}
      {nfts.length > 0 && (
        <p className="text-center text-[10px] font-mono text-muted-foreground/25">
          Showing {Math.min(visibleCount, nfts.length).toLocaleString()} of {nfts.length.toLocaleString()}
        </p>
      )}
    </div>
  );
};

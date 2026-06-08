/**
 * NftDetailPopover — shows full NFT metadata in a floating panel.
 *
 * Triggered by the info-button (ⓘ) on each card — never interrupts card selection.
 * Uses Radix Popover so it portals above the grid and closes on outside click.
 */
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Info, ExternalLink, Copy, Check,
  Store, Shield, AlertTriangle,
  CheckCircle2, Flame, Tag, Hash,
} from "lucide-react";
import { NFTAsset } from "@/lib/nftService";
import { NftImage } from "@/components/NftImage";
import { computeRiskScore, getRiskLevel, type RiskLevel } from "@/lib/riskScore";
import { explorerAddressUrl, magicEdenItemUrl } from "@/lib/explorer";
import { useClipboard } from "@/hooks/useClipboard";

interface NftDetailPopoverProps {
  nft: NFTAsset;
  floorData?: { floorSol: number; listedCount: number };
}

const RiskIcon = ({ level }: { level: RiskLevel }) => {
  if (level === "high") return <AlertTriangle className="w-3 h-3" />;
  if (level === "mid")  return <Shield        className="w-3 h-3" />;
  return                       <CheckCircle2  className="w-3 h-3" />;
};

export const NftDetailPopover = ({ nft, floorData }: NftDetailPopoverProps) => {
  const [open,    setOpen]    = useState(false);
  const { copied, copy } = useClipboard();

  const score        = computeRiskScore(nft.id);
  const { level, label, color } = getRiskLevel(score);

  const copyMint = (e: React.MouseEvent) => {
    e.stopPropagation();
    copy(nft.id);
  };

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* ⓘ button — sits in card top-right, stopPropagation so card doesn't toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.stopPropagation(); setOpen((v) => !v); } }}
          className="
            absolute top-1 right-1 z-10
            w-5 h-5 rounded flex items-center justify-center
            bg-black/40 backdrop-blur-sm border border-white/10
            text-white/50 hover:text-white hover:bg-black/60
            transition-all duration-100
            opacity-0 group-hover:opacity-100
          "
          title="View details"
          aria-label="View NFT details"
          tabIndex={-1}
        >
          <Info className="w-3 h-3" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-72 p-0 bg-card border border-border/60 shadow-[0_8px_40px_rgba(0,0,0,0.45)] rounded-xl overflow-hidden z-[200]"
        onClick={stopProp}
        onPointerDown={stopProp}
      >
        {/* ── Image banner ── */}
        <div className="relative w-full h-44 bg-secondary/60 overflow-hidden">
          <NftImage src={nft.image} alt={nft.name} />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />

          {/* Risk badge */}
          <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded border
            text-[9px] font-mono font-bold tracking-widest backdrop-blur-sm
            ${level === "high" ? "bg-red-950/80 border-red-500/40 text-red-400"
            : level === "mid"  ? "bg-yellow-950/80 border-yellow-500/30 text-yellow-400"
            :                    "bg-emerald-950/80 border-emerald-600/30 text-emerald-400"}`
          }>
            <RiskIcon level={level} />
            {label}
          </div>

          {/* Name on image bottom */}
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5">
            <p className="font-bold text-sm leading-tight text-white drop-shadow" title={nft.name}>
              {nft.name || "Unknown NFT"}
            </p>
            {nft.collectionSymbol && (
              <p className="text-[10px] text-white/50 font-mono truncate mt-0.5">{nft.collectionSymbol}</p>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-3 py-3 space-y-3">

          {/* Description */}
          {nft.description && (
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-3">
              {nft.description}
            </p>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {/* Floor */}
            <StatCell
              icon={<Store className="w-3 h-3" />}
              label="Floor"
              value={
                floorData && floorData.floorSol > 0
                  ? `${floorData.floorSol < 0.001 ? "<0.001" : floorData.floorSol.toFixed(3)} SOL`
                  : "—"
              }
              highlight={!!floorData && floorData.floorSol > 0}
            />
            {/* Listed */}
            <StatCell
              icon={<Tag className="w-3 h-3" />}
              label="Listed"
              value={floorData?.listedCount ? floorData.listedCount.toLocaleString() : "—"}
            />
            {/* Risk score */}
            <StatCell
              icon={<RiskIcon level={level} />}
              label="Risk"
              value={score.toString()}
              colorClass={color}
            />
          </div>

          {/* Mint address */}
          <div className="space-y-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 flex items-center gap-1">
              <Hash className="w-2.5 h-2.5" /> Mint address
            </p>
            <div className="flex items-center gap-1.5 bg-secondary/40 rounded-lg border border-border/30 px-2.5 py-1.5">
              <span className="font-mono text-[10px] text-muted-foreground/60 flex-1 truncate">
                {nft.id.slice(0, 20)}…{nft.id.slice(-6)}
              </span>
              <button
                onClick={copyMint}
                className="shrink-0 text-muted-foreground/30 hover:text-primary transition-colors"
                title="Copy mint address"
              >
                {copied
                  ? <Check  className="w-3 h-3 text-emerald-400" />
                  : <Copy   className="w-3 h-3" />
                }
              </button>
            </div>
          </div>

          {/* Symbol + description meta */}
          {(nft.symbol || nft.collectionSymbol) && (
            <div className="flex gap-2 flex-wrap">
              {nft.symbol && (
                <MetaTag label="Symbol" value={nft.symbol} />
              )}
              {nft.collectionSymbol && nft.collectionSymbol !== nft.symbol && (
                <MetaTag label="Collection" value={nft.collectionSymbol} />
              )}
            </div>
          )}

          {/* External links */}
          <div className="flex gap-1.5 pt-0.5">
            <ExtLink
              href={explorerAddressUrl(nft.id)}
              label="Explorer"
              icon={<ExternalLink className="w-2.5 h-2.5" />}
            />
            {nft.collectionSymbol && (
              <ExtLink
                href={magicEdenItemUrl(nft.id)}
                label="Magic Eden"
                icon={<Store className="w-2.5 h-2.5" />}
              />
            )}
            <ExtLink
              href={explorerAddressUrl(nft.id)}
              label="Burn history"
              icon={<Flame className="w-2.5 h-2.5" />}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const StatCell = ({
  icon, label, value, highlight = false, colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  colorClass?: string;
}) => (
  <div className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg bg-secondary/30 border border-border/30">
    <span className="text-muted-foreground/40">{icon}</span>
    <span className={`font-mono text-[11px] font-bold leading-none ${colorClass ?? (highlight ? "text-foreground" : "text-muted-foreground/60")}`}>
      {value}
    </span>
    <span className="text-[9px] uppercase tracking-widest text-muted-foreground/30">{label}</span>
  </div>
);

const MetaTag = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/30 bg-secondary/30">
    <span className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">{label}:</span>
    <span className="text-[10px] font-mono text-muted-foreground/60 max-w-[80px] truncate">{value}</span>
  </div>
);

const ExtLink = ({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => e.stopPropagation()}
    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-border/30 bg-secondary/20 text-[10px] text-muted-foreground/50 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all"
  >
    {icon}
    {label}
  </a>
);

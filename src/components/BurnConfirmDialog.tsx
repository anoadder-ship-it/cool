/**
 * BurnConfirmDialog — shown before every burn.
 *
 * Transparency commitments shown to the user:
 *  - The NFT is sent to the official Solana burn address (1nc1nerator…)
 *  - Signing model: wallet.signTransaction() — one tx per NFT, user approves each
 *  - Fee breakdown: per-NFT fee + network cost
 *  - The burn address links to Solana Explorer so users can verify it themselves
 */
import { useState } from "react";
import {
  AlertTriangle, Flame, Skull, Crown, Zap,
  ExternalLink, Info, ShieldCheck, KeyRound, ImageOff,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SOLANA_BURN_ADDRESS, FEE_PER_BURN_SOL, PREMIUM_FEE_SOL, ADMIN_TREASURY } from "@/lib/configAddress";
import type { NFTAsset } from "@/lib/nftService";

interface BurnConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  totalFee: number;
  isPremium?: boolean;
  isBurning: boolean;
  burnProgress: { current: number; total: number; lastSig?: string } | null;
  onConfirm: () => void;
  /** Full NFT objects — used to render image previews */
  selectedNfts?: NFTAsset[];
}

const BURN_EXPLORER = `https://explorer.solana.com/address/${SOLANA_BURN_ADDRESS}?cluster=mainnet`;
const TREASURY_EXPLORER = `https://explorer.solana.com/address/${ADMIN_TREASURY}?cluster=mainnet`;

// ── Large single-NFT preview ────────────────────────────────────────
const SinglePreview = ({ nft }: { nft: NFTAsset }) => {
  const [err, setErr] = useState(false);
  return (
    <div className="shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-primary/20 bg-secondary/60 shadow-[0_0_20px_hsl(var(--primary)/0.15)] relative">
      {nft.image && !err ? (
        <img
          src={nft.image}
          alt={nft.name}
          className="w-full h-full object-cover"
          onError={() => setErr(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageOff className="w-7 h-7 text-muted-foreground/20" />
        </div>
      )}
    </div>
  );
};

// ── NFT image thumbnail with fallback ────────────────────────────────────────
const NftThumb = ({ nft, burning }: { nft: NFTAsset; burning?: boolean }) => {
  const [err, setErr] = useState(false);
  return (
    <div
      className={`relative shrink-0 w-14 h-14 rounded-lg overflow-hidden border ${
        burning ? "border-primary/60" : "border-border/40"
      } bg-secondary/60 transition-all`}
      title={nft.name}
    >
      {nft.image && !err ? (
        <img
          src={nft.image}
          alt={nft.name}
          loading="lazy"
          onError={() => setErr(true)}
          className={`w-full h-full object-cover ${
            burning ? "brightness-50" : ""
          }`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageOff className="w-5 h-5 text-muted-foreground/20" />
        </div>
      )}
      {burning && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Flame className="w-5 h-5 text-primary fire-glow" />
        </div>
      )}
    </div>
  );
};

export const BurnConfirmDialog = ({
  open,
  onOpenChange,
  selectedCount,
  totalFee,
  isPremium = false,
  isBurning,
  burnProgress,
  onConfirm,
  selectedNfts = [],
}: BurnConfirmDialogProps) => {
  const pct = burnProgress
    ? Math.round((burnProgress.current / burnProgress.total) * 100)
    : 0;

  const shortBurnAddr = `${SOLANA_BURN_ADDRESS.slice(0, 8)}…${SOLANA_BURN_ADDRESS.slice(-6)}`;
  const shortTreasury = `${ADMIN_TREASURY.slice(0, 6)}…${ADMIN_TREASURY.slice(-4)}`;

  return (
    <Dialog open={open} onOpenChange={isBurning ? undefined : onOpenChange}>
      <DialogContent className="bg-card border border-border/60 shadow-[0_0_60px_hsl(var(--primary)/0.12)] max-w-md p-0 overflow-hidden">

        {/* Header strip */}
        <div className={`px-5 pt-5 pb-4 border-b border-border/40 ${isPremium ? "bg-yellow-950/20" : "bg-red-950/20"}`}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                isPremium
                  ? "bg-yellow-500/10 border-yellow-500/30"
                  : "bg-primary/10 border-primary/30"
              }`}>
                {isPremium
                  ? <Crown className="w-4 h-4 text-yellow-400" />
                  : <Skull className="w-4 h-4 text-primary" />
                }
              </div>
              <div>
                <DialogTitle className="text-base font-bold uppercase tracking-wider">
                  {isPremium ? "Premium Clean" : "Confirm Burn"}
                </DialogTitle>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  {selectedCount} NFT{selectedCount !== 1 ? "s" : ""} · {isPremium ? PREMIUM_FEE_SOL : totalFee.toFixed(3)} SOL total
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[75vh] overflow-y-auto">
          {!isBurning ? (
            <div className="space-y-3">

              {/* ── WHAT HAPPENS ── */}
              <div className="rounded-lg border border-border/40 bg-secondary/20 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-secondary/30">
                  <ShieldCheck className="w-3 h-3 text-primary/70" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">What happens</span>
                </div>
                <div className="px-3 py-2.5 space-y-2 text-[11px] text-muted-foreground leading-relaxed">
                  <p>
                    Each NFT is <span className="text-foreground font-semibold">transferred to the official Solana burn address</span> — a public key no one controls. It cannot be reversed.
                  </p>
                  <div className="flex items-center gap-2 p-2 rounded bg-secondary/60 border border-border/30 font-mono text-[10px]">
                    <span className="text-muted-foreground/50 shrink-0">Burn address:</span>
                    <span className="text-primary/90 truncate">{shortBurnAddr}</span>
                    <a
                      href={BURN_EXPLORER}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto shrink-0 text-muted-foreground/40 hover:text-primary transition-colors"
                      title="Verify on Solana Explorer"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50">
                    Your empty token account is then closed, returning ~0.002 SOL rent to your wallet.
                  </p>
                </div>
              </div>

              {/* ── SIGNING MODEL ── */}
              <div className="rounded-lg border border-blue-500/20 bg-blue-950/10 px-3 py-2.5 flex items-start gap-2.5">
                <KeyRound className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-[11px] font-semibold text-blue-300">One signature per NFT</p>
                  <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                    We use <code className="text-blue-300/80">signTransaction</code> — your wallet will show you each transaction before it's sent. We never batch-sign silently.
                  </p>
                </div>
              </div>

              {/* ── NFT PREVIEW ── */}
              {selectedNfts.length > 0 && (
                <div className="rounded-lg border border-border/30 bg-secondary/20 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Flame className="w-3 h-3 text-primary/60" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">NFTs to burn</span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground/40">{selectedNfts.length}</span>
                  </div>

                  {/* Single NFT — large preview */}
                  {selectedNfts.length === 1 ? (
                    <div className="flex items-center gap-4 px-4 py-4">
                      <SinglePreview nft={selectedNfts[0]} />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{selectedNfts[0].name || "Unknown NFT"}</p>
                        {selectedNfts[0].collectionSymbol && (
                          <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 truncate">
                            {selectedNfts[0].collectionSymbol}
                          </p>
                        )}
                        <p className="text-[10px] font-mono text-muted-foreground/30 mt-1 truncate">
                          {selectedNfts[0].id.slice(0, 16)}…
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Multiple NFTs — scrollable strip + overflow count */
                    <div className="px-3 py-3 space-y-2">
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        {selectedNfts.slice(0, 12).map((nft) => (
                          <NftThumb key={nft.id} nft={nft} />
                        ))}
                        {selectedNfts.length > 12 && (
                          <div className="shrink-0 w-14 h-14 rounded-lg border border-border/30 bg-secondary/40 flex items-center justify-center">
                            <span className="text-[11px] font-mono font-bold text-muted-foreground/60">
                              +{selectedNfts.length - 12}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Name list below strip — scrollable */}
                      <div className="max-h-20 overflow-y-auto divide-y divide-border/20">
                        {selectedNfts.slice(0, 20).map((nft, i) => (
                          <div key={nft.id} className="py-1.5 flex items-center gap-2">
                            <span className="text-[9px] font-mono text-muted-foreground/30 w-4 text-right shrink-0">{i + 1}</span>
                            <span className="text-[11px] text-muted-foreground truncate">{nft.name || "Unknown NFT"}</span>
                          </div>
                        ))}
                        {selectedNfts.length > 20 && (
                          <div className="py-1.5 text-[10px] text-muted-foreground/30 font-mono">
                            +{selectedNfts.length - 20} more…
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── FEE BREAKDOWN ── */}
              <div className="rounded-lg border border-border/40 bg-secondary/30 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-secondary/30">
                  <Info className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Fee breakdown</span>
                </div>
                <div className="divide-y divide-border/20">
                  {isPremium ? (
                    <>
                      <Row label="Plan" value={<span className="text-yellow-400 font-bold">Premium Unlimited</span>} />
                      <Row label="NFTs to burn" value={<span className="font-mono font-bold">{selectedCount.toLocaleString()}</span>} />
                      <Row label="Flat fee" value={<span className="font-mono font-bold">{PREMIUM_FEE_SOL} SOL</span>} />
                    </>
                  ) : (
                    <>
                      <Row label="NFTs selected" value={<span className="font-mono font-bold">{selectedCount.toLocaleString()}</span>} />
                      <Row
                        label="Service fee"
                        value={
                          <span className="font-mono">
                            {FEE_PER_BURN_SOL} SOL × {selectedCount} = <strong>{totalFee.toFixed(3)} SOL</strong>
                          </span>
                        }
                      />
                      <Row label="Network fee (est.)" value={<span className="font-mono text-muted-foreground/60">~{(selectedCount * 0.000025).toFixed(6)} SOL</span>} />
                      <Row label="Rent reclaimed" value={<span className="font-mono text-emerald-400">+{(selectedCount * 0.002).toFixed(3)} SOL</span>} />
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-secondary/40">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Total fee</span>
                  <span className={`text-lg font-bold font-mono ${isPremium ? "text-yellow-400" : "text-primary"}`}>
                    {isPremium ? PREMIUM_FEE_SOL : totalFee.toFixed(3)} SOL
                  </span>
                </div>
              </div>

              {/* ── TREASURY TRANSPARENCY ── */}
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40 font-mono">
                <Info className="w-3 h-3 shrink-0" />
                <span>Fees go to treasury:</span>
                <a
                  href={TREASURY_EXPLORER}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground/60 hover:text-primary transition-colors flex items-center gap-0.5"
                >
                  {shortTreasury} <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                </a>
              </div>

              {/* ── IRREVERSIBLE WARNING ── */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-yellow-500/20 bg-yellow-950/10">
                <AlertTriangle className="w-4 h-4 text-yellow-500/80 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This action is{" "}
                  <span className="text-foreground font-semibold">permanent and irreversible.</span>
                  {" "}NFTs sent to the burn address cannot be recovered by anyone.
                </p>
              </div>

              {/* ── ACTIONS ── */}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 h-9 text-xs border-border/50 text-muted-foreground hover:text-foreground"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  className={`flex-1 h-9 text-xs font-bold uppercase tracking-wider ${
                    isPremium
                      ? "bg-yellow-500 hover:bg-yellow-400 text-black"
                      : "burn-button text-white"
                  }`}
                  onClick={onConfirm}
                >
                  {isPremium
                    ? <><Crown className="w-3.5 h-3.5 mr-1.5" />Sign & Burn All</>
                    : <><Flame className="w-3.5 h-3.5 mr-1.5" />Sign & Burn</>
                  }
                </Button>
              </div>
            </div>
          ) : (
            /* Burning state */
            <div className="py-4 space-y-5">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center pulse-ring">
                    <Flame className="w-7 h-7 text-primary fire-glow" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="font-bold text-sm uppercase tracking-wider">Incinerating</p>
                  {burnProgress && (
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {burnProgress.current.toLocaleString()} / {burnProgress.total.toLocaleString()} NFTs
                    </p>
                  )}
                </div>
              </div>

              {/* Burning NFT images — strip of thumbs that get consumed */}
              {selectedNfts.length > 0 && (
                <div className="flex gap-2 justify-center flex-wrap">
                  {selectedNfts.slice(0, 6).map((nft, i) => (
                    <NftThumb
                      key={nft.id}
                      nft={nft}
                      burning={
                        burnProgress
                          ? i < burnProgress.current
                          : false
                      }
                    />
                  ))}
                  {selectedNfts.length > 6 && (
                    <div className="shrink-0 w-14 h-14 rounded-lg border border-border/30 bg-secondary/40 flex items-center justify-center">
                      <span className="text-[11px] font-mono font-bold text-muted-foreground/40">+{selectedNfts.length - 6}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Sending to address */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border/30 text-[10px] font-mono">
                <span className="text-muted-foreground/40">→</span>
                <span className="text-primary/70 truncate">{shortBurnAddr}</span>
                <a
                  href={BURN_EXPLORER}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-muted-foreground/30 hover:text-primary"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

              {/* Last tx link */}
              {burnProgress?.lastSig && (
                <a
                  href={`https://explorer.solana.com/tx/${burnProgress.lastSig}?cluster=mainnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-600/20 text-[10px] font-mono text-emerald-400 hover:border-emerald-500/40 transition-colors"
                >
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  Latest tx: {burnProgress.lastSig.slice(0, 16)}…
                </a>
              )}

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full progress-bar" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5 text-primary" />
                    Signing & sending to chain
                  </span>
                  <span>{pct}%</span>
                </div>
              </div>

              <p className="text-[11px] text-center text-muted-foreground/40">
                Approve each transaction in your wallet · Do not close this window
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between px-4 py-2.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-xs">{value}</span>
  </div>
);
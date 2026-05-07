import React, { useState, useEffect, useCallback, useRef } from "react";
import { ShieldCheck, useWallet } from "@solana/wallet-adapter-react";
import { ShieldCheck, fetchUserNFTs, NFTAsset } from "@/lib/nftService";
import { ShieldCheck, magicEdenService } from "@/lib/MagicEdenService";
import { ShieldCheck, BurnRecord, BurnErrorCode } from "@/lib/nftHaterSDK";
import { ShieldCheck, recordBurns } from "@/lib/leaderboardStore";
import { ShieldCheck,
  registerPresence,
  subscribeActiveUsers,
  registerReferralUse,
  creditReferralEarnings,
  resolveReferralCode,
} from "@/lib/firebaseService";
import { ShieldCheck, ReferralModal } from "@/components/ReferralModal";
import { ShieldCheck, useNftHater } from "@/hooks/useNftHater";
import { ShieldCheck, useToast } from "@/hooks/use-toast";
import { ShieldCheck, NftGrid } from "@/components/NftGrid";
import { ShieldCheck, Leaderboard } from "@/components/Leaderboard";
import { ShieldCheck, WalletStats } from "@/components/WalletStats";
import { ShieldCheck, BurnConfirmDialog } from "@/components/BurnConfirmDialog";
import { ShieldCheck, BurnHistory } from "@/components/BurnHistory";
import { ShieldCheck, HowToBurnModal } from "@/components/HowToBurnModal";
import { ShieldCheck, BuySOLModal } from "@/components/BuySOLModal";
import { ShieldCheck, SolBalanceBadge, SolBalanceMobile } from "@/components/SolBalanceBadge";
import { ShieldCheck, BurnSuccessOverlay } from "@/components/BurnSuccessOverlay";
import { ShieldCheck, MobileWalletConnect } from "@/components/MobileWalletConnect";
import { ShieldCheck, GlobalStatsBanner } from "@/components/GlobalStatsBanner";
import { ShieldCheck,
  Flame, Skull, LayoutGrid, Trophy,
  RefreshCw, Crown, Search, X,
  HelpCircle, TriangleAlert, Gift,
} from "lucide-react";
import { ShieldCheck, Button } from "@/components/ui/button";
import { ShieldCheck, ADMIN_TREASURY, SOLANA_BURN_ADDRESS } from "@/lib/configAddress";

// ── Social links ─────────────────────────────────────────────────────────────
const SOCIALS = [
  {
    label: "X / Twitter",
    href: "https://x.com/BurnBoxSol",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
      </svg>
    ),
  },
  {
    label: "Telegram",
    href: "https://t.me/BurnBoxSol",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    label: "Discord",
    href: "https://discord.gg/burnbox",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  },
  {
    label: "GitHub",
    href: "https://github.com/BurnBoxSol",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
  },
] as const;

type Tab        = "burn" | "leaderboard" | "stats";
type SortKey    = "default" | "name" | "floor_desc" | "floor_asc" | "risk" | "scam";
type ViewFilter = "all" | "scam" | "suspicious" | "nfts" | "tokens";

const riskScore = (id: string) =>
  Math.abs(id.split("").reduce((s, c) => (s * 31 + c.charCodeAt(0)) | 0, 0)) % 100;

const isConfirmedScam  = (n: NFTAsset) => n.scam?.level === "confirmed";
const isSuspiciousScam = (n: NFTAsset) => n.scam?.level === "suspicious";

// Error code → human-readable action
const ERROR_ACTIONS: Record<BurnErrorCode, { label: string; action?: string }> = {
  NO_SOL:          { label: "Not enough SOL",        action: "buy_sol" },
  RATE_LIMITED:    { label: "RPC rate limited",       action: "retry" },
  USER_REJECTED:   { label: "Rejected in wallet",     action: "retry" },
  ATA_MISSING:     { label: "Token account not found" },
  METADATA_ERROR:  { label: "Metadata unavailable" },
  NETWORK_ERROR:   { label: "Network error",          action: "retry" },
  TX_EXPIRED:      { label: "Transaction expired",    action: "retry" },
  UNKNOWN:         { label: "Unknown error",          action: "retry" },
};

export default function Index() {
  const { publicKey, connected } = useWallet();
  const { sdk } = useNftHater();
  const { toast } = useToast();

  const [tab,             setTab]           = useState<Tab>("burn");
  const [nfts,            setNfts]          = useState<NFTAsset[]>([]);
  const [selectedIds,     setSelectedIds]   = useState<Set<string>>(new Set());
  const [isLoading,       setIsLoading]     = useState(false);
  const [isLoadingMore,   setIsLoadingMore] = useState(false);
  const [confirmOpen,     setConfirmOpen]   = useState(false);
  const [howToOpen,       setHowToOpen]     = useState(false);
  const [buySOLOpen,      setBuySOLOpen]    = useState(false);
  const [isPremium,       setIsPremium]     = useState(false);
  const [isBurning,       setIsBurning]     = useState(false);
  const [burnProgress,    setBurnProgress]  = useState<{
    current: number; total: number; lastSig?: string;
  } | null>(null);
  const [floorPrices,     setFloorPrices]   = useState<Map<string, { floorSol: number; listedCount: number }>>(new Map());
  const [search,          setSearch]        = useState("");
  const [sort,            setSort]          = useState<SortKey>("default");
  const [burnHistory,     setBurnHistory]   = useState<BurnRecord[]>([]);
  const [meError,         setMeError]       = useState(false);
  const [rpcError,        setRpcError]      = useState(false);
  const [suggestedSol,    setSuggestedSol]  = useState(0.05);
  const [activeUsers,     setActiveUsers]   = useState<number>(0);
  const [burnSuccess,     setBurnSuccess]   = useState<number | null>(null);
  const [viewFilter,      setViewFilter]    = useState<ViewFilter>("all");
  const [referralOpen,    setReferralOpen]  = useState(false);
  const [referrerWallet,  setReferrerWallet] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ── Register presence + subscribe to active count ────────────────────
  useEffect(() => {
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const cleanupPresence = registerPresence(sessionId);
    const cleanupCount    = subscribeActiveUsers(setActiveUsers);
    return () => { cleanupPresence(); cleanupCount(); };
  }, []);

  // ── Referral code detection from URL (?ref=XXXXX) ─────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get("ref");
    if (!code) return;
    // Resolve code → referrer wallet (async, non-blocking)
    resolveReferralCode(code).then((referrer) => {
      if (referrer) setReferrerWallet(referrer);
    });
    // Clean the URL so the code isn't re-processed on refresh
    const clean = new URL(window.location.href);
    clean.searchParams.delete("ref");
    window.history.replaceState({}, "", clean.toString());
  }, []);

  // ── Register referral use once wallet connects ────────────────────────
  useEffect(() => {
    if (!connected || !publicKey || !referrerWallet) return;
    const wallet = publicKey.toString();
    if (wallet === referrerWallet) return; // can't refer yourself
    registerReferralUse(wallet, referrerWallet);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey?.toString(), referrerWallet]);

  // ── Load NFTs ─────────────────────────────────────────────────────────────
  const loadNFTs = useCallback(async () => {
    if (!publicKey) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsLoading(true);
    setIsLoadingMore(false);
    setNfts([]);
    setSelectedIds(new Set());
    setFloorPrices(new Map());
    setRpcError(false);

    const seen        = new Set<string>();
    const seenSymbols = new Set<string>();
    let firstBatch    = true;
    let gotAny        = false;

    try {
      await fetchUserNFTs(publicKey.toString(), (batch) => {
        if (ctrl.signal.aborted) return;
        const fresh = batch.filter((n) => n.id && !seen.has(n.id));
        fresh.forEach((n) => seen.add(n.id));
        if (!fresh.length) return;

        gotAny = true;
        setNfts((prev) => [...prev, ...fresh]);

        if (firstBatch) {
          setIsLoading(false);
          setIsLoadingMore(true);
          firstBatch = false;
        }

        // Fetch floor prices — ignore ME errors gracefully
        const newSyms = fresh
          .map((n) => n.collectionSymbol)
          .filter((s): s is string => !!s && !seenSymbols.has(s));
        newSyms.forEach((s) => seenSymbols.add(s));

        if (newSyms.length) {
          magicEdenService.getFloorPriceBatch(newSyms)
            .then((prices) => {
              if (ctrl.signal.aborted) return;
              if (prices.size === 0 && newSyms.length > 0) setMeError(true);
              else setMeError(false);
              setFloorPrices((prev) => {
                const next = new Map(prev);
                prices.forEach((v, k) => next.set(k, v));
                return next;
              });
            })
            .catch(() => setMeError(true));
        }
      });

      if (!gotAny && !ctrl.signal.aborted) {
        // Could be RPC issue or genuinely empty wallet — we show empty state either way
        setRpcError(false);
      }
    } catch {
      if (!ctrl.signal.aborted) {
        setRpcError(true);
        toast({
          title: "Failed to load NFTs",
          description: "RPC error. Your wallet data couldn't be fetched. Try refreshing.",
          variant: "destructive",
        });
      }
    } finally {
      if (!ctrl.signal.aborted) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey?.toString()]);

  useEffect(() => {
    if (connected && publicKey) {
      loadNFTs();
    } else {
      abortRef.current?.abort();
      setNfts([]);
      setSelectedIds(new Set());
      setFloorPrices(new Map());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey?.toString()]);

  // ── Scam counts (for filter pill badges) ─────────────────────────────────
  const scamCount       = nfts.filter(isConfirmedScam).length;
  const suspiciousCount = nfts.filter(isSuspiciousScam).length;
  const fungibleCount   = nfts.filter((n) => n.isFungible).length;

  // ── Filter + Sort ─────────────────────────────────────────────────────────
  const visibleNfts = (() => {
    let list = nfts;
    // View filter
    switch (viewFilter) {
      case "scam":       list = list.filter(isConfirmedScam);            break;
      case "suspicious": list = list.filter(isSuspiciousScam);           break;
      case "nfts":       list = list.filter((n) => !n.isFungible);       break;
      case "tokens":     list = list.filter((n) => n.isFungible);        break;
      default: break;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) => n.name.toLowerCase().includes(q) || n.collectionSymbol.toLowerCase().includes(q)
      );
    }
    switch (sort) {
      case "name":       return [...list].sort((a, b) => a.name.localeCompare(b.name));
      case "floor_desc": return [...list].sort((a, b) => (floorPrices.get(b.collectionSymbol)?.floorSol ?? 0) - (floorPrices.get(a.collectionSymbol)?.floorSol ?? 0));
      case "floor_asc":  return [...list].sort((a, b) => (floorPrices.get(a.collectionSymbol)?.floorSol ?? 0) - (floorPrices.get(b.collectionSymbol)?.floorSol ?? 0));
      case "risk":       return [...list].sort((a, b) => riskScore(b.id) - riskScore(a.id));
      case "scam":       return [...list].sort((a, b) => (b.scam?.score ?? 0) - (a.scam?.score ?? 0));
      default:           return list;
    }
  })();

  // ── Selection helpers ──────────────────────────────────────────────────────
  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); } else { n.add(id); }
      return n;
    });

  const selectMany = (ids: Set<string>) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      ids.forEach((id) => n.add(id));
      return n;
    });

  const selectAll = () =>
    setSelectedIds(
      selectedIds.size === visibleNfts.length
        ? new Set()
        : new Set(visibleNfts.map((n) => n.id))
    );

  const selectHighRisk = () =>
    setSelectedIds(new Set(visibleNfts.filter((n) => riskScore(n.id) >= 75).map((n) => n.id)));

  const selectAllScams = () =>
    setSelectedIds(new Set(nfts.filter((n) => isConfirmedScam(n) || isSuspiciousScam(n)).map((n) => n.id)));

  // ── Burn ──────────────────────────────────────────────────────────────────
  const handleBurn = async () => {
    if (!sdk) {
      toast({
        title: "Wallet not ready",
        description: "Reconnect your wallet and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsBurning(true);
    setBurnProgress({ current: 0, total: selectedIds.size });

    try {
      if (isPremium) {
        const res = await sdk.payPremiumFee();
        if (!res.success) {
          if (res.errorCode === "NO_SOL") {
            setSuggestedSol(0.1);
            toast({
              title: "Not enough SOL for premium",
              description: res.error,
              variant: "destructive",
            });
            setBuySOLOpen(true);
          } else {
            toast({ title: "Premium payment failed", description: res.error, variant: "destructive" });
          }
          return;
        }
        toast({
          title: "✅ Premium activated",
          description: (
            <a
              href={res.data?.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 underline text-primary mt-1"
            >
              <ExternalLink className="w-3 h-3" /> View payment on Explorer
            </a>
          ) as unknown as string,
        });
      }

      const mints    = Array.from(selectedIds);
      const nftNames = Object.fromEntries(nfts.map((n) => [n.id, n.name]));

      // Build the set of compressed mints so the SDK knows which burn path to use
      const compressedSet = new Set(
        nfts.filter((n) => n.compressed && selectedIds.has(n.id)).map((n) => n.id)
      );

      const result = await sdk.burnBatch(
        mints,
        nftNames,
        (current, total, lastSig) => setBurnProgress({ current, total, lastSig }),
        compressedSet
      );

      if (!result.success) {
        // Surface specific error codes
        if (result.errorCode === "NO_SOL") {
          const need = selectedIds.size * 0.005 + 0.01;
          setSuggestedSol(need);
          setBuySOLOpen(true);
        } else if (result.errorCode === "NETWORK_ERROR" || result.errorCode === "RATE_LIMITED") {
          setRpcError(true);
        }
        toast({
          title: "Burn failed",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      const { successCount, failCount, records, errors } = result.data!;

      // Auto-remove NFTs whose token account no longer exists on-chain
      const missingMints = new Set(
        errors.filter((e) => e.code === "ATA_MISSING").map((e) => e.mint)
      );
      const burnedMints = new Set(records.map((r) => r.mint));
      const toRemove = new Set([...missingMints, ...burnedMints]);
      if (toRemove.size > 0) {
        setNfts((prev) => prev.filter((n) => !toRemove.has(n.id)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          toRemove.forEach((id) => next.delete(id));
          return next;
        });
      }

      // Save to leaderboard store + credit referrer
      if (successCount > 0 && publicKey) {
        const wallet   = publicKey.toString();
        const feeSol   = successCount * 0.005;
        recordBurns(wallet, successCount, feeSol, records.map((r) => r.signature));
        setBurnSuccess(successCount);
        // Credit referral earnings (non-blocking — fire and forget)
        creditReferralEarnings(wallet, successCount, feeSol);
      }

      // Append to burn history
      if (records.length > 0) {
        setBurnHistory((prev) => [...records, ...prev]);
      }

      // Surface per-NFT errors with actionable messages
      if (errors.length > 0) {
        const noSol   = errors.filter((e) => e.code === "NO_SOL");
        const limited = errors.filter((e) => e.code === "RATE_LIMITED");

        if (noSol.length > 0) {
          setSuggestedSol(noSol.length * 0.005 + 0.01);
          // Don't auto-open buy modal on partial failure — just toast
        }
        if (limited.length > 0) {
          toast({
            title: `${limited.length} NFT${limited.length > 1 ? "s" : ""} skipped — RPC rate limit`,
            description: "Wait a few seconds and retry the remaining NFTs.",
            variant: "destructive",
          });
        }
      }

      if (successCount > 0) {
        const firstSig = records[0]?.signature;
        toast({
          title: `🔥 ${successCount.toLocaleString()} NFT${successCount !== 1 ? "s" : ""} permanently destroyed`,
          description: firstSig ? (
            <a
              href={`https://explorer.solana.com/tx/${firstSig}?cluster=mainnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 underline text-primary mt-1"
            >
              <ExternalLink className="w-3 h-3" />
              View on Solana Explorer
              {failCount > 0 ? ` · ${failCount} failed` : ""}
            </a>
          ) as unknown as string : failCount > 0 ? `${failCount} NFTs could not be burned.` : `Sent to ${SOLANA_BURN_ADDRESS.slice(0, 8)}…`,
        });
      } else if (errors.length > 0) {
        // If every failure is ATA_MISSING the NFTs were already removed above
        // — show a helpful message rather than a scary error
        const allGhost = errors.every((e) => e.code === "ATA_MISSING");
        if (allGhost) {
          toast({
            title: "NFTs removed from your grid",
            description: "These NFTs no longer exist on-chain (already burned or transferred). They've been removed from your list.",
          });
        } else {
          const topError = errors[0];
          const info     = ERROR_ACTIONS[topError.code];
          toast({
            title: `Nothing burned — ${info.label}`,
            description: topError.userFacing,
            variant: "destructive",
          });
          if (topError.code === "NO_SOL") {
            setSuggestedSol(mints.length * 0.005 + 0.01);
            setBuySOLOpen(true);
          }
        }
      } else {
        toast({
          title: "Nothing burned",
          description: "All selected NFTs had empty token accounts — they have been removed from your grid.",
          variant: "destructive",
        });
      }

      // Only reload from RPC if we actually burned something
      // (avoids spamming Helius on ghost-NFT failures)
      if (successCount > 0) {
        await loadNFTs();
      }
    } finally {
      setIsBurning(false);
      setBurnProgress(null);
      setConfirmOpen(false);
    }
  };

  const totalFee    = selectedIds.size * 0.005;
  const hasSelected = selectedIds.size > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">


      {/* ── BURN SUCCESS OVERLAY ── */}
      {burnSuccess !== null && (
        <BurnSuccessOverlay
          count={burnSuccess}
          onDone={() => setBurnSuccess(null)}
        />
      )}

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 h-14 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-full flex items-center justify-between gap-4">

          {/* Logo + contract badge */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-7 h-7 rounded bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Flame className="w-3.5 h-3.5 text-primary fire-glow" />
            </div>
            <div className="hidden sm:block">
              <span className="font-black text-sm tracking-widest uppercase">
                Burn<span className="text-primary">Box</span>
              </span>
              {/* Burn address — tiny, always visible */}
              <a
                href={`https://explorer.solana.com/address/${SOLANA_BURN_ADDRESS}?cluster=mainnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground/30 hover:text-primary/60 transition-colors leading-none mt-0.5"
                title={`Burn address: ${SOLANA_BURN_ADDRESS}`}
              >
                <ShieldCheck className="w-2 h-2" />
                {SOLANA_BURN_ADDRESS.slice(0, 8)}…{SOLANA_BURN_ADDRESS.slice(-6)}
              </a>
            </div>
          </div>

          {/* Nav */}
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border/40 bg-secondary/40">
              {([
                { id: "burn",        label: "Burn",        icon: LayoutGrid },
                { id: "leaderboard", label: "Leaderboard", icon: Trophy },
                { id: "stats",       label: "My Stats",    icon: User },
              ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-150 ${
                    tab === id
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </nav>

            {/* Active users pill */}
            {activeUsers > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-green-500/20 bg-green-500/5 text-[10px] font-mono text-green-500/80">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                {activeUsers} online
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* How to burn */}
            <button
              onClick={() => setHowToOpen(true)}
              className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border/40 bg-secondary/40 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              title="How does BurnBox work?"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              How it works
            </button>

            {/* Referral */}
            {connected && (
              <button
                onClick={() => setReferralOpen(true)}
                className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg border border-primary/30 bg-primary/5 text-[11px] font-bold text-primary hover:bg-primary/10 hover:border-primary/50 transition-colors"
                title="Referral program — earn SOL"
              >
                <Gift className="w-3.5 h-3.5" />
                Refer &amp; Earn
              </button>
            )}

            {/* SOL balance */}
            <SolBalanceBadge pendingFeeSol={totalFee} />
            <SolBalanceMobile />

            <MobileWalletConnect />
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="flex-1 container mx-auto px-4 py-6">

        {tab === "leaderboard" ? (
          <Leaderboard activeUsers={activeUsers} />

        ) : tab === "stats" ? (
          <WalletStats />

        ) : !connected ? (
          /* ── HERO ── */
          <div className="max-w-2xl mx-auto text-center mt-16 md:mt-24 space-y-10 px-4 slide-up">

            <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl" />
              <div className="relative w-20 h-20 rounded-2xl bg-card border border-primary/20 flex items-center justify-center shadow-[0_0_40px_hsl(var(--primary)/0.15)]">
                <Skull className="w-10 h-10 text-primary fire-glow" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-[11px] font-mono text-primary uppercase tracking-widest mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Solana Mainnet · Live
              </div>
              <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tight leading-none">
                Burn Your<br />
                <span className="text-primary fire-glow">Worthless NFTs</span>
              </h1>
              <p className="text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
                BurnBox permanently destroys NFTs by sending them to the official Solana burn address.
                Transparent, traceable, irreversible. You sign each transaction individually.
              </p>
            </div>

            {/* Burn address hero */}
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/20 bg-primary/5 font-mono text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-primary/70 shrink-0" />
              <span className="text-muted-foreground/50">Burns sent to:</span>
              <a
                href={`https://explorer.solana.com/address/${SOLANA_BURN_ADDRESS}?cluster=mainnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary/80 hover:text-primary transition-colors flex items-center gap-1"
              >
                {SOLANA_BURN_ADDRESS.slice(0, 12)}…{SOLANA_BURN_ADDRESS.slice(-8)}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {[
                { icon: Zap,           text: "0.005 SOL per burn",      color: "border-primary/20 text-primary/80" },
                { icon: Crown,         text: "0.1 SOL flat — unlimited", color: "border-yellow-500/20 text-yellow-500/80" },
                { icon: AlertTriangle, text: "Permanent — irreversible", color: "border-muted/40 text-muted-foreground" },
                { icon: ShieldCheck,   text: "signTransaction only",     color: "border-blue-500/20 text-blue-400/80" },
              ].map(({ icon: Icon, text, color }) => (
                <div key={text} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-secondary/20 text-[11px] font-medium ${color}`}>
                  <Icon className="w-3 h-3 shrink-0" />
                  {text}
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
              <MobileWalletConnect />
              <button
                onClick={() => setHowToOpen(true)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors font-mono"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                How does this work?
              </button>
            </div>

            {/* ── Global stats bar ── */}
            <div className="w-full max-w-2xl">
              <GlobalStatsBanner activeUsers={activeUsers} />
            </div>

          </div>

        ) : (
          /* ── BURN TAB ── */
          <div className={`space-y-4 slide-up ${hasSelected ? "pb-28" : ""}`}>

            {/* Error banners */}
            {rpcError && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-yellow-500/20 bg-yellow-950/10">
                <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                <div className="flex-1 text-[11px]">
                  <span className="font-semibold text-yellow-300">RPC error</span>
                  <span className="text-muted-foreground ml-2">Helius couldn't load your wallet. Check your connection.</span>
                </div>
                <button
                  onClick={loadNFTs}
                  className="text-[10px] font-mono text-yellow-400/60 hover:text-yellow-400 transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}
            {meError && !rpcError && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border/30 bg-secondary/20">
                <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                <span className="text-[10px] text-muted-foreground/50">
                  Magic Eden API unavailable — floor prices may not show. NFT scanning and burning still work normally.
                </span>
              </div>
            )}

            {/* ── Scam alert banner ── */}
            {(scamCount > 0 || suspiciousCount > 0) && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-red-500/30 bg-red-950/20">
                <div className="flex items-center gap-2.5 min-w-0">
                  <TriangleAlert className="w-4 h-4 text-red-400 shrink-0" />
                  <div className="text-[11px] leading-snug min-w-0">
                    <span className="font-bold text-red-300">
                      {scamCount > 0 && `${scamCount} confirmed scam${scamCount !== 1 ? "s" : ""}`}
                      {scamCount > 0 && suspiciousCount > 0 && " · "}
                      {suspiciousCount > 0 && `${suspiciousCount} suspicious`}
                    </span>
                    <span className="text-muted-foreground ml-1.5">detected in your wallet</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllScams}
                  className="h-7 px-3 text-[10px] font-bold shrink-0 border-red-500/40 text-red-400 hover:bg-red-950/40 hover:border-red-500/60"
                >
                  <Skull className="w-3 h-3 mr-1" />
                  Select All Scams
                </Button>
              </div>
            )}

            {/* ── View filter pills ── */}
            {nfts.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  { id: "all",        label: "All",       count: nfts.length },
                  { id: "scam",       label: "Scam",      count: scamCount,       color: scamCount > 0 ? "border-red-500/50 text-red-400 bg-red-950/20" : undefined },
                  { id: "suspicious", label: "Suspicious", count: suspiciousCount, color: suspiciousCount > 0 ? "border-orange-500/40 text-orange-400 bg-orange-950/10" : undefined },
                  { id: "nfts",       label: "NFTs",       count: nfts.filter((n) => !n.isFungible).length },
                  { id: "tokens",     label: "Tokens",     count: fungibleCount },
                ] as { id: ViewFilter; label: string; count: number; color?: string }[]).map(({ id, label, count, color }) =>
                  count > 0 || id === "all" ? (
                    <button
                      key={id}
                      onClick={() => setViewFilter(id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold transition-all ${
                        viewFilter === id
                          ? color ?? "border-primary/50 text-primary bg-primary/10"
                          : "border-border/30 text-muted-foreground/60 hover:text-muted-foreground hover:border-border/60"
                      }`}
                    >
                      {label}
                      <span className="opacity-60">{count}</span>
                    </button>
                  ) : null
                )}
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-col gap-3">
              {/* Row 1 */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-black uppercase tracking-wider">NFTs</h2>
                      {nfts.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-secondary border border-border/40 text-[10px] font-mono text-muted-foreground">
                          {nfts.length.toLocaleString()}
                        </span>
                      )}
                      {selectedIds.size > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/30 text-[10px] font-mono text-primary">
                          {selectedIds.size.toLocaleString()} selected
                        </span>
                      )}
                      {isLoadingMore && (
                        <span className="text-[10px] font-mono text-muted-foreground/50 animate-pulse">
                          loading…
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                      {selectedIds.size > 0
                        ? "Ready to incinerate — confirm below"
                        : "Click cards to select · High Risk auto-selects likely scam NFTs"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={loadNFTs}
                    disabled={isLoading || isLoadingMore}
                    className="w-8 h-8 rounded-lg border border-border/40 bg-secondary/40 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-40"
                    title="Refresh"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${(isLoading || isLoadingMore) ? "animate-spin" : ""}`} />
                  </button>
                  {visibleNfts.length > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAll}
                        className="h-8 px-3 text-[11px] font-bold border-border/40 text-muted-foreground hover:text-foreground hover:border-border"
                      >
                        {selectedIds.size === visibleNfts.length ? "Deselect" : "All"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectHighRisk}
                        className="h-8 px-3 text-[11px] font-bold border-primary/30 text-primary hover:bg-primary/10"
                      >
                        High Risk
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Row 2: search + sort + treasury link */}
              <div className="flex gap-2 items-center">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or collection…"
                    className="w-full h-8 bg-secondary/40 border border-border/40 rounded-lg pl-7 pr-7 text-[12px] placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40 focus:bg-secondary/60 transition-all"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-8 bg-secondary/40 border border-border/40 rounded-lg px-2.5 text-[11px] text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors cursor-pointer appearance-none"
                >
                  <option value="default">Default</option>
                  <option value="name">Name A–Z</option>
                  <option value="floor_desc">Floor ↓</option>
                  <option value="floor_asc">Floor ↑</option>
                  <option value="risk">Risk ↓</option>
                  <option value="scam">Scam score ↓</option>
                </select>

                {/* Treasury link — subtle, always visible */}
                <a
                  href={`https://explorer.solana.com/address/${ADMIN_TREASURY}?cluster=mainnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden md:flex items-center gap-1 text-[9px] font-mono text-muted-foreground/25 hover:text-muted-foreground/60 transition-colors ml-auto"
                  title="View fee treasury on Solana Explorer"
                >
                  <ShieldCheck className="w-2.5 h-2.5" />
                  treasury
                </a>
              </div>
            </div>

            {/* Burn history */}
            <BurnHistory records={burnHistory} />

            <NftGrid
              nfts={visibleNfts}
              selectedIds={selectedIds}
              onToggle={toggle}
              onSelectMany={selectMany}
              isLoading={isLoading}
              isLoadingMore={isLoadingMore}
              floorPrices={floorPrices}
            />
          </div>
        )}
      </main>

      {/* ── BURN BAR ── */}
      {connected && hasSelected && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background/95 backdrop-blur-xl slide-up">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">

            {/* Stats */}
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">Selected</div>
                <div className="text-xl font-black font-mono text-primary leading-none">
                  {selectedIds.size.toLocaleString()}
                </div>
              </div>
              <div className="w-px h-8 bg-border/40" />
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">Fee</div>
                <div className="text-xl font-black font-mono leading-none">
                  {totalFee.toFixed(3)}<span className="text-sm font-normal text-muted-foreground ml-1">SOL</span>
                </div>
              </div>
              <div className="w-px h-8 bg-border/40 hidden sm:block" />
              {/* Burn address reminder */}
              <div className="hidden sm:block">
                <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40">Burn address</div>
                <a
                  href={`https://explorer.solana.com/address/${SOLANA_BURN_ADDRESS}?cluster=mainnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-muted-foreground/40 hover:text-primary/60 transition-colors flex items-center gap-1"
                >
                  {SOLANA_BURN_ADDRESS.slice(0, 8)}…
                  <ExternalLink className="w-2 h-2" />
                </a>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              {/* Buy SOL shortcut */}
              <Button
                variant="outline"
                onClick={() => { setSuggestedSol(totalFee + 0.01); setBuySOLOpen(true); }}
                className="h-10 px-3 border-blue-500/20 text-blue-400/70 hover:bg-blue-950/20 text-[11px] font-bold hidden sm:flex"
                title="Buy SOL via Jupiter"
              >
                <ArrowDown className="w-3.5 h-3.5 mr-1" />
                Buy SOL
              </Button>
              <Button
                variant="outline"
                onClick={() => { setIsPremium(true); setConfirmOpen(true); }}
                className="h-10 px-4 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 text-[11px] font-bold uppercase tracking-wide hidden sm:flex"
              >
                <Crown className="w-3.5 h-3.5 mr-1.5" />
                Premium
              </Button>
              <Button
                onClick={() => { setIsPremium(false); setConfirmOpen(true); }}
                className="h-10 px-6 burn-button text-white text-[12px] font-black uppercase tracking-widest shadow-[0_0_24px_hsl(var(--primary)/0.35)]"
              >
                <Flame className="w-4 h-4 mr-1.5" />
                Burn {selectedIds.size > 1 ? `${selectedIds.size.toLocaleString()} NFTs` : "NFT"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ── */}
      <ReferralModal
        open={referralOpen}
        onOpenChange={setReferralOpen}
      />

      <BurnConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        selectedCount={selectedIds.size}
        totalFee={totalFee}
        isPremium={isPremium}
        isBurning={isBurning}
        burnProgress={burnProgress}
        onConfirm={handleBurn}
        selectedNfts={nfts.filter((n) => selectedIds.has(n.id))}
      />

      <HowToBurnModal
        open={howToOpen}
        onOpenChange={setHowToOpen}
      />

      <BuySOLModal
        open={buySOLOpen}
        onOpenChange={setBuySOLOpen}
        suggestedSol={suggestedSol}
        onSuccess={() => {
          toast({ title: "SOL received", description: "Your balance has been updated. Ready to burn." });
        }}
      />

      {/* ── FOOTER ── */}
      <footer className="border-t border-border/30 bg-background/60 backdrop-blur-sm mt-auto">
        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

            {/* Brand */}
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Flame className="w-3 h-3 text-primary" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest">
                Burn<span className="text-primary">Box</span>
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/30 hidden sm:inline">· Solana NFT Incinerator</span>
            </div>

            {/* Refer & Earn footer link */}
            {connected && (
              <button
                onClick={() => setReferralOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary/20 bg-primary/5 text-[10px] font-bold text-primary/70 hover:text-primary hover:bg-primary/10 hover:border-primary/40 transition-all"
              >
                <Gift className="w-3 h-3" />
                Refer &amp; Earn 20%
              </button>
            )}

            {/* Social icons */}
            <div className="flex items-center gap-1">
              {SOCIALS.map(({ label, href, icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={label}
                  className="w-8 h-8 rounded-lg border border-border/30 bg-secondary/20 flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:border-border/60 hover:bg-secondary/60 transition-all duration-150"
                >
                  {icon}
                </a>
              ))}
              {/* Treasury explorer link */}
              <a
                href={`https://explorer.solana.com/address/${ADMIN_TREASURY}?cluster=mainnet`}
                target="_blank"
                rel="noopener noreferrer"
                title="View fee treasury on Solana Explorer"
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border/30 bg-secondary/20 text-[9px] font-mono text-muted-foreground/40 hover:text-muted-foreground hover:border-border/60 hover:bg-secondary/60 transition-all duration-150 ml-1"
              >
                <ShieldCheck className="w-3 h-3" />
                Treasury
              </a>
            </div>

            {/* Legal */}
            <p className="text-[9px] font-mono text-muted-foreground/25 text-center sm:text-right">
              Burns are permanent &amp; irreversible · Not financial advice
            </p>

          </div>
        </div>
      </footer>
    </div>
  );
}
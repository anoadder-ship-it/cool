/**
 * HowToBurnModal — step-by-step guide + full transparency about how BurnBox works.
 */
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Wallet, MousePointer, KeyRound, Flame, ExternalLink,
  ShieldCheck, Eye, Code2, FileSearch,
} from "lucide-react";
import { SOLANA_BURN_ADDRESS, ADMIN_TREASURY, FEE_PER_BURN_SOL, PREMIUM_FEE_SOL } from "@/lib/configAddress";
import { explorerAddressUrl } from "@/lib/explorer";

interface HowToBurnModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BURN_EXPLORER     = explorerAddressUrl(SOLANA_BURN_ADDRESS);
const TREASURY_EXPLORER = explorerAddressUrl(ADMIN_TREASURY);

const steps = [
  {
    icon: Wallet,
    title: "Connect your wallet",
    desc: "Connect Phantom, Solflare, or any Solana wallet. We only read your NFT list — we never request any permissions beyond signing individual transactions.",
    color: "text-blue-400",
    bg: "bg-blue-950/30 border-blue-500/20",
  },
  {
    icon: MousePointer,
    title: "Select NFTs to burn",
    desc: "Click cards to select. Use 'High Risk' to auto-select likely scam or worthless NFTs based on on-chain signals. You decide what gets burned.",
    color: "text-yellow-400",
    bg: "bg-yellow-950/20 border-yellow-500/20",
  },
  {
    icon: Eye,
    title: "Review the confirmation",
    desc: "Before anything is signed, we show you exactly: which NFTs are burned, the burn address, the fee, and that we use signTransaction (one-by-one).",
    color: "text-purple-400",
    bg: "bg-purple-950/20 border-purple-500/20",
  },
  {
    icon: KeyRound,
    title: "Sign each transaction",
    desc: "Your wallet opens for every NFT. You see the exact instructions: transfer to burn address + close account + fee. You approve or reject each one.",
    color: "text-primary",
    bg: "bg-primary/5 border-primary/20",
  },
  {
    icon: Flame,
    title: "NFT is permanently destroyed",
    desc: "The token is transferred to the official Solana incinerator address. No one can reverse this — not us, not Solana, not anyone. The transaction is on-chain forever.",
    color: "text-primary",
    bg: "bg-primary/5 border-primary/20",
  },
];

const transparencies = [
  {
    icon: Code2,
    title: "signTransaction only",
    desc: "We never call signAllTransactions. Each NFT = one wallet approval. You can reject any individual transaction without affecting the others.",
  },
  {
    icon: ShieldCheck,
    title: "Official burn address",
    desc: `We use the Solana incinerator: ${SOLANA_BURN_ADDRESS.slice(0, 16)}… — a public key with no private key. Verifiable on any Solana explorer.`,
    link: BURN_EXPLORER,
  },
  {
    icon: FileSearch,
    title: "On-chain fee transparency",
    desc: `Every fee payment (${FEE_PER_BURN_SOL} SOL per burn, ${PREMIUM_FEE_SOL} SOL premium) is a standard SOL transfer to our treasury — visible on Explorer. No hidden deductions.`,
    link: TREASURY_EXPLORER,
  },
  {
    icon: Eye,
    title: "No server — fully client-side",
    desc: "BurnBox runs entirely in your browser. We don't operate a server that processes your transactions. Your wallet signs directly to the Solana network via Helius RPC.",
  },
];

export const HowToBurnModal = ({ open, onOpenChange }: HowToBurnModalProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-card border border-border/60 max-w-lg p-0 overflow-hidden max-h-[85vh] overflow-y-auto">

      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border/40 bg-secondary/20">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Flame className="w-4 h-4 text-primary fire-glow" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold uppercase tracking-wider">How BurnBox Works</DialogTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">Full transparency — no surprises</p>
            </div>
          </div>
        </DialogHeader>
      </div>

      <div className="px-5 py-5 space-y-6">

        {/* Steps */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">Step by step</p>
          <div className="space-y-2">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${step.bg}`}>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] font-mono font-bold text-muted-foreground/40 w-3">{i + 1}</span>
                    <Icon className={`w-3.5 h-3.5 ${step.color}`} />
                  </div>
                  <div>
                    <p className={`text-[11px] font-bold ${step.color} mb-0.5`}>{step.title}</p>
                    <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Burn address callout */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60">Official Solana burn address</p>
          <div className="flex items-center gap-2 font-mono text-[11px] text-primary break-all">
            {SOLANA_BURN_ADDRESS}
            <a
              href={BURN_EXPLORER}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-primary/40 hover:text-primary transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
            This address is universally recognised in the Solana ecosystem as the token incinerator.
            No one has ever held the private key — sending tokens here is the standard way to permanently destroy them.
          </p>
        </div>

        {/* Transparency grid */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">Transparency commitments</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {transparencies.map((t, i) => {
              const Icon = t.icon;
              return (
                <div key={i} className="p-3 rounded-lg border border-border/30 bg-secondary/20 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3 h-3 text-primary/60 shrink-0" />
                    <p className="text-[11px] font-bold">{t.title}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{t.desc}</p>
                  {t.link && (
                    <a
                      href={t.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-primary/50 hover:text-primary transition-colors mt-1"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Verify on Explorer
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </DialogContent>
  </Dialog>
);

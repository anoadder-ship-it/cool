/**
 * MobileWalletConnect
 *
 * On Android/iOS, browser extensions don't exist. The ONLY reliable method
 * is a deep-link that opens the site inside the wallet's built-in browser.
 *
 * Supported deep-link formats:
 *  Phantom:  https://phantom.app/ul/browse/<url>?ref=<url>
 *  Solflare: https://solflare.com/ul/v1/browse/<url>?ref=<url>
 *  Backpack: https://backpack.app/ul/browse/<url>?ref=<url>
 */
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Smartphone } from "lucide-react";
import { isMobileDevice } from "@/lib/device";
import { truncateAddress } from "@/lib/format";

/** Returns which wallet browser we're already inside, or null */
const detectWalletBrowser = (): "phantom" | "solflare" | "backpack" | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const solana = w["solana"] as Record<string, unknown> | undefined;
  if (solana?.isPhantom)   return "phantom";
  if (solana?.isSolflare)  return "solflare";
  if (w["backpack"])        return "backpack";
  return null;
};

// ── wallet deep-link configs ───────────────────────────────────────────────
interface WalletOption {
  id:    string;
  name:  string;
  color: string;
  logo:  string;
  deepLink: (url: string) => string;
}

const WALLET_OPTIONS: WalletOption[] = [
  {
    id:    "phantom",
    name:  "Phantom",
    color: "#ab9ff2",
    logo:  "https://phantom.app/img/phantom-logo.png",
    deepLink: (url) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(url)}`,
  },
  {
    id:    "solflare",
    name:  "Solflare",
    color: "#fc8c00",
    logo:  "https://solflare.com/icons/icon-256x256.png",
    deepLink: (url) =>
      `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(url)}`,
  },
  {
    id:    "backpack",
    name:  "Backpack",
    color: "#e33e3e",
    logo:  "https://backpack.app/favicon.ico",
    deepLink: (url) =>
      `https://backpack.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(url)}`,
  },
];

// ── component ─────────────────────────────────────────────────────────────
export function MobileWalletConnect() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [mobile, setMobile]           = useState(false);
  const [inWalletBrowser, setInWalletBrowser] = useState<string | null>(null);
  const [showPicker, setShowPicker]   = useState(false);

  useEffect(() => {
    setMobile(isMobileDevice());
    setInWalletBrowser(detectWalletBrowser());
  }, []);

  const currentUrl =
    typeof window !== "undefined" ? window.location.href : "";

  // ── Already connected ──────────────────────────────────────────────────
  if (connected && publicKey) {
    const short = truncateAddress(publicKey.toString());
    return (
      <button
        onClick={() => disconnect()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 14px",
          borderRadius: "9999px",
          fontSize: "13px",
          fontWeight: 700,
          background: "hsl(var(--primary)/0.12)",
          border: "1px solid hsl(var(--primary)/0.35)",
          color: "hsl(var(--primary))",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        <span
          style={{
            width: 8, height: 8,
            borderRadius: "50%",
            background: "#22c55e",
            display: "inline-block",
          }}
        />
        {short}
      </button>
    );
  }

  // ── Desktop or already inside wallet browser → use normal adapter modal ──
  if (!mobile || inWalletBrowser) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 16px",
          borderRadius: "9999px",
          fontSize: "13px",
          fontWeight: 700,
          background: "hsl(var(--primary))",
          color: "hsl(var(--primary-foreground))",
          border: "none",
          cursor: "pointer",
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        Connect Wallet
      </button>
    );
  }

  // ── Mobile, not inside a wallet browser → show deep-link picker ──────────
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setShowPicker((p) => !p)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 14px",
          borderRadius: "9999px",
          fontSize: "13px",
          fontWeight: 700,
          background: "hsl(var(--primary))",
          color: "hsl(var(--primary-foreground))",
          border: "none",
          cursor: "pointer",
        }}
      >
        <Smartphone size={14} />
        Connect Wallet
      </button>

      {showPicker && (
        <>
          {/* backdrop */}
          <div
            onClick={() => setShowPicker(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 998,
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
            }}
          />

          {/* sheet */}
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 999,
              background: "hsl(var(--card))",
              borderTop: "1px solid hsl(var(--border))",
              borderRadius: "16px 16px 0 0",
              padding: "24px 20px 36px",
            }}
          >
            <div
              style={{
                width: 40, height: 4,
                borderRadius: 2,
                background: "hsl(var(--muted-foreground)/0.3)",
                margin: "0 auto 20px",
              }}
            />

            <p
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "hsl(var(--foreground))",
                textAlign: "center",
                marginBottom: 6,
              }}
            >
              Kies je wallet
            </p>
            <p
              style={{
                fontSize: 12,
                color: "hsl(var(--muted-foreground))",
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              De site opent in de wallet app — verbinding werkt dan automatisch
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {WALLET_OPTIONS.map((w) => (
                <a
                  key={w.id}
                  href={w.deepLink(currentUrl)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: "hsl(var(--muted)/0.5)",
                    border: "1px solid hsl(var(--border))",
                    textDecoration: "none",
                    color: "hsl(var(--foreground))",
                    fontSize: 15,
                    fontWeight: 600,
                    transition: "background 0.15s",
                  }}
                >
                  <img
                    src={w.logo}
                    alt={w.name}
                    width={32}
                    height={32}
                    style={{ borderRadius: 8, objectFit: "contain" }}
                    onError={(e) => {
                      // fallback: colored circle
                      const el = e.currentTarget;
                      el.style.display = "none";
                    }}
                  />
                  <span>Open in {w.name}</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: w.color + "22",
                      color: w.color,
                      fontWeight: 700,
                    }}
                  >
                    Open →
                  </span>
                </a>
              ))}
            </div>

            <p
              style={{
                fontSize: 11,
                color: "hsl(var(--muted-foreground)/0.6)",
                textAlign: "center",
                marginTop: 16,
              }}
            >
              Nog geen wallet? Download{" "}
              <a
                href="https://phantom.app"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#ab9ff2", textDecoration: "underline" }}
              >
                Phantom
              </a>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

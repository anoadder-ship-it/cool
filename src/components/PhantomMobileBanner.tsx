/**
 * PhantomMobileBanner
 *
 * On Android/iOS, Phantom does NOT inject a wallet extension into Chrome.
 * The ONLY reliable way to connect Phantom on mobile is to open the site
 * inside Phantom's built-in browser via its deep-link:
 *
 *   https://phantom.app/ul/browse/<url>?ref=<url>
 *
 * This banner detects mobile + non-Phantom browser and shows a one-tap
 * button that redirects the user into Phantom's in-app browser.
 * Once inside Phantom's browser, wallet.connect() works normally.
 */
import { Smartphone, X } from "lucide-react";
import { useState, useEffect } from "react";
import { isMobileDevice } from "@/lib/device";

const isPhantomBrowser = () =>
  typeof window !== "undefined" &&
  (
    !!(window as unknown as Record<string, unknown>)["phantom"] ||
    !!((window as unknown as Record<string, { isPhantom?: boolean }>)["solana"]?.isPhantom)
  );

export function PhantomMobileBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isMobileDevice() && !isPhantomBrowser() && !dismissed) {
      setShow(true);
    } else {
      setShow(false);
    }
  }, [dismissed]);

  if (!show) return null;

  const currentUrl = typeof window !== "undefined" ? window.location.href : "";
  const phantomDeepLink = `https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(currentUrl)}`;

  return (
    <div
      className="relative z-50 w-full px-4 py-3 flex items-center justify-between gap-3"
      style={{
        background: "linear-gradient(90deg, hsl(var(--primary)/0.15), hsl(var(--primary)/0.08))",
        borderBottom: "1px solid hsl(var(--primary)/0.25)",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: "hsl(var(--primary)/0.2)", border: "1px solid hsl(var(--primary)/0.4)" }}
        >
          <Smartphone className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />
        </div>
        <p className="text-xs leading-tight" style={{ color: "hsl(var(--foreground)/0.85)" }}>
          <span className="font-bold">Open in Phantom</span>
          <span className="text-muted-foreground"> — vereist om je wallet te verbinden op mobiel</span>
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <a
          href={phantomDeepLink}
          className="px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-150"
          style={{
            background: "hsl(var(--primary))",
            color: "hsl(var(--primary-foreground))",
          }}
        >
          Open
        </a>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" style={{ color: "hsl(var(--foreground))" }} />
        </button>
      </div>
    </div>
  );
}

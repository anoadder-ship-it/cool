import { useState, useCallback, useRef } from "react";

/**
 * Copy-to-clipboard hook with auto-resetting "copied" state.
 *
 * @param resetMs  How long the `copied` flag stays true (default 1800 ms).
 * @returns `{ copied, copy }` — `copy(text)` writes to the clipboard and
 *          sets `copied` to `true` for `resetMs` milliseconds.
 */
export function useClipboard(resetMs = 1800) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).catch(() => {});
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), resetMs);
    },
    [resetMs]
  );

  return { copied, copy };
}

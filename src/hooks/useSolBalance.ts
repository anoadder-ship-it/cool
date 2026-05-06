import { useEffect, useState, useCallback, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const POLL_INTERVAL_MS = 20_000; // refresh every 20 s while connected

export const useSolBalance = () => {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!publicKey) { setBalance(null); return; }
    setLoading(true);
    try {
      const lamports = await connection.getBalance(publicKey, "confirmed");
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch {
      // silently ignore — stale value stays shown
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setBalance(null);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    fetch();
    timerRef.current = setInterval(fetch, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [connected, publicKey?.toString(), fetch]); // eslint-disable-line react-hooks/exhaustive-deps

  return { balance, loading, refresh: fetch };
};

import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { BurnBoxSDK } from "@/lib/nftHaterSDK";

export const useNftHater = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  const sdk = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    try {
      const provider = new AnchorProvider(
        connection,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { publicKey, signTransaction, signAllTransactions } as any,
        { commitment: "confirmed", skipPreflight: false }
      );
      return new BurnBoxSDK(provider);
    } catch (err) {
      console.error("[useNftHater] SDK init failed:", err);
      return null;
    }
  }, [connection, publicKey, signTransaction, signAllTransactions]);

  return { sdk };
};

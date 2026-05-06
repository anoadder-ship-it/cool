import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    hmr: { overlay: false },
    watch: { usePolling: true, interval: 500 },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      stream: "stream-browserify",
      crypto: "crypto-browserify",
      buffer: "buffer",
      util: "util",
      // process/browser no longer exported in newer process package — use root
      process: "process",
    },
  },
  define: {
    global: "globalThis",
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
    "process.env": "{}",
    "process.browser": "true",
    "process.version": '""',
    "process.platform": '"browser"',
  },
  build: {
    target: "es2020",
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: {
      output: {
        manualChunks: {
          "solana-core": [
            "@solana/web3.js",
            "@solana/spl-token",
            "@coral-xyz/anchor",
          ],
          "wallet-adapter": [
            "@solana/wallet-adapter-react",
            "@solana/wallet-adapter-react-ui",
            "@solana/wallet-adapter-wallets",
            "@solana/wallet-adapter-base",
          ],
          "firebase": [
            "firebase/app",
            "firebase/firestore",
            "firebase/database",
            "firebase/auth",
          ],
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "framer": ["framer-motion"],
        },
      },
    },
  },
  optimizeDeps: {
    include: ["buffer", "process"],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
});

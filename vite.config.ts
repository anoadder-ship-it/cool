/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
  },
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
        manualChunks: (id) => {
          if (id.includes("@solana/web3.js") || id.includes("@solana/spl-token") || id.includes("@coral-xyz/anchor")) {
            return "solana-core";
          }
          if (id.includes("@solana/wallet-adapter")) {
            return "wallet-adapter";
          }
          if (id.includes("firebase")) {
            return "firebase";
          }
          if (id.includes("react-dom") || id.includes("react-router-dom")) {
            return "react-vendor";
          }
          if (id.includes("framer-motion")) {
            return "framer";
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: ["buffer", "process"],
  },
});

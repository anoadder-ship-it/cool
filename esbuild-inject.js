// Injected into every esbuild bundle before any other module.
// Provides Buffer globally for @solana/web3.js.
import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

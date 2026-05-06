// FIRST import in main.tsx — sets up Buffer before any Solana code runs.
// process is set in index.html (inline script, runs before all modules).
// global is handled by vite define → globalThis.

import { Buffer } from "buffer";
(globalThis as Record<string, unknown>).Buffer = Buffer;

export {};

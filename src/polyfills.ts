import { Buffer } from "buffer";

(globalThis as unknown as Record<string, unknown>).Buffer = Buffer;
if (!(globalThis as unknown as Record<string, unknown>).process) {
  (globalThis as unknown as Record<string, unknown>).process = { env: { NODE_ENV: "production" }, browser: true, version: "", platform: "browser", nextTick: (fn: () => void) => setTimeout(fn, 0) };
}
export {};

import { Buffer } from "buffer";
(globalThis as any).Buffer = Buffer;
if (!(globalThis as any).process) {
  (globalThis as any).process = { env: { NODE_ENV: "production" }, browser: true, version: "", platform: "browser", nextTick: (fn: () => void) => setTimeout(fn, 0) };
}
export {};

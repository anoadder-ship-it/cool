import { describe, it, expect } from "vitest";
import {
  ADMIN_TREASURY,
  SOLANA_BURN_ADDRESS,
  FEE_PER_BURN_SOL,
  PREMIUM_FEE_SOL,
  HELIUS_RPC,
  BURN_ADDRESS_SHORT,
} from "../lib/configAddress";

describe("configAddress constants", () => {
  describe("ADMIN_TREASURY", () => {
    it("is a valid Solana base58 address (32-44 chars)", () => {
      expect(ADMIN_TREASURY).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });

    it("is defined and non-empty", () => {
      expect(ADMIN_TREASURY.length).toBeGreaterThan(0);
    });
  });

  describe("SOLANA_BURN_ADDRESS", () => {
    it("starts with 1nc1nerator", () => {
      expect(SOLANA_BURN_ADDRESS.startsWith("1nc1nerator")).toBe(true);
    });

    it("is the correct well-known incinerator address", () => {
      expect(SOLANA_BURN_ADDRESS).toBe("1nc1nerator11111111111111111111111111111111");
    });
  });

  describe("fee constants", () => {
    it("FEE_PER_BURN_SOL is a positive number", () => {
      expect(FEE_PER_BURN_SOL).toBeGreaterThan(0);
      expect(typeof FEE_PER_BURN_SOL).toBe("number");
    });

    it("FEE_PER_BURN_SOL is 0.005 SOL", () => {
      expect(FEE_PER_BURN_SOL).toBe(0.005);
    });

    it("PREMIUM_FEE_SOL is greater than per-burn fee", () => {
      expect(PREMIUM_FEE_SOL).toBeGreaterThan(FEE_PER_BURN_SOL);
    });

    it("PREMIUM_FEE_SOL is 0.1 SOL", () => {
      expect(PREMIUM_FEE_SOL).toBe(0.1);
    });
  });

  describe("HELIUS_RPC", () => {
    it("is a valid HTTPS URL", () => {
      expect(HELIUS_RPC.startsWith("https://")).toBe(true);
    });

    it("points to helius-rpc.com", () => {
      expect(HELIUS_RPC).toContain("helius-rpc.com");
    });

    it("includes an api-key parameter", () => {
      expect(HELIUS_RPC).toContain("api-key=");
    });
  });

  describe("BURN_ADDRESS_SHORT", () => {
    it("is a shortened display version of the burn address", () => {
      expect(BURN_ADDRESS_SHORT).toContain("1nc1ne");
      expect(BURN_ADDRESS_SHORT).toContain("1111");
    });

    it("contains an ellipsis-like separator", () => {
      expect(BURN_ADDRESS_SHORT).toContain("…");
    });
  });
});

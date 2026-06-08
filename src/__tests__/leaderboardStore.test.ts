import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock firebaseService before importing leaderboardStore
vi.mock("../lib/firebaseService", () => ({
  firestoreRecordBurns: vi.fn().mockResolvedValue(undefined),
}));

import { recordBurns, getTopBurners, getGlobalStats } from "../lib/leaderboardStore";

describe("leaderboardStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("recordBurns", () => {
    it("creates a new entry for a new wallet", () => {
      recordBurns("7xKpABCDEFGH1234567890abcdefgh4mBz", 3, 0.015, ["sig1", "sig2"]);
      const top = getTopBurners(10);
      expect(top).toHaveLength(1);
      expect(top[0].wallet).toBe("7xKpABCDEFGH1234567890abcdefgh4mBz");
      expect(top[0].burned).toBe(3);
      expect(top[0].feeSol).toBe(0.015);
      expect(top[0].signatures).toEqual(["sig1", "sig2"]);
    });

    it("formats walletShort correctly", () => {
      recordBurns("ABCDwallet1234", 1, 0.005, ["sig1"]);
      const top = getTopBurners(10);
      expect(top[0].walletShort).toBe("ABCD…1234");
    });

    it("accumulates burns for the same wallet", () => {
      recordBurns("wallet1", 2, 0.01, ["sig1"]);
      recordBurns("wallet1", 5, 0.025, ["sig2", "sig3"]);
      const top = getTopBurners(10);
      expect(top).toHaveLength(1);
      expect(top[0].burned).toBe(7);
      expect(top[0].feeSol).toBeCloseTo(0.035);
    });

    it("prepends new signatures to existing ones", () => {
      recordBurns("wallet1", 1, 0.005, ["old_sig"]);
      recordBurns("wallet1", 1, 0.005, ["new_sig"]);
      const top = getTopBurners(10);
      expect(top[0].signatures[0]).toBe("new_sig");
      expect(top[0].signatures[1]).toBe("old_sig");
    });

    it("caps signatures at 20", () => {
      const manySigs = Array.from({ length: 25 }, (_, i) => `sig_${i}`);
      recordBurns("wallet1", 25, 0.125, manySigs);
      const top = getTopBurners(10);
      expect(top[0].signatures.length).toBeLessThanOrEqual(20);
    });

    it("ignores empty wallet address", () => {
      recordBurns("", 3, 0.015, ["sig1"]);
      const top = getTopBurners(10);
      expect(top).toHaveLength(0);
    });

    it("ignores zero count", () => {
      recordBurns("wallet1", 0, 0, ["sig1"]);
      const top = getTopBurners(10);
      expect(top).toHaveLength(0);
    });

    it("ignores negative count", () => {
      recordBurns("wallet1", -1, 0, ["sig1"]);
      const top = getTopBurners(10);
      expect(top).toHaveLength(0);
    });

    it("updates lastBurnAt timestamp on subsequent burns", () => {
      recordBurns("wallet1", 1, 0.005, ["sig1"]);
      const first = getTopBurners(10)[0].lastBurnAt;

      // Small delay to ensure different timestamp
      recordBurns("wallet1", 1, 0.005, ["sig2"]);
      const second = getTopBurners(10)[0].lastBurnAt;
      expect(second).toBeGreaterThanOrEqual(first);
    });
  });

  describe("getTopBurners", () => {
    it("returns empty array when no records exist", () => {
      expect(getTopBurners(10)).toEqual([]);
    });

    it("sorts by burned count descending", () => {
      recordBurns("walletA", 2, 0.01, ["sigA"]);
      recordBurns("walletB", 10, 0.05, ["sigB"]);
      recordBurns("walletC", 5, 0.025, ["sigC"]);
      const top = getTopBurners(10);
      expect(top[0].wallet).toBe("walletB");
      expect(top[1].wallet).toBe("walletC");
      expect(top[2].wallet).toBe("walletA");
    });

    it("respects the limit parameter", () => {
      recordBurns("w1", 1, 0.005, ["s1"]);
      recordBurns("w2", 2, 0.01, ["s2"]);
      recordBurns("w3", 3, 0.015, ["s3"]);
      const top = getTopBurners(2);
      expect(top).toHaveLength(2);
      expect(top[0].wallet).toBe("w3");
    });

    it("defaults to limit of 10", () => {
      for (let i = 0; i < 15; i++) {
        recordBurns(`wallet_${i}`, i + 1, 0.005, [`sig_${i}`]);
      }
      const top = getTopBurners();
      expect(top).toHaveLength(10);
    });
  });

  describe("getGlobalStats", () => {
    it("returns zeros when no records exist", () => {
      const stats = getGlobalStats();
      expect(stats.totalBurned).toBe(0);
      expect(stats.totalWallets).toBe(0);
      expect(stats.totalFeeSol).toBe(0);
    });

    it("aggregates across all wallets", () => {
      recordBurns("w1", 3, 0.015, ["s1"]);
      recordBurns("w2", 7, 0.035, ["s2"]);
      const stats = getGlobalStats();
      expect(stats.totalBurned).toBe(10);
      expect(stats.totalWallets).toBe(2);
      expect(stats.totalFeeSol).toBeCloseTo(0.05);
    });

    it("includes accumulated burns in totals", () => {
      recordBurns("w1", 3, 0.015, ["s1"]);
      recordBurns("w1", 2, 0.01, ["s2"]);
      const stats = getGlobalStats();
      expect(stats.totalBurned).toBe(5);
      expect(stats.totalWallets).toBe(1);
    });
  });

  describe("localStorage resilience", () => {
    it("handles corrupted localStorage data gracefully", () => {
      localStorage.setItem("burnbox_records", "not valid json{{{");
      const top = getTopBurners(10);
      expect(top).toEqual([]);
    });

    it("handles localStorage being full", () => {
      // Simulate storage quota by mocking setItem to throw
      const original = localStorage.setItem.bind(localStorage);
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("QuotaExceededError");
      });

      // Should not throw — silently fails
      expect(() => recordBurns("w1", 1, 0.005, ["s1"])).not.toThrow();

      vi.spyOn(Storage.prototype, "setItem").mockImplementation(original);
    });
  });
});

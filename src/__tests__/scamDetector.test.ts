import { describe, it, expect } from "vitest";
import { detectScam, detectScamBatch } from "../lib/scamDetector";

// ── Helper to build a minimal DAS-like asset object ─────────────────────────

function makeAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: "mintAddress123",
    interface: "V1_NFT",
    content: {
      metadata: {
        name: "CoolNFT",
        symbol: "COOL",
        description: "A cool NFT",
      },
      links: { image: "https://arweave.net/abc" },
      files: [{ uri: "https://arweave.net/abc" }],
      json_uri: "https://arweave.net/meta.json",
    },
    ownership: { frozen: false },
    grouping: [{ group_key: "collection", verified: true }],
    token_info: { supply: 1, decimals: 0, price_info: { price_per_token: 1.5 } },
    ...overrides,
  };
}

describe("detectScam", () => {
  describe("clean tokens", () => {
    it("returns clean for a normal verified NFT", () => {
      const result = detectScam(makeAsset());
      expect(result.level).toBe("clean");
      expect(result.score).toBe(0);
      expect(result.reasons).toHaveLength(0);
    });

    it("returns clean for a normal fungible token with metadata", () => {
      const result = detectScam(
        makeAsset({
          interface: "FungibleToken",
          token_info: { supply: 1000000, decimals: 6, price_info: { price_per_token: 2.5 } },
        })
      );
      expect(result.level).toBe("clean");
      expect(result.score).toBeLessThan(45);
    });
  });

  describe("phishing detection (Signal 2)", () => {
    it("flags tokens with 'claim your reward' in name", () => {
      const result = detectScam(
        makeAsset({
          content: {
            metadata: { name: "Claim your reward now!", symbol: "X", description: "" },
            links: { image: "https://img.com/a.png" },
            json_uri: "https://meta.com/m.json",
          },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(35);
      expect(result.reasons.some((r) => r.includes("Suspicious text"))).toBe(true);
    });

    it("flags tokens with 'free SOL' in description", () => {
      const result = detectScam(
        makeAsset({
          content: {
            metadata: { name: "Token", symbol: "T", description: "Get free SOL today" },
            links: { image: "https://img.com/a.png" },
            json_uri: "https://meta.com/m.json",
          },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(35);
    });

    it("adds extra weight for URLs in name", () => {
      const result = detectScam(
        makeAsset({
          content: {
            metadata: { name: "Visit https://scam.xyz", symbol: "X", description: "" },
            links: { image: "https://img.com/a.png" },
            json_uri: "https://meta.com/m.json",
          },
        })
      );
      // 35 (phishing) + 25 (URL in name) = 60
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.reasons.some((r) => r.includes("URL embedded"))).toBe(true);
    });

    it("flags 'airdrop' keyword", () => {
      const result = detectScam(
        makeAsset({
          content: {
            metadata: { name: "Free Airdrop", symbol: "DROP", description: "" },
            links: { image: "https://img.com/a.png" },
            json_uri: "https://meta.com/m.json",
          },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(35);
    });

    it("flags 'congratulations' and 'winner'", () => {
      const result = detectScam(
        makeAsset({
          content: {
            metadata: { name: "Congratulations Winner!", symbol: "W", description: "" },
            links: { image: "https://img.com/a.png" },
            json_uri: "https://meta.com/m.json",
          },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(35);
    });
  });

  describe("suspicious symbol (Signal 3)", () => {
    it("flags absurdly long uppercase-only symbols", () => {
      const result = detectScam(
        makeAsset({
          content: {
            metadata: { name: "Token", symbol: "ABCDEFGHIJKLMNO", description: "Normal desc" },
            links: { image: "https://img.com/a.png" },
            json_uri: "https://meta.com/m.json",
          },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(10);
      expect(result.reasons.some((r) => r.includes("Suspicious token symbol"))).toBe(true);
    });

    it("flags symbols with many digits", () => {
      const result = detectScam(
        makeAsset({
          content: {
            metadata: { name: "Token", symbol: "V12345", description: "Normal desc" },
            links: { image: "https://img.com/a.png" },
            json_uri: "https://meta.com/m.json",
          },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(10);
    });
  });

  describe("suspicious metadata URI (Signal 4)", () => {
    it("flags .ru domain in image URI", () => {
      const result = detectScam(
        makeAsset({
          content: {
            metadata: { name: "Token", symbol: "T", description: "OK" },
            links: { image: "https://evil.ru/img.png" },
            json_uri: "https://arweave.net/meta.json",
          },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(20);
      expect(result.reasons.some((r) => r.includes("suspicious domain"))).toBe(true);
    });

    it("flags bit.ly shortener in json_uri", () => {
      const result = detectScam(
        makeAsset({
          content: {
            metadata: { name: "Token", symbol: "T", description: "OK" },
            links: { image: "https://normal.com/img.png" },
            json_uri: "https://bit.ly/3xAbC",
          },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(20);
    });

    it("flags discord.gg link in metadata URI", () => {
      const result = detectScam(
        makeAsset({
          content: {
            metadata: { name: "Token", symbol: "T", description: "OK" },
            links: { image: "https://discord.gg/invite" },
            json_uri: "https://arweave.net/m.json",
          },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(20);
    });
  });

  describe("fungible with no image/description (Signal 5)", () => {
    it("flags a fungible token with missing image and description", () => {
      const result = detectScam(
        makeAsset({
          interface: "FungibleToken",
          content: {
            metadata: { name: "Spam", symbol: "S", description: "" },
            links: {},
            files: [],
            json_uri: "",
          },
          token_info: { supply: 100, decimals: 6, price_info: { price_per_token: 0.01 } },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(20);
      expect(result.reasons.some((r) => r.includes("no image or description"))).toBe(true);
    });
  });

  describe("zero-value fungible (Signal 6)", () => {
    it("flags $0 fungible with no name", () => {
      const result = detectScam(
        makeAsset({
          interface: "FungibleToken",
          content: {
            metadata: { name: "", symbol: "Z", description: "" },
            links: {},
            files: [],
            json_uri: "",
          },
          token_info: { supply: 100, decimals: 6, price_info: { price_per_token: 0 } },
        })
      );
      // Signal 5 (no image+desc) + Signal 6 (zero-value, no name) = 50
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.level).toBe("suspicious");
    });
  });

  describe("dust spam (Signal 7)", () => {
    it("flags extreme supply with 0 decimals", () => {
      const result = detectScam(
        makeAsset({
          interface: "FungibleToken",
          token_info: { supply: 5_000_000_000, decimals: 0, price_info: { price_per_token: 0 } },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(25);
      expect(result.reasons.some((r) => r.includes("dust spam"))).toBe(true);
    });

    it("flags quadrillion+ supply", () => {
      const result = detectScam(
        makeAsset({
          interface: "FungibleToken",
          token_info: { supply: 2_000_000_000_000_000_000, decimals: 9, price_info: { price_per_token: 0 } },
        })
      );
      expect(result.reasons.some((r) => r.includes("Quadrillion+"))).toBe(true);
    });
  });

  describe("frozen token (Signal 9)", () => {
    it("flags frozen non-fungible token", () => {
      const result = detectScam(
        makeAsset({
          interface: "V1_NFT",
          ownership: { frozen: true },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(20);
      expect(result.reasons.some((r) => r.includes("frozen"))).toBe(true);
    });

    it("does NOT flag frozen fungible tokens", () => {
      const result = detectScam(
        makeAsset({
          interface: "FungibleToken",
          ownership: { frozen: true },
        })
      );
      expect(result.reasons.some((r) => r.includes("frozen"))).toBe(false);
    });
  });

  describe("unverified NFT with no image (Signal 10)", () => {
    it("flags unverified collection with no image", () => {
      const result = detectScam(
        makeAsset({
          interface: "V1_NFT",
          content: {
            metadata: { name: "Suspicious", symbol: "S", description: "desc" },
            links: {},
            files: [],
            json_uri: "https://arweave.net/m.json",
          },
          grouping: [],
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(10);
      expect(result.reasons.some((r) => r.includes("Unverified collection"))).toBe(true);
    });
  });

  describe("score clamping and severity levels", () => {
    it("clamps score to 100 maximum", () => {
      // Stack multiple signals to exceed 100
      const result = detectScam(
        makeAsset({
          interface: "FungibleToken",
          content: {
            metadata: {
              name: "Claim your free airdrop https://scam.xyz",
              symbol: "ABCDEFGHIJKLMNO",
              description: "Visit https://evil.com to claim reward",
            },
            links: { image: "https://evil.ru/img.png" },
            json_uri: "https://bit.ly/scam",
          },
          ownership: { frozen: true },
          token_info: { supply: 5_000_000_000_000_000_000, decimals: 0, price_info: { price_per_token: 0 } },
          grouping: [],
        })
      );
      expect(result.score).toBe(100);
      expect(result.level).toBe("confirmed");
    });

    it("classifies score >= 80 as confirmed", () => {
      const result = detectScam(
        makeAsset({
          content: {
            metadata: {
              name: "https://scam.io claim your reward now",
              symbol: "SCAMSCAMSCAM",
              description: "Visit https://evil.xyz to claim airdrop",
            },
            links: { image: "https://evil.ru/scam.png" },
            json_uri: "https://bit.ly/3abc",
          },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.level).toBe("confirmed");
    });

    it("classifies score 45-79 as suspicious", () => {
      // Phishing text (35) + suspicious URI (20) = 55
      const result = detectScam(
        makeAsset({
          content: {
            metadata: { name: "Free airdrop token", symbol: "OK", description: "" },
            links: { image: "https://evil.ru/img.png" },
            json_uri: "https://arweave.net/m.json",
          },
        })
      );
      expect(result.score).toBeGreaterThanOrEqual(45);
      expect(result.score).toBeLessThan(80);
      expect(result.level).toBe("suspicious");
    });
  });

  describe("edge cases", () => {
    it("handles null/undefined asset gracefully", () => {
      const result = detectScam(null);
      expect(result.level).toBe("clean");
      expect(result.score).toBeLessThan(45);
    });

    it("handles empty object", () => {
      const result = detectScam({});
      expect(result.level).toBe("clean");
    });

    it("handles missing nested properties", () => {
      const result = detectScam({ id: "abc", content: null });
      expect(result.level).toBe("clean");
    });
  });
});

describe("detectScamBatch", () => {
  it("returns a Map keyed by mint address", () => {
    const assets = [
      makeAsset({ id: "mint1" }),
      makeAsset({ id: "mint2" }),
    ];
    const map = detectScamBatch(assets);
    expect(map.size).toBe(2);
    expect(map.has("mint1")).toBe(true);
    expect(map.has("mint2")).toBe(true);
  });

  it("skips assets without an id", () => {
    const assets = [makeAsset({ id: "mint1" }), { content: {} }];
    const map = detectScamBatch(assets);
    expect(map.size).toBe(1);
  });

  it("returns empty map for empty array", () => {
    const map = detectScamBatch([]);
    expect(map.size).toBe(0);
  });

  it("scores each asset independently", () => {
    const clean = makeAsset({ id: "cleanMint" });
    const scammy = makeAsset({
      id: "scamMint",
      content: {
        metadata: { name: "Claim free SOL https://scam.xyz", symbol: "SCAM", description: "airdrop" },
        links: {},
        files: [],
        json_uri: "https://bit.ly/abc",
      },
    });
    const map = detectScamBatch([clean, scammy]);
    expect(map.get("cleanMint")!.level).toBe("clean");
    expect(map.get("scamMint")!.score).toBeGreaterThan(0);
  });
});

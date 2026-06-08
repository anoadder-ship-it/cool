const BASE_URL = "https://corsproxy.io/?https://api-mainnet.magiceden.dev/v2";

// Cache to avoid hammering ME for the same collection repeatedly
const statsCache = new Map<string, { floorSol: number; listedCount: number; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class MagicEdenService {
  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean>): string {
    const url = new URL(`${BASE_URL}${endpoint}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private async fetchJson<T>(url: string): Promise<T | undefined> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        console.warn(`[MagicEden] fetchJson failed: HTTP ${res.status} for ${url}`);
        return undefined;
      }
      return (await res.json()) as T;
    } catch (err) {
      console.warn("[MagicEden] fetchJson error:", err instanceof Error ? err.message : err);
      return undefined;
    }
  }

  /**
   * Get floor price + listed count for a collection symbol.
   * Results are cached for 5 minutes.
   */
  async getCollectionFloor(
    symbol: string
  ): Promise<{ floorSol: number; listedCount: number } | undefined> {
    if (!symbol) return undefined;

    const cached = statsCache.get(symbol);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { floorSol: cached.floorSol, listedCount: cached.listedCount };
    }

    const url = this.buildUrl(`/collections/${encodeURIComponent(symbol)}/stats`);
    const data = await this.fetchJson<{ floorPrice?: number; listedCount?: number }>(url);
    if (!data) return undefined;

    const result = {
      floorSol: data.floorPrice ? data.floorPrice / 1e9 : 0,
      listedCount: data.listedCount ?? 0,
      fetchedAt: Date.now(),
    };
    statsCache.set(symbol, result);
    return result;
  }

  /**
   * Batch-fetch floor prices for multiple collection symbols.
   * Fires up to MAX_CONCURRENT requests in parallel, respecting rate limits.
   */
  async getFloorPriceBatch(
    symbols: string[]
  ): Promise<Map<string, { floorSol: number; listedCount: number }>> {
    const MAX_CONCURRENT = 4;
    const result = new Map<string, { floorSol: number; listedCount: number }>();
    const unique = [...new Set(symbols.filter(Boolean))];

    for (let i = 0; i < unique.length; i += MAX_CONCURRENT) {
      const chunk = unique.slice(i, i + MAX_CONCURRENT);
      const results = await Promise.allSettled(
        chunk.map((sym) => this.getCollectionFloor(sym).then((d) => ({ sym, d })))
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value?.d) {
          result.set(r.value.sym, r.value.d);
        }
      }
      // Brief pause between batches to stay under 2 req/s
      if (i + MAX_CONCURRENT < unique.length) {
        await new Promise((res) => setTimeout(res, 600));
      }
    }

    return result;
  }
}

export const magicEdenService = new MagicEdenService();

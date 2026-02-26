import { arenaClient } from "../client/arenaClient.js";
import type { TradingPair, TradingPairsResponse } from "../types.js";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface Cache {
  pairs: Map<string, TradingPair>;
  fetchedAt: number;
}

let cache: Cache | null = null;

async function fetchTradingPairs(): Promise<Map<string, TradingPair>> {
  const response = await arenaClient().get<TradingPairsResponse>(
    "/agents/perp/trading-pairs"
  );

  const map = new Map<string, TradingPair>();
  for (const pair of response.pairs) {
    map.set(pair.symbol, pair);
  }
  return map;
}

/**
 * Returns all trading pairs, refreshing the cache if stale (>30 min).
 */
export async function getAllPairs(forceRefresh = false): Promise<TradingPair[]> {
  if (forceRefresh || !cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    const pairs = await fetchTradingPairs();
    cache = { pairs, fetchedAt: Date.now() };
  }
  return Array.from(cache.pairs.values());
}

/**
 * Returns a single trading pair by symbol, or throws if not found.
 * Symbol formats: "BTC", "ETH", "xyz:TRUMP"
 */
export async function getPair(symbol: string): Promise<TradingPair> {
  if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    await getAllPairs();
  }

  const pair = cache!.pairs.get(symbol);
  if (!pair) {
    throw new Error(
      `Trading pair not found: "${symbol}". Run 'pairs' to see available markets.`
    );
  }
  return pair;
}

/**
 * Invalidate the local cache so the next call re-fetches.
 */
export function invalidatePairsCache(): void {
  cache = null;
}

import { config } from "../config.js";
import type { HlClearinghouseState, HlOpenOrder } from "../types.js";

interface HlMarketSnapshot {
  coin: string;
  markPx: string;
  midPx?: string;
  [key: string]: unknown;
}

export class HyperliquidClient {
  private readonly infoUrl: string;

  constructor(infoUrl = config.hyperliquidInfoUrl) {
    this.infoUrl = infoUrl;
  }

  private async post<T>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.infoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(
        `Hyperliquid info API error ${response.status}: ${text}`
      );
    }

    return response.json() as Promise<T>;
  }

  async getClearinghouseState(userAddress: string): Promise<HlClearinghouseState> {
    return this.post<HlClearinghouseState>({
      type: "clearinghouseState",
      user: userAddress,
    });
  }

  async getOpenOrders(userAddress: string): Promise<HlOpenOrder[]> {
    return this.post<HlOpenOrder[]>({
      type: "openOrders",
      user: userAddress,
    });
  }

  async getAllMids(): Promise<HlMarketSnapshot[]> {
    const result = await this.post<HlMarketSnapshot[] | Record<string, unknown>>({
      type: "allMids",
    });
    
    // Handle if it returns an object instead of array
    if (Array.isArray(result)) {
      return result;
    }
    
    // Convert object format to array
    // The API returns { "BTC": "95000.0", "ETH": "3500.0", ... }
    const markets = Object.entries(result).map(([coin, priceData]: [string, any]) => {
      // If priceData is a string, use it directly as the price
      if (typeof priceData === "string") {
        return {
          coin,
          midPx: priceData,
          markPx: priceData,
        };
      }
      
      // If it's an object with nested price fields
      return {
        coin,
        markPx: priceData?.markPx ?? priceData?.px ?? "0",
        midPx: priceData?.midPx ?? priceData?.px ?? priceData?.markPx ?? "0",
        ...priceData,
      };
    });
    
    return markets;
  }

  async getMarketPrice(symbol: string): Promise<number> {
    const mids = await this.getAllMids();
    const market = mids.find((m) => m.coin === symbol);
    if (!market) {
      throw new Error(
        `Market price not found for ${symbol}. Available markets: ${mids.map(m => m.coin).slice(0, 10).join(", ")}...`
      );
    }
    const priceStr = market.midPx ?? market.markPx ?? "0";
    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price for ${symbol}: "${priceStr}"`);
    }
    return price;
  }
}

let _hyperliquidClient: HyperliquidClient | undefined;
export function hyperliquidClient(): HyperliquidClient {
  if (!_hyperliquidClient) _hyperliquidClient = new HyperliquidClient();
  return _hyperliquidClient;
}

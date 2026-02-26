import { config } from "../config.js";
import type { HlClearinghouseState, HlOpenOrder } from "../types.js";

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
}

let _hyperliquidClient: HyperliquidClient | undefined;
export function hyperliquidClient(): HyperliquidClient {
  if (!_hyperliquidClient) _hyperliquidClient = new HyperliquidClient();
  return _hyperliquidClient;
}

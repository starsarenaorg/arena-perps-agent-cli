import { arenaClient } from "../client/arenaClient.js";
import type { LeverageType, UpdateLeverageRequest } from "../types.js";

export interface SetLeverageOptions {
  symbol: string;
  leverage: number;
  leverageType?: LeverageType;
}

/**
 * Set leverage for a market before placing the first order.
 * Must be called once per market. Cross leverage is used by default.
 */
export async function setLeverage(options: SetLeverageOptions): Promise<void> {
  const body: UpdateLeverageRequest = {
    provider: "HYPERLIQUID",
    symbol: options.symbol,
    leverage: options.leverage,
    leverageType: options.leverageType ?? "cross",
  };

  await arenaClient().post("/agents/perp/leverage/update", body);
}

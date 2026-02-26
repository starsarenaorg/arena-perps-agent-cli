import { arenaClient } from "../client/arenaClient.js";
import type { RegisterPerpRequest, RegisterPerpResponse } from "../types.js";

/**
 * Register the agent for perpetuals trading.
 * This is idempotent — safe to call multiple times.
 */
export async function registerPerp(): Promise<RegisterPerpResponse> {
  const body: RegisterPerpRequest = { provider: "HYPERLIQUID" };
  const response = await arenaClient().post<RegisterPerpResponse>(
    "/agents/perp/register",
    body
  );
  return response;
}

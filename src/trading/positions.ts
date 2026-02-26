import { hyperliquidClient } from "../client/hyperliquidClient.js";
import { config } from "../config.js";
import type { HlAssetPosition, HlClearinghouseState, HlOpenOrder } from "../types.js";

/**
 * Returns all open positions for the configured main wallet address.
 * Only returns positions with non-zero size.
 */
export async function getPositions(
  walletAddress = config.mainWalletAddress
): Promise<HlAssetPosition[]> {
  if (!walletAddress) {
    throw new Error(
      "MAIN_WALLET_ADDRESS is not set. Add it to your .env file."
    );
  }

  const state: HlClearinghouseState =
    await hyperliquidClient().getClearinghouseState(walletAddress);

  return state.assetPositions.filter(
    (ap) => parseFloat(ap.position.szi) !== 0
  );
}

/**
 * Returns the full clearing house state (account summary + positions).
 */
export async function getClearinghouseState(
  walletAddress = config.mainWalletAddress
): Promise<HlClearinghouseState> {
  if (!walletAddress) {
    throw new Error(
      "MAIN_WALLET_ADDRESS is not set. Add it to your .env file."
    );
  }
  return hyperliquidClient().getClearinghouseState(walletAddress);
}

/**
 * Returns all open orders for the configured main wallet address.
 */
export async function getOpenOrders(
  walletAddress = config.mainWalletAddress
): Promise<HlOpenOrder[]> {
  if (!walletAddress) {
    throw new Error(
      "MAIN_WALLET_ADDRESS is not set. Add it to your .env file."
    );
  }
  return hyperliquidClient().getOpenOrders(walletAddress);
}

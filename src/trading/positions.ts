import { hyperliquidClient } from "../client/hyperliquidClient.js";
import { config } from "../config.js";
import type { HlAssetPosition, HlClearinghouseState, HlOpenOrder } from "../types.js";

// Known DEXes - empty string for main/default DEX
const KNOWN_DEXES = ["", "xyz", "flx", "vntl", "hyna", "km", "abcd", "cash"];

/**
 * Returns all open positions for the configured main wallet address across all DEXs.
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

  // Query all known DEXs and aggregate positions
  const allPositions: HlAssetPosition[] = [];
  
  for (const dex of KNOWN_DEXES) {
    try {
      const state = await hyperliquidClient().getClearinghouseState(
        walletAddress,
        dex === "" ? undefined : dex
      );
      
      const positions = state.assetPositions.filter(
        (ap) => parseFloat(ap.position.szi) !== 0
      );
      
      allPositions.push(...positions);
    } catch (error) {
      // Silently skip DEXs that error (user might not have positions there)
      continue;
    }
  }

  return allPositions;
}

/**
 * Returns the full clearing house state (account summary + positions) for default DEX.
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
 * Returns all open orders for the configured main wallet address across all DEXs.
 */
export async function getOpenOrders(
  walletAddress = config.mainWalletAddress
): Promise<HlOpenOrder[]> {
  if (!walletAddress) {
    throw new Error(
      "MAIN_WALLET_ADDRESS is not set. Add it to your .env file."
    );
  }
  
  // Query all known DEXs and aggregate orders
  const allOrders: HlOpenOrder[] = [];
  
  for (const dex of KNOWN_DEXES) {
    try {
      const orders = await hyperliquidClient().getOpenOrders(
        walletAddress,
        dex === "" ? undefined : dex
      );
      
      allOrders.push(...orders);
    } catch (error) {
      // Silently skip DEXs that error
      continue;
    }
  }
  
  return allOrders;
}

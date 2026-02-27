import { arenaClient } from "../client/arenaClient.js";
import { getPair } from "./marketData.js";
import { roundSize, roundPrice, applySlippage } from "../utils/precision.js";
import type {
  BaseOrderParams,
  OrderDirection,
  LeverageType,
  PlaceOrderRequest,
} from "../types.js";

export interface ScaleOrderOptions {
  symbol: string;
  direction: OrderDirection;
  leverageType?: LeverageType;
  totalSize: number;
  numOrders: number;
  priceStart: number;
  priceEnd: number;
  marginPerOrder: number;
  leverage: number;
}

/**
 * Place scale orders (ladder/grid orders) with multiple limit orders at different price levels.
 * 
 * @example
 * // Scale BUY: 5 orders from $94000 to $90000
 * placeScaleOrders({
 *   symbol: "BTC",
 *   direction: "long",
 *   totalSize: 0.005,         // 0.001 BTC per order
 *   numOrders: 5,
 *   priceStart: 94000,        // First order at $94,000
 *   priceEnd: 90000,          // Last order at $90,000
 *   marginPerOrder: 10,       // $10 margin per order
 *   leverage: 20
 * });
 */
export async function placeScaleOrders(
  options: ScaleOrderOptions
): Promise<unknown> {
  const pair = await getPair(options.symbol);
  const leverageType = options.leverageType ?? "cross";

  // Calculate size per order
  const sizePerOrder = options.totalSize / options.numOrders;
  const roundedSizePerOrder = roundSize(sizePerOrder, pair.sizePrecision);

  // Calculate price step
  const priceStep =
    (options.priceEnd - options.priceStart) / (options.numOrders - 1);

  // Build orders array
  const orders: BaseOrderParams[] = [];

  for (let i = 0; i < options.numOrders; i++) {
    const orderPrice = options.priceStart + priceStep * i;
    const roundedPrice = roundPrice(orderPrice, pair);

    const order: BaseOrderParams = {
      provider: "HYPERLIQUID",
      symbol: options.symbol,
      direction: options.direction,
      orderType: "limit",
      leverageType,
      size: roundedSizePerOrder,
      marginAmount: options.marginPerOrder,
      assetId: String(pair.baseAssetId),
      initialMarginAssetId: "USDC",
      leverage: options.leverage,
      price: roundedPrice,
      limitPrice: roundedPrice,
    };

    orders.push(order);
  }

  const body: PlaceOrderRequest = {
    provider: "HYPERLIQUID",
    orders,
  };

  return arenaClient().post("/agents/perp/orders/place", body);
}

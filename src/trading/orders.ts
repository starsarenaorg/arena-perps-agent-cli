import { arenaClient } from "../client/arenaClient.js";
import { getPair } from "./marketData.js";
import { roundSize, roundPrice, applySlippage } from "../utils/precision.js";
import type {
  BaseOrderParams,
  CancelOrder,
  CancelOrderRequest,
  ClosePositionRequest,
  LeverageType,
  ModifyOrderRequest,
  OrderDirection,
  OrderType,
  PlaceOrderRequest,
  TradingPair,
  AttachedTpSlOrder,
} from "../types.js";

// ─── Public Options Types ─────────────────────────────────────────────────────

export interface PlaceOrderOptions {
  symbol: string;
  direction: OrderDirection;
  orderType: OrderType;
  size: number;
  marginAmount: number;
  leverage: number;
  leverageType?: LeverageType;
  /** Required for limit orders. For market orders, current market price is used for slippage calc. */
  price: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
  hasExistingPosition?: boolean;
}

export interface CancelOrderOptions {
  assetIndex: number;
  oid: number;
}

export interface ModifyOrderOptions {
  oid: number;
  symbol: string;
  direction: OrderDirection;
  orderType: OrderType;
  size: number;
  marginAmount: number;
  leverage: number;
  leverageType?: LeverageType;
  price: number;
}

export interface ClosePositionOptions {
  symbol: string;
  positionSide: OrderDirection;
  size: number;
  currentPrice: number;
  closePercent?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAttachedOrder(
  price: number,
  size: number,
  pair: TradingPair,
  marginAmount: number
): AttachedTpSlOrder {
  return {
    price: roundPrice(price, pair),
    size: roundSize(size, pair.sizePrecision),
    baseAssetId: String(pair.baseAssetId),
    initialMarginAssetId: "USDC",
    initialMargin: marginAmount,
    orderType: "market",
    isFullPosition: true,
  };
}

// ─── Place Order ──────────────────────────────────────────────────────────────

export async function placeOrder(
  options: PlaceOrderOptions
): Promise<unknown> {
  const pair = await getPair(options.symbol);
  const leverageType = options.leverageType ?? "cross";

  const roundedSize = roundSize(options.size, pair.sizePrecision);

  let executionPrice: number;
  if (options.orderType === "market") {
    executionPrice = roundPrice(
      applySlippage(options.price, options.direction),
      pair
    );
  } else {
    executionPrice = roundPrice(options.price, pair);
  }

  const order: BaseOrderParams = {
    provider: "HYPERLIQUID",
    symbol: options.symbol,
    direction: options.direction,
    orderType: options.orderType,
    leverageType,
    size: roundedSize,
    marginAmount: options.marginAmount,
    assetId: String(pair.baseAssetId),
    initialMarginAssetId: "USDC",
    leverage: options.leverage,
    price: executionPrice,
    ...(options.orderType === "limit" && { limitPrice: executionPrice }),
    ...(options.hasExistingPosition && { hasExistingPosition: true }),
  };

  if (options.takeProfitPrice !== undefined) {
    order.takeProfitOrders = [
      buildAttachedOrder(
        options.takeProfitPrice,
        roundedSize,
        pair,
        options.marginAmount
      ),
    ];
  }

  if (options.stopLossPrice !== undefined) {
    order.stopLossOrders = [
      buildAttachedOrder(
        options.stopLossPrice,
        roundedSize,
        pair,
        options.marginAmount
      ),
    ];
  }

  const body: PlaceOrderRequest = {
    provider: "HYPERLIQUID",
    orders: [order],
  };

  return arenaClient().post("/agents/perp/orders/place", body);
}

// ─── Cancel Order ─────────────────────────────────────────────────────────────

export async function cancelOrders(
  cancels: CancelOrderOptions[]
): Promise<unknown> {
  const cancelList: CancelOrder[] = cancels.map((c) => ({
    assetIndex: c.assetIndex,
    oid: c.oid,
  }));

  const body: CancelOrderRequest = {
    provider: "HYPERLIQUID",
    cancels: cancelList,
  };

  return arenaClient().post("/agents/perp/orders/cancel", body);
}

// ─── Modify Order ─────────────────────────────────────────────────────────────

export async function modifyOrder(
  options: ModifyOrderOptions
): Promise<unknown> {
  const pair = await getPair(options.symbol);
  const leverageType = options.leverageType ?? "cross";
  const roundedSize = roundSize(options.size, pair.sizePrecision);
  const roundedPrice = roundPrice(options.price, pair);

  const order: BaseOrderParams = {
    provider: "HYPERLIQUID",
    symbol: options.symbol,
    direction: options.direction,
    orderType: options.orderType,
    leverageType,
    size: roundedSize,
    marginAmount: options.marginAmount,
    assetId: String(pair.baseAssetId),
    initialMarginAssetId: "USDC",
    leverage: options.leverage,
    price: roundedPrice,
    ...(options.orderType === "limit" && { limitPrice: roundedPrice }),
  };

  const body: ModifyOrderRequest = {
    provider: "HYPERLIQUID",
    oid: options.oid,
    order,
  };

  return arenaClient().post("/agents/perp/orders/modify", body);
}

// ─── Close Position ───────────────────────────────────────────────────────────

export async function closePosition(
  options: ClosePositionOptions
): Promise<unknown> {
  const body: ClosePositionRequest = {
    provider: "HYPERLIQUID",
    symbol: options.symbol,
    positionSide: options.positionSide,
    size: options.size,
    currentPrice: options.currentPrice,
    closePercent: options.closePercent ?? 100,
  };

  return arenaClient().post("/agents/perp/orders/close-position", body);
}

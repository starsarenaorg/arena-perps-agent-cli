/**
 * Type definitions for Hyperliquid Copy Trading Bot
 * (from gamma-trade-lab/Hyperliquid-Copy-Trading-Bot)
 */

export type Side = "A" | "B"; // A = Ask (sell), B = Bid (buy)
export type OrderType = "Limit" | "Market";
export type TimeInForce = "Gtc" | "Ioc" | "Alo";

export type PositionSide = "Long" | "Short";
export type TradeAction = "open" | "reduce" | "close";

export interface FillEvent {
  coin: string;
  px: string;
  sz: string;
  side: Side;
  time: number;
  startPosition: string;
  dir: "Open Long" | "Close Long" | "Open Short" | "Close Short";
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
}

export interface Position {
  coin: string;
  szi: string;
  entryPx: string;
  leverage: { value: string };
  liquidationPx: string;
  marginUsed: string;
  returnOnEquity: string;
  unrealizedPnl: string;
}

export interface AccountEquity {
  accountValue: string;
  totalMarginUsed: string;
  totalNtlPos: string;
  totalRawUsd: string;
  crossMaintenanceMarginUsed: string;
  crossMarginSummary: Record<string, unknown>;
}

export interface CopyTradeParams {
  coin: string;
  side: Side;
  size: string;
  orderType: OrderType;
  reduceOnly: boolean;
  leverage: number;
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  error?: string;
  params: CopyTradeParams;
}

export interface HealthCheckResult {
  timestamp: number;
  ourPositions: Position[];
  targetPositions: Position[];
  ourEquity: string;
  targetEquity: string;
  drift: Record<string, { ourSize: string; targetSize: string; difference: string }>;
}

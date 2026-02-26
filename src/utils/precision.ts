import type { TradingPair } from "../types.js";

/**
 * Round size to the pair's szDecimals precision.
 */
export function roundSize(size: number, szDecimals: number): number {
  const factor = Math.pow(10, szDecimals);
  return Math.floor(size * factor) / factor;
}

/**
 * Round price to 5 significant figures, then snap to the pair's tick size.
 * Tick size is derived from pricePrecision (number of decimal places).
 */
export function roundPrice(price: number, pair: TradingPair): number {
  const rounded = toSignificantFigures(price, 5);
  const tickSize = Math.pow(10, -pair.pricePrecision);
  return snapToTick(rounded, tickSize);
}

function toSignificantFigures(value: number, sigFigs: number): number {
  if (value === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = Math.pow(10, sigFigs - 1 - magnitude);
  return Math.round(value * factor) / factor;
}

function snapToTick(value: number, tickSize: number): number {
  return Math.round(value / tickSize) * tickSize;
}

/**
 * Apply market-order slippage to get a guaranteed execution price.
 * Long orders use +slippage, short orders use -slippage.
 */
export function applySlippage(
  price: number,
  direction: "long" | "short",
  slippagePct: number = 0.05
): number {
  const factor = direction === "long" ? 1 + slippagePct : 1 - slippagePct;
  return price * factor;
}

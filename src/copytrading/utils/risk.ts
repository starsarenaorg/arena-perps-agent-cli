import { copyTradingConfig } from "../config.js";
import { logger } from "../logger.js";
import type { CopyTradeParams, FillEvent } from "../types.js";

export function removeTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/, "");
}

export function isAssetBlocked(coin: string): boolean {
  return copyTradingConfig.BLOCKED_ASSETS.includes(coin.toUpperCase());
}

export function meetsMinimumNotional(size: string, price: string): boolean {
  const notional = parseFloat(size) * parseFloat(price);
  return notional >= copyTradingConfig.MIN_NOTIONAL;
}

export function capLeverage(leverage: number): number {
  return Math.min(leverage, copyTradingConfig.MAX_LEVERAGE);
}

export function capPositionSize(calculatedSize: number, ourEquity: number): number {
  const maxSize = (ourEquity * copyTradingConfig.MAX_POSITION_SIZE_PERCENT) / 100;
  return Math.min(calculatedSize, maxSize);
}

export function calculatePositionSize(
  targetSize: number,
  ourEquity: number,
  targetEquity: number
): number {
  if (targetEquity === 0) {
    logger.warn("Target equity is zero, using target size directly");
    return targetSize * copyTradingConfig.SIZE_MULTIPLIER;
  }
  const ratio = ourEquity / targetEquity;
  const calculatedSize = ratio * targetSize * copyTradingConfig.SIZE_MULTIPLIER;
  return capPositionSize(calculatedSize, ourEquity);
}

export function getTradeAction(fill: FillEvent): "open" | "reduce" | "close" {
  if (fill.dir === "Open Long" || fill.dir === "Open Short") return "open";
  if (fill.dir === "Close Long" || fill.dir === "Close Short") {
    const startPos = parseFloat(fill.startPosition);
    const fillSize = parseFloat(fill.sz);
    if (Math.abs(startPos) <= fillSize) return "close";
  }
  return "reduce";
}

export function validateTradeParams(
  params: CopyTradeParams,
  price: string,
  ourEquity: number
): { valid: boolean; reason?: string } {
  if (isAssetBlocked(params.coin)) {
    return { valid: false, reason: `Asset ${params.coin} is blocked` };
  }
  if (!meetsMinimumNotional(params.size, price)) {
    return {
      valid: false,
      reason: `Position size ${params.size} * ${price} < ${copyTradingConfig.MIN_NOTIONAL} minimum`,
    };
  }
  if (params.leverage > copyTradingConfig.MAX_LEVERAGE) {
    return {
      valid: false,
      reason: `Leverage ${params.leverage} exceeds max ${copyTradingConfig.MAX_LEVERAGE}`,
    };
  }
  const positionValue = parseFloat(params.size) * parseFloat(price);
  const maxAllowed = (ourEquity * copyTradingConfig.MAX_POSITION_SIZE_PERCENT) / 100;
  if (positionValue > maxAllowed) {
    return {
      valid: false,
      reason: `Position value ${positionValue} exceeds ${maxAllowed} max`,
    };
  }
  return { valid: true };
}

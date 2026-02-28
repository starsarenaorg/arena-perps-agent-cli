/**
 * Arena feed poster - replaces Telegram for high-quality trade notifications.
 * Only posts position opens and closes with PnL. Rate-limited to 10/hour.
 */

import { arenaClient } from "../../client/arenaClient.js";
import { copyTradingConfig } from "../config.js";
import { logger } from "../logger.js";
import type { CopyTradeParams, FillEvent, TradeResult } from "../types.js";

const MIN_GAP_MS = 6 * 60 * 1000; // 6 min between posts (~10/hour)
const MAX_QUEUE = 5;
let lastPostTime = 0;
const queue: Array<() => Promise<void>> = [];
let processing = false;

async function processQueue(): Promise<void> {
  if (processing || queue.length === 0) return;
  processing = true;
  while (queue.length > 0) {
    const gap = Date.now() - lastPostTime;
    if (gap < MIN_GAP_MS) {
      await new Promise((r) => setTimeout(r, MIN_GAP_MS - gap));
    }
    const fn = queue.shift()!;
    try {
      await fn();
      lastPostTime = Date.now();
    } catch (err) {
      logger.error("Arena feed post failed", { error: String(err) });
    }
  }
  processing = false;
}

function post(content: string): void {
  if (copyTradingConfig.DRY_RUN) {
    logger.info("📝 [DRY RUN] Would post to Arena feed:", { content });
    return;
  }
  if (!copyTradingConfig.ARENA_FEED_ENABLED) return;
  if (queue.length >= MAX_QUEUE) {
    queue.shift();
  }
  queue.push(async () => {
    await arenaClient().post("/agents/threads", {
      content: content.replace(/\n/g, "<br>"),
      files: [],
      privacyType: 0,
    });
  });
  processQueue();
}

export async function initTelegramBot(): Promise<void> {
  // No-op, Arena feed uses existing API key
}

export async function sendTradeNotification(
  fill: FillEvent,
  params: CopyTradeParams,
  result: TradeResult
): Promise<void> {
  if (!result.success) return;
  const action = params.reduceOnly ? "close" : "open";
  const sideText = params.side === "B" ? "Long" : "Short";
  const price = parseFloat(fill.px);
  const size = params.size;
  const notional = price * parseFloat(size);
  const orderType = params.orderType === "Market" ? "Market" : "Limit";

  if (action === "open") {
    post(
      `🟢 Opened ${sideText}<br>` +
      `${fill.coin} • ${size} @ $${price.toFixed(4)}<br>` +
      `Notional: $${notional.toFixed(2)} • ${params.leverage}x leverage<br>` +
      `Type: ${orderType}`
    );
  } else {
    const pnl = fill.closedPnl ? parseFloat(fill.closedPnl) : 0;
    const pnlSign = pnl >= 0 ? "+" : "";
    const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
    post(
      `${pnlEmoji} Closed ${sideText}<br>` +
      `${fill.coin} • ${size} @ $${price.toFixed(4)}<br>` +
      `Notional: $${notional.toFixed(2)}<br>` +
      `PnL: ${pnlSign}$${pnl.toFixed(2)}`
    );
  }
}

export async function sendErrorNotification(
  error: string | Error,
  context?: Record<string, unknown>
): Promise<void> {
  const msg = error instanceof Error ? error.message : String(error);
  logger.error("Copy trading error", { error: msg, ...context });
  // Optional: post critical errors to feed (rate-limited, so use sparingly)
  // post(`Error: ${msg}`);
}

export async function sendStartupNotification(): Promise<void> {
  // Skip startup post - high quality events only (opens/closes)
}

export async function sendShutdownNotification(): Promise<void> {
  // Skip shutdown post - high quality events only
}

export async function sendHealthCheckNotification(_healthCheck: unknown): Promise<void> {
  // Skip health check posts - high quality events only
}

export async function sendSummaryNotification(_stats: unknown): Promise<void> {
  // Skip summary posts
}

export async function sendWarningNotification(
  warning: string,
  context?: Record<string, unknown>
): Promise<void> {
  logger.warn(warning, context);
}

export async function sendInfoNotification(
  info: string,
  context?: Record<string, unknown>
): Promise<void> {
  logger.info(info, context);
}

export async function cleanupTelegramBot(): Promise<void> {
  await sendShutdownNotification();
}

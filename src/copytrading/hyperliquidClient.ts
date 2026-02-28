/**
 * Hyperliquid client from gamma-trade-lab with Arena API execution adapter.
 * Uses their WebSocket/REST logic, swaps placeOrder to use Arena API.
 */

import { config } from "../config.js";
import { hyperliquidClient } from "../client/hyperliquidClient.js";
import { placeOrder, closePosition } from "../trading/orders.js";
import { setLeverage } from "../trading/leverage.js";
import { copyTradingConfig } from "./config.js";
import { logger, loggerUtils } from "./logger.js";
import { getTradeAction } from "./utils/risk.js";
import {
  TradingError,
  SDKError,
  NetworkError,
  WebSocketError,
  ErrorHandler,
  retryWithBackoff,
} from "./utils/errors.js";
import type { AccountEquity, Position, FillEvent } from "./types.js";

const WS_URL = "wss://api.hyperliquid.xyz/ws";

export class HyperliquidClientWrapper {
  private readonly ourAddress: string;
  private readonly ignoredCoins = new Set<string>();
  private ws: WebSocket | null = null;
  private isConnected = false;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.ourAddress = config.mainWalletAddress ?? "";
    if (!this.ourAddress) throw new Error("MAIN_WALLET_ADDRESS is required");
  }

  async initialize(): Promise<void> {
    const target = copyTradingConfig.TARGET_WALLET;
    const state = await hyperliquidClient().getClearinghouseState(target);
    const positions = (state.assetPositions ?? []).filter(
      (ap: { position?: { szi: string } }) =>
        ap.position && parseFloat(ap.position.szi) !== 0
    );
    for (const ap of positions) {
      const coin = (ap as { position?: { coin?: string } }).position?.coin;
      if (coin) this.ignoredCoins.add(coin);
    }
    logger.info("Ignored pre-existing coins", { coins: [...this.ignoredCoins] });
  }

  getAddress(): string {
    return this.ourAddress;
  }

  async getAccountEquity(address: string): Promise<AccountEquity> {
    try {
      const state = await hyperliquidClient().getClearinghouseState(address);
      const ms = state.marginSummary ?? {};
      return {
        accountValue: ms.accountValue ?? "0",
        totalMarginUsed: ms.totalMarginUsed ?? "0",
        totalNtlPos: ms.totalNtlPos ?? "0",
        totalRawUsd: ms.totalRawUsd ?? "0",
        crossMaintenanceMarginUsed: ms.crossMaintenanceMarginUsed ?? "0",
        crossMarginSummary: (ms.crossMarginSummary as Record<string, unknown>) ?? {},
      };
    } catch (error) {
      const formattedError = ErrorHandler.formatError(error);
      logger.error("Failed to get account equity", { address, ...formattedError });
      if (error instanceof SDKError) throw error;
      throw new NetworkError("Failed to fetch account equity", {
        address,
        originalError: formattedError.message,
      });
    }
  }

  async getPositions(address: string): Promise<Position[]> {
    try {
      const state = await hyperliquidClient().getClearinghouseState(address);
      const positions: Position[] = [];
      for (const ap of state.assetPositions ?? []) {
        const p = (ap as { position?: Record<string, unknown> }).position;
        if (!p || parseFloat(String(p.szi)) === 0) continue;
        const lev = p.leverage as { value?: number | string } | undefined;
        positions.push({
          coin: String(p.coin),
          szi: String(p.szi),
          entryPx: String(p.entryPx ?? "0"),
          leverage: { value: String(lev?.value ?? "1") },
          liquidationPx: String(p.liquidationPx ?? "0"),
          marginUsed: String(p.marginUsed ?? "0"),
          returnOnEquity: String(p.returnOnEquity ?? "0"),
          unrealizedPnl: String(p.unrealizedPnl ?? "0"),
        });
      }
      return positions;
    } catch (error) {
      const formattedError = ErrorHandler.formatError(error);
      logger.error("Failed to get positions", { address, ...formattedError });
      if (error instanceof SDKError) throw error;
      throw new NetworkError("Failed to fetch positions", {
        address,
        originalError: formattedError.message,
      });
    }
  }

  async placeOrder(params: {
    coin: string;
    side: "A" | "B";
    sz: string;
    orderType: "Limit" | "Market";
    reduceOnly: boolean;
    leverage: number;
  }): Promise<string> {
    try {
      if (copyTradingConfig.DRY_RUN) {
        loggerUtils.logTrade("warn", "DRY RUN: Order not placed", params);
        return "dry-run-order-id";
      }

      const symbol = params.coin;
      const size = parseFloat(params.sz);
      const direction = params.side === "B" ? "long" : "short";
      const price = await hyperliquidClient().getMarketPrice(symbol);

      if (params.leverage > 1) {
        try {
          await setLeverage({ symbol, leverage: params.leverage });
        } catch (err) {
          logger.warn("Failed to set leverage, continuing", { error: String(err), symbol });
        }
      }

      const startTime = Date.now();
      loggerUtils.logTrade("info", "Placing order", params);

      if (params.reduceOnly) {
        const positionSide = direction === "long" ? "long" : "short";
        const res = await closePosition({
          symbol,
          positionSide,
          size,
          currentPrice: price,
          closePercent: 100,
        });
        const oid = this.extractOrderId(res);
        const duration = Date.now() - startTime;
        loggerUtils.logTrade("info", "Close order placed successfully", {
          orderId: oid,
          params,
          duration: `${duration}ms`,
        });
        loggerUtils.logPerformance("placeOrder", duration, { coin: params.coin });
        return String(oid ?? "close-ok");
      }

      const notional = size * price;
      const marginAmount = notional / params.leverage;
      const res = await placeOrder({
        symbol,
        direction,
        orderType: "market",
        size,
        marginAmount,
        leverage: params.leverage,
        price,
      });
      const oid = this.extractOrderId(res);
      if (!oid) throw new TradingError("Order placed but no order ID returned", true, { params });

      const duration = Date.now() - startTime;
      loggerUtils.logTrade("info", "Order placed successfully", {
        orderId: oid,
        params,
        duration: `${duration}ms`,
      });
      loggerUtils.logPerformance("placeOrder", duration, { coin: params.coin });

      return String(oid);
    } catch (error) {
      const formattedError = ErrorHandler.formatError(error);
      logger.error("Failed to place order", { params, ...formattedError });
      if (error instanceof TradingError || error instanceof SDKError) throw error;
      throw new TradingError("Failed to place order", true, {
        params,
        originalError: formattedError.message,
      });
    }
  }

  private extractOrderId(res: unknown): number | undefined {
    const r = res as { response?: { data?: { statuses?: Array<{ filled?: { oid?: number } }> } } };
    const filled = r?.response?.data?.statuses?.[0]?.filled;
    return filled?.oid;
  }

  async subscribeToUserFills(
    address: string,
    onFill: (fill: FillEvent) => void
  ): Promise<() => void> {
    try {
      const { default: WebSocket } = await import("ws");
      this.ws = new WebSocket(WS_URL);

      this.ws.on("open", () => {
        loggerUtils.logWebSocket("open", "WebSocket connected", { address, url: WS_URL });
        this.isConnected = true;

        try {
          this.ws?.send(
            JSON.stringify({
              method: "subscribe",
              subscription: { type: "userFills", user: address },
            })
          );
        } catch (error) {
          logger.error("Failed to send WebSocket subscription", {
            error: ErrorHandler.formatError(error),
            address,
          });
        }

        // Start ping interval to prevent 60s idle timeout
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === 1) { // 1 = WebSocket.OPEN
            try {
              this.ws.send(JSON.stringify({ method: "ping" }));
              logger.debug("WebSocket ping sent");
            } catch (error) {
              logger.error("Failed to send WebSocket ping", {
                error: ErrorHandler.formatError(error),
              });
            }
          }
        }, 50000); // 50 seconds
      });

      this.ws.on("message", (data: string | { toString(): string }) => {
        try {
          const messageStr = typeof data === "string" ? data : data.toString();
          const message = JSON.parse(messageStr);

          // Handle pong responses
          if (message.channel === "pong") {
            logger.debug("WebSocket pong received");
            return;
          }

          if (message.channel === "userFills" && message.data) {
            if (message.data.isSnapshot === true) {
              logger.debug("Skipping snapshot fills (historical data)");
              return;
            }
            const fills = message.data.fills ?? [];
            if (Array.isArray(fills)) {
              fills.forEach((raw: Record<string, unknown>) => {
                const fill = this.normalizeFill(raw);
                const action = getTradeAction(fill);
                if (this.ignoredCoins.has(fill.coin)) {
                  if (action === "close") this.ignoredCoins.delete(fill.coin);
                  return;
                }
                try {
                  onFill(fill);
                } catch (error) {
                  logger.error("Error in fill callback", {
                    error: ErrorHandler.formatError(error),
                    fill,
                  });
                }
              });
            }
          }
        } catch (error) {
          logger.error("Failed to parse WebSocket message", {
            error: ErrorHandler.formatError(error),
            data: typeof data === "string" ? data.substring(0, 200) : "Buffer",
          });
        }
      });

      this.ws.on("error", (error: Error) => {
        const formattedError = ErrorHandler.formatError(error);
        logger.error("WebSocket error", { ...formattedError, address, url: WS_URL });
        this.isConnected = false;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
      });

      this.ws.on("close", (code: number, reason?: { toString(): string } | string) => {
        logger.warn("WebSocket closed", {
          code,
          reason: reason ? (typeof reason === "string" ? reason : reason.toString()) : "Unknown",
          address,
        });
        this.isConnected = false;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        this.reconnect(address, onFill);
      });

      return () => {
        try {
          if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
          }
          if (this.ws) {
            this.ws.close();
            this.isConnected = false;
            loggerUtils.logWebSocket("close", "WebSocket unsubscribed", { address });
          }
        } catch (error) {
          logger.error("Error unsubscribing WebSocket", {
            error: ErrorHandler.formatError(error),
            address,
          });
        }
      };
    } catch (error) {
      const formattedError = ErrorHandler.formatError(error);
      logger.error("Failed to subscribe to user fills", { address, ...formattedError });
      if (error instanceof WebSocketError) throw error;
      throw new WebSocketError("Failed to subscribe to user fills", {
        address,
        originalError: formattedError.message,
      });
    }
  }

  private reconnect(address: string, onFill: (fill: FillEvent) => void, attempt = 1): void {
    const maxAttempts = 10;
    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);

    if (attempt > maxAttempts) {
      const error = new WebSocketError("Max reconnection attempts reached", {
        address,
        attempts: maxAttempts,
      });
      logger.error("Max reconnection attempts reached", ErrorHandler.formatError(error));
      return;
    }

    setTimeout(async () => {
      logger.info(`Reconnection attempt ${attempt}/${maxAttempts}`, { address });
      try {
        await this.subscribeToUserFills(address, onFill);
      } catch (error) {
        const formattedError = ErrorHandler.formatError(error);
        logger.error("Reconnection failed", { attempt, ...formattedError, address });
        this.reconnect(address, onFill, attempt + 1);
      }
    }, delay);
  }

  private normalizeFill(raw: Record<string, unknown>): FillEvent {
    return {
      coin: String(raw.coin ?? ""),
      px: String(raw.px ?? "0"),
      sz: String(raw.sz ?? "0"),
      side: (raw.side === "B" ? "B" : "A") as "A" | "B",
      time: Number(raw.time ?? 0),
      startPosition: String(raw.startPosition ?? "0"),
      dir: String(raw.dir ?? "Open Long") as FillEvent["dir"],
      closedPnl: String(raw.closedPnl ?? "0"),
      hash: String(raw.hash ?? ""),
      oid: Number(raw.oid ?? 0),
      crossed: Boolean(raw.crossed),
      fee: String(raw.fee ?? "0"),
    };
  }

  isWsConnected(): boolean {
    return this.isConnected;
  }
}

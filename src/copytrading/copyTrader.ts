import { copyTradingConfig } from "./config.js";
import { logger, loggerUtils } from "./logger.js";
import { HyperliquidClientWrapper } from "./hyperliquidClient.js";
import {
  calculatePositionSize,
  capLeverage,
  getTradeAction,
  removeTrailingZeros,
  validateTradeParams,
} from "./utils/risk.js";
import {
  TradingError,
  ValidationError,
  ErrorHandler,
  retryWithBackoff,
} from "./utils/errors.js";
import { sendErrorNotification } from "./notifications/arenaFeed.js";
import type {
  CopyTradeParams,
  FillEvent,
  Position,
  TradeResult,
} from "./types.js";

export class CopyTrader {
  private client: HyperliquidClientWrapper;
  private targetWallet: string;
  private ourAddress: string;
  private activeTrades: Set<string> = new Set();
  private unsubscribeFn?: () => void;

  constructor(client: HyperliquidClientWrapper, targetWallet: string) {
    this.client = client;
    this.targetWallet = targetWallet;
    this.ourAddress = client.getAddress();
  }

  async start(): Promise<void> {
    logger.info("Starting copy trader", {
      ourAddress: this.ourAddress,
      targetWallet: this.targetWallet,
      dryRun: copyTradingConfig.DRY_RUN,
    });

    this.unsubscribeFn = await this.client.subscribeToUserFills(
      this.targetWallet,
      (fill: FillEvent) => this.handleFill(fill)
    );

    logger.info("Copy trader started, monitoring fills...");
  }

  stop(): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = undefined;
    }
    logger.info("Copy trader stopped");
  }

  private async handleFill(fill: FillEvent): Promise<void> {
    try {
      logger.info("Received fill event", {
        coin: fill.coin,
        side: fill.side,
        size: fill.sz,
        price: fill.px,
        direction: fill.dir,
        hash: fill.hash,
      });

      const action = getTradeAction(fill);
      logger.info("Trade action determined", { action, fill });

      let ourEquityData: { accountValue: string };
      let targetEquityData: { accountValue: string };
      try {
        [ourEquityData, targetEquityData] = await retryWithBackoff(
          async () => {
            return await Promise.all([
              this.client.getAccountEquity(this.ourAddress),
              this.client.getAccountEquity(this.targetWallet),
            ]);
          },
          { maxRetries: 3, initialDelay: 1000, maxDelay: 10000, backoffMultiplier: 2 },
          (error, attempt) => {
            logger.warn(`Failed to fetch account equity (attempt ${attempt}/3)`, { error });
          }
        );
      } catch (error) {
        const formattedError = ErrorHandler.formatError(error);
        logger.error("Failed to fetch account equity after retries", formattedError);
        await sendErrorNotification(
          ErrorHandler.wrapError(error as Error, "Failed to fetch account equity"),
          { fillHash: fill.hash, coin: fill.coin }
        );
        return;
      }

      const ourEquity = parseFloat(ourEquityData.accountValue);
      const targetEquity = parseFloat(targetEquityData.accountValue);

      if (isNaN(ourEquity) || isNaN(targetEquity)) {
        throw new ValidationError("Invalid equity values", {
          ourEquity: ourEquityData.accountValue,
          targetEquity: targetEquityData.accountValue,
        });
      }

      logger.info("Account equities", { ourEquity, targetEquity });

      let targetPositions: Position[];
      try {
        [, targetPositions] = await retryWithBackoff(
          async () => {
            return await Promise.all([
              this.client.getPositions(this.ourAddress),
              this.client.getPositions(this.targetWallet),
            ]);
          },
          { maxRetries: 3, initialDelay: 1000, maxDelay: 10000, backoffMultiplier: 2 }
        );
      } catch (error) {
        const formattedError = ErrorHandler.formatError(error);
        logger.error("Failed to fetch positions after retries", formattedError);
        await sendErrorNotification(
          ErrorHandler.wrapError(error as Error, "Failed to fetch positions"),
          { fillHash: fill.hash, coin: fill.coin }
        );
        return;
      }

      const targetPosition = targetPositions.find((p) => p.coin === fill.coin);

      let tradeParams: CopyTradeParams | null;
      try {
        tradeParams = await this.calculateTradeParams(
          fill,
          action,
          ourEquity,
          targetEquity,
          targetPosition
        );
      } catch (error) {
        const formattedError = ErrorHandler.formatError(error);
        logger.error("Failed to calculate trade parameters", formattedError);
        await sendErrorNotification(
          ErrorHandler.wrapError(error as Error, "Failed to calculate trade parameters"),
          { fillHash: fill.hash, coin: fill.coin }
        );
        return;
      }

      if (!tradeParams) {
        logger.warn("Trade parameters calculation returned null, skipping", {
          coin: fill.coin,
          action,
        });
        return;
      }

      const result = await this.executeTrade(tradeParams, fill.px, ourEquity);

      if (result.success) {
        loggerUtils.logTrade("info", "Trade executed successfully", {
          orderId: result.orderId,
          params: tradeParams,
          fillHash: fill.hash,
          coin: fill.coin,
          action,
        });

        if (action === "open") {
          this.activeTrades.add(fill.coin);
        } else if (action === "close") {
          this.activeTrades.delete(fill.coin);
        }

        await this.sendNotification(fill, tradeParams, result);
      } else {
        loggerUtils.logTrade("error", "Trade execution failed", {
          error: result.error,
          params: tradeParams,
          fillHash: fill.hash,
          coin: fill.coin,
        });
        await sendErrorNotification(
          new TradingError(result.error || "Trade execution failed", false, {
            tradeParams,
            fillHash: fill.hash,
          }),
          {}
        );
      }
    } catch (error) {
      const formattedError = ErrorHandler.formatError(error);
      logger.error("Error handling fill", { fill, ...formattedError });

      if (error instanceof TradingError || error instanceof ValidationError) {
        await sendErrorNotification(
          ErrorHandler.wrapError(error, "Error handling fill"),
          { fillHash: fill.hash, coin: fill.coin }
        );
      }
    }
  }

  private async calculateTradeParams(
    fill: FillEvent,
    action: "open" | "reduce" | "close",
    ourEquity: number,
    targetEquity: number,
    targetPosition: Position | undefined
  ): Promise<CopyTradeParams | null> {
    const coin = fill.coin;
    const fillSize = parseFloat(fill.sz);

    let side: "A" | "B";
    let reduceOnly = false;

    if (action === "open") {
      side = fill.dir === "Open Long" ? "B" : "A";
    } else {
      if (targetPosition) {
        const isLong = parseFloat(targetPosition.szi) > 0;
        side = isLong ? "A" : "B";
      } else {
        side = fill.side;
      }
      reduceOnly = true;
    }

    const targetSize = fillSize;
    const calculatedSize = calculatePositionSize(targetSize, ourEquity, targetEquity);

    let leverage = 1;
    if (targetPosition?.leverage) {
      leverage = parseInt(targetPosition.leverage.value, 10);
      leverage = capLeverage(leverage);
    }

    if (
      action === "open" &&
      this.activeTrades.size >= copyTradingConfig.MAX_CONCURRENT_TRADES
    ) {
      logger.warn("Max concurrent trades reached, skipping", {
        activeTrades: this.activeTrades.size,
        max: copyTradingConfig.MAX_CONCURRENT_TRADES,
        coin: fill.coin,
      });
      return null;
    }

    if (calculatedSize <= 0 || isNaN(calculatedSize) || !isFinite(calculatedSize)) {
      logger.error("Invalid calculated position size", {
        calculatedSize,
        targetSize,
        ourEquity,
        targetEquity,
        coin: fill.coin,
      });
      return null;
    }

    const sizeStr = removeTrailingZeros(calculatedSize.toFixed(8));

    return {
      coin,
      side,
      size: sizeStr,
      orderType: "Market",
      reduceOnly,
      leverage,
    };
  }

  private async executeTrade(
    params: CopyTradeParams,
    price: string,
    ourEquity: number
  ): Promise<TradeResult> {
    const validation = validateTradeParams(params, price, ourEquity);
    if (!validation.valid) {
      const error = new ValidationError(validation.reason || "Invalid trade parameters", {
        params,
        price,
        ourEquity,
      });
      logger.warn("Trade validation failed", ErrorHandler.formatError(error));
      return {
        success: false,
        error: error.message,
        params,
      };
    }

    try {
      const orderId = await retryWithBackoff(
        async () => {
          return await this.client.placeOrder({
            coin: params.coin,
            side: params.side,
            sz: params.size,
            orderType: params.orderType,
            reduceOnly: params.reduceOnly,
            leverage: params.leverage,
          });
        },
        {
          maxRetries: 3,
          initialDelay: 1000,
          maxDelay: 10000,
          backoffMultiplier: 2,
        },
        (error, attempt) => {
          logger.warn(`Trade execution attempt ${attempt}/3 failed`, {
            error: ErrorHandler.formatError(error),
            params,
          });
        }
      );

      return {
        success: true,
        orderId,
        params,
      };
    } catch (error) {
      const formattedError = ErrorHandler.formatError(error);
      logger.error("Trade execution failed after retries", { ...formattedError });

      return {
        success: false,
        error: formattedError.message,
        params,
      };
    }
  }

  private async sendNotification(
    fill: FillEvent,
    params: CopyTradeParams,
    result: TradeResult
  ): Promise<void> {
    if (copyTradingConfig.ARENA_FEED_ENABLED || copyTradingConfig.DRY_RUN) {
      const { sendTradeNotification } = await import("./notifications/arenaFeed.js");
      await sendTradeNotification(fill, params, result);
    }
  }

  getActiveTradesCount(): number {
    return this.activeTrades.size;
  }
}

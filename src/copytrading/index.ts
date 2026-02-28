#!/usr/bin/env node

/**
 * Arena Copy Trading Bot
 * Monitors target Hyperliquid wallet and mirrors trades via Arena API.
 * Posts position opens/closes to Arena feed.
 */

import { copyTradingConfig } from "./config.js";
import { logger } from "./logger.js";
import { HyperliquidClientWrapper } from "./hyperliquidClient.js";
import { CopyTrader } from "./copyTrader.js";
import {
  initTelegramBot,
  cleanupTelegramBot,
  sendErrorNotification,
  sendStartupNotification,
} from "./notifications/arenaFeed.js";
import { ErrorHandler } from "./utils/errors.js";

async function main(): Promise<void> {
  try {
    logger.info("=".repeat(60));
    logger.info("Arena Copy Trading Bot Starting...");
    logger.info("=".repeat(60));
    logger.info("Configuration:", {
      targetWallet: copyTradingConfig.COPY_TRADING_TARGET_WALLET,
      dryRun: copyTradingConfig.DRY_RUN,
      sizeMultiplier: copyTradingConfig.SIZE_MULTIPLIER,
      maxLeverage: copyTradingConfig.MAX_LEVERAGE,
      blockedAssets: copyTradingConfig.BLOCKED_ASSETS,
    });

    await initTelegramBot();

    const client = new HyperliquidClientWrapper();
    await client.initialize();

    const ourAddress = client.getAddress();
    logger.info("Our wallet address:", ourAddress);

    try {
      const ourEquity = await client.getAccountEquity(ourAddress);
      logger.info("Account connected successfully", {
        accountValue: ourEquity.accountValue,
      });
    } catch (error) {
      const formattedError = ErrorHandler.formatError(error);
      logger.error("Failed to connect to account", formattedError);
      await sendErrorNotification(
        ErrorHandler.wrapError(error as Error, "Cannot connect to Hyperliquid account"),
        { address: ourAddress }
      );
      throw error;
    }

    await sendStartupNotification();

    const copyTrader = new CopyTrader(client, copyTradingConfig.COPY_TRADING_TARGET_WALLET);
    await copyTrader.start();

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      copyTrader.stop();
      await cleanupTelegramBot();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    process.on("uncaughtException", async (error) => {
      logger.error("Uncaught exception", { error });
      await sendErrorNotification(error, { type: "uncaughtException" });
      shutdown("uncaughtException");
    });

    process.on("unhandledRejection", async (reason) => {
      logger.error("Unhandled rejection", { reason });
      await sendErrorNotification(
        reason instanceof Error ? reason : new Error(String(reason)),
        { type: "unhandledRejection" }
      );
    });

    logger.info("Bot is running. Press Ctrl+C to stop.");
  } catch (error) {
    const formattedError = ErrorHandler.formatError(error);
    logger.error("Fatal error during startup", formattedError);
    try {
      await sendErrorNotification(
        ErrorHandler.wrapError(error as Error, "Fatal error during startup"),
        { phase: "startup" }
      );
    } catch (notifError) {
      logger.error("Failed to send startup error notification", {
        error: ErrorHandler.formatError(notifError),
      });
    }
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Fatal error", { error });
  process.exit(1);
});

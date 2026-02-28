import { z } from "zod";
import "dotenv/config";

const configSchema = z.object({
  COPY_TRADING_TARGET_WALLET: z.string().min(1, "COPY_TRADING_TARGET_WALLET is required"),
  SIZE_MULTIPLIER: z
    .string()
    .default("1.0")
    .transform(Number)
    .pipe(z.number().positive()),
  MAX_LEVERAGE: z
    .string()
    .default("20")
    .transform(Number)
    .pipe(z.number().min(1).max(100)),
  MAX_POSITION_SIZE_PERCENT: z
    .string()
    .default("50")
    .transform(Number)
    .pipe(z.number().min(1).max(100)),
  MIN_NOTIONAL: z
    .string()
    .default("10")
    .transform(Number)
    .pipe(z.number().min(0)),
  MAX_CONCURRENT_TRADES: z
    .string()
    .default("10")
    .transform(Number)
    .pipe(z.number().int().positive()),
  BLOCKED_ASSETS: z
    .string()
    .default("")
    .transform((val) =>
      val
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    ),
  DRY_RUN: z
    .string()
    .default("false")
    .transform((val) => val.toLowerCase() === "true")
    .pipe(z.boolean()),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  ARENA_FEED_ENABLED: z
    .string()
    .default("true")
    .transform((val) => val.toLowerCase() === "true")
    .pipe(z.boolean()),
  TESTNET: z
    .string()
    .default("false")
    .transform((val) => val.toLowerCase() === "true")
    .pipe(z.boolean()),
});

export type CopyTradingConfig = z.infer<typeof configSchema>;

const parsed = configSchema.parse(process.env) as CopyTradingConfig;

export const copyTradingConfig = {
  ...parsed,
  TARGET_WALLET: parsed.COPY_TRADING_TARGET_WALLET,
  PRIVATE_KEY: process.env.MAIN_WALLET_PRIVATE_KEY ?? "",
} as CopyTradingConfig & { TARGET_WALLET: string; PRIVATE_KEY: string };

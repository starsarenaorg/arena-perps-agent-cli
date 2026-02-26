import "dotenv/config";

function optionalEnv(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

/**
 * Config is loaded lazily so that commands like `help` work without a .env file.
 * The API key is validated the first time it is actually used (in ArenaClient).
 */
export const config = {
  get apiKey(): string {
    const key = optionalEnv("ARENA_API_KEY");
    if (!key) throw new Error("Missing required environment variable: ARENA_API_KEY");
    return key;
  },
  mainWalletPrivateKey: optionalEnv("MAIN_WALLET_PRIVATE_KEY"),
  mainWalletAddress: optionalEnv("MAIN_WALLET_ADDRESS"),
  baseUrl: optionalEnv("ARENA_BASE_URL", "https://api.satest-dev.com"),
  hyperliquidInfoUrl: optionalEnv(
    "HYPERLIQUID_INFO_URL",
    "https://api-ui.hyperliquid.xyz/info"
  ),
  arbitrumRpcUrl: optionalEnv("ARBITRUM_RPC_URL", "https://arb1.arbitrum.io/rpc"),
} as const;

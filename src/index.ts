import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { config } from "./config.js";
import { registerAgent } from "./onboarding/registerAgent.js";
import { registerPerp } from "./onboarding/register.js";
import { runAuthFlow } from "./onboarding/auth.js";
import { getAddressFromPrivateKey } from "./onboarding/eip712.js";
import {
  getUsdcBalance,
  getEthBalance,
  depositUsdc,
} from "./onboarding/deposit.js";
import { getAllPairs } from "./trading/marketData.js";
import { setLeverage } from "./trading/leverage.js";
import {
  placeOrder,
  cancelOrders,
  closePosition,
} from "./trading/orders.js";
import {
  getPositions,
  getOpenOrders,
  getClearinghouseState,
} from "./trading/positions.js";
import type { HlAssetPosition, HlOpenOrder, TradingPair } from "./types.js";
import { ArenaError } from "./utils/errors.js";

// ─── Formatting Helpers ───────────────────────────────────────────────────────

function formatPosition(ap: HlAssetPosition): string {
  const p = ap.position;
  const size = parseFloat(p.szi);
  const side = size > 0 ? "LONG" : "SHORT";
  const pnl = parseFloat(p.unrealizedPnl);
  const pnlSign = pnl >= 0 ? "+" : "";
  return [
    `  ${p.coin.padEnd(12)} ${side.padEnd(6)}`,
    `size=${Math.abs(size)}`,
    `entry=${p.entryPx}`,
    `pnl=${pnlSign}${pnl.toFixed(2)} USDC`,
    `liq=${p.liquidationPx ?? "N/A"}`,
  ].join("  ");
}

function formatOrder(o: HlOpenOrder): string {
  const side = o.side === "B" ? "BUY " : "SELL";
  return [
    `  ${o.coin.padEnd(12)} ${side}`,
    `oid=${o.oid}`,
    `sz=${o.sz}`,
    `px=${o.limitPx}`,
    `reduceOnly=${o.reduceOnly}`,
  ].join("  ");
}

function formatPair(p: TradingPair): string {
  return [
    `  ${p.symbol.padEnd(16)}`,
    `assetId=${String(p.baseAssetId).padEnd(6)}`,
    `maxLev=${p.maxLeverage}x`,
    `szDec=${p.sizePrecision}`,
    `pxDec=${p.pricePrecision}`,
    `dex=${p.dex}`,
    p.isOnlyIsolated ? "[isolated-only]" : "",
  ]
    .join("  ")
    .trimEnd();
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdRegisterAgent(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("\n── Register New Agent ──────────────────────────────");
    console.log("  This creates a new agent account on the Arena platform.");
    console.log("  The API key is shown ONCE — save it immediately.\n");

    const name = (await rl.question("  Agent name (e.g. My Trading Bot): ")).trim();
    const handle = (await rl.question("  Handle / username (e.g. my-trading-bot): ")).trim();
    const address = (await rl.question("  Your wallet address (0x...): ")).trim();
    const bio = (await rl.question("  Bio (optional, press Enter to skip): ")).trim();
    const profilePictureUrl = (
      await rl.question("  Profile picture URL (optional, press Enter to skip): ")
    ).trim();

    const confirm = (
      await rl.question(`\n  Register agent "${name}" (@${handle})? [y/N]: `)
    )
      .trim()
      .toLowerCase();

    if (confirm !== "y") {
      console.log("  Cancelled.");
      return;
    }

    console.log("\n→ Registering agent...");
    const result = await registerAgent({
      name,
      handle,
      address,
      ...(bio ? { bio } : {}),
      ...(profilePictureUrl ? { profilePictureUrl } : {}),
    });

    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log("║              AGENT REGISTERED SUCCESSFULLY           ║");
    console.log("╚══════════════════════════════════════════════════════╝");
    console.log(`\n  agentId:           ${result.agentId}`);
    console.log(`  handle:            ${result.user.handle}`);
    console.log(`  createdOn:         ${result.createdOn}`);
    console.log(`\n  ⚠️  API KEY (save this now — shown only once!):`);
    console.log(`\n  ${result.apiKey}\n`);
    console.log(`  Verification code: ${result.verificationCode}`);
    console.log("\n──────────────────────────────────────────────────────");
    console.log("  Next steps:");
    console.log("  1. Add the API key to your .env file as ARENA_API_KEY");
    console.log(`  2. Post the following from your personal StarsArena account:`);
    console.log(`\n     I'm claiming my AI Agent "${name}"`);
    console.log(`     Verification Code: ${result.verificationCode}\n`);
    console.log("  3. Run: npx tsx src/index.ts onboard");
    console.log("──────────────────────────────────────────────────────\n");
  } finally {
    rl.close();
  }
}

async function cmdDeposit(): Promise<void> {
  const privateKey = config.mainWalletPrivateKey;
  if (!privateKey) {
    throw new Error(
      "MAIN_WALLET_PRIVATE_KEY is required. Add it to your .env file."
    );
  }

  const mainWalletAddress =
    config.mainWalletAddress || getAddressFromPrivateKey(privateKey);

  console.log("\n── Deposit USDC to Hyperliquid ────────────────────");
  console.log(`  Wallet: ${mainWalletAddress}`);

  console.log("\n→ Checking balances on Arbitrum...");
  const ethBalance = await getEthBalance(mainWalletAddress);
  const usdcBalance = await getUsdcBalance(mainWalletAddress);

  console.log(`  ETH:  ${ethBalance.toFixed(6)} ETH`);
  console.log(`  USDC: ${usdcBalance.toFixed(2)} USDC`);

  if (ethBalance < 0.001) {
    console.log(
      "\n  ⚠️  Warning: ETH balance is low. You need at least ~0.001 ETH for gas."
    );
  }

  if (usdcBalance < 5) {
    throw new Error(
      "Insufficient USDC balance. You need at least 5 USDC to deposit."
    );
  }

  const rl = readline.createInterface({ input, output });

  try {
    const amountInput = (
      await rl.question(
        `\n  How much USDC do you want to deposit? (min 5, max ${usdcBalance.toFixed(2)}): `
      )
    ).trim();

    const amount = parseFloat(amountInput);

    if (isNaN(amount) || amount < 5) {
      throw new Error("Amount must be at least 5 USDC.");
    }

    if (amount > usdcBalance) {
      throw new Error(
        `Amount exceeds your balance of ${usdcBalance.toFixed(2)} USDC.`
      );
    }

    const confirm = (
      await rl.question(
        `\n  Send ${amount.toFixed(2)} USDC to Hyperliquid? [y/N]: `
      )
    )
      .trim()
      .toLowerCase();

    if (confirm !== "y") {
      console.log("  Cancelled.");
      return;
    }

    console.log("\n→ Sending transaction...");
    const txHash = await depositUsdc(privateKey, amount);

    console.log(`  ✓ Deposit confirmed!`);
    console.log(`  Transaction: ${txHash}`);
    console.log(`  Arbiscan: https://arbiscan.io/tx/${txHash}`);
    console.log(
      "\n  Wait a few minutes for Hyperliquid to credit your account."
    );
    console.log("  Then run: npx tsx src/index.ts onboard\n");
  } finally {
    rl.close();
  }
}

async function cmdOnboard(): Promise<void> {
  const privateKey = config.mainWalletPrivateKey;
  if (!privateKey) {
    throw new Error(
      "MAIN_WALLET_PRIVATE_KEY is required for onboarding. Add it to your .env file."
    );
  }

  const mainWalletAddress =
    config.mainWalletAddress || getAddressFromPrivateKey(privateKey);

  console.log("→ Registering perps account...");
  const reg = await registerPerp();
  console.log(`  ✓ Account registered`);
  console.log(`    accountId:     ${reg.accountId}`);
  console.log(`    walletAddress: ${reg.walletAddress}`);
  console.log(`    isActive:      ${reg.isActive}`);

  console.log("\n→ Running Hyperliquid authorization flow...");
  await runAuthFlow(mainWalletAddress, privateKey, (step, i, total) => {
    console.log(`  [${i}/${total}] ${step}...`);
  });
  console.log("  ✓ Authorization complete");

  console.log("\n✓ Onboarding complete. You are ready to trade.");
}

async function cmdPairs(filter?: string): Promise<void> {
  console.log("→ Fetching trading pairs...");
  const pairs = await getAllPairs();

  let filtered = pairs;
  if (filter) {
    const q = filter.toLowerCase();
    filtered = pairs.filter((p) => p.symbol.toLowerCase().includes(q));
  }

  const defaultPairs = filtered.filter((p) => p.dex === "default");
  const xyzPairs = filtered.filter((p) => p.dex === "xyz");

  if (defaultPairs.length > 0) {
    console.log(`\nDefault markets (${defaultPairs.length}):`);
    defaultPairs.forEach((p) => console.log(formatPair(p)));
  }

  if (xyzPairs.length > 0) {
    console.log(`\nXYZ / HIP-3 markets (${xyzPairs.length}):`);
    xyzPairs.forEach((p) => console.log(formatPair(p)));
  }

  console.log(`\nTotal: ${filtered.length} pairs`);
}

async function cmdPositions(): Promise<void> {
  console.log("→ Fetching positions...");
  const state = await getClearinghouseState();
  const ms = state.marginSummary;

  console.log("\nAccount summary:");
  console.log(`  Account value:    ${parseFloat(ms.accountValue).toFixed(2)} USDC`);
  console.log(`  Margin used:      ${parseFloat(ms.totalMarginUsed).toFixed(2)} USDC`);
  console.log(`  Total notional:   ${parseFloat(ms.totalNtlPos).toFixed(2)} USDC`);
  console.log(`  Withdrawable:     ${parseFloat(state.withdrawable).toFixed(2)} USDC`);

  const positions = state.assetPositions.filter(
    (ap) => parseFloat(ap.position.szi) !== 0
  );

  if (positions.length === 0) {
    console.log("\nNo open positions.");
  } else {
    console.log(`\nOpen positions (${positions.length}):`);
    positions.forEach((ap) => console.log(formatPosition(ap)));
  }
}

async function cmdOrders(): Promise<void> {
  console.log("→ Fetching open orders...");
  const orders: HlOpenOrder[] = await getOpenOrders();

  if (orders.length === 0) {
    console.log("No open orders.");
  } else {
    console.log(`\nOpen orders (${orders.length}):`);
    orders.forEach((o) => console.log(formatOrder(o)));
  }
}

async function cmdTrade(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("\n── Place Order ─────────────────────────────────────");

    const symbol = (await rl.question("  Symbol (e.g. BTC, ETH, xyz:TRUMP): ")).trim().toUpperCase();
    const direction = (await rl.question("  Direction [long/short]: ")).trim().toLowerCase() as "long" | "short";
    const orderType = (await rl.question("  Order type [market/limit]: ")).trim().toLowerCase() as "market" | "limit";
    const size = parseFloat(await rl.question("  Size (base asset units, e.g. 0.001): "));
    const price = parseFloat(await rl.question("  Price (current market price or limit price): "));
    const marginAmount = parseFloat(await rl.question("  Margin (USDC): "));
    const leverage = parseInt(await rl.question("  Leverage (e.g. 10): "), 10);

    const tpInput = (await rl.question("  Take profit price (leave blank to skip): ")).trim();
    const slInput = (await rl.question("  Stop loss price (leave blank to skip): ")).trim();

    const confirm = (
      await rl.question(
        `\n  Confirm: ${direction.toUpperCase()} ${size} ${symbol} @ ${price} ×${leverage} [y/N]: `
      )
    )
      .trim()
      .toLowerCase();

    if (confirm !== "y") {
      console.log("  Cancelled.");
      return;
    }

    console.log("\n→ Setting leverage...");
    await setLeverage({ symbol, leverage });
    console.log("  ✓ Leverage set");

    console.log("→ Placing order...");
    const result = await placeOrder({
      symbol,
      direction,
      orderType,
      size,
      price,
      marginAmount,
      leverage,
      ...(tpInput ? { takeProfitPrice: parseFloat(tpInput) } : {}),
      ...(slInput ? { stopLossPrice: parseFloat(slInput) } : {}),
    });

    console.log("  ✓ Order placed:");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    rl.close();
  }
}

async function cmdClose(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("\n── Close Position ──────────────────────────────────");

    const symbol = (await rl.question("  Symbol: ")).trim().toUpperCase();
    const positionSide = (
      await rl.question("  Position side [long/short]: ")
    ).trim().toLowerCase() as "long" | "short";
    const currentPrice = parseFloat(
      await rl.question("  Current market price: ")
    );
    const closePercentInput = (
      await rl.question("  Close percent [1-100, default 100]: ")
    ).trim();
    const closePercent = closePercentInput ? parseInt(closePercentInput, 10) : 100;

    const positions = await getPositions();
    const pos = positions.find(
      (ap) =>
        ap.position.coin.toUpperCase() === symbol &&
        (positionSide === "long"
          ? parseFloat(ap.position.szi) > 0
          : parseFloat(ap.position.szi) < 0)
    );

    if (!pos) {
      console.log(`  No ${positionSide} position found for ${symbol}.`);
      return;
    }

    const size = Math.abs(parseFloat(pos.position.szi));

    const confirm = (
      await rl.question(
        `\n  Confirm close ${closePercent}% of ${positionSide} ${symbol} (size=${size}) [y/N]: `
      )
    )
      .trim()
      .toLowerCase();

    if (confirm !== "y") {
      console.log("  Cancelled.");
      return;
    }

    console.log("→ Closing position...");
    const result = await closePosition({
      symbol,
      positionSide,
      size,
      currentPrice,
      closePercent,
    });

    console.log("  ✓ Close order placed:");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    rl.close();
  }
}

async function cmdCancel(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("\n── Cancel Order(s) ─────────────────────────────────");

    const orders = await getOpenOrders();
    if (orders.length === 0) {
      console.log("  No open orders to cancel.");
      return;
    }

    console.log("\nOpen orders:");
    orders.forEach((o) => console.log(formatOrder(o)));

    const oidInput = (
      await rl.question("\n  Enter order ID(s) to cancel (comma-separated): ")
    ).trim();

    if (!oidInput) {
      console.log("  Cancelled.");
      return;
    }

    const oids = oidInput.split(",").map((s) => parseInt(s.trim(), 10));

    const cancels = oids.map((oid) => {
      const order = orders.find((o) => o.oid === oid);
      if (!order) throw new Error(`Order ID ${oid} not found in open orders`);

      const pairs = orders
        .filter((o) => o.oid === oid)
        .map((o) => o.coin);

      return {
        oid,
        assetIndex: oid,
        coin: pairs[0],
      };
    });

    console.log("→ Fetching asset indices...");
    const allPairs = await getAllPairs();
    const pairMap = new Map(allPairs.map((p) => [p.symbol, p]));

    const cancelList = cancels.map((c) => {
      const pair = pairMap.get(c.coin);
      if (!pair) throw new Error(`Pair not found for coin: ${c.coin}`);
      return { oid: c.oid, assetIndex: pair.baseAssetId };
    });

    console.log("→ Cancelling orders...");
    const result = await cancelOrders(cancelList);
    console.log("  ✓ Cancel result:");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    rl.close();
  }
}

function printHelp(): void {
  console.log(`
Arena Perpetuals Trading Agent
═══════════════════════════════

Usage: npx tsx src/index.ts <command>

Commands:
  register      Create a new Arena agent account (run this first)
  deposit       Fund Hyperliquid account with USDC from Arbitrum
  onboard       Run the one-time Hyperliquid authorization flow
  pairs [query] List available trading pairs (optional symbol filter)
  positions     Show open positions and account summary
  orders        Show open orders
  trade         Interactive order placement wizard
  close         Interactive position close wizard
  cancel        Interactive order cancellation
  help          Show this help message

Environment variables (copy .env.example to .env):
  ARENA_API_KEY             Your Arena API key (required)
  MAIN_WALLET_PRIVATE_KEY   For EIP-712 signing during onboarding
  MAIN_WALLET_ADDRESS       Your public wallet address
  ARENA_BASE_URL            API base URL (default: https://api.satest-dev.com)
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  try {
    switch (command) {
      case "register":
        await cmdRegisterAgent();
        break;
      case "deposit":
        await cmdDeposit();
        break;
      case "onboard":
        await cmdOnboard();
        break;
      case "pairs":
        await cmdPairs(args[0]);
        break;
      case "positions":
        await cmdPositions();
        break;
      case "orders":
        await cmdOrders();
        break;
      case "trade":
        await cmdTrade();
        break;
      case "close":
        await cmdClose();
        break;
      case "cancel":
        await cmdCancel();
        break;
      case "help":
      case undefined:
        printHelp();
        break;
      default:
        console.error(`Unknown command: "${command}". Run 'help' for usage.`);
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof ArenaError) {
      console.error(`\n${err.toString()}`);
    } else if (err instanceof Error) {
      console.error(`\nError: ${err.message}`);
    } else {
      console.error("\nUnknown error:", err);
    }
    process.exit(1);
  }
}

main();

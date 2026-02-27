import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { select, input as textInput, confirm } from "@inquirer/prompts";
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
import { hyperliquidClient } from "./client/hyperliquidClient.js";
import type { HlAssetPosition, HlOpenOrder, TradingPair } from "./types.js";
import { ArenaError } from "./utils/errors.js";

// ─── Formatting Helpers ───────────────────────────────────────────────────────

function formatPosition(ap: HlAssetPosition): string {
  const p = ap.position;
  const size = parseFloat(p.szi);
  const side = size > 0 ? "LONG" : "SHORT";
  const pnl = parseFloat(p.unrealizedPnl);
  const pnlSign = pnl >= 0 ? "+" : "";
  const pnlColor = pnl >= 0 ? "\x1b[32m" : "\x1b[31m"; // Green or Red
  const sideColor = size > 0 ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  
  return [
    `  ${p.coin.padEnd(8)}`,
    `${sideColor}${side.padEnd(6)}${reset}`,
    `size=${Math.abs(size).toFixed(6)}`,
    `entry=$${parseFloat(p.entryPx).toLocaleString()}`,
    `${pnlColor}pnl=${pnlSign}$${Math.abs(pnl).toFixed(2)}${reset}`,
    `liq=${p.liquidationPx ? "$" + parseFloat(p.liquidationPx).toLocaleString() : "N/A"}`,
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
  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║                         📊 POSITIONS                                 ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");
  
  console.log("→ Fetching account state...");
  const state = await getClearinghouseState();
  const ms = state.marginSummary;

  const accountValue = parseFloat(ms.accountValue);
  const marginUsed = parseFloat(ms.totalMarginUsed);
  const totalNotional = parseFloat(ms.totalNtlPos);
  const withdrawable = parseFloat(state.withdrawable);

  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│  💰 Account Summary                                                 │");
  console.log("├─────────────────────────────────────────────────────────────────────┤");
  console.log(`│  Account Value    │  $${accountValue.toFixed(2).padStart(10)} USDC                        │`);
  console.log(`│  Margin Used      │  $${marginUsed.toFixed(2).padStart(10)} USDC                        │`);
  console.log(`│  Total Notional   │  $${totalNotional.toFixed(2).padStart(10)} USDC                        │`);
  console.log(`│  Withdrawable     │  \x1b[32m$${withdrawable.toFixed(2).padStart(10)}\x1b[0m USDC                        │`);
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  const positions = state.assetPositions.filter(
    (ap) => parseFloat(ap.position.szi) !== 0
  );

  if (positions.length === 0) {
    console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
    console.log("│  📭 No open positions                                               │");
    console.log("└─────────────────────────────────────────────────────────────────────┘\n");
  } else {
    console.log(`\n┌─────────────────────────────────────────────────────────────────────┐`);
    console.log(`│  📈 Open Positions (${positions.length})                                               │`);
    console.log("├─────────────────────────────────────────────────────────────────────┤");
    positions.forEach((ap) => {
      console.log(`│  ${formatPosition(ap).padEnd(69)}│`);
    });
    console.log("└─────────────────────────────────────────────────────────────────────┘\n");
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
  try {
    console.log("\n── Place Order ─────────────────────────────────────");

    // Fetch available markets for selection
    console.log("→ Fetching available markets...");
    const allPairs = await getAllPairs();
    
    // Small delay to let the console settle
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Group by dex type
    const defaultMarkets = allPairs.filter(p => p.dex === "default");
    const xyzMarkets = allPairs.filter(p => p.dex === "xyz");
    
    const marketChoices = [
      ...defaultMarkets.slice(0, 20).map(p => ({
        name: `${p.symbol.padEnd(12)} (max ${p.maxLeverage}x leverage)`,
        value: p.symbol,
        description: `Asset ID: ${p.baseAssetId}`
      })),
      ...(xyzMarkets.length > 0 ? [{ name: "─── XYZ Markets ───", value: "separator", disabled: true }] : []),
      ...xyzMarkets.slice(0, 10).map(p => ({
        name: `${p.symbol.padEnd(12)} (max ${p.maxLeverage}x leverage)`,
        value: p.symbol,
        description: `Asset ID: ${p.baseAssetId}`
      }))
    ];

    const symbol = await select({
      message: "Select market:",
      choices: marketChoices,
      pageSize: 15
    });

    const direction = await select({
      message: "Direction:",
      choices: [
        { name: "🟢 Long (Buy)", value: "long" },
        { name: "🔴 Short (Sell)", value: "short" }
      ]
    });

    const orderType = await select({
      message: "Order type:",
      choices: [
        { name: "Market (Execute immediately)", value: "market" },
        { name: "Limit (Execute at specific price)", value: "limit" }
      ]
    });

    let price: number;
    
    if (orderType === "market") {
      console.log("→ Fetching current market price...");
      price = await hyperliquidClient().getMarketPrice(symbol);
      console.log(`  Current ${symbol} price: $${price.toLocaleString()}\n`);
    } else {
      // Fetch market price for limit order offset calculation
      console.log("→ Fetching current market price...");
      const marketPrice = await hyperliquidClient().getMarketPrice(symbol);
      console.log(`  Current ${symbol} price: $${marketPrice.toLocaleString()}\n`);
      
      // Show percentage-based limit price selection
      const limitOffsetChoices = direction === "long"
        ? [
            { name: "-0.05% (below market)", value: "-0.05" },
            { name: "-0.1%", value: "-0.1" },
            { name: "-0.5%", value: "-0.5" },
            { name: "-1%", value: "-1" },
            { name: "-2%", value: "-2" },
            { name: "Custom (manual entry)", value: "custom" }
          ]
        : [
            { name: "+0.05% (above market)", value: "+0.05" },
            { name: "+0.1%", value: "+0.1" },
            { name: "+0.5%", value: "+0.5" },
            { name: "+1%", value: "+1" },
            { name: "+2%", value: "+2" },
            { name: "Custom (manual entry)", value: "custom" }
          ];
      
      const limitChoice = await select({
        message: "Limit price offset from market:",
        choices: limitOffsetChoices
      });
      
      if (limitChoice === "custom") {
        const priceInput = await textInput({
          message: "Limit price:",
          validate: (value) => !isNaN(parseFloat(value)) || "Please enter a valid number"
        });
        price = parseFloat(priceInput);
      } else {
        const pct = parseFloat(limitChoice) / 100;
        price = marketPrice * (1 + pct);
        console.log(`  Limit price set to: $${price.toLocaleString()} (${limitChoice}%)\n`);
      }
    }

    const marginInput = await textInput({
      message: "Margin (USDC):",
      default: "10",
      validate: (value) => !isNaN(parseFloat(value)) && parseFloat(value) > 0 || "Please enter a valid amount"
    });
    const marginAmount = parseFloat(marginInput);

    const leverageInput = await textInput({
      message: "Leverage:",
      default: "10",
      validate: (value) => !isNaN(parseInt(value)) && parseInt(value) >= 1 || "Please enter a valid leverage"
    });
    const leverage = parseInt(leverageInput);

    // Auto-calculate size from margin and leverage
    const notionalValue = marginAmount * leverage;
    const calculatedSize = notionalValue / price;
    
    console.log(`\n  → Auto-calculated size: ${calculatedSize.toFixed(6)} ${symbol} (${notionalValue.toFixed(2)} USDC notional)`);
    
    const sizeInput = await textInput({
      message: "Size:",
      default: calculatedSize.toFixed(6),
      validate: (value) => !isNaN(parseFloat(value)) && parseFloat(value) > 0 || "Please enter a valid size"
    });
    const size = parseFloat(sizeInput);

    const addTpSl = await confirm({
      message: "Add take profit / stop loss?",
      default: false
    });

    let takeProfitPrice: number | undefined;
    let stopLossPrice: number | undefined;

    if (addTpSl) {
      // Take Profit selection
      const tpChoices = direction === "long"
        ? [
            { name: "+10% (profit when price rises)", value: "+10" },
            { name: "+25%", value: "+25" },
            { name: "+50%", value: "+50" },
            { name: "+100%", value: "+100" },
            { name: "+200%", value: "+200" },
            { name: "Custom (manual entry)", value: "custom" },
            { name: "Skip", value: "skip" }
          ]
        : [
            { name: "-10% (profit when price drops)", value: "-10" },
            { name: "-25%", value: "-25" },
            { name: "-50%", value: "-50" },
            { name: "Custom (manual entry)", value: "custom" },
            { name: "Skip", value: "skip" }
          ];
      
      const tpChoice = await select({
        message: "Take profit:",
        choices: tpChoices
      });
      
      if (tpChoice !== "skip") {
        if (tpChoice === "custom") {
          const tpInput = await textInput({
            message: "Take profit price:",
            validate: (value) => !isNaN(parseFloat(value)) || "Please enter a valid number"
          });
          takeProfitPrice = parseFloat(tpInput);
        } else {
          const pct = Math.abs(parseFloat(tpChoice)) / 100;
          takeProfitPrice = direction === "long" 
            ? price * (1 + pct) 
            : price * (1 - pct);
          console.log(`  TP set to: $${takeProfitPrice.toLocaleString()} (${tpChoice}%)`);
        }
      }

      // Stop Loss selection
      const slChoices = direction === "long"
        ? [
            { name: "-5% (stop if price drops)", value: "-5" },
            { name: "-10%", value: "-10" },
            { name: "-25%", value: "-25" },
            { name: "-50%", value: "-50" },
            { name: "Custom (manual entry)", value: "custom" },
            { name: "Skip", value: "skip" }
          ]
        : [
            { name: "+5% (stop if price rises)", value: "+5" },
            { name: "+10%", value: "+10" },
            { name: "+25%", value: "+25" },
            { name: "+50%", value: "+50" },
            { name: "+100%", value: "+100" },
            { name: "Custom (manual entry)", value: "custom" },
            { name: "Skip", value: "skip" }
          ];
      
      const slChoice = await select({
        message: "Stop loss:",
        choices: slChoices
      });
      
      if (slChoice !== "skip") {
        if (slChoice === "custom") {
          const slInput = await textInput({
            message: "Stop loss price:",
            validate: (value) => !isNaN(parseFloat(value)) || "Please enter a valid number"
          });
          stopLossPrice = parseFloat(slInput);
        } else {
          const pct = Math.abs(parseFloat(slChoice)) / 100;
          stopLossPrice = direction === "long" 
            ? price * (1 - pct) 
            : price * (1 + pct);
          console.log(`  SL set to: $${stopLossPrice.toLocaleString()} (${slChoice}%)`);
        }
      }
    }

    const priceDisplay = orderType === "market" ? `~$${price.toLocaleString()}` : `$${price.toLocaleString()}`;
    
    // Build confirmation message with TP/SL details
    let confirmMessage = `Confirm: ${direction.toUpperCase()} ${size.toFixed(6)} ${symbol} @ ${priceDisplay} ×${leverage} ($${marginAmount} margin)`;
    
    if (takeProfitPrice || stopLossPrice) {
      confirmMessage += "\n";
      if (takeProfitPrice) {
        const tpPct = ((takeProfitPrice - price) / price * 100).toFixed(2);
        const tpSign = parseFloat(tpPct) >= 0 ? "+" : "";
        confirmMessage += `\n  TP: $${takeProfitPrice.toLocaleString()} (${tpSign}${tpPct}%)`;
      }
      if (stopLossPrice) {
        const slPct = ((stopLossPrice - price) / price * 100).toFixed(2);
        const slSign = parseFloat(slPct) >= 0 ? "+" : "";
        confirmMessage += `\n  SL: $${stopLossPrice.toLocaleString()} (${slSign}${slPct}%)`;
      }
    }
    
    const confirmed = await confirm({
      message: confirmMessage,
      default: false
    });

    if (!confirmed) {
      console.log("  Cancelled.");
      return;
    }

    console.log("\n→ Setting leverage...");
    await setLeverage({ symbol, leverage });
    console.log("  ✓ Leverage set");

    console.log("→ Placing order...");
    const result = await placeOrder({
      symbol,
      direction: direction as "long" | "short",
      orderType: orderType as "market" | "limit",
      size,
      price,
      marginAmount,
      leverage,
      ...(takeProfitPrice ? { takeProfitPrice } : {}),
      ...(stopLossPrice ? { stopLossPrice } : {}),
    });

    console.log("  ✓ Order placed:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof Error && error.message.includes("User force closed")) {
      console.log("\n  Cancelled.");
      return;
    }
    throw error;
  }
}

async function cmdClose(): Promise<void> {
  try {
    console.log("\n── Close Position ──────────────────────────────────");

    // Fetch and display all open positions
    console.log("→ Fetching open positions...");
    const positions = await getPositions();

    if (positions.length === 0) {
      console.log("  No open positions to close.");
      return;
    }

    const positionChoices = positions.map((ap, index) => {
      const p = ap.position;
      const size = parseFloat(p.szi);
      const side = size > 0 ? "🟢 LONG" : "🔴 SHORT";
      const pnl = parseFloat(p.unrealizedPnl);
      const pnlSign = pnl >= 0 ? "+" : "";
      const pnlColor = pnl >= 0 ? "🟢" : "🔴";
      
      return {
        name: `${p.coin.padEnd(8)} ${side.padEnd(8)} size=${Math.abs(size).toFixed(6)}  ${pnlColor} ${pnlSign}${pnl.toFixed(2)} USDC  entry=$${p.entryPx}`,
        value: index,
        description: `Liq: ${p.liquidationPx ?? "N/A"}`
      };
    });

    const selection = await select({
      message: "Select position to close:",
      choices: positionChoices
    });

    const selectedPosition = positions[selection];
    const p = selectedPosition.position;
    const symbol = p.coin.toUpperCase();
    const size = Math.abs(parseFloat(p.szi));
    const positionSide = parseFloat(p.szi) > 0 ? "long" : "short";

    // Fetch current market price
    console.log("→ Fetching current market price...");
    const currentPrice = await hyperliquidClient().getMarketPrice(symbol);
    console.log(`  Current ${symbol} price: $${currentPrice.toLocaleString()}\n`);

    const closePercentInput = await textInput({
      message: "Close percent (1-100):",
      default: "100",
      validate: (value) => {
        const num = parseInt(value);
        return (!isNaN(num) && num >= 1 && num <= 100) || "Please enter a number between 1 and 100";
      }
    });
    const closePercent = parseInt(closePercentInput);

    const confirmed = await confirm({
      message: `Close ${closePercent}% of ${positionSide} ${symbol} (size=${size.toFixed(6)}) @ ~$${currentPrice.toLocaleString()}`,
      default: true
    });

    if (!confirmed) {
      console.log("  Cancelled.");
      return;
    }

    console.log("\n→ Closing position...");
    const result = await closePosition({
      symbol,
      positionSide: positionSide as "long" | "short",
      size,
      currentPrice,
      closePercent,
    });

    console.log("  ✓ Close order placed:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof Error && error.message.includes("User force closed")) {
      console.log("\n  Cancelled.");
      return;
    }
    throw error;
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

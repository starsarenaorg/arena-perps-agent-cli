import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { config } from "../config.js";

const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;
const HL_DEPOSIT_ADDRESS = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7" as const;
const USDC_DECIMALS = 6;

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

function getPublicClient() {
  return createPublicClient({
    chain: arbitrum,
    transport: http(config.arbitrumRpcUrl),
  });
}

function getWalletClient(privateKey: string) {
  const normalizedKey = privateKey.startsWith("0x")
    ? (privateKey as `0x${string}`)
    : (`0x${privateKey}` as `0x${string}`);

  const account = privateKeyToAccount(normalizedKey);

  return createWalletClient({
    account,
    chain: arbitrum,
    transport: http(config.arbitrumRpcUrl),
  });
}

/**
 * Get USDC balance on Arbitrum for the given address.
 * Returns the balance as a number (human-readable, e.g. 100.5 USDC).
 */
export async function getUsdcBalance(address: string): Promise<number> {
  const publicClient = getPublicClient();

  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
  });

  return parseFloat(formatUnits(balance, USDC_DECIMALS));
}

/**
 * Get ETH balance on Arbitrum for the given address.
 * Returns the balance as a number (human-readable, e.g. 0.05 ETH).
 */
export async function getEthBalance(address: string): Promise<number> {
  const publicClient = getPublicClient();

  const balance = await publicClient.getBalance({
    address: address as `0x${string}`,
  });

  return parseFloat(formatUnits(balance, 18));
}

/**
 * Deposit USDC to Hyperliquid by transferring to their deposit address.
 * Returns the transaction hash.
 */
export async function depositUsdc(
  privateKey: string,
  amountUsdc: number
): Promise<string> {
  const walletClient = getWalletClient(privateKey);
  const publicClient = getPublicClient();

  const amount = parseUnits(amountUsdc.toString(), USDC_DECIMALS);

  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [HL_DEPOSIT_ADDRESS, amount],
  });

  // Wait for confirmation
  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}

import { privateKeyToAccount } from "viem/accounts";
import { signTypedData } from "viem/actions";
import { createWalletClient, http } from "viem";
import { arbitrum } from "viem/chains";
import type { Eip712Payload } from "../types.js";

/**
 * Sign an EIP-712 typed data payload using a private key.
 * Returns the hex signature string (0x-prefixed).
 */
export async function signEip712(
  privateKey: string,
  payload: Eip712Payload
): Promise<string> {
  const normalizedKey = privateKey.startsWith("0x")
    ? (privateKey as `0x${string}`)
    : (`0x${privateKey}` as `0x${string}`);

  const account = privateKeyToAccount(normalizedKey);

  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http(),
  });

  // viem requires the types object without EIP712Domain (it's handled by domain)
  const { EIP712Domain: _removed, ...typesWithoutDomain } = payload.types as Record<
    string,
    { name: string; type: string }[]
  >;

  const signature = await signTypedData(walletClient, {
    account,
    domain: payload.domain as Parameters<typeof signTypedData>[1]["domain"],
    types: typesWithoutDomain,
    primaryType: payload.primaryType,
    message: payload.message as Record<string, unknown>,
  });

  return signature;
}

/**
 * Derive a public address from a private key.
 */
export function getAddressFromPrivateKey(privateKey: string): string {
  const normalizedKey = privateKey.startsWith("0x")
    ? (privateKey as `0x${string}`)
    : (`0x${privateKey}` as `0x${string}`);
  return privateKeyToAccount(normalizedKey).address;
}

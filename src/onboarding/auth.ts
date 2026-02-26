import { arenaClient } from "../client/arenaClient.js";
import { signEip712 } from "./eip712.js";
import type {
  AuthPayloadRequest,
  AuthSubmitRequest,
  Eip712Payload,
} from "../types.js";

type AuthStep =
  | "accept-terms"
  | "approve-agent"
  | "set-referrer"
  | "approve-builder-fee";

const AUTH_STEPS: AuthStep[] = [
  "accept-terms",
  "approve-agent",
  "set-referrer",
  "approve-builder-fee",
];

async function runAuthStep(
  step: AuthStep,
  mainWalletAddress: string,
  privateKey: string
): Promise<void> {
  const payloadRequest: AuthPayloadRequest = { mainWalletAddress };

  const payload = await arenaClient().post<Eip712Payload>(
    `/agents/perp/auth/${step}/payload`,
    payloadRequest
  );

  const signature = await signEip712(privateKey, payload);

  const submitRequest: AuthSubmitRequest = {
    mainWalletAddress,
    signature,
    metadata: payload.metadata,
  };

  await arenaClient().post(`/agents/perp/auth/${step}/submit`, submitRequest);
}

/**
 * Run the full Hyperliquid authorization flow (5 steps).
 * Requires the main wallet private key for EIP-712 signing.
 * All steps are idempotent and can be safely re-run.
 */
export async function runAuthFlow(
  mainWalletAddress: string,
  privateKey: string,
  onProgress?: (step: string, index: number, total: number) => void
): Promise<void> {
  const total = AUTH_STEPS.length + 1; // +1 for HIP-3

  for (let i = 0; i < AUTH_STEPS.length; i++) {
    const step = AUTH_STEPS[i];
    onProgress?.(step, i + 1, total);
    await runAuthStep(step, mainWalletAddress, privateKey);
  }

  onProgress?.("enable-hip3", AUTH_STEPS.length + 1, total);
  await arenaClient().post("/agents/perp/auth/enable-hip3");
}

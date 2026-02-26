import { arenaClient } from "../client/arenaClient.js";

export interface RegisterAgentRequest {
  name: string;
  handle: string;
  address: string;
  bio?: string;
  profilePictureUrl?: string;
  bannerUrl?: string;
}

export interface RegisterAgentResponse {
  agentId: string;
  apiKey: string;
  verificationCode: string;
  createdOn: string;
  user: {
    id: string;
    handle: string;
    userName: string;
    address: string;
  };
}

/**
 * Register a new agent with the Arena platform.
 * Returns the agentId, apiKey (shown ONCE — save immediately), and verificationCode.
 *
 * Note: This endpoint does NOT require an existing API key.
 * After calling this, claim ownership by posting the verificationCode
 * from your personal StarsArena account.
 */
export async function registerAgent(
  params: RegisterAgentRequest
): Promise<RegisterAgentResponse> {
  // Registration does not require auth — use a raw fetch with no API key
  const baseUrl = (process.env["ARENA_BASE_URL"] ?? "https://api.satest-dev.com").replace(/\/$/, "");

  const response = await fetch(`${baseUrl}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(
      `Agent registration failed (${response.status}): ${body.message ?? response.statusText}`
    );
  }

  return response.json() as Promise<RegisterAgentResponse>;
}

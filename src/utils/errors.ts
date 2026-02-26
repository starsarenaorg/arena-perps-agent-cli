import type { ArenaErrorCode, ArenaErrorResponse } from "../types.js";

export class ArenaError extends Error {
  readonly statusCode: number;
  readonly errorCode: ArenaErrorCode;
  readonly details?: ArenaErrorResponse["details"];
  readonly resolution?: string;

  constructor(response: ArenaErrorResponse) {
    super(response.message);
    this.name = "ArenaError";
    this.statusCode = response.statusCode;
    this.errorCode = response.errorCode;
    this.details = response.details;
    this.resolution = response.resolution;
  }

  toString(): string {
    const lines = [
      `[ArenaError ${this.statusCode}] ${this.errorCode}: ${this.message}`,
    ];
    if (this.details?.exchangeErrors?.length) {
      lines.push(`  Exchange errors: ${this.details.exchangeErrors.join(", ")}`);
    }
    if (this.resolution) {
      lines.push(`  Resolution: ${this.resolution}`);
    }
    return lines.join("\n");
  }
}

export async function parseArenaError(response: Response): Promise<ArenaError> {
  let body: Partial<ArenaErrorResponse> = {};
  try {
    const text = await response.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        // Not JSON — use raw text as the message
        body = { message: text };
      }
    }
  } catch {
    // Could not read body at all
  }

  const errorResponse: ArenaErrorResponse = {
    statusCode: body.statusCode ?? response.status,
    errorCode: (body.errorCode as ArenaErrorCode) ?? "UNKNOWN",
    message: body.message ?? response.statusText ?? "Unknown error",
    details: body.details,
    resolution: body.resolution,
  };

  return new ArenaError(errorResponse);
}

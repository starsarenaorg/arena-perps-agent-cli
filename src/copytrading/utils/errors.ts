/**
 * Custom error classes for better error handling and categorization
 * (from gamma-trade-lab/Hyperliquid-Copy-Trading-Bot)
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    retryable = false,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.retryable = retryable;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class SDKError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "SDK_ERROR", true, context);
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "NETWORK_ERROR", true, context);
  }
}

export class WebSocketError extends NetworkError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { ...context, type: "websocket" });
    this.code = "WEBSOCKET_ERROR";
  }
}

export class TradingError extends AppError {
  constructor(message: string, retryable = false, context?: Record<string, unknown>) {
    super(message, "TRADING_ERROR", retryable, context);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", false, context);
  }
}

export class ConfigError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "CONFIG_ERROR", false, context);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, retryAfter?: number, context?: Record<string, unknown>) {
    super(message, "RATE_LIMIT_ERROR", true, { ...context, retryAfter });
  }
}

export class AccountError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "ACCOUNT_ERROR", false, context);
  }
}

export class ErrorHandler {
  static isRetryable(error: unknown): boolean {
    if (error instanceof AppError) return error.retryable;
    if (error instanceof Error) {
      const m = error.message.toLowerCase();
      return (
        m.includes("network") ||
        m.includes("timeout") ||
        m.includes("connection") ||
        m.includes("econnreset") ||
        m.includes("enotfound")
      );
    }
    return false;
  }

  static getErrorMessage(error: unknown): string {
    if (error instanceof AppError) return error.message;
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "Unknown error occurred";
  }

  static getErrorCode(error: unknown): string {
    return error instanceof AppError ? error.code : "UNKNOWN_ERROR";
  }

  static getErrorContext(error: unknown): Record<string, unknown> {
    return error instanceof AppError && error.context ? error.context : {};
  }

  static formatError(error: unknown): {
    message: string;
    code: string;
    retryable: boolean;
    context: Record<string, unknown>;
    stack?: string;
  } {
    const result = {
      message: this.getErrorMessage(error),
      code: this.getErrorCode(error),
      retryable: this.isRetryable(error),
      context: this.getErrorContext(error),
    };
    if (error instanceof Error && error.stack) return { ...result, stack: error.stack };
    return result;
  }

  static wrapError(
    error: unknown,
    defaultMessage = "An error occurred",
    defaultCode = "UNKNOWN_ERROR"
  ): AppError {
    if (error instanceof AppError) return error;
    return new AppError(
      this.getErrorMessage(error) || defaultMessage,
      defaultCode,
      this.isRetryable(error),
      error instanceof Error ? { originalError: error.name } : {}
    );
  }
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (error: unknown, attempt: number) => void
): Promise<T> {
  let lastError: unknown;
  let delay = config.initialDelay;
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!ErrorHandler.isRetryable(error)) throw error;
      if (attempt >= config.maxRetries) break;
      if (onRetry) onRetry(error, attempt);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
    }
  }
  throw ErrorHandler.wrapError(lastError, "Max retries exceeded");
}

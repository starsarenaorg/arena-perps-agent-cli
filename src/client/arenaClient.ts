import { config } from "../config.js";
import { parseArenaError } from "../utils/errors.js";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ArenaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl = config.baseUrl, apiKey = config.apiKey) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
    };
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: this.buildHeaders(),
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);

    if (!response.ok) {
      throw await parseArenaError(response);
    }

    // 204 No Content or empty body
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const text = await response.text();
    if (!text.trim()) {
      return undefined as unknown as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `Failed to parse JSON response from ${method} ${path} (status ${response.status}):\n${text}`
      );
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}

let _arenaClient: ArenaClient | undefined;
export function arenaClient(): ArenaClient {
  if (!_arenaClient) _arenaClient = new ArenaClient();
  return _arenaClient;
}

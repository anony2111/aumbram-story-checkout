import { isApiErrorBody } from "@/domain/api";
import type { ApiErrorCode } from "@/domain/api";

/**
 * The one place the client talks to the mock backend.
 *
 * Responsibilities kept here so no component has to think about them: the single
 * error shape, a request timeout (a hung socket is the common failure on a train,
 * not a 500), and abort signal composition so a stale request can be cancelled.
 */

export const API_BASE = "/api/v1";

/** A request that has not answered by now is not going to. */
export const DEFAULT_TIMEOUT_MS = 10_000;

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | "NETWORK" | "TIMEOUT";
  readonly details: unknown;

  constructor(options: {
    status: number;
    code: ApiErrorCode | "NETWORK" | "TIMEOUT";
    message: string;
    details?: unknown;
  }) {
    super(options.message);
    this.name = "ApiRequestError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }

  /** Worth another attempt: transport trouble or a server that said "later". */
  get isRetryable(): boolean {
    return this.code === "NETWORK" || this.code === "TIMEOUT" || this.status >= 500;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "signal"> {
  signal?: AbortSignal | undefined;
  timeoutMs?: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

function composeSignals(signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const present = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return AbortSignal.any(present);
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...init } = options;
  const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      // The cart, quote and orders must never come from a cache.
      cache: "no-store",
      ...(composeSignals([signal, timeoutSignal]) ? { signal: composeSignals([signal, timeoutSignal]) } : {}),
    });
  } catch (cause) {
    // A caller-initiated abort is not an error to report; let it propagate.
    if (signal?.aborted) throw cause;
    const timedOut = timeoutSignal?.aborted === true;
    throw new ApiRequestError({
      status: 0,
      code: timedOut ? "TIMEOUT" : "NETWORK",
      message: timedOut ? "The request timed out" : "The network request failed",
      details: cause,
    });
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!response.ok) {
    if (isApiErrorBody(parsed)) {
      throw new ApiRequestError({
        status: response.status,
        code: parsed.error.code,
        message: parsed.error.message,
        details: parsed.error.details,
      });
    }
    throw new ApiRequestError({
      status: response.status,
      code: "NETWORK",
      message: `Request failed with ${response.status}`,
    });
  }

  return { data: parsed as T, status: response.status, headers: response.headers };
}

/** The common case: just the body. */
export async function apiGet<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return (await apiRequest<T>(path, { ...options, method: "GET" })).data;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  return (await apiRequest<T>(path, { ...options, method: "POST", body: JSON.stringify(body) })).data;
}

import { ZodError } from "zod";
import { getStore } from "./store";
import type { ApiErrorBody, ApiErrorCode } from "@/domain/api";

/**
 * Response helpers and the fault injector.
 *
 * Every `/api/v1` handler goes through `withApi`, so latency, injected 503s and the
 * single error shape are decided in one place rather than repeated per route.
 */

export function json<T>(data: T, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: {
      // Nothing the mock returns is shared between users; the cart, quote and
      // orders must never be cached by a proxy or the browser.
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown
): Response {
  const body: ApiErrorBody = {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
  return json(body, { status });
}

export function notFound(what: string): Response {
  return apiError(404, "NOT_FOUND", `${what} not found`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** The latency the current debug profile asks for. */
export function injectedLatencyMs(): number {
  const { latencyProfile, fixedLatencyMs } = getStore().debug;
  switch (latencyProfile) {
    case "off":
      return 0;
    case "fast":
      return randomInt(50, 150);
    case "slow4g":
      return randomInt(600, 2500);
    case "fixed":
      return Math.max(0, fixedLatencyMs);
  }
}

export class ApiResponseError extends Error {
  constructor(readonly response: Response) {
    super("api-error");
    this.name = "ApiResponseError";
  }
}

/** Throw from anywhere inside a handler to answer with a specific error. */
export function fail(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown
): never {
  throw new ApiResponseError(apiError(status, code, message, details));
}

export interface ApiOptions {
  /**
   * Skip the injected 503. Used by /api/v1/debug itself — a reviewer must always
   * be able to turn the failure rate back down.
   */
  faultless?: boolean;
}

/**
 * Wraps a route handler with fault injection and error normalisation.
 *
 * The order matters: latency first (so a slow network is slow even when the call
 * ends up failing), then the failure dice, then the handler.
 */
export function withApi<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response> | Response,
  options: ApiOptions = {}
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    if (!options.faultless) {
      const latency = injectedLatencyMs();
      if (latency > 0) await sleep(latency);

      const { failureRate } = getStore().debug;
      if (failureRate > 0 && Math.random() < failureRate) {
        return apiError(503, "SERVICE_UNAVAILABLE", "Injected failure", { retryAfterMs: 2000 });
      }
    }

    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiResponseError) return error.response;
      if (error instanceof ZodError) {
        return apiError(422, "INVALID_BODY", "Request body failed validation", {
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }
      console.error("[api] unhandled error", error);
      return apiError(500 as number, "SERVICE_UNAVAILABLE", "Unexpected mock backend error");
    }
  };
}

/** Parse a JSON body, answering 422 in the single shape rather than throwing HTML. */
export async function readJsonBody<T>(
  request: Request,
  schema: { parse: (value: unknown) => T }
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    fail(422, "INVALID_BODY", "Body must be JSON");
  }
  return schema.parse(raw);
}

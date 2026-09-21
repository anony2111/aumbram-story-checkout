import { BUILD_ID } from "./build-info";
import { scrubAndTruncate } from "./pii";
import type { ClientErrorBody } from "@/domain/schemas";

/**
 * Client error reporting.
 *
 * Sent with `sendBeacon` so a report survives the navigation that often follows a
 * crash. Every field is scrubbed (see `pii.ts`) and the payload deliberately
 * carries no cart, address or form contents — a route, a build id and a
 * correlation id are enough to find the failure in the server log.
 */

export interface ReportInput {
  error: unknown;
  route: string;
  componentStack?: string | undefined;
}

function describe(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: scrubAndTruncate(error.message, 500),
      ...(error.stack ? { stack: scrubAndTruncate(error.stack, 4000) } : {}),
    };
  }
  return { name: "UnknownError", message: scrubAndTruncate(String(error), 500) };
}

/** Returns the correlation id, so the UI can show it to the user to quote back. */
export function reportClientError(input: ReportInput): string {
  const correlationId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cid-${Date.now().toString(36)}`;

  const body: ClientErrorBody = {
    buildId: BUILD_ID,
    route: input.route,
    correlationId,
    ...describe(input.error),
    ...(input.componentStack
      ? { componentStack: scrubAndTruncate(input.componentStack, 4000) }
      : {}),
  };

  if (typeof window === "undefined") return correlationId;

  const payload = JSON.stringify(body);
  try {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/v1/client-errors", blob)) return correlationId;
  } catch {
    // Fall through to fetch.
  }

  void fetch("/api/v1/client-errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Reporting must never throw over the error it is reporting.
  });

  return correlationId;
}

import { LIVE_TICK_MS, subscribeToLiveUpdates } from "@/server/live";
import { withApi } from "@/server/http";
import type { LiveUpdate } from "@/domain/types";

export const dynamic = "force-dynamic";

/** Keeps intermediaries from closing an idle stream. */
const HEARTBEAT_MS = 15_000;

/**
 * Server-Sent Events.
 *
 * SSE rather than a WebSocket: the payload is server-to-client only, it rides
 * ordinary HTTP (so it survives the proxies on Indian mobile networks), and the
 * browser reconnects on its own with a backoff we do not have to write. The
 * trade-off is argued in the ADR.
 */
export const GET = withApi(async (request: Request) => {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The client went away mid-enqueue; the abort handler cleans up.
        }
      };

      send("ready", { tickMs: LIVE_TICK_MS });

      unsubscribe = subscribeToLiveUpdates((update: LiveUpdate) => send("update", update));

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          // Same as above.
        }
      }, HEARTBEAT_MS);
      heartbeat.unref?.();

      const close = () => {
        unsubscribe?.();
        unsubscribe = null;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      if (request.signal.aborted) close();
      else request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      // Disables response buffering on nginx-style proxies.
      "x-accel-buffering": "no",
    },
  });
});

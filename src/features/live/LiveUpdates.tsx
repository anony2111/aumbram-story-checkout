"use client";

import { useEffect } from "react";
import { useLiveStore } from "./live-store";
import { liveUpdateSchema } from "@/domain/schemas";
import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * The single SSE connection, mounted once in the root layout.
 *
 * `EventSource` reconnects on its own, but on a fixed ~3 s interval, which on a
 * flaky mobile connection is a request every three seconds for as long as the
 * outage lasts. So the stream is closed on error and reopened with exponential
 * backoff and jitter, and the attempt counter resets on a clean open.
 *
 * Nothing is opened at all while the browser says it is offline; the online
 * event brings it back.
 */

const MAX_BACKOFF_MS = 30_000;

export function LiveUpdates() {
  const online = useOnlineStatus();
  const apply = useLiveStore((state) => state.apply);
  const setConnected = useLiveStore((state) => state.setConnected);

  useEffect(() => {
    if (!online) {
      setConnected(false);
      return;
    }

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let closed = false;

    const connect = () => {
      if (closed) return;
      source = new EventSource("/api/v1/live");

      source.addEventListener("ready", () => {
        attempt = 0;
        setConnected(true);
      });

      source.addEventListener("update", (event) => {
        try {
          // Parsed, not trusted: this is data arriving from the network into a
          // store several screens read from.
          apply(liveUpdateSchema.parse(JSON.parse((event as MessageEvent<string>).data)));
        } catch {
          // A malformed frame is dropped; the stream carries on.
        }
      });

      source.onerror = () => {
        setConnected(false);
        source?.close();
        source = null;
        if (closed) return;
        attempt += 1;
        const backoff =
          Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS) + Math.round(Math.random() * 400);
        reconnectTimer = setTimeout(connect, backoff);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
      setConnected(false);
    };
  }, [online, apply, setConnected]);

  return null;
}

"use client";

import { BUILD_ID } from "@/lib/build-info";
import type { AnalyticsEventBody } from "@/domain/schemas";

/**
 * Analytics batching.
 *
 * Events are buffered and flushed on a timer, at a size cap, or when the page is
 * being hidden — which on a phone is the moment that actually matters, because
 * `pagehide` is the last reliable callback before the tab is frozen or killed.
 * The final flush uses `sendBeacon`, the only transport the browser promises to
 * finish after the page has gone.
 *
 * Each event carries a client-generated UUID so the server can dedupe a batch
 * that gets sent twice, which is exactly what happens when a flush races a
 * `pagehide`.
 *
 * No PII: ids, counts and a session id that lives for one tab.
 */

const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 20;

type EventName = AnalyticsEventBody["name"];

let buffer: AnalyticsEventBody[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let sessionId: string | null = null;
let listenersAttached = false;

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId(): string {
  if (sessionId) return sessionId;
  try {
    const stored = sessionStorage.getItem("aumbram.session");
    sessionId = stored ?? uuid();
    sessionStorage.setItem("aumbram.session", sessionId);
  } catch {
    // Private mode, or storage blocked: an in-memory id is still useful.
    sessionId = uuid();
  }
  return sessionId;
}

function networkType(): string | undefined {
  const connection = (navigator as { connection?: { effectiveType?: string } }).connection;
  return connection?.effectiveType;
}

export function flushAnalytics(useBeacon = false): void {
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  const payload = JSON.stringify({ events });
  if (useBeacon) {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/v1/events/batch", blob)) return;
    } catch {
      // Fall through.
    }
  }

  void fetch("/api/v1/events/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Analytics must never be the reason something breaks.
  });
}

function attachListeners(): void {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;
  // `pagehide` rather than `unload`: bfcache-safe, and it actually fires on iOS.
  window.addEventListener("pagehide", () => flushAnalytics(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAnalytics(true);
  });
}

export function track(name: EventName, props: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  attachListeners();

  buffer.push({
    id: uuid(),
    name,
    props: { ...props, buildId: BUILD_ID },
    clientTs: new Date().toISOString(),
    sessionId: getSessionId(),
    // The demo has one fixed user; a real app would read this from the session.
    userId: "usr_000001",
    device: {
      os: navigator.platform || "unknown",
      ...(networkType() ? { network: networkType() } : {}),
    },
  });

  if (buffer.length >= MAX_BATCH) {
    flushAnalytics();
    return;
  }
  if (!timer) timer = setTimeout(() => flushAnalytics(), FLUSH_INTERVAL_MS);
}

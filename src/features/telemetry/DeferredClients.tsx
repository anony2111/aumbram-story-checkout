"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * Everything that is not the page.
 *
 * Real user monitoring, the live-update stream and the analytics buffer are all
 * useful and none of them are content. Loaded eagerly they sit in the first-load
 * bundle and compete for bandwidth with the one image the Largest Contentful
 * Paint is waiting for — on a 1.6 Mbps connection that competition is measured
 * in hundreds of milliseconds.
 *
 * So they are code-split and mounted after the browser goes idle. The cost is
 * that the first second of a visit is not monitored and the stream connects a
 * moment late; neither matters, and both are recorded in the ADR.
 */

const Rum = dynamic(() => import("./Rum").then((module) => module.Rum), { ssr: false });
const LiveUpdates = dynamic(
  () => import("@/features/live/LiveUpdates").then((module) => module.LiveUpdates),
  { ssr: false }
);

/** Falls back to a timeout where requestIdleCallback is not implemented. */
function onIdle(callback: () => void, timeoutMs = 2500): () => void {
  if (typeof window === "undefined") return () => undefined;
  const idle = (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
    .requestIdleCallback;
  if (idle) {
    const handle = idle(callback, { timeout: timeoutMs });
    return () =>
      (window as Window & { cancelIdleCallback?: typeof cancelIdleCallback }).cancelIdleCallback?.(
        handle
      );
  }
  const timer = setTimeout(callback, 1200);
  return () => clearTimeout(timer);
}

export function DeferredClients() {
  const [ready, setReady] = useState(false);

  useEffect(() => onIdle(() => setReady(true)), []);

  if (!ready) return null;
  return (
    <>
      <Rum />
      <LiveUpdates />
    </>
  );
}

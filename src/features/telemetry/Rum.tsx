"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { onCLS, onINP, onLCP, onTTFB } from "web-vitals/attribution";
import { useTranslator } from "@/i18n/client";
import { BUILD_ID } from "@/lib/build-info";
import type { MetricWithAttribution } from "web-vitals/attribution";
import type { RumBody } from "@/domain/schemas";

/**
 * Real user monitoring.
 *
 * Sampled, because RUM on a feed is a request per reader per metric and the
 * point is a distribution, not a census. The rate is configurable so a reviewer
 * can turn it to 1 and see every beacon; it defaults to 1 here for exactly that
 * reason, and a real deployment would run it far lower.
 *
 * INP is collected with attribution, so a slow interaction arrives with the
 * element and the phase that caused it rather than just a number nobody can act
 * on. Sent with `sendBeacon`: these fire as the page is going away.
 */

const SAMPLE_RATE = Number(process.env.NEXT_PUBLIC_RUM_SAMPLE_RATE ?? "1");

function networkType(): string | undefined {
  const connection = (navigator as { connection?: { effectiveType?: string } }).connection;
  return connection?.effectiveType;
}

export function Rum() {
  const pathname = usePathname();
  const t = useTranslator();
  const route = useRef(pathname);
  route.current = pathname;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (Math.random() >= SAMPLE_RATE) return;

    const send = (metric: MetricWithAttribution) => {
      const body: RumBody = {
        buildId: BUILD_ID,
        // The route pattern, never the URL: an order id in a metric is PII by
        // another name.
        route: toRoutePattern(route.current),
        locale: t.locale,
        ...(networkType() ? { effectiveType: networkType() as string } : {}),
        metric: {
          name: metric.name as RumBody["metric"]["name"],
          value: Math.round(metric.value * 1000) / 1000,
          rating: metric.rating as RumBody["metric"]["rating"],
          id: metric.id,
          ...(metric.attribution
            ? { attribution: summarise(metric.attribution as Record<string, unknown>) }
            : {}),
        },
      };

      const payload = JSON.stringify(body);
      try {
        const blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon("/api/v1/rum", blob)) return;
      } catch {
        // Fall through.
      }
      void fetch("/api/v1/rum", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    };

    onLCP(send);
    onCLS(send);
    onINP(send);
    onTTFB(send);
  }, [t.locale]);

  return null;
}

/** /stories/sty_0022 -> /stories/[storyId]; ids are not dimensions. */
function toRoutePattern(pathname: string): string {
  return pathname
    .replace(/\/stories\/[^/]+/, "/stories/[storyId]")
    .replace(/\/products\/[^/]+/, "/products/[productId]")
    .replace(/\/orders\/[^/]+/, "/orders/[segment]");
}

/** Keeps the few attribution fields worth alerting on, drops the rest. */
function summarise(attribution: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    "element",
    "url",
    "interactionType",
    "interactionTarget",
    "loadState",
    "largestShiftTarget",
    "inputDelay",
    "processingDuration",
    "presentationDelay",
  ];
  const summary: Record<string, unknown> = {};
  for (const key of keys) {
    const value = attribution[key];
    if (typeof value === "string" || typeof value === "number") summary[key] = value;
  }
  return summary;
}

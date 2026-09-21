"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "@/components/chrome/error-page.module.css";
import { useTranslator } from "@/i18n/client";
import { reportClientError } from "@/lib/error-reporter";

/**
 * Route-level error boundary.
 *
 * Reports once per error (React runs effects twice in development's strict mode)
 * and offers both a retry and a way out. The reference id is shown so a reviewer
 * or a support conversation can find the matching server log line.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslator();
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (reported.current === error.message) return;
    reported.current = error.message;
    reportClientError({
      error,
      route: typeof window === "undefined" ? "unknown" : window.location.pathname,
    });
  }, [error]);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>{t("error.title")}</h1>
      <p className={styles.body}>{t("error.body")}</p>
      {error.digest ? (
        <p className={styles.reference}>{t("error.reference", { id: error.digest })}</p>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={reset}>
          {t("app.retry")}
        </button>
        <Link className={styles.secondary} href="/">
          {t("story.backToFeed")}
        </Link>
      </div>
    </div>
  );
}

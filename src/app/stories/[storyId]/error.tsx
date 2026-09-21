"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "@/features/story/story.module.css";
import { useTranslator } from "@/i18n/client";
import { reportClientError } from "@/lib/error-reporter";

/**
 * The story viewer's own boundary.
 *
 * A story that cannot be played must not blank the app: this offers a way back
 * to the feed and a retry, and reports the failure with the route rather than
 * with anything about the reader.
 */
export default function StoryError({
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
      route: "/stories/[storyId]",
    });
  }, [error]);

  return (
    <div className={styles.failure}>
      <p>{t("story.failed")}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className={styles.failureAction} onClick={reset}>
          {t("app.retry")}
        </button>
        <Link className={styles.failureAction} href="/">
          {t("story.backToFeed")}
        </Link>
      </div>
    </div>
  );
}

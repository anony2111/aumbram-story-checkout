"use client";

import styles from "./feed.module.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTranslator } from "@/i18n/client";
import type { ReactNode } from "react";

/**
 * One broken card must not take the feed down with it.
 *
 * A boundary per card rather than per list: a malformed promo or a missing image
 * host costs the reader that card and nothing else, and the failure is still
 * reported with the card's id for triage.
 */
export function FeedCardBoundary({ cardId, children }: { cardId: string; children: ReactNode }) {
  const t = useTranslator();

  return (
    <ErrorBoundary
      route={`/feed#${cardId}`}
      fallback={() => <li className={styles.cardError}>{t("feed.cardFailed")}</li>}
    >
      {children}
    </ErrorBoundary>
  );
}

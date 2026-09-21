"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import styles from "./chrome.module.css";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { writeLocaleCookie } from "@/i18n/cookie";
import { useTranslator } from "@/i18n/client";
import type { Locale } from "@/i18n/config";

/**
 * Language switch.
 *
 * Writes the cookie the server reads, then asks the router to re-render from the
 * server. The new language therefore arrives as server-rendered HTML — the same
 * path a first visit takes — instead of being swapped in on the client.
 */
export function LocaleSwitch() {
  const t = useTranslator();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const active = t.locale;

  const choose = (locale: Locale) => {
    if (locale === active) return;
    writeLocaleCookie(locale);
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className={styles.localeSwitch} role="group" aria-label={t("app.language")}>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          className={`${styles.localeOption} ${locale === active ? styles.localeOptionActive : ""}`}
          aria-pressed={locale === active}
          disabled={isPending}
          onClick={() => choose(locale)}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}

/**
 * Locale configuration.
 *
 * The locale is a cookie rather than a URL segment. The assignment needs the
 * *server* to render the right language on first paint, and a cookie gives that
 * without doubling every route. The trade-off — a locale is not shareable in a
 * link, and a cached page must vary on the cookie — is argued in the ADR.
 */

export const LOCALES = ["en", "hi"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "aumbram_locale";

/** A year: this is a preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
};

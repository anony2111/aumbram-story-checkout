import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "./config";
import type { Locale } from "./config";

/**
 * Writes the locale preference the server reads on the next render.
 *
 * Not `httpOnly`, because the client writes it; `SameSite=Lax` so it is not sent
 * on cross-site requests. It holds a two-letter language tag and nothing else, so
 * there is no personal data in it.
 */
export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

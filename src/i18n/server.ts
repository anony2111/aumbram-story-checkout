import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "./config";
import { createTranslator, getDictionary } from "./translate";
import type { Locale } from "./config";
import type { Translator } from "./translate";

/**
 * Server-side locale resolution.
 *
 * Reading the cookie during the server render is what makes the *first paint*
 * Hindi rather than a flash of English followed by a client swap.
 */

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getTranslator(): Promise<Translator> {
  const locale = await getLocale();
  return createTranslator(locale, getDictionary(locale));
}

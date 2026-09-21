import { en } from "./messages/en";
import { hi } from "./messages/hi";
import type { Dictionary, MessageKey, MessageValue } from "./messages/en";
import type { Locale } from "./config";

/**
 * A ~40-line translator instead of an i18n library.
 *
 * The app has one namespace, one plural mechanism and `{brace}` placeholders. A
 * library would add 12-15 KB of client JavaScript to the first load budget for
 * features (namespaces, lazy catalogues, rich text) nothing here uses. The
 * trade-off is recorded in the ADR; if the app grew a second namespace or needed
 * gender/select rules, this would become the wrong call.
 */

export const DICTIONARIES: Record<Locale, Dictionary> = {
  en: en as unknown as Dictionary,
  hi,
};

export type TranslationValues = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

export function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

function selectPlural(
  message: Exclude<MessageValue, string>,
  locale: Locale,
  count: number
): string {
  // Hindi puts 0 and 1 in `one`; English puts only 1 there. Intl knows both.
  const category = new Intl.PluralRules(locale).select(count);
  return message[category] ?? message.other;
}

export interface Translator {
  (key: MessageKey, values?: TranslationValues): string;
  locale: Locale;
}

export function createTranslator(locale: Locale, dictionary: Dictionary): Translator {
  const translate = (key: MessageKey, values?: TranslationValues): string => {
    const message: MessageValue = dictionary[key];
    if (typeof message === "string") return interpolate(message, values);

    const count = values?.count;
    const resolved =
      typeof count === "number"
        ? selectPlural(message, locale, count)
        : message.other;
    return interpolate(resolved, values);
  };

  const translator = translate as Translator;
  translator.locale = locale;
  return translator;
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

// ------------------------------------------------------- date and time

const IST_TIME_ZONE = "Asia/Kolkata";

/**
 * Order timestamps are stored in UTC and always shown in IST, regardless of the
 * device clock or where the reviewer is sitting.
 */
export function formatIST(isoTimestamp: string, locale: Locale): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatDateIST(isoTimestamp: string, locale: Locale): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(date);
}

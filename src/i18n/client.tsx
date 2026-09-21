"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { createTranslator } from "./translate";
import type { Dictionary } from "./messages/en";
import type { Locale } from "./config";
import type { Translator } from "./translate";

/**
 * Client-side translations.
 *
 * Only the active locale's dictionary is serialised into the RSC payload, so the
 * browser never downloads the language it is not reading. It arrives as data
 * rather than as a JavaScript module, which keeps it out of the first-load JS
 * budget.
 */

const I18nContext = createContext<Translator | null>(null);

export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: ReactNode;
}) {
  const translator = useMemo(() => createTranslator(locale, dictionary), [locale, dictionary]);
  return <I18nContext.Provider value={translator}>{children}</I18nContext.Provider>;
}

export function useTranslator(): Translator {
  const translator = useContext(I18nContext);
  if (!translator) throw new Error("useTranslator must be used inside I18nProvider");
  return translator;
}

/** Locale alone, for components that only need `Intl` formatting. */
export function useLocale(): Locale {
  return useTranslator().locale;
}

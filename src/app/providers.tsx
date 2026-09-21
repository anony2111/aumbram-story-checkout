"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/client";
import { ApiRequestError } from "@/lib/api-client";
import type { Dictionary } from "@/i18n/messages/en";
import type { Locale } from "@/i18n/config";

/**
 * Client providers.
 *
 * The query client is created inside the component, once per browser session: a
 * module-level client would be shared between requests on the server and leak one
 * user's data into another's render.
 *
 * Defaults are tuned for a patchy mobile network rather than a desk:
 * - three retries with exponential backoff and jitter, but never on a 4xx, which
 *   will not become true by asking again;
 * - a 30 s stale time, so a back-navigation to the feed paints from cache;
 * - no refetch on window focus — on a phone, focus changes constantly and every
 *   refetch costs someone's data.
 */
export function Providers({
  children,
  locale,
  dictionary,
}: {
  children: ReactNode;
  locale: Locale;
  dictionary: Dictionary;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (error instanceof ApiRequestError && !error.isRetryable) return false;
              return failureCount < 3;
            },
            retryDelay: (attempt) =>
              Math.min(1000 * 2 ** attempt, 8000) + Math.round(Math.random() * 250),
          },
          mutations: { retry: false },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale={locale} dictionary={dictionary}>
        {children}
      </I18nProvider>
    </QueryClientProvider>
  );
}

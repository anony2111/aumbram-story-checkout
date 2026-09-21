"use client";

import { useQuery } from "@tanstack/react-query";
import { isValidPincode } from "@/domain/rules";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { apiRequest } from "@/lib/api-client";
import type { Quote } from "@/domain/quote";

/**
 * The delivery quote for a pincode.
 *
 * Three requirements fall out of using the pincode as the query key rather than
 * managing this by hand:
 *
 *  - requests are debounced, via the trailing pincode value;
 *  - an earlier in-flight request is aborted, because the query's `signal` is
 *    passed to `fetch` and a key change aborts the old one;
 *  - a response can only be applied to the pincode it was asked about, since it
 *    is cached under that key — the stale-response race cannot happen.
 */

const DEBOUNCE_MS = 400;

export interface QuoteQuery {
  quote: Quote | undefined;
  isLoading: boolean;
  isError: boolean;
  /** True while the shopper has typed something the quote has not caught up with. */
  isStale: boolean;
  refetch: () => void;
}

export function useQuote(pincode: string, options: { enabled?: boolean } = {}): QuoteQuery {
  const debouncedPincode = useDebouncedValue(pincode, DEBOUNCE_MS);
  const enabled = (options.enabled ?? true) && isValidPincode(debouncedPincode);

  const query = useQuery({
    queryKey: ["quote", debouncedPincode],
    queryFn: async ({ signal }) =>
      (
        await apiRequest<Quote>("/checkout/quote", {
          method: "POST",
          body: JSON.stringify({ pincode: debouncedPincode }),
          signal,
        })
      ).data,
    enabled,
    // A quote is a price and a promise to deliver; it is never served from cache.
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });

  return {
    quote: query.data,
    isLoading: enabled && query.isPending,
    isError: query.isError,
    isStale: pincode !== debouncedPincode && isValidPincode(pincode),
    refetch: () => void query.refetch(),
  };
}

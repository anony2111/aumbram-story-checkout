"use client";

import { useEffect, useState } from "react";

/**
 * Trails a value by `delayMs`.
 *
 * Used for the pincode: six digits typed on a phone keypad would otherwise be up
 * to six quote requests, five of which are for pincodes nobody meant.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

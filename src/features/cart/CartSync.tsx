"use client";

import { useEffect } from "react";
import { useCartStore } from "./cart-store";
import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Keeps the local cart and the server cart converging.
 *
 * Mounted once in the root layout, renders nothing. It drains the queue when the
 * app loads and again whenever the connection comes back — the two moments at
 * which offline work needs to reach the server.
 */
export function CartSync() {
  const online = useOnlineStatus();
  const hydrated = useCartStore((state) => state.hydrated);
  const sync = useCartStore((state) => state.sync);

  useEffect(() => {
    if (!hydrated || !online) return;
    void sync();
  }, [hydrated, online, sync]);

  return null;
}

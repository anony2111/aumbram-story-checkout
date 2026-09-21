"use client";

import { useEffect, useState } from "react";

/**
 * Whether the browser thinks it can reach the network.
 *
 * Starts optimistic so the server render and the first client render agree, then
 * corrects itself in an effect. `navigator.onLine` is a weak signal — it means
 * "an interface is up", not "requests succeed" — so it is used to decide when to
 * *try* syncing and to disable order placement, never as proof that a request
 * will work. A failed request is the real evidence, and the queue handles that.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}

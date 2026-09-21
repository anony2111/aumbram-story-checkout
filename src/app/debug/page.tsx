"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useState } from "react";
import styles from "./page.module.css";
import { apiGet, apiPost, ApiRequestError } from "@/lib/api-client";
import type { DebugCommand, DebugState } from "@/server/debug";

/**
 * Fault injection console, served at both /debug and /__debug.
 *
 * Deliberately plain: it is a reviewer's control panel, not a product surface.
 * Every switch maps to one field of the mock backend's in-memory debug settings,
 * and "Reset" drops the whole overlay back to seed state.
 */

const LATENCY_PROFILES = [
  { value: "off", label: "off — no injected delay" },
  { value: "fast", label: "fast — 50-150 ms" },
  { value: "slow4g", label: "slow4g — 600-2500 ms" },
  { value: "fixed", label: "fixed — the value below" },
] as const;

export default function DebugPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  const debugQuery = useQuery({
    queryKey: ["debug"],
    queryFn: ({ signal }) => apiGet<DebugState>("/debug", { signal }),
    staleTime: 0,
  });

  const command = useMutation({
    mutationFn: (input: DebugCommand) =>
      apiPost<{ state: DebugState; message: string }>("/debug", input),
    onSuccess: (result) => {
      queryClient.setQueryData(["debug"], result.state);
      setMessage(result.message);
      // Everything else the app knows may have just changed under it.
      void queryClient.invalidateQueries({ queryKey: ["cart"] });
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const send = useCallback(
    (input: DebugCommand) => {
      command.mutate(input);
    },
    [command]
  );

  const state = debugQuery.data ?? null;
  const busy = command.isPending;
  const failure = debugQuery.error ?? command.error;
  const error =
    failure instanceof ApiRequestError
      ? failure.message
      : failure instanceof Error
        ? failure.message
        : "";

  const settings = state?.settings;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Fault injection</h1>
      <p className={styles.lede}>
        Dev console for the mock backend. Settings are process-wide and survive reloads;
        <strong> Reset </strong>
        restores seed state. Disable the whole console with <code>AUMBRAM_DEBUG=0</code>.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Network</h2>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="latency">
            Latency profile
            <span className={styles.hint}>Applied to every /api/v1 call before it runs.</span>
          </label>
          <div className={styles.control}>
            <select
              id="latency"
              className={styles.select}
              value={settings?.latencyProfile ?? "fast"}
              disabled={!settings || busy}
              onChange={(event) =>
                send({
                  action: "settings",
                  settings: {
                    latencyProfile: event.target.value as DebugState["settings"]["latencyProfile"],
                  },
                })
              }
            >
              {LATENCY_PROFILES.map((profile) => (
                <option key={profile.value} value={profile.value}>
                  {profile.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="fixedLatency">
            Fixed latency (ms)
          </label>
          <div className={styles.control}>
            <input
              id="fixedLatency"
              className={styles.number}
              type="number"
              min={0}
              max={30000}
              step={100}
              value={settings?.fixedLatencyMs ?? 800}
              disabled={!settings || busy}
              onChange={(event) =>
                send({
                  action: "settings",
                  settings: { fixedLatencyMs: Number(event.target.value) },
                })
              }
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="failureRate">
            Failure rate
            <span className={styles.hint}>
              Probability of a 503 with <code>retryAfterMs</code>. /api/v1/debug is exempt.
            </span>
          </label>
          <div className={styles.control}>
            <input
              id="failureRate"
              className={styles.number}
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={settings?.failureRate ?? 0}
              disabled={!settings || busy}
              onChange={(event) =>
                send({
                  action: "settings",
                  settings: { failureRate: Number(event.target.value) },
                })
              }
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Failure scenarios</h2>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="dropOrder">
            Drop next order response
            <span className={styles.hint}>
              The next POST /orders commits, then never answers. The client must retry with the
              same key, or look the key up.
            </span>
          </label>
          <div className={styles.control}>
            <input
              id="dropOrder"
              type="checkbox"
              checked={settings?.dropNextOrderResponse ?? false}
              disabled={!settings || busy}
              onChange={(event) =>
                send({
                  action: "settings",
                  settings: { dropNextOrderResponse: event.target.checked },
                })
              }
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="live">
            Live updates
            <span className={styles.hint}>Replays live-updates.jsonl at 2/s over SSE.</span>
          </label>
          <div className={styles.control}>
            <input
              id="live"
              type="checkbox"
              checked={settings?.liveUpdatesEnabled ?? true}
              disabled={!settings || busy}
              onChange={(event) =>
                send({
                  action: "settings",
                  settings: { liveUpdatesEnabled: event.target.checked },
                })
              }
            />
          </div>
        </div>

        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => send({ action: "bumpPrice" })}
          >
            Raise a cart price by ₹100
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            disabled={busy}
            onClick={() => send({ action: "reset" })}
          >
            Reset to seed state
          </button>
        </div>

        <p className={error ? `${styles.status} ${styles.error}` : styles.status} role="status">
          {error || message}
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>State</h2>
        <dl className={styles.grid}>
          <dt>Build id</dt>
          <dd>{state?.buildId ?? "…"}</dd>
          <dt>Cart lines</dt>
          <dd>{state?.cartLineCount ?? "…"}</dd>
          <dt>Orders placed</dt>
          <dd>{state?.orderCount ?? "…"}</dd>
          <dt>Idempotency keys</dt>
          <dd>{state?.idempotencyKeyCount ?? "…"}</dd>
          <dt>Stock overrides</dt>
          <dd>{state?.stockOverrides.length ?? "…"}</dd>
          <dt>Price overrides</dt>
          <dd>{state?.priceOverrides.length ?? "…"}</dd>
          <dt>Telemetry received</dt>
          <dd>{state?.telemetryCount ?? "…"}</dd>
        </dl>
      </section>

      <Link className={styles.back} href="/">
        Back to the feed
      </Link>
    </main>
  );
}

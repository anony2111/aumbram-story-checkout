"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./confirmation.module.css";
import { formatINR } from "@/domain/money";
import { useTranslator } from "@/i18n/client";
import { formatIST } from "@/i18n/translate";
import { apiGet, apiRequest } from "@/lib/api-client";
import type { Order, OrderStatus } from "@/domain/types";
import type { ConfirmationBundle } from "@/server/rsc";

/**
 * The confirmation.
 *
 * Server-rendered from the idempotency key, so a refresh — or a link sent to
 * someone — reads the orders back from the server rather than from whatever
 * happened to be in memory when the tab last rendered.
 *
 * The mock UPI step is the only client work here: it asks the backend to settle,
 * then polls each order with a widening interval and stops as soon as nothing is
 * pending. A poll that never stops is how a backgrounded tab eats a battery.
 */

const POLL_STEPS_MS = [800, 1200, 2000, 3000, 5000];

export function OrderConfirmation({ bundle }: { bundle: ConfirmationBundle }) {
  const t = useTranslator();
  const [orders, setOrders] = useState<Order[]>(bundle.orders);
  const [paying, setPaying] = useState(false);
  const pollIndex = useRef(0);

  const awaitingPayment = orders.some((order) => order.status === "pending_payment");
  const payable = orders.reduce((sum, order) => sum + order.total.amount, 0);

  const refreshOrders = useCallback(async () => {
    const fresh = await Promise.all(
      orders.map((order) =>
        apiGet<Order>(`/orders/${order.id}`).catch(() => order)
      )
    );
    setOrders(fresh);
    return fresh;
  }, [orders]);

  // Poll only while something is actually pending, with a widening interval.
  useEffect(() => {
    if (!paying || !awaitingPayment) return;
    const wait = POLL_STEPS_MS[Math.min(pollIndex.current, POLL_STEPS_MS.length - 1)] ?? 5000;
    const timer = setTimeout(() => {
      pollIndex.current += 1;
      void refreshOrders();
    }, wait);
    return () => clearTimeout(timer);
  }, [paying, awaitingPayment, refreshOrders, orders]);

  useEffect(() => {
    if (paying && !awaitingPayment) setPaying(false);
  }, [paying, awaitingPayment]);

  const pay = async () => {
    const first = orders[0];
    if (!first) return;
    setPaying(true);
    pollIndex.current = 0;
    // One payment settles every order the key produced, as a real gateway
    // callback would for a single payment across a split cart.
    await apiRequest(`/orders/${first.id}/pay`, { method: "POST" }).catch(() => undefined);
  };

  if (orders.length === 0) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>{t("order.notFound")}</p>
        <Link className={styles.secondaryAction} href="/">
          {t("order.continueShopping")}
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="confirmation-page">
      <h1 className={styles.title} data-testid="confirmation-title">
        {t("order.confirmedTitle", { count: orders.length })}
      </h1>

      {orders.map((order) => {
        const creatorHandle = order.attribution.creatorId
          ? bundle.creatorHandles[order.attribution.creatorId]
          : undefined;

        return (
          <section className={styles.order} key={order.id} data-testid="order" data-order-id={order.id}>
            <p className={styles.orderHeader}>
              <span className={styles.orderId}>{t("order.number", { id: order.id })}</span>
              <span className={styles.status} data-testid="order-status">
                {t(`order.status.${order.status}` as StatusKey)}
              </span>
            </p>
            <p className={styles.vendor}>
              {t("cart.soldBy", { vendor: bundle.vendorNames[order.vendorId] ?? order.vendorId })}
            </p>

            {order.lines.map((line) => (
              <p className={styles.line} key={line.variantId}>
                <span>
                  {bundle.lineTitles[line.variantId] ?? line.variantId} × {line.quantity}
                </span>
                <span>{formatINR(line.unitPrice)}</span>
              </p>
            ))}

            <div className={styles.totals}>
              <p className={styles.totalsRow}>
                <span>{t("checkout.subtotal")}</span>
                <span>{formatINR(order.subtotal)}</span>
              </p>
              <p className={styles.totalsRow}>
                <span>{t("checkout.delivery")}</span>
                <span>
                  {order.shippingFee.amount === 0
                    ? t("checkout.freeDelivery")
                    : formatINR(order.shippingFee)}
                </span>
              </p>
              <p className={styles.totalsRowStrong}>
                <span>{t("checkout.total")}</span>
                <span>{formatINR(order.total)}</span>
              </p>
            </div>

            {creatorHandle ? (
              <p
                className={styles.attribution}
                data-testid="order-attribution"
                data-story-id={order.attribution.storyId ?? ""}
              >
                {t("order.attributedTo", { creatorHandle })}
              </p>
            ) : null}

            <p className={styles.placedAt} data-testid="order-placed-at">
              {t("order.placedAt", { datetime: formatIST(order.createdAt, t.locale) })}
            </p>
          </section>
        );
      })}

      {awaitingPayment ? (
        <button
          type="button"
          className={styles.primaryAction}
          data-testid="pay-now"
          disabled={paying}
          onClick={() => void pay()}
        >
          {paying
            ? t("order.paying")
            : t("order.payNow", { total: formatINR({ amount: payable, currency: "INR" }) })}
        </button>
      ) : null}

      <Link className={styles.secondaryAction} href="/">
        {t("order.continueShopping")}
      </Link>
    </div>
  );
}

type StatusKey = `order.status.${OrderStatus}`;

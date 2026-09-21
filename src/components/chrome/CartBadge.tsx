"use client";

import Link from "next/link";
import styles from "./chrome.module.css";
import { useCart } from "@/features/cart/cart-queries";
import { useTranslator } from "@/i18n/client";

/**
 * Cart link and item count, present on every surface.
 *
 * The count comes from the cart query, so it reflects optimistic changes the
 * moment they are applied rather than after a round trip.
 *
 * The story viewer has no app bar — it is deliberately immersive — so it renders
 * this in its own header with the `overlay` tone, which draws in white over the
 * photograph instead of on the light chrome.
 */
export function CartBadge({ tone = "bar" }: { tone?: "bar" | "overlay" }) {
  const t = useTranslator();
  const { data } = useCart();
  const count = data?.itemCount ?? 0;

  return (
    <Link
      className={tone === "overlay" ? styles.iconButtonOverlay : styles.iconButton}
      href="/cart"
      aria-label={count > 0 ? t("app.cartWithCount", { count }) : t("app.cart")}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 6h2l1.6 9.2a2 2 0 0 0 2 1.8h6.9a2 2 0 0 0 2-1.6L20 9H7"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="20" r="1.3" fill="currentColor" />
        <circle cx="17" cy="20" r="1.3" fill="currentColor" />
      </svg>
      {count > 0 ? (
        <span className={styles.badge} data-testid="cart-badge">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

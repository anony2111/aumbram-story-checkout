"use client";

import { useEffect, useState } from "react";
import styles from "./quick-add.module.css";
import { useAddToCart } from "@/features/cart/cart-queries";
import { useTranslator } from "@/i18n/client";
import { useUiStore } from "@/stores/ui-store";
import type { Attribution } from "@/domain/types";

/**
 * Quick-add from a card or a story, without leaving the surface you are on.
 *
 * One variant in stock is a single tap. Anything else has to go through the
 * picker, because adding "a" size M when there are three is a guess we would be
 * making with someone's money.
 */

export interface QuickAddButtonProps {
  productId: string;
  /** Set only when exactly one variant is purchasable. */
  quickAddVariantId: string | null;
  soldOut: boolean;
  /** Used for the accessible name, so a screen reader hears which product. */
  title: string;
  attribution?: Attribution;
  variant?: "card" | "inline";
}

const ADDED_FEEDBACK_MS = 1600;

export function QuickAddButton({
  productId,
  quickAddVariantId,
  soldOut,
  title,
  attribution,
  variant = "card",
}: QuickAddButtonProps) {
  const t = useTranslator();
  const openProductSheet = useUiStore((state) => state.openProductSheet);
  const addToCart = useAddToCart();
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), ADDED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [justAdded]);

  const needsPicker = quickAddVariantId === null;

  const handleClick = () => {
    if (soldOut) return;
    if (needsPicker) {
      openProductSheet({ productId, attribution: attribution ?? {} });
      return;
    }
    addToCart.mutate(
      { variantId: quickAddVariantId, attribution: attribution ?? {} },
      { onSuccess: () => setJustAdded(true) }
    );
  };

  const label = soldOut
    ? t("product.soldOut")
    : justAdded
      ? t("product.added")
      : needsPicker
        ? t("product.choose")
        : t("product.quickAdd");

  return (
    <button
      type="button"
      className={variant === "card" ? styles.button : styles.inlineButton}
      data-state={justAdded ? "added" : undefined}
      disabled={soldOut || addToCart.isPending}
      aria-label={soldOut ? undefined : t("product.quickAddNamed", { title })}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}

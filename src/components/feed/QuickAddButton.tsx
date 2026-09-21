"use client";

import { useEffect, useState } from "react";
import styles from "./quick-add.module.css";
import { stockState } from "@/domain/display";
import { useCartStore } from "@/features/cart/cart-store";
import { useTranslator } from "@/i18n/client";
import { useUiStore } from "@/stores/ui-store";
import type { ProductCardView } from "@/domain/api";
import type { Attribution } from "@/domain/types";

/**
 * Quick-add from a card or a story, without leaving the surface you are on.
 *
 * One variant in stock is a single tap. Anything else has to go through the
 * picker, because adding "a" size M when there are three is a guess we would be
 * making with someone's money.
 *
 * The card carries everything a cart line needs to render, so a tap taken
 * offline produces a complete line rather than a placeholder waiting on a
 * request that is not going to happen.
 */

export interface QuickAddButtonProps {
  card: ProductCardView;
  attribution?: Attribution;
  variant?: "card" | "inline";
}

const ADDED_FEEDBACK_MS = 1600;

export function QuickAddButton({ card, attribution, variant = "card" }: QuickAddButtonProps) {
  const t = useTranslator();
  const openProductSheet = useUiStore((state) => state.openProductSheet);
  const add = useCartStore((state) => state.add);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), ADDED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [justAdded]);

  const soldOut = stockState(card.totalStock).kind === "sold_out";
  const quickAddVariantId = card.quickAddVariantId;
  const needsPicker = quickAddVariantId === null;

  const handleClick = () => {
    if (soldOut) return;
    if (needsPicker) {
      openProductSheet({ productId: card.id, attribution: attribution ?? {} });
      return;
    }
    add({
      variantId: quickAddVariantId,
      ...(attribution ? { attribution } : {}),
      preview: {
        productId: card.id,
        productTitle: card.title,
        imageUrl: card.image?.url ?? null,
        // The single-variant case, so there is nothing to choose between.
        variantOptions: {},
        unitPrice: card.priceRange.min,
        stock: card.totalStock,
        vendor: card.vendor,
      },
    });
    setJustAdded(true);
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
      data-testid="quick-add"
      data-picker={needsPicker ? "true" : "false"}
      data-state={justAdded ? "added" : undefined}
      disabled={soldOut}
      aria-label={soldOut ? undefined : t("product.quickAddNamed", { title: card.title })}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}

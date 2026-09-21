"use client";

import styles from "./feed.module.css";
import { QuickAddButton } from "./QuickAddButton";
import { stockState } from "@/domain/display";
import { useLiveTotalStock } from "@/features/live/live-store";
import { useTranslator } from "@/i18n/client";
import type { ProductCardView } from "@/domain/api";
import type { Attribution } from "@/domain/types";

/**
 * The one interactive strip of a product card: the stock hint and quick-add.
 *
 * It is the only client component on the card, and it subscribes to just this
 * product's variants. A stock update for something else on the page re-renders
 * nothing here.
 */
export function ProductCardFooter({
  card,
  attribution,
}: {
  card: ProductCardView;
  attribution?: Attribution;
}) {
  const t = useTranslator();
  const totalStock = useLiveTotalStock(card.variantIds, card.totalStock);
  const stock = stockState(totalStock);

  return (
    <div className={styles.footerRow}>
      {stock.kind === "low" ? (
        <span className={styles.stockLow} data-testid="stock-hint">
          {t("product.onlyLeft", { count: stock.count })}
        </span>
      ) : stock.kind === "sold_out" ? (
        <span className={styles.stockSoldOut} data-testid="stock-hint">
          {t("product.soldOut")}
        </span>
      ) : (
        <span />
      )}
      <QuickAddButton
        card={{ ...card, totalStock }}
        {...(attribution ? { attribution } : {})}
      />
    </div>
  );
}

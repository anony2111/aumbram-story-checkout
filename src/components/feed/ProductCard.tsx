import Image from "next/image";
import styles from "./feed.module.css";
import { QuickAddButton } from "./QuickAddButton";
import { displayPrice, stockState } from "@/domain/display";
import { formatINR } from "@/domain/money";
import type { ProductCardView } from "@/domain/api";
import type { Translator } from "@/i18n/translate";

/**
 * A product card. A server component, so the only JavaScript it costs is the
 * quick-add button.
 *
 * Display rules come from `domain/display.ts` rather than from inline conditions,
 * so "From", the floored discount and the stock hint are tested once.
 */

export interface ProductCardProps {
  card: ProductCardView;
  t: Translator;
  /** The LCP candidate. Exactly one card per page should set this. */
  priority?: boolean;
  reason?: "trending" | "followed_vendor" | "similar" | undefined;
}

/** The column is capped at 448px, so one image width covers every phone. */
const CARD_IMAGE_SIZES = "(max-width: 448px) 100vw, 448px";

export function ProductCard({ card, t, priority = false, reason }: ProductCardProps) {
  const price = displayPrice(card.priceRange, card.mrp);
  const stock = stockState(card.totalStock);
  const soldOut = stock.kind === "sold_out";

  return (
    <article className={styles.card} data-testid="product-card" data-product-id={card.id}>
      {card.image ? (
        <div className={styles.media}>
          <Image
            className={styles.mediaImage}
            src={card.image.url}
            alt={card.title}
            width={card.image.width}
            height={card.image.height}
            sizes={CARD_IMAGE_SIZES}
            priority={priority}
            // Everything below the fold waits until it is near the viewport.
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
          />
          {price.discountPercent !== null ? (
            <span className={styles.badge}>
              {t("product.discount", { percent: price.discountPercent })}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={styles.body}>
        {reason ? <p className={styles.reason}>{t(`feed.reason.${reason}`)}</p> : null}
        <h3 className={styles.title}>{card.title}</h3>

        <p className={styles.priceRow}>
          <span className={styles.price}>
            {price.prefixFrom ? <span className={styles.fromPrefix}>{t("product.from")}</span> : null}
            {formatINR(price.price)}
          </span>
          {price.mrp ? (
            <span className={styles.mrp}>{t("product.mrp", { price: formatINR(price.mrp) })}</span>
          ) : null}
          {price.discountPercent !== null ? (
            <span className={styles.discount}>
              {t("product.discount", { percent: price.discountPercent })}
            </span>
          ) : null}
        </p>

        <div className={styles.footerRow}>
          {stock.kind === "low" ? (
            <span className={styles.stockLow}>{t("product.onlyLeft", { count: stock.count })}</span>
          ) : soldOut ? (
            <span className={styles.stockSoldOut}>{t("product.soldOut")}</span>
          ) : (
            <span />
          )}
          <QuickAddButton
            productId={card.id}
            quickAddVariantId={card.quickAddVariantId}
            soldOut={soldOut}
            title={card.title}
          />
        </div>
      </div>
    </article>
  );
}

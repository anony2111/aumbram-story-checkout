import Image from "next/image";
import styles from "./feed.module.css";
import { ProductCardFooter } from "./ProductCardFooter";
import { displayPrice } from "@/domain/display";
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

/**
 * Below Next's default of 75.
 *
 * These are photographs of textiles and pottery on a 400-pixel-wide column: at
 * 60 the difference is invisible at arm's length, and it takes about a third off
 * the one image the Largest Contentful Paint is waiting for. On a 1.6 Mbps
 * connection that is the cheapest second available.
 */
const CARD_IMAGE_QUALITY = 60;

export function ProductCard({ card, t, priority = false, reason }: ProductCardProps) {
  const price = displayPrice(card.priceRange, card.mrp);

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
            quality={CARD_IMAGE_QUALITY}
            priority={priority}
            // Everything below the fold waits until it is near the viewport.
            loading={priority ? "eager" : "lazy"}
            /*
             * Explicitly low for everything that is not the LCP candidate.
             * Chrome starts lazy images well before they scroll into view, and
             * at 1.6 Mbps those requests take bandwidth away from the one image
             * the Largest Contentful Paint is actually waiting for.
             */
            fetchPriority={priority ? "high" : "low"}
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

        <ProductCardFooter card={card} />
      </div>
    </article>
  );
}

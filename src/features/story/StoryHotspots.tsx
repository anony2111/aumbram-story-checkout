"use client";

import styles from "./story.module.css";
import { placeHotspot } from "@/domain/hotspot";
import type { SafeArea } from "@/domain/hotspot";
import { formatINR } from "@/domain/money";
import type { ProductDetail } from "@/domain/api";
import type { TaggedProduct } from "@/domain/types";
import type { Translator } from "@/i18n/translate";

/**
 * Product hotspots for the current segment.
 *
 * Positions come from `domain/hotspot.ts`, which maps the tag's 0-1 coordinates
 * on the original 9:16 frame through the `object-fit: cover` crop and then clamps
 * them into the area below the progress bars and above the caption.
 */

/**
 * Kept clear: progress bars and the header row at the top, the caption at the
 * bottom, plus a thumb's width at each side.
 */
const SAFE_AREA: SafeArea = { top: 76, right: 16, bottom: 92, left: 16 };

export function StoryHotspots({
  tags,
  products,
  container,
  t,
  onOpen,
}: {
  tags: TaggedProduct[];
  products: ProductDetail[];
  container: { width: number; height: number };
  t: Translator;
  onOpen: (productId: string) => void;
}) {
  if (container.width === 0 || container.height === 0) return null;

  return (
    <>
      {tags.map((tag) => {
        const product = products.find((candidate) => candidate.id === tag.productId);
        if (!product) return null;

        const placement = placeHotspot({ x: tag.x, y: tag.y, container, safeArea: SAFE_AREA });

        return (
          <button
            key={`${tag.productId}-${tag.x}-${tag.y}`}
            type="button"
            className={styles.hotspot}
            style={{ left: placement.left, top: placement.top }}
            data-testid="story-hotspot"
            data-product-id={product.id}
            data-clamped={placement.clamped ? "true" : undefined}
            // "Upcycled Dhurrie, ₹1,399" — a dot alone tells a screen reader nothing.
            aria-label={t("story.hotspot", {
              title: product.title,
              price: formatINR(product.priceRange.min),
            })}
            onClick={() => onOpen(product.id)}
          >
            <span className={styles.hotspotDot} />
          </button>
        );
      })}
    </>
  );
}

import Image from "next/image";
import styles from "./feed.module.css";
import type { Creator } from "@/domain/types";
import type { ProductCardView } from "@/domain/api";

/**
 * Creator card, intentionally minimal — the brief puts creator-card polish out of
 * scope, and the bytes are better spent on the story viewer.
 */
export function CreatorCard({
  creator,
  sampleProducts,
}: {
  creator: Creator;
  sampleProducts: ProductCardView[];
}) {
  return (
    <article className={styles.card} data-testid="creator-card">
      <div className={styles.creatorCard}>
        <Image
          className={styles.avatar}
          src={creator.avatarUrl}
          alt=""
          width={44}
          height={44}
          loading="lazy"
        />
        <div>
          <p className={styles.creatorName}>
            {creator.displayName} {creator.verified ? "·" : null}
          </p>
          <p className={styles.creatorMeta}>{creator.handle}</p>
        </div>
      </div>
      {sampleProducts.length > 0 ? (
        <ul className={styles.storyProducts}>
          {sampleProducts.slice(0, 4).map((product) =>
            product.image ? (
              <li className={styles.storyProduct} key={product.id}>
                <Image
                  className={styles.storyProductImage}
                  src={product.image.url}
                  alt={product.title}
                  width={64}
                  height={64}
                  loading="lazy"
                />
              </li>
            ) : null
          )}
        </ul>
      ) : null}
    </article>
  );
}

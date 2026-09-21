import Image from "next/image";
import Link from "next/link";
import styles from "./feed.module.css";
import { formatINR } from "@/domain/money";
import type { Creator } from "@/domain/types";
import type { ProductCardView, StoryCardView } from "@/domain/api";
import type { Translator } from "@/i18n/translate";

/**
 * A story card.
 *
 * The cover is the same URL the full-screen viewer paints first, so tapping in
 * shows the frame from cache before any data arrives — which is what makes the
 * transition feel instant on a slow connection.
 */

export interface StoryCardProps {
  story: StoryCardView;
  creator: Creator;
  products: ProductCardView[];
  t: Translator;
  priority?: boolean;
}

const STORY_IMAGE_SIZES = "(max-width: 448px) 100vw, 448px";

export function StoryCard({ story, creator, products, t, priority = false }: StoryCardProps) {
  return (
    <article className={styles.card} data-testid="story-card" data-story-id={story.id}>
      <Link className={styles.storyLink} href={`/stories/${story.id}`} prefetch={false}>
        <div className={styles.storyMedia}>
          <Image
            className={styles.storyImage}
            src={story.coverUrl}
            alt={story.caption}
            width={720}
            height={900}
            sizes={STORY_IMAGE_SIZES}
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
          />
          {story.taggedProductCount > 0 ? (
            <span className={styles.storyTag}>
              {t("feed.storyProducts", { count: story.taggedProductCount })}
            </span>
          ) : null}
          <div className={styles.storyScrim}>
            <h3 className={styles.storyCaption}>{story.caption}</h3>
            <p className={styles.storyMeta}>
              <Image
                className={styles.avatar}
                src={creator.avatarUrl}
                alt=""
                width={24}
                height={24}
                loading="lazy"
              />
              <span>{creator.handle}</span>
            </p>
          </div>
        </div>
      </Link>

      {products.length > 0 ? (
        <ul className={styles.storyProducts}>
          {products.slice(0, 6).map((product) => (
            <li className={styles.storyProduct} key={product.id}>
              {product.image ? (
                <Image
                  className={styles.storyProductImage}
                  src={product.image.url}
                  alt={product.title}
                  width={64}
                  height={64}
                  loading="lazy"
                />
              ) : null}
              <p className={styles.storyProductPrice}>{formatINR(product.priceRange.min)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

import styles from "./feed.module.css";

/**
 * The placeholder streamed in place of the below-the-fold cards.
 *
 * It reserves the same aspect ratio as a real card, so the content that replaces
 * it does not move anything — the CLS budget is 0.1 for the whole page.
 */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <li className={styles.skeletonCard} key={index} aria-hidden="true">
          <div className={styles.skeletonMedia} />
          <div className={styles.skeletonLine} />
          <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
        </li>
      ))}
    </>
  );
}

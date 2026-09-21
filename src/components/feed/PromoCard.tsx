import Image from "next/image";
import styles from "./feed.module.css";
import { isSafeDeeplink } from "@/domain/display";
import { formatDateIST } from "@/i18n/translate";
import type { Translator } from "@/i18n/translate";

/**
 * Promo card.
 *
 * The deeplink arrives as feed data and is validated against our own scheme
 * before it becomes an href. An unvalidated one is an open redirect at best and a
 * `javascript:` injection at worst; an invalid one degrades to plain text rather
 * than to a link that goes somewhere we did not choose.
 */
export function PromoCard({
  title,
  imageUrl,
  deeplink,
  endsAt,
  t,
}: {
  title: string;
  imageUrl: string;
  deeplink: string;
  endsAt: string;
  t: Translator;
}) {
  const safeHref = isSafeDeeplink(deeplink) ? deeplink : null;

  const content = (
    <>
      <Image
        className={styles.promoImage}
        src={imageUrl}
        alt={title}
        width={1200}
        height={600}
        sizes="(max-width: 448px) 100vw, 448px"
        loading="lazy"
      />
      <p className={styles.promoTitle}>
        {title}
        <span className={styles.reason}> · {t("feed.promoEnds", { date: formatDateIST(endsAt, t.locale) })}</span>
      </p>
    </>
  );

  return (
    <article className={styles.card} data-testid="promo-card">
      {safeHref ? (
        <a className={styles.promo} href={safeHref} rel="noopener noreferrer">
          {content}
        </a>
      ) : (
        <div className={styles.promo}>{content}</div>
      )}
    </article>
  );
}

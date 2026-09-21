"use client";

import Link from "next/link";
import styles from "./cart.module.css";
import { useCartStore } from "./cart-store";
import { useCartView } from "./use-cart-view";
import { formatINR, moneyEquals, scaleMoney } from "@/domain/money";
import { MAX_LINE_QUANTITY } from "@/domain/rules";
import { useTranslator } from "@/i18n/client";
import { useOnlineStatus } from "@/lib/use-online-status";
import type { ProjectedLine } from "./cart-projection";
import type { LineProblem } from "./cart-store";
import type { Translator } from "@/i18n/translate";

/**
 * The cart.
 *
 * Lines are grouped by vendor because that is how they will be ordered — one
 * order per seller — so the split at checkout is not a surprise. Everything the
 * shopper does here is applied locally first and queued; the row's own state
 * says whether the server has caught up.
 */
export function CartView() {
  const t = useTranslator();
  const online = useOnlineStatus();
  const cart = useCartView();
  const problems = useCartStore((state) => state.problems);
  const queueLength = useCartStore((state) => state.queue.length);
  const hydrated = useCartStore((state) => state.hydrated);

  const problemCount = Object.keys(problems).length;
  const groups = groupByVendor(cart.lines);
  const empty = hydrated && cart.lines.length === 0;

  /*
   * The banners render whether or not there are lines. Going offline before the
   * first read of the server cart lands would otherwise show a bare "your cart
   * is empty" — which is not only unhelpful, it is probably a lie.
   */
  const banners = (
    <>
      {!online ? (
        <p className={styles.noticeOffline} role="status" data-testid="offline-banner">
          {t("offline.banner")}
        </p>
      ) : null}

      {queueLength > 0 ? (
        <p className={styles.noticePending} role="status" data-testid="pending-banner">
          {t("cart.pendingCount", { count: queueLength })}
        </p>
      ) : null}

      {problemCount > 0 ? (
        <p className={styles.noticeProblem} role="alert" data-testid="cart-problems">
          {t("cart.resolveFirst")}
        </p>
      ) : null}
    </>
  );

  if (empty) {
    return (
      <div className={styles.page} data-testid="cart-page">
        <h1 className={styles.title}>{t("cart.title")}</h1>
        {banners}
        <div className={styles.empty}>
          <p>{t("cart.empty")}</p>
          <Link className={styles.emptyLink} href="/">
            {t("cart.emptyAction")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="cart-page">
      <h1 className={styles.title}>
        {t("cart.title")}
        <span className={styles.count}>{t("cart.lineCount", { count: cart.itemCount })}</span>
      </h1>

      {banners}

      {groups.map((group) => (
        <section className={styles.group} key={group.vendorId} data-vendor-id={group.vendorId}>
          <h2 className={styles.groupHeader}>{t("cart.soldBy", { vendor: group.vendorName })}</h2>
          {group.lines.map((line) => (
            <CartLineRow key={line.variantId} line={line} problem={problems[line.variantId]} t={t} />
          ))}
        </section>
      ))}

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span>{t("cart.subtotal")}</span>
          <span className={styles.summaryTotal} data-testid="cart-subtotal">
            {formatINR(cart.subtotal)}
          </span>
        </div>
        {problemCount > 0 ? (
          <span className={styles.checkoutButtonDisabled} aria-disabled="true">
            {t("cart.checkout")}
          </span>
        ) : (
          <Link className={styles.checkoutButton} href="/checkout" data-testid="go-to-checkout">
            {t("cart.checkout")}
          </Link>
        )}
      </div>
    </div>
  );
}

function CartLineRow({
  line,
  problem,
  t,
}: {
  line: ProjectedLine;
  problem: LineProblem | undefined;
  t: Translator;
}) {
  const setQuantity = useCartStore((state) => state.setQuantity);
  const remove = useCartStore((state) => state.remove);

  // Price at add versus price now: the shopper should not discover a change at
  // the payment step.
  const priceMoved = !moneyEquals(line.priceAtAdd, line.unitPrice);
  const ceiling = Math.min(MAX_LINE_QUANTITY, line.stock);
  const options = Object.values(line.variantOptions).join(" · ");

  return (
    <div className={styles.line} data-testid="cart-line" data-variant-id={line.variantId}>
      {line.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.lineImage} src={line.imageUrl} alt="" width={72} height={72} />
      ) : (
        <div className={styles.lineImage} />
      )}

      <div className={styles.lineBody}>
        <p className={styles.lineTitle}>{line.productTitle}</p>
        {options ? <p className={styles.lineOptions}>{options}</p> : null}

        <p className={styles.linePrices}>
          <span className={styles.linePrice}>
            {formatINR(scaleMoney(line.unitPrice, line.quantity))}
          </span>
          {priceMoved ? (
            <span className={styles.lineWasPrice}>
              {t("cart.priceWas", { price: formatINR(line.priceAtAdd) })}
            </span>
          ) : null}
        </p>
        {priceMoved ? <p className={styles.priceChangedNote}>{t("cart.priceChanged")}</p> : null}

        {line.attribution.storyId ? (
          <Link
            className={styles.fromStory}
            href={`/stories/${line.attribution.storyId}`}
            data-testid="cart-line-attribution"
            data-story-id={line.attribution.storyId}
            data-creator-id={line.attribution.creatorId ?? ""}
          >
            {t("cart.fromStory")}
          </Link>
        ) : null}

        {problem ? (
          <p className={styles.problemTag} role="alert" data-testid="cart-line-problem">
            {problem.code === "OUT_OF_STOCK"
              ? problem.available && problem.available > 0
                ? t("cart.outOfStock", { count: problem.available })
                : t("cart.outOfStockNone")
              : t("sheet.addFailed")}
          </p>
        ) : line.pending ? (
          <span className={styles.pendingTag} data-testid="cart-line-pending">
            {t("cart.pending")}
          </span>
        ) : null}

        <div className={styles.lineActions}>
          <div className={styles.stepper}>
            <button
              type="button"
              className={styles.stepperButton}
              aria-label={t("cart.decrease")}
              data-testid="cart-decrease"
              disabled={line.quantity <= 1}
              onClick={() => setQuantity(line.variantId, line.quantity - 1)}
            >
              −
            </button>
            <span className={styles.stepperValue} aria-label={t("cart.quantity")}>
              {line.quantity}
            </span>
            <button
              type="button"
              className={styles.stepperButton}
              aria-label={t("cart.increase")}
              data-testid="cart-increase"
              // 1-10 per line, and never more than the shelf holds.
              disabled={line.quantity >= ceiling}
              onClick={() => setQuantity(line.variantId, line.quantity + 1)}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className={styles.removeButton}
            aria-label={t("cart.removeNamed", { title: line.productTitle })}
            data-testid="cart-remove"
            onClick={() => remove(line.variantId)}
          >
            {t("cart.remove")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface VendorGroup {
  vendorId: string;
  vendorName: string;
  lines: ProjectedLine[];
}

/** Same ordering as the checkout split: a vendor sits where its first line does. */
function groupByVendor(lines: readonly ProjectedLine[]): VendorGroup[] {
  const groups = new Map<string, VendorGroup>();
  for (const line of lines) {
    const existing = groups.get(line.vendor.id);
    if (existing) existing.lines.push(line);
    else
      groups.set(line.vendor.id, {
        vendorId: line.vendor.id,
        vendorName: line.vendor.name,
        lines: [line],
      });
  }
  return [...groups.values()];
}

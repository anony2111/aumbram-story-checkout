"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./product-sheet.module.css";
import quickAddStyles from "@/components/feed/quick-add.module.css";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { stockState } from "@/domain/display";
import { formatINR } from "@/domain/money";
import {
  defaultSelection,
  findVariantForSelection,
  variantOptionGroups,
} from "@/domain/variants";
import { useAddToCart } from "@/features/cart/cart-queries";
import { useTranslator } from "@/i18n/client";
import { apiGet } from "@/lib/api-client";
import { useUiStore } from "@/stores/ui-store";
import type { ProductDetail } from "@/domain/api";
import type { VariantSelection } from "@/domain/variants";

/**
 * The product sheet: the one place a variant is chosen and a line is added.
 *
 * It is mounted once, in the root layout, and driven by `ui-store`. That matters
 * for the story viewer: the viewer needs to know a sheet is open so it can pause,
 * and it must not unmount while the sheet is up, or the segment position the
 * shopper is meant to come back to would be gone.
 */

export function ProductSheetHost() {
  const request = useUiStore((state) => state.productSheet);
  const close = useUiStore((state) => state.closeProductSheet);
  const t = useTranslator();

  // Keep the last request while the sheet plays its exit transition, so the
  // content does not vanish before the sheet does.
  const [lastRequest, setLastRequest] = useState(request);
  useEffect(() => {
    if (request) setLastRequest(request);
  }, [request]);

  const productId = (request ?? lastRequest)?.productId;
  const attribution = (request ?? lastRequest)?.attribution ?? {};

  const productQuery = useQuery({
    queryKey: ["product", productId],
    queryFn: ({ signal }) => apiGet<ProductDetail>(`/products/${productId}`, { signal }),
    enabled: Boolean(productId),
    staleTime: 15_000,
  });

  const product = productQuery.data;

  return (
    <BottomSheet
      open={request !== null}
      onClose={close}
      title={product?.title ?? t("app.loading")}
      closeLabel={t("app.close")}
      testId="product-sheet"
    >
      {product ? (
        <ProductSheetBody
          product={product}
          attribution={attribution}
          preselectedVariantId={(request ?? lastRequest)?.variantId}
        />
      ) : (
        <ProductSheetSkeleton failed={productQuery.isError} retryLabel={t("app.retry")} onRetry={() => void productQuery.refetch()} />
      )}
    </BottomSheet>
  );
}

function ProductSheetSkeleton({
  failed,
  retryLabel,
  onRetry,
}: {
  failed: boolean;
  retryLabel: string;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <div className={styles.body}>
        <button type="button" className={quickAddStyles.inlineButton} onClick={onRetry}>
          {retryLabel}
        </button>
      </div>
    );
  }
  return (
    <div className={styles.body} aria-hidden="true">
      <div className={styles.skeletonBlock} />
      <div className={styles.skeletonLine} />
      <div className={styles.skeletonLine} />
    </div>
  );
}

function ProductSheetBody({
  product,
  attribution,
  preselectedVariantId,
}: {
  product: ProductDetail;
  attribution: { storyId?: string; creatorId?: string };
  preselectedVariantId?: string | undefined;
}) {
  const t = useTranslator();
  const addToCart = useAddToCart();
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const [added, setAdded] = useState(false);

  const groups = useMemo(() => variantOptionGroups(product.variants), [product.variants]);

  const [selection, setSelection] = useState<VariantSelection>(() => {
    const preselected = product.variants.find((variant) => variant.id === preselectedVariantId);
    return preselected ? { ...preselected.options } : defaultSelection(product.variants);
  });

  // A live stock update can sell out the chosen variant underneath the shopper.
  const selected = findVariantForSelection(product.variants, selection);
  const stock = stockState(selected?.stock ?? 0);
  const soldOut = stock.kind === "sold_out";

  const image = product.images[0];
  const price = selected?.price ?? product.priceRange.min;

  const add = () => {
    if (!selected || soldOut) return;
    addToCart.mutate(
      { variantId: selected.id, attribution },
      { onSuccess: () => setAdded(true) }
    );
  };

  return (
    <div className={styles.body}>
      <div className={styles.summary}>
        {image ? (
          <Image
            className={styles.image}
            src={image.url}
            alt=""
            width={92}
            height={92}
            sizes="92px"
          />
        ) : null}
        <div className={styles.summaryText}>
          <p className={styles.vendor}>{t("sheet.soldBy", { vendor: product.vendor.name })}</p>
          <p className={styles.price}>{formatINR(price)}</p>
          {stock.kind === "low" ? (
            <p className={styles.stockLow}>{t("product.onlyLeft", { count: stock.count })}</p>
          ) : soldOut ? (
            <p className={styles.stockOut}>{t("product.soldOut")}</p>
          ) : null}
        </div>
      </div>

      {groups.map((group) => (
        <fieldset className={styles.group} key={group.name}>
          <legend className={styles.groupLabel}>
            {t("sheet.selectOption", { option: group.name })}
          </legend>
          <div className={styles.chips}>
            {group.values.map((option) => {
              const active = selection[group.name] === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={styles.chip}
                  aria-pressed={active}
                  // A sold-out option is visible but not selectable: hiding it
                  // would make the product look like it has fewer choices.
                  disabled={!option.available}
                  onClick={() => {
                    setAdded(false);
                    setSelection((current) => ({ ...current, [group.name]: option.value }));
                  }}
                >
                  {option.value}
                  {option.available ? null : ` · ${t("sheet.soldOutVariant")}`}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {/*
        * The story this add will be attributed to. Not shown to the shopper — a
        * raw id means nothing to them — but carried here so the end-to-end test
        * can assert the signal survives from hotspot to cart line.
        */}
      {attribution.storyId ? (
        <span
          hidden
          data-testid="sheet-attribution"
          data-story-id={attribution.storyId}
          data-creator-id={attribution.creatorId ?? ""}
        />
      ) : null}

      <button
        ref={addButtonRef}
        type="button"
        className={quickAddStyles.inlineButton}
        data-testid="sheet-add-to-cart"
        data-state={added ? "added" : undefined}
        disabled={soldOut || !selected || addToCart.isPending}
        onClick={add}
      >
        {soldOut
          ? t("product.soldOut")
          : addToCart.isPending
            ? t("sheet.adding")
            : added
              ? t("sheet.added")
              : t("sheet.addToCart")}
      </button>

      <p className={addToCart.isError ? styles.error : styles.status} role="status">
        {addToCart.isError ? t("sheet.addFailed") : added ? t("sheet.added") : ""}
      </p>
    </div>
  );
}

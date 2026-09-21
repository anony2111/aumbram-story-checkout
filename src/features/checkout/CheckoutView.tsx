"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import styles from "./checkout.module.css";
import { AddressForm } from "./AddressForm";
import { buildOrderPayload, EMPTY_ADDRESS, firstInvalidField, validateAddress } from "./payload";
import { usePlaceOrder } from "./use-place-order";
import { useQuote } from "./use-quote";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { formatINR } from "@/domain/money";
import { orderCount, unserviceableGroups } from "@/domain/quote";
import { useCartStore } from "@/features/cart/cart-store";
import { useCartView } from "@/features/cart/use-cart-view";
import { useTranslator } from "@/i18n/client";
import { useOnlineStatus } from "@/lib/use-online-status";
import type { Quote, QuoteGroup } from "@/domain/quote";
import type { PaymentMethod } from "@/domain/types";
import type { AddressField, AddressFormValues } from "./payload";
import type { Translator } from "@/i18n/translate";

/**
 * Checkout.
 *
 * One page, three sections, and a single decision at the bottom. The quote is
 * re-asked whenever the pincode settles, and everything downstream — how many
 * orders there will be, what delivery costs, whether Cash on Delivery is even an
 * option — is read from that answer rather than recomputed here.
 */
export function CheckoutView() {
  const t = useTranslator();
  const online = useOnlineStatus();
  const cart = useCartView();
  const removeFromCart = useCartStore((store) => store.remove);
  const hydrated = useCartStore((store) => store.hydrated);

  const [values, setValues] = useState<AddressFormValues>(EMPTY_ADDRESS);
  const [touched, setTouched] = useState<Partial<Record<AddressField, boolean>>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [unserviceableSheetOpen, setUnserviceableSheetOpen] = useState(false);

  const inputs = useRef<Partial<Record<AddressField, HTMLInputElement | null>>>({});
  const registerRef = useCallback(
    (field: AddressField) => (element: HTMLInputElement | null) => {
      inputs.current[field] = element;
    },
    []
  );
  const fieldRefs = useMemo(
    () =>
      ({
        name: registerRef("name"),
        phone: registerRef("phone"),
        line1: registerRef("line1"),
        line2: registerRef("line2"),
        city: registerRef("city"),
        state: registerRef("state"),
        pincode: registerRef("pincode"),
      }) as const,
    [registerRef]
  );

  const validation = validateAddress(values);
  const quoteQuery = useQuote(values.pincode, { enabled: cart.lines.length > 0 });
  const quote = quoteQuery.quote;

  const placeOrder = usePlaceOrder({ onQuoteInvalidated: quoteQuery.refetch });

  const blocked = quote ? unserviceableGroups(quote) : [];
  const orders = quote ? orderCount(quote) : 0;
  const codUnavailable = quote ? !quote.cod.available : true;

  const handleChange = (field: AddressField, value: string) => {
    // Numeric fields only ever accept digits, so a paste cannot smuggle text in.
    const cleaned = field === "pincode" ? value.replace(/\D/g, "").slice(0, 6) : value;
    setValues((current) => ({ ...current, [field]: cleaned }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!quote) return;

    const { errors, address } = validateAddress(values);
    if (!address) {
      // Show every error at once, and put the caret in the first one.
      setTouched({
        name: true,
        phone: true,
        line1: true,
        city: true,
        state: true,
        pincode: true,
      });
      const first = firstInvalidField(errors);
      if (first) inputs.current[first]?.focus();
      return;
    }

    if (blocked.length > 0) return;
    void placeOrder.place(buildOrderPayload(quote, address, paymentMethod));
  };

  const removeBlockedItems = () => {
    for (const group of blocked) {
      for (const line of group.lines) removeFromCart(line.variantId);
    }
    setUnserviceableSheetOpen(false);
    quoteQuery.refetch();
  };

  if (hydrated && cart.lines.length === 0) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{t("checkout.title")}</h1>
        <div className={styles.empty}>
          <p>{t("checkout.emptyCart")}</p>
        </div>
      </div>
    );
  }

  const canPlace =
    online &&
    Boolean(quote) &&
    blocked.length === 0 &&
    orders > 0 &&
    !placeOrder.busy &&
    !(paymentMethod === "cod" && codUnavailable);

  return (
    <form className={styles.page} onSubmit={handleSubmit} noValidate data-testid="checkout-page">
      <h1 className={styles.title}>{t("checkout.title")}</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIndex}>1</span>
          {t("checkout.addressSection")}
        </h2>
        <AddressForm
          values={values}
          errors={validation.errors}
          touched={touched}
          onChange={handleChange}
          onBlur={(field) => setTouched((current) => ({ ...current, [field]: true }))}
          fieldRefs={fieldRefs}
        />
      </section>

      <section className={styles.section} data-testid="delivery-section">
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIndex}>2</span>
          {t("checkout.deliverySection")}
        </h2>

        {!quote ? (
          <p className={styles.loading}>
            {quoteQuery.isLoading || quoteQuery.isStale
              ? t("checkout.checkingPincode")
              : t("checkout.pincodeInvalid")}
          </p>
        ) : (
          <DeliveryPreview
            quote={quote}
            orders={orders}
            t={t}
            onShowBlocked={() => setUnserviceableSheetOpen(true)}
            onRemoveBlocked={removeBlockedItems}
          />
        )}
      </section>

      <section className={styles.section} data-testid="payment-section">
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionIndex}>3</span>
          {t("checkout.paymentSection")}
        </h2>

        <PaymentOption
          method="upi"
          label={t("checkout.payUpi")}
          selected={paymentMethod === "upi"}
          onSelect={setPaymentMethod}
        />
        <PaymentOption
          method="card"
          label={t("checkout.payCard")}
          selected={paymentMethod === "card"}
          onSelect={setPaymentMethod}
        />
        <PaymentOption
          method="cod"
          label={t("checkout.payCod")}
          selected={paymentMethod === "cod"}
          disabled={codUnavailable}
          reasons={quote ? codReasons(quote, t) : []}
          onSelect={setPaymentMethod}
        />
      </section>

      <PlaceOrderFooter
        state={placeOrder.state}
        busy={placeOrder.busy}
        canPlace={canPlace}
        online={online}
        orders={orders}
        payable={quote ? formatINR(quote.payable) : ""}
        blockedCount={blocked.length}
        t={t}
        onDismiss={placeOrder.reset}
        onRetry={() => {
          const address = validateAddress(values).address;
          if (quote && address) void placeOrder.place(buildOrderPayload(quote, address, paymentMethod));
        }}
        onAcceptPrices={() => {
          // New prices mean a new payload, and therefore a new key.
          quoteQuery.refetch();
          placeOrder.reset();
        }}
      />

      <BottomSheet
        open={unserviceableSheetOpen}
        onClose={() => setUnserviceableSheetOpen(false)}
        title={t("checkout.blockedByUnserviceable")}
        closeLabel={t("app.close")}
        testId="unserviceable-sheet"
      >
        <div className={styles.sheetList}>
          {blocked.map((group) => (
            <div key={group.vendor.id}>
              <p className={styles.warning}>
                {t("checkout.notServiceable", {
                  vendorName: group.vendor.name,
                  pincode: quote?.pincode ?? "",
                })}
              </p>
              {group.lines.map((line) => (
                <p className={styles.sheetLine} key={line.variantId}>
                  <span>
                    {line.productTitle} × {line.quantity}
                  </span>
                  <span>{formatINR(line.lineTotal)}</span>
                </p>
              ))}
            </div>
          ))}
          <button type="button" className={styles.problemAction} onClick={removeBlockedItems}>
            {t("checkout.removeThese")}
          </button>
        </div>
      </BottomSheet>
    </form>
  );
}

// ------------------------------------------------------------- delivery

function DeliveryPreview({
  quote,
  orders,
  t,
  onShowBlocked,
  onRemoveBlocked,
}: {
  quote: Quote;
  orders: number;
  t: Translator;
  onShowBlocked: () => void;
  onRemoveBlocked: () => void;
}) {
  const serviceable = quote.groups.filter((group) => group.serviceable);
  const blocked = unserviceableGroups(quote);

  return (
    <>
      {orders > 1 ? (
        <p className={styles.splitNotice} data-testid="split-notice">
          {t("checkout.splitNotice", { count: orders })}
        </p>
      ) : null}

      {serviceable.map((group, index) => (
        <OrderBlock key={group.vendor.id} group={group} index={index + 1} t={t} />
      ))}

      {blocked.map((group) => (
        <div
          className={styles.orderBlockUnserviceable}
          key={group.vendor.id}
          data-testid="unserviceable-group"
          data-vendor-id={group.vendor.id}
        >
          <div className={styles.warning}>
            <span>
              {t("checkout.notServiceable", {
                vendorName: group.vendor.name,
                pincode: quote.pincode,
              })}
            </span>
            <span>
              <button type="button" className={styles.linkButton} onClick={onShowBlocked}>
                {t("app.back")}
              </button>{" "}
              <button
                type="button"
                className={styles.linkButton}
                data-testid="remove-unserviceable"
                onClick={onRemoveBlocked}
              >
                {t("checkout.removeThese")}
              </button>
            </span>
          </div>
        </div>
      ))}

      <div className={styles.orderTotals}>
        <p className={styles.totalsRowStrong}>
          <span>{t("checkout.total")}</span>
          <span data-testid="payable-total">{formatINR(quote.payable)}</span>
        </p>
      </div>
    </>
  );
}

function OrderBlock({ group, index, t }: { group: QuoteGroup; index: number; t: Translator }) {
  return (
    <div className={styles.orderBlock} data-testid="order-block" data-vendor-id={group.vendor.id}>
      <p className={styles.orderHeader}>
        <span>{t("checkout.orderOf", { index, vendor: group.vendor.name })}</span>
      </p>
      {group.lines.map((line) => (
        <p className={styles.orderLine} key={line.variantId}>
          <span>
            {line.productTitle} × {line.quantity}
          </span>
          <span>{formatINR(line.lineTotal)}</span>
        </p>
      ))}
      <div className={styles.orderTotals}>
        <p className={styles.totalsRow}>
          <span>{t("checkout.subtotal")}</span>
          <span>{formatINR(group.subtotal)}</span>
        </p>
        <p className={styles.totalsRow}>
          <span>{t("checkout.delivery")}</span>
          {group.shippingFee.amount === 0 ? (
            <span className={styles.freeDelivery}>{t("checkout.freeDelivery")}</span>
          ) : (
            <span>{formatINR(group.shippingFee)}</span>
          )}
        </p>
        <p className={styles.totalsRowStrong}>
          <span>{t("checkout.total")}</span>
          <span>{formatINR(group.total)}</span>
        </p>
      </div>
    </div>
  );
}

/** COD refusals, named by seller rather than by code. */
function codReasons(quote: Quote, t: Translator): string[] {
  return quote.cod.reasons.map((reason) => {
    const vendor = quote.groups.find((group) => group.vendor.id === reason.vendorId)?.vendor;
    const vendorName = vendor?.name ?? reason.vendorId;
    if (reason.code === "VENDOR_COD_DISABLED") return t("checkout.codUnavailable", { vendorName });
    return t("checkout.codTooHigh", { limit: formatINR(reason.limit) });
  });
}

// -------------------------------------------------------------- payment

function PaymentOption({
  method,
  label,
  selected,
  disabled = false,
  reasons = [],
  onSelect,
}: {
  method: PaymentMethod;
  label: string;
  selected: boolean;
  disabled?: boolean;
  reasons?: string[];
  onSelect: (method: PaymentMethod) => void;
}) {
  const className = disabled
    ? styles.paymentOptionDisabled
    : selected
      ? styles.paymentOptionSelected
      : styles.paymentOption;

  return (
    <label className={className} data-testid={`payment-${method}`}>
      <input
        type="radio"
        name="paymentMethod"
        value={method}
        checked={selected}
        disabled={disabled}
        onChange={() => onSelect(method)}
      />
      <span>
        <span className={styles.paymentLabel}>{label}</span>
        {disabled
          ? reasons.map((reason) => (
              <span className={styles.paymentReason} key={reason} data-testid="cod-reason">
                {reason}
              </span>
            ))
          : null}
      </span>
    </label>
  );
}

// ---------------------------------------------------------- place order

function PlaceOrderFooter({
  state,
  busy,
  canPlace,
  online,
  orders,
  payable,
  blockedCount,
  t,
  onDismiss,
  onRetry,
  onAcceptPrices,
}: {
  state: ReturnType<typeof usePlaceOrder>["state"];
  busy: boolean;
  canPlace: boolean;
  online: boolean;
  orders: number;
  payable: string;
  blockedCount: number;
  t: Translator;
  onDismiss: () => void;
  onRetry: () => void;
  onAcceptPrices: () => void;
}) {
  return (
    <div className={styles.footer}>
      {state.status === "priceChanged" ? (
        <div className={styles.problemBox} role="alert" data-testid="price-changed">
          <span className={styles.problemTitle}>{t("checkout.priceChangedTitle")}</span>
          {state.lines.map((line) => (
            <span key={line.variantId}>
              {t("checkout.priceChangedLine", {
                title: line.variantId,
                oldPrice: formatINR(line.expected),
                newPrice: formatINR(line.current),
              })}
            </span>
          ))}
          <button
            type="button"
            className={styles.problemAction}
            data-testid="accept-new-prices"
            onClick={onAcceptPrices}
          >
            {t("checkout.acceptNewPrices")}
          </button>
        </div>
      ) : null}

      {state.status === "outOfStock" ? (
        <div className={styles.problemBox} role="alert" data-testid="order-out-of-stock">
          <span className={styles.problemTitle}>{t("checkout.outOfStockTitle")}</span>
          <span>
            {state.available > 0
              ? t("cart.outOfStock", { count: state.available })
              : t("cart.outOfStockNone")}
          </span>
          <Link className={styles.problemAction} href="/cart">
            {t("checkout.backToCart")}
          </Link>
        </div>
      ) : null}

      {state.status === "notServiceable" || state.status === "codUnavailable" ? (
        <div className={styles.problemBox} role="alert" data-testid="order-rejected">
          <span>
            {state.status === "codUnavailable"
              ? t("checkout.codDisabled")
              : t("checkout.blockedByUnserviceable")}
          </span>
          <button type="button" className={styles.problemAction} onClick={onDismiss}>
            {t("app.retry")}
          </button>
        </div>
      ) : null}

      {state.status === "unknown" ? (
        <div className={styles.unknownBox} role="alert" data-testid="order-unknown">
          <span className={styles.problemTitle}>{t("checkout.unknownOutcome")}</span>
          <span>{t("checkout.unknownOutcomeHint")}</span>
          <button
            type="button"
            className={styles.unknownAction}
            data-testid="check-again"
            onClick={onRetry}
          >
            {t("checkout.checkAgain")}
          </button>
        </div>
      ) : null}

      {state.status === "failed" ? (
        <div className={styles.problemBox} role="alert" data-testid="order-failed">
          <span>{t("error.body")}</span>
          <button type="button" className={styles.problemAction} onClick={onRetry}>
            {t("app.retry")}
          </button>
        </div>
      ) : null}

      <button
        type="submit"
        className={styles.placeButton}
        data-testid="place-order"
        disabled={!canPlace}
      >
        {busy
          ? t("checkout.confirming")
          : t("checkout.placeOrders", { count: Math.max(orders, 1), total: payable })}
      </button>

      <p className={styles.statusMessage} role="status">
        {!online
          ? t("offline.orderBlocked")
          : blockedCount > 0
            ? t("checkout.blockedByUnserviceable")
            : ""}
      </p>
    </div>
  );
}

import chrome from "@/components/chrome/chrome.module.css";
import { AppHeader } from "@/components/chrome/AppHeader";
import { OrderConfirmation } from "@/features/orders/OrderConfirmation";
import { loadOrdersForKey } from "@/server/rsc";

/**
 * The confirmation, addressed by idempotency key rather than by order id.
 *
 * One key can have produced several orders, and the key is the thing the client
 * is guaranteed to still hold after an ambiguous failure — so it is the right
 * handle for "show me what that attempt actually created". It also means a
 * refresh re-reads from the server instead of trusting a page that may have been
 * rendered before the outcome was known.
 */
export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const bundle = key
    ? loadOrdersForKey(key)
    : { orders: [], vendorNames: {}, creatorHandles: {}, lineTitles: {} };

  return (
    <>
      <AppHeader />
      <main className={chrome.main}>
        <OrderConfirmation bundle={bundle} />
      </main>
    </>
  );
}

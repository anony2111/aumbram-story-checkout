import chrome from "@/components/chrome/chrome.module.css";
import { AppHeader } from "@/components/chrome/AppHeader";
import { CartView } from "@/features/cart/CartView";

/**
 * The cart route.
 *
 * A shell only. The cart itself is client state — it has to be writable offline
 * and survive a reload — so there is nothing useful the server can render here
 * beyond the app bar.
 */
export const dynamic = "force-dynamic";

export default function CartPage() {
  return (
    <>
      <AppHeader />
      <main className={chrome.main}>
        <CartView />
      </main>
    </>
  );
}

import chrome from "@/components/chrome/chrome.module.css";
import { AppHeader } from "@/components/chrome/AppHeader";
import { CheckoutView } from "@/features/checkout/CheckoutView";

/**
 * The checkout route.
 *
 * A shell, like the cart: what is being bought is client state, and the quote is
 * a live answer about a pincode that has not been typed yet when the server
 * renders.
 */
export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  return (
    <>
      <AppHeader />
      <main className={chrome.main}>
        <CheckoutView />
      </main>
    </>
  );
}

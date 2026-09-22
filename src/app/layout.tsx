import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { CartSync } from "@/features/cart/CartSync";
import { DeferredClients } from "@/features/telemetry/DeferredClients";
import { ProductSheetHost } from "@/features/product/ProductSheet";
import { getLocale } from "@/i18n/server";
import { getDictionary } from "@/i18n/translate";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aumbram",
  description: "Discover products through stories and creators.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

/**
 * The locale is resolved on the server from a cookie, so `<html lang>` and every
 * string are already correct in the first byte of HTML.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    /*
     * `suppressHydrationWarning` on <html> only.
     *
     * This element is the one browser extensions reliably mutate before React
     * hydrates — password managers, reader modes and translation tools all add
     * attributes to it — and a real user's Chrome has several installed. React
     * reports every one of those as a hydration mismatch, which turns a genuine
     * signal into noise nobody reads.
     *
     * It suppresses warnings for this element's own attributes and nothing else:
     * the tree underneath is still checked normally, and we own nothing dynamic
     * on <html> anyway — `lang` comes from a cookie read on the server.
     */
    <html lang={locale} suppressHydrationWarning>
      <body>
        <Providers locale={locale} dictionary={getDictionary(locale)}>
          {children}
          {/*
            * Mounted once, above every route: a feed card, a story hotspot and a
            * cart line all open the same sheet, and the story viewer must not
            * unmount while it is open or the segment position it resumes from
            * would be lost.
            */}
          <ProductSheetHost />
          {/* Drains the offline mutation queue on load and on reconnect. */}
          <CartSync />
          {/* RUM and the live stream, code-split and mounted once idle. */}
          <DeferredClients />
        </Providers>
      </body>
    </html>
  );
}

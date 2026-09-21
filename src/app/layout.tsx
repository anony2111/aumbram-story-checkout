import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
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
    <html lang={locale}>
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
        </Providers>
      </body>
    </html>
  );
}

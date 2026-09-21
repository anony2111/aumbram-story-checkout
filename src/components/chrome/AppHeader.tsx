import Link from "next/link";
import styles from "./chrome.module.css";
import { CartBadge } from "./CartBadge";
import { LocaleSwitch } from "./LocaleSwitch";
import { getTranslator } from "@/i18n/server";

/**
 * The app bar. A server component: only the two interactive pieces inside it —
 * the locale switch and the cart count — ship JavaScript.
 */
export async function AppHeader() {
  const t = await getTranslator();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/">
          {t("app.name")}
        </Link>
        <div className={styles.actions}>
          <LocaleSwitch />
          <CartBadge />
        </div>
      </div>
    </header>
  );
}

import { describe, expect, it } from "vitest";
import { createTranslator, formatIST, getDictionary, interpolate } from "./translate";
import { en } from "./messages/en";
import { hi } from "./messages/hi";
import type { MessageKey } from "./messages/en";

const t = createTranslator("en", getDictionary("en"));
const tHi = createTranslator("hi", getDictionary("hi"));

describe("interpolate", () => {
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(interpolate("Hello {name}", { name: "Nandini" })).toBe("Hello Nandini");
    expect(interpolate("Hello {name}", {})).toBe("Hello {name}");
    expect(interpolate("No placeholders")).toBe("No placeholders");
  });

  it("repeats a placeholder used more than once", () => {
    expect(
      interpolate("ship from {count} sellers, so {count} orders", { count: 2 })
    ).toBe("ship from 2 sellers, so 2 orders");
  });
});

describe("plurals", () => {
  it("uses English rules: 1 is one, 0 and 2 are other", () => {
    expect(t("product.onlyLeft", { count: 1 })).toBe("Only 1 left");
    expect(t("app.cartWithCount", { count: 1 })).toBe("Cart, 1 item");
    expect(t("app.cartWithCount", { count: 2 })).toBe("Cart, 2 items");
    expect(t("app.cartWithCount", { count: 0 })).toBe("Cart, 0 items");
  });

  it("uses Hindi rules, where 0 and 1 are both one", () => {
    expect(new Intl.PluralRules("hi").select(0)).toBe("one");
    expect(tHi("product.onlyLeft", { count: 1 })).toBe("सिर्फ़ 1 बचा है");
    expect(tHi("product.onlyLeft", { count: 0 })).toBe("सिर्फ़ 0 बचा है");
    expect(tHi("product.onlyLeft", { count: 3 })).toBe("सिर्फ़ 3 बचे हैं");
  });

  it("falls back to `other` when no count is supplied", () => {
    expect(t("checkout.splitNotice")).toBe(
      "Your items ship from {count} sellers, so you'll get {count} orders"
    );
  });
});

describe("the dictionaries", () => {
  const keys = Object.keys(en) as MessageKey[];

  it("cover the same keys in both locales", () => {
    expect(Object.keys(hi).sort()).toEqual(keys.slice().sort());
  });

  it("agree on which keys are plural", () => {
    for (const key of keys) {
      expect(typeof hi[key], `plural shape of ${key}`).toBe(typeof en[key]);
    }
  });

  it("use the same placeholders in both locales", () => {
    const names = (value: unknown): string[] =>
      [...JSON.stringify(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string);
    for (const key of keys) {
      expect(new Set(names(hi[key])), `placeholders of ${key}`).toEqual(new Set(names(en[key])));
    }
  });

  it("include the assignment's required Hindi strings verbatim", () => {
    expect(tHi("feed.title")).toBe("आपके लिए");
    expect(tHi("product.soldOut")).toBe("स्टॉक ख़त्म");
    expect(tHi("sheet.addToCart")).toBe("कार्ट में डालें");
    expect(tHi("sheet.added")).toBe("कार्ट में जोड़ दिया गया");
    expect(tHi("story.paused")).toBe("रुका हुआ");
    expect(tHi("checkout.pincode")).toBe("डिलीवरी पिनकोड");
    expect(tHi("checkout.pincodeInvalid")).toBe("सही 6 अंकों का पिनकोड डालें");
    expect(tHi("checkout.notServiceable", { vendorName: "Kochi Studio", pincode: "751001" })).toBe(
      "Kochi Studio अभी 751001 पर डिलीवरी नहीं करता"
    );
    expect(tHi("checkout.codUnavailable", { vendorName: "Jaipur Kala" })).toBe(
      "Jaipur Kala कैश ऑन डिलीवरी की सुविधा नहीं देता"
    );
    expect(tHi("checkout.splitNotice", { count: 2 })).toBe(
      "आपका सामान 2 विक्रेताओं से आएगा, इसलिए आपको 2 ऑर्डर मिलेंगे"
    );
    expect(tHi("checkout.placeOrder", { total: "₹4,098" })).toBe("ऑर्डर करें · ₹4,098");
    expect(tHi("checkout.confirming")).toBe("आपका ऑर्डर कन्फ़र्म हो रहा है…");
    expect(tHi("offline.banner")).toBe("आप ऑफ़लाइन हैं। आपका कार्ट इस फ़ोन पर सेव है।");
    expect(tHi("order.attributedTo", { creatorHandle: "@lakshmi.desi7" })).toBe(
      "@lakshmi.desi7 के ज़रिए मिला"
    );
  });
});

describe("formatIST", () => {
  it("renders a UTC timestamp in Indian Standard Time", () => {
    // 08:30 UTC is 14:00 IST on the same day.
    const formatted = formatIST("2026-09-13T08:30:00Z", "en");
    expect(formatted).toContain("13 Sept 2026"); // en-IN abbreviates September as "Sept"
    expect(formatted).toContain("2:00");
  });

  it("crosses the date boundary correctly", () => {
    // 20:00 UTC is 01:30 IST the next day.
    expect(formatIST("2026-09-13T20:00:00Z", "en")).toContain("14 Sept 2026");
  });

  it("returns an empty string for an unusable timestamp", () => {
    expect(formatIST("not-a-date", "en")).toBe("");
  });
});

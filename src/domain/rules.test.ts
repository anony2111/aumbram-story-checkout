import { describe, expect, it } from "vitest";
import { money } from "./money";
import {
  attributionForLines,
  clampQuantity,
  codAvailability,
  isValidMobile,
  isValidPincode,
  mergeAttribution,
  servesPincode,
  shippingFeeFor,
  toE164,
} from "./rules";
import type { CartLine } from "./types";

describe("pincode", () => {
  it("accepts six digits that do not start with zero", () => {
    expect(isValidPincode("751001")).toBe(true);
    expect(isValidPincode("400001")).toBe(true);
  });

  it("rejects the shapes people actually type", () => {
    expect(isValidPincode("051001")).toBe(false); // leading zero
    expect(isValidPincode("75100")).toBe(false); // five digits
    expect(isValidPincode("7510011")).toBe(false); // seven digits
    expect(isValidPincode("751 001")).toBe(false); // space
    expect(isValidPincode("")).toBe(false);
  });
});

describe("mobile", () => {
  it("accepts ten digits starting 6-9 and stores them as E.164", () => {
    expect(isValidMobile("9876543210")).toBe(true);
    expect(toE164("9876543210")).toBe("+919876543210");
  });

  it("rejects landline-style and short numbers", () => {
    expect(isValidMobile("5876543210")).toBe(false);
    expect(isValidMobile("987654321")).toBe(false);
    expect(isValidMobile("+919876543210")).toBe(false);
  });
});

describe("servesPincode", () => {
  it("matches on any prefix", () => {
    expect(servesPincode(["70", "11", "75"], "751001")).toBe(true); // Kolkata Looms
    expect(servesPincode(["68", "22", "30", "41"], "751001")).toBe(false); // Kochi Studio
  });

  it("is false with no prefixes at all", () => {
    expect(servesPincode([], "751001")).toBe(false);
  });

  it("does not match a prefix that is merely contained in the pincode", () => {
    expect(servesPincode(["51"], "751001")).toBe(false);
  });
});

describe("shippingFeeFor", () => {
  it("is free at or above ₹499 and ₹49 below it", () => {
    expect(shippingFeeFor(money(49_900))).toEqual(money(0));
    expect(shippingFeeFor(money(50_000))).toEqual(money(0));
    expect(shippingFeeFor(money(49_899))).toEqual(money(4_900));
    expect(shippingFeeFor(money(0))).toEqual(money(4_900));
  });
});

describe("codAvailability", () => {
  const enabled = { vendorId: "vnd_0017", codEnabled: true, total: money(269_900) };

  it("is available when every group qualifies", () => {
    expect(codAvailability([enabled])).toEqual({ available: true, reasons: [] });
  });

  it("names the vendor that does not offer COD", () => {
    const result = codAvailability([
      enabled,
      { vendorId: "vnd_0023", codEnabled: false, total: money(139_900) },
    ]);
    expect(result.available).toBe(false);
    expect(result.reasons).toEqual([{ code: "VENDOR_COD_DISABLED", vendorId: "vnd_0023" }]);
  });

  it("names a group over the ₹5,000 ceiling", () => {
    const result = codAvailability([
      { vendorId: "vnd_0017", codEnabled: true, total: money(500_100) },
    ]);
    expect(result.available).toBe(false);
    expect(result.reasons[0]).toMatchObject({
      code: "ORDER_TOTAL_TOO_HIGH",
      vendorId: "vnd_0017",
    });
  });

  it("allows exactly ₹5,000", () => {
    expect(
      codAvailability([{ vendorId: "vnd_0017", codEnabled: true, total: money(500_000) }]).available
    ).toBe(true);
  });

  it("reports both reasons when a group fails twice", () => {
    const result = codAvailability([
      { vendorId: "vnd_0009", codEnabled: false, total: money(600_000) },
    ]);
    expect(result.reasons).toHaveLength(2);
  });

  it("is unavailable with nothing to pay for", () => {
    expect(codAvailability([]).available).toBe(false);
  });
});

describe("clampQuantity", () => {
  it("keeps quantities inside 1-10 and inside stock", () => {
    expect(clampQuantity(3, 5)).toBe(3);
    expect(clampQuantity(11, 50)).toBe(10);
    expect(clampQuantity(0, 5)).toBe(1);
    expect(clampQuantity(7, 3)).toBe(3);
  });

  it("returns 0 when nothing is left, so the caller must drop the line", () => {
    expect(clampQuantity(2, 0)).toBe(0);
    expect(clampQuantity(2, -1)).toBe(0);
  });
});

describe("attribution", () => {
  const line = (over: Partial<CartLine>): CartLine => ({
    variantId: "var_00576",
    productId: "prd_0179",
    quantity: 1,
    priceAtAdd: money(269_900),
    attribution: {},
    addedAt: "2026-09-21T10:00:00.000Z",
    ...over,
  });

  it("takes the most recent line that carries a story", () => {
    const result = attributionForLines([
      line({ attribution: { storyId: "sty_0001", creatorId: "crt_0001" }, addedAt: "2026-09-21T10:00:00.000Z" }),
      line({ attribution: { storyId: "sty_0022", creatorId: "crt_0008" }, addedAt: "2026-09-21T11:00:00.000Z" }),
    ]);
    expect(result).toEqual({ storyId: "sty_0022", creatorId: "crt_0008" });
  });

  it("ignores later lines with no story rather than letting them erase the signal", () => {
    const result = attributionForLines([
      line({ attribution: { storyId: "sty_0022", creatorId: "crt_0008" }, addedAt: "2026-09-21T10:00:00.000Z" }),
      line({ attribution: {}, addedAt: "2026-09-21T12:00:00.000Z" }),
    ]);
    expect(result).toEqual({ storyId: "sty_0022", creatorId: "crt_0008" });
  });

  it("is empty when no line came from a story", () => {
    expect(attributionForLines([line({})])).toEqual({});
    expect(attributionForLines([])).toEqual({});
  });

  it("merges so a plain feed add never overwrites a story add", () => {
    const story = { storyId: "sty_0022", creatorId: "crt_0008" };
    expect(mergeAttribution(story, {})).toEqual(story);
    expect(mergeAttribution({}, story)).toEqual(story);
    expect(mergeAttribution(story, { storyId: "sty_0099", creatorId: "crt_0002" })).toEqual({
      storyId: "sty_0099",
      creatorId: "crt_0002",
    });
  });
});

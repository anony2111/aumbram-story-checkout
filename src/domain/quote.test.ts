import { describe, expect, it } from "vitest";
import { money } from "./money";
import { buildQuote, groupLinesByVendor, orderCount, unserviceableGroups } from "./quote";
import type { QuoteLineInput } from "./quote";
import type { Vendor } from "./types";

/**
 * The fixture is the assignment's scenario: story `sty_0022`, creator `crt_0008`,
 * pincode 751001. Three sellers, one of whom cannot deliver and one of whom
 * refuses COD.
 */

const vendor = (over: Partial<Vendor> & Pick<Vendor, "id" | "name">): Vendor => ({
  city: "Kolkata",
  state: "West Bengal",
  rating: 4.2,
  codEnabled: true,
  serviceablePincodePrefixes: ["75"],
  ...over,
});

const KOLKATA_LOOMS = vendor({
  id: "vnd_0017",
  name: "Kolkata Looms",
  serviceablePincodePrefixes: ["70", "11", "75"],
});
const JAIPUR_KALA = vendor({
  id: "vnd_0023",
  name: "Jaipur Kala",
  codEnabled: false,
  serviceablePincodePrefixes: ["30", "11", "70", "75"],
});
const KOCHI_STUDIO = vendor({
  id: "vnd_0009",
  name: "Kochi Studio",
  serviceablePincodePrefixes: ["68", "22", "30", "41"],
});

const STORY_ATTRIBUTION = { storyId: "sty_0022", creatorId: "crt_0008" };

const line = (over: Partial<QuoteLineInput> & Pick<QuoteLineInput, "variantId" | "vendor">): QuoteLineInput => ({
  productId: "prd_0000",
  productTitle: "Something handmade",
  variantOptions: {},
  quantity: 1,
  unitPrice: money(269_900),
  priceAtAdd: money(269_900),
  attribution: STORY_ATTRIBUTION,
  addedAt: "2026-09-21T10:00:00.000Z",
  ...over,
});

const basket: QuoteLineInput[] = [
  line({
    variantId: "var_00576",
    productId: "prd_0179",
    productTitle: "Handcrafted Bamboo Basket",
    vendor: KOLKATA_LOOMS,
    unitPrice: money(269_900),
    priceAtAdd: money(269_900),
    addedAt: "2026-09-21T10:00:00.000Z",
  }),
  line({
    variantId: "var_00305",
    productId: "prd_0082",
    productTitle: "Upcycled Dhurrie",
    variantOptions: { colour: "Indigo" },
    vendor: JAIPUR_KALA,
    unitPrice: money(139_900),
    priceAtAdd: money(139_900),
    addedAt: "2026-09-21T10:01:00.000Z",
  }),
  line({
    variantId: "var_00121",
    productId: "prd_0034",
    productTitle: "Meenakari Nose Pin",
    variantOptions: { finish: "Oxidised" },
    vendor: KOCHI_STUDIO,
    unitPrice: money(159_900),
    priceAtAdd: money(159_900),
    addedAt: "2026-09-21T10:02:00.000Z",
  }),
];

describe("buildQuote — the sty_0022 basket at pincode 751001", () => {
  const quote = buildQuote(basket, "751001");

  it("creates one group per vendor, in the order the cart was built", () => {
    expect(quote.groups.map((group) => group.vendor.id)).toEqual([
      "vnd_0017",
      "vnd_0023",
      "vnd_0009",
    ]);
  });

  it("flags the vendor that does not deliver instead of dropping the line", () => {
    expect(quote.groups.map((group) => group.serviceable)).toEqual([true, true, false]);
    expect(unserviceableGroups(quote).map((group) => group.vendor.name)).toEqual(["Kochi Studio"]);
    // the line is still visible, so the shopper can decide what to do with it
    expect(unserviceableGroups(quote)[0]?.lines).toHaveLength(1);
  });

  it("prices each order on its own, with free delivery over ₹499", () => {
    expect(quote.groups[0]).toMatchObject({
      subtotal: money(269_900),
      shippingFee: money(0),
      total: money(269_900),
    });
    expect(quote.groups[1]).toMatchObject({
      subtotal: money(139_900),
      shippingFee: money(0),
      total: money(139_900),
    });
  });

  it("charges ₹49 on an order below the threshold", () => {
    const cheap = buildQuote(
      [line({ variantId: "var_00001", vendor: KOLKATA_LOOMS, unitPrice: money(19_900), priceAtAdd: money(19_900) })],
      "751001"
    );
    expect(cheap.groups[0]).toMatchObject({
      subtotal: money(19_900),
      shippingFee: money(4_900),
      total: money(24_800),
    });
  });

  it("sums only what it can actually ship", () => {
    expect(quote.payable).toEqual(money(409_800));
    expect(orderCount(quote)).toBe(2);
  });

  it("disables COD and names Jaipur Kala, ignoring the unserviceable group", () => {
    expect(quote.cod.available).toBe(false);
    expect(quote.cod.reasons).toEqual([{ code: "VENDOR_COD_DISABLED", vendorId: "vnd_0023" }]);
  });

  it("keeps the story attribution on every line", () => {
    for (const group of quote.groups) {
      for (const quoteLine of group.lines) {
        expect(quoteLine.attribution).toEqual(STORY_ATTRIBUTION);
      }
    }
  });

  it("multiplies the unit price by the quantity", () => {
    const three = buildQuote(
      [line({ variantId: "var_00305", vendor: JAIPUR_KALA, unitPrice: money(139_900), quantity: 3 })],
      "751001"
    );
    expect(three.groups[0]?.lines[0]?.lineTotal).toEqual(money(419_700));
    expect(three.groups[0]?.subtotal).toEqual(money(419_700));
  });
});

describe("buildQuote — nothing is serviceable", () => {
  const quote = buildQuote([basket[2] as QuoteLineInput], "751001");

  it("has nothing payable, no orders and no COD", () => {
    expect(quote.payable).toEqual(money(0));
    expect(orderCount(quote)).toBe(0);
    expect(quote.cod.available).toBe(false);
  });
});

describe("groupLinesByVendor", () => {
  it("keeps several lines of the same vendor together, sorted by when they were added", () => {
    const groups = groupLinesByVendor([
      line({ variantId: "b", vendor: KOLKATA_LOOMS, addedAt: "2026-09-21T10:05:00.000Z" }),
      line({ variantId: "a", vendor: KOLKATA_LOOMS, addedAt: "2026-09-21T10:00:00.000Z" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.lines.map((l) => l.variantId)).toEqual(["a", "b"]);
  });
});

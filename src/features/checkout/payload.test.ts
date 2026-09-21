import { describe, expect, it } from "vitest";
import {
  buildOrderPayload,
  canonicalisePayload,
  EMPTY_ADDRESS,
  fingerprintPayload,
  firstInvalidField,
  validateAddress,
} from "./payload";
import type { AddressFormValues } from "./payload";
import { money } from "@/domain/money";
import { buildQuote } from "@/domain/quote";
import type { QuoteLineInput } from "@/domain/quote";
import type { Vendor } from "@/domain/types";

const filled: AddressFormValues = {
  name: "Nandini Das",
  phone: "9876543210",
  line1: "Plot 42, Saheed Nagar",
  line2: "",
  city: "Bhubaneswar",
  state: "Odisha",
  pincode: "751001",
};

describe("validateAddress", () => {
  it("accepts a complete address and stores the phone in E.164", () => {
    const { errors, address } = validateAddress(filled);
    expect(errors).toEqual({});
    expect(address).toEqual({
      name: "Nandini Das",
      line1: "Plot 42, Saheed Nagar",
      city: "Bhubaneswar",
      state: "Odisha",
      pincode: "751001",
      phone: "+919876543210",
    });
  });

  it("omits an empty landmark rather than sending a blank line", () => {
    expect(validateAddress({ ...filled, line2: "   " }).address).not.toHaveProperty("line2");
    expect(validateAddress({ ...filled, line2: "Near the temple" }).address?.line2).toBe(
      "Near the temple"
    );
  });

  it("trims what people actually type", () => {
    const { address } = validateAddress({ ...filled, name: "  Nandini Das  " });
    expect(address?.name).toBe("Nandini Das");
  });

  it("reports every empty required field at once", () => {
    const { errors } = validateAddress(EMPTY_ADDRESS);
    expect(errors).toEqual({
      name: "checkout.required",
      phone: "checkout.required",
      line1: "checkout.required",
      city: "checkout.required",
      state: "checkout.required",
      pincode: "checkout.required",
    });
    // line2 is optional, so it is never an error.
    expect(errors).not.toHaveProperty("line2");
  });

  it("tells a missing phone apart from a wrong one", () => {
    expect(validateAddress({ ...filled, phone: "" }).errors.phone).toBe("checkout.required");
    expect(validateAddress({ ...filled, phone: "5876543210" }).errors.phone).toBe(
      "checkout.phoneInvalid"
    );
    expect(validateAddress({ ...filled, phone: "98765" }).errors.phone).toBe(
      "checkout.phoneInvalid"
    );
  });

  it("accepts a phone typed with spaces or dashes", () => {
    expect(validateAddress({ ...filled, phone: "98765 43210" }).address?.phone).toBe(
      "+919876543210"
    );
    expect(validateAddress({ ...filled, phone: "98765-43210" }).address?.phone).toBe(
      "+919876543210"
    );
  });

  it("rejects a pincode that does not match the Indian format", () => {
    expect(validateAddress({ ...filled, pincode: "051001" }).errors.pincode).toBe(
      "checkout.pincodeInvalid"
    );
    expect(validateAddress({ ...filled, pincode: "75100" }).errors.pincode).toBe(
      "checkout.pincodeInvalid"
    );
  });

  it("names the first invalid field in visual order, which is where focus goes", () => {
    const { errors } = validateAddress({ ...EMPTY_ADDRESS, name: "Nandini" });
    expect(firstInvalidField(errors)).toBe("phone");
    expect(firstInvalidField({})).toBeUndefined();
  });
});

// ------------------------------------------------------------- payloads

const vendor = (over: Partial<Vendor> & Pick<Vendor, "id" | "name">): Vendor => ({
  city: "Kolkata",
  state: "West Bengal",
  rating: 4.2,
  codEnabled: true,
  serviceablePincodePrefixes: ["75"],
  ...over,
});

const KOLKATA = vendor({ id: "vnd_0017", name: "Kolkata Looms" });
const KOCHI_STUDIO = vendor({
  id: "vnd_0009",
  name: "Kochi Studio",
  serviceablePincodePrefixes: ["68"],
});

const line = (
  over: Partial<QuoteLineInput> & Pick<QuoteLineInput, "variantId" | "vendor">
): QuoteLineInput => ({
  productId: "prd_0179",
  productTitle: "Handcrafted Bamboo Basket",
  variantOptions: {},
  quantity: 1,
  unitPrice: money(269_900),
  priceAtAdd: money(269_900),
  attribution: { storyId: "sty_0022", creatorId: "crt_0008" },
  addedAt: "2026-09-21T10:00:00.000Z",
  ...over,
});

const address = validateAddress(filled).address!;

describe("buildOrderPayload", () => {
  it("sends only what can be delivered", () => {
    const quote = buildQuote(
      [
        line({ variantId: "var_00576", vendor: KOLKATA }),
        line({ variantId: "var_00121", vendor: KOCHI_STUDIO, addedAt: "2026-09-21T10:01:00.000Z" }),
      ],
      "751001"
    );
    const payload = buildOrderPayload(quote, address, "upi");
    expect(payload.lines.map((entry) => entry.variantId)).toEqual(["var_00576"]);
  });

  it("carries the price the shopper was shown, so a change comes back as a 409", () => {
    const quote = buildQuote([line({ variantId: "var_00576", vendor: KOLKATA })], "751001");
    expect(buildOrderPayload(quote, address, "upi").lines[0]?.expectedUnitPrice).toEqual(
      money(269_900)
    );
  });

  it("carries each line's attribution through to the order", () => {
    const quote = buildQuote([line({ variantId: "var_00576", vendor: KOLKATA })], "751001");
    expect(buildOrderPayload(quote, address, "upi").lines[0]?.attribution).toEqual({
      storyId: "sty_0022",
      creatorId: "crt_0008",
    });
  });
});

describe("the payload fingerprint", () => {
  const quote = buildQuote(
    [
      line({ variantId: "var_00576", vendor: KOLKATA }),
      line({ variantId: "var_00305", vendor: KOLKATA, unitPrice: money(139_900), addedAt: "2026-09-21T10:01:00.000Z" }),
    ],
    "751001"
  );
  const base = buildOrderPayload(quote, address, "upi");

  it("is stable", () => {
    expect(fingerprintPayload(base)).toBe(fingerprintPayload(base));
  });

  it("ignores the order of the lines", () => {
    const reversed = { ...base, lines: [...base.lines].reverse() };
    expect(fingerprintPayload(reversed)).toBe(fingerprintPayload(base));
  });

  it("ignores attribution, which changes who is paid rather than what is bought", () => {
    const reattributed = {
      ...base,
      lines: base.lines.map((entry) => ({ ...entry, attribution: { storyId: "sty_9999" } })),
    };
    expect(fingerprintPayload(reattributed)).toBe(fingerprintPayload(base));
  });

  it("changes with quantity, price, payment method or address", () => {
    const withQuantity = {
      ...base,
      lines: [{ ...base.lines[0]!, quantity: 2 }, base.lines[1]!],
    };
    const withPrice = {
      ...base,
      lines: [
        { ...base.lines[0]!, expectedUnitPrice: money(279_900) },
        base.lines[1]!,
      ],
    };
    expect(fingerprintPayload(withQuantity)).not.toBe(fingerprintPayload(base));
    expect(fingerprintPayload(withPrice)).not.toBe(fingerprintPayload(base));
    expect(fingerprintPayload({ ...base, paymentMethod: "cod" })).not.toBe(
      fingerprintPayload(base)
    );
    expect(
      fingerprintPayload({
        ...base,
        shippingAddress: { ...base.shippingAddress, pincode: "110001" },
      })
    ).not.toBe(fingerprintPayload(base));
  });

  it("changes when a line is dropped, which is what removing an item does", () => {
    expect(fingerprintPayload({ ...base, lines: [base.lines[0]!] })).not.toBe(
      fingerprintPayload(base)
    );
  });

  it("is a digest, not the payload: no address survives in it", () => {
    const digest = fingerprintPayload(base);
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
    expect(digest).not.toContain("Nandini");
    expect(canonicalisePayload(base)).toContain("Nandini");
  });
});

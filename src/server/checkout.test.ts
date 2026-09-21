import { describe, expect, it } from "vitest";
import { fingerprintPayload } from "./checkout";
import type { PlaceOrderBody } from "@/domain/schemas";

/**
 * The fingerprint decides whether a retry is "the same order".
 *
 * Too loose and a changed cart silently reuses a key (the shopper gets the old
 * order). Too tight and an innocent reordering of the lines array looks like a new
 * payload, which is how duplicate orders get created.
 */

const base: PlaceOrderBody = {
  shippingAddress: {
    name: "Nandini Das",
    line1: "Plot 42, Saheed Nagar",
    city: "Bhubaneswar",
    state: "Odisha",
    pincode: "751001",
    phone: "+919876543210",
  },
  paymentMethod: "upi",
  lines: [
    {
      variantId: "var_00576",
      quantity: 1,
      expectedUnitPrice: { amount: 269900, currency: "INR" },
      attribution: { storyId: "sty_0022", creatorId: "crt_0008" },
    },
    {
      variantId: "var_00305",
      quantity: 1,
      expectedUnitPrice: { amount: 139900, currency: "INR" },
      attribution: { storyId: "sty_0022", creatorId: "crt_0008" },
    },
  ],
};

const withLines = (lines: PlaceOrderBody["lines"]): PlaceOrderBody => ({ ...base, lines });

describe("fingerprintPayload", () => {
  it("is stable across calls", () => {
    expect(fingerprintPayload(base)).toBe(fingerprintPayload(base));
  });

  it("ignores the order of the lines array", () => {
    const reversed = withLines([...base.lines].reverse());
    expect(fingerprintPayload(reversed)).toBe(fingerprintPayload(base));
  });

  it("ignores attribution, which never changes what is charged", () => {
    const reattributed = withLines(
      base.lines.map((line) => ({ ...line, attribution: { storyId: "sty_0099" } }))
    );
    expect(fingerprintPayload(reattributed)).toBe(fingerprintPayload(base));
  });

  it("changes when the quantity changes", () => {
    const more = withLines([{ ...base.lines[0]!, quantity: 2 }, base.lines[1]!]);
    expect(fingerprintPayload(more)).not.toBe(fingerprintPayload(base));
  });

  it("changes when an accepted price change moves the expected price", () => {
    const repriced = withLines([
      { ...base.lines[0]!, expectedUnitPrice: { amount: 279900, currency: "INR" } },
      base.lines[1]!,
    ]);
    expect(fingerprintPayload(repriced)).not.toBe(fingerprintPayload(base));
  });

  it("changes when a line is removed", () => {
    expect(fingerprintPayload(withLines([base.lines[0]!]))).not.toBe(fingerprintPayload(base));
  });

  it("changes when the payment method or the address changes", () => {
    expect(fingerprintPayload({ ...base, paymentMethod: "cod" })).not.toBe(fingerprintPayload(base));
    expect(
      fingerprintPayload({
        ...base,
        shippingAddress: { ...base.shippingAddress, pincode: "110001" },
      })
    ).not.toBe(fingerprintPayload(base));
  });

  it("treats a missing line2 and an empty line2 as the same address", () => {
    expect(
      fingerprintPayload({
        ...base,
        shippingAddress: { ...base.shippingAddress, line2: "" },
      })
    ).toBe(fingerprintPayload(base));
  });
});

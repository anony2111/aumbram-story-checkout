import { describe, expect, it } from "vitest";
import { displayPrice, isSafeDeeplink, stockState } from "./display";
import { money } from "./money";

describe("stockState", () => {
  it("is sold out at zero, and would be at a negative count too", () => {
    expect(stockState(0)).toEqual({ kind: "sold_out" });
    expect(stockState(-3)).toEqual({ kind: "sold_out" });
  });

  it("nudges from 1 to 5", () => {
    expect(stockState(1)).toEqual({ kind: "low", count: 1 });
    expect(stockState(5)).toEqual({ kind: "low", count: 5 });
  });

  it("says nothing from 6 up", () => {
    expect(stockState(6)).toEqual({ kind: "in_stock" });
    expect(stockState(151)).toEqual({ kind: "in_stock" });
  });
});

describe("displayPrice", () => {
  const range = (min: number, max: number) => ({ min: money(min), max: money(max) });

  it("shows the minimum, with no prefix when every variant costs the same", () => {
    const result = displayPrice(range(139_900, 139_900), null);
    expect(result.price).toEqual(money(139_900));
    expect(result.prefixFrom).toBe(false);
  });

  it("prefixes From when the variants differ", () => {
    expect(displayPrice(range(79_900, 89_900), null).prefixFrom).toBe(true);
  });

  it("floors the discount against the minimum price", () => {
    // (366000 - 209900) * 100 / 366000 = 42.65… -> 42
    const result = displayPrice(range(209_900, 209_900), money(366_000));
    expect(result.discountPercent).toBe(42);
    expect(result.mrp).toEqual(money(366_000));
  });

  it("hides the discount when there is no MRP, or it does not beat the price", () => {
    expect(displayPrice(range(209_900, 209_900), null).discountPercent).toBeNull();
    expect(displayPrice(range(209_900, 209_900), money(209_900)).discountPercent).toBeNull();
    expect(displayPrice(range(209_900, 209_900), money(180_000)).discountPercent).toBeNull();
  });

  it("hides the MRP whenever the discount is hidden, so no struck-through lie is rendered", () => {
    expect(displayPrice(range(209_900, 209_900), money(180_000)).mrp).toBeNull();
  });
});

describe("isSafeDeeplink", () => {
  it("accepts our own scheme", () => {
    expect(isSafeDeeplink("aumbram://collections/festive")).toBe(true);
  });

  it("rejects anything else a feed could carry", () => {
    expect(isSafeDeeplink("javascript:alert(1)")).toBe(false);
    expect(isSafeDeeplink("https://example.com")).toBe(false);
    expect(isSafeDeeplink("//evil.example")).toBe(false);
    expect(isSafeDeeplink(" aumbram://x")).toBe(false);
    expect(isSafeDeeplink("aumbram://x\nLocation: evil")).toBe(false);
  });
});

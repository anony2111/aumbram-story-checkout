import { describe, expect, it } from "vitest";
import {
  addMoney,
  discountPercent,
  formatINR,
  money,
  moneyEquals,
  scaleMoney,
  subtractMoney,
  sumMoney,
  ZERO_INR,
} from "./money";

describe("money arithmetic", () => {
  it("rejects non-integer paise, so no float ever enters a total", () => {
    expect(() => money(499.5)).toThrow(TypeError);
  });

  it("adds and subtracts without drift on amounts that break float maths", () => {
    // 0.1 + 0.2 in rupees is the classic float trap; in paise it is exact.
    expect(addMoney(money(10), money(20))).toEqual(money(30));
    expect(subtractMoney(money(269900), money(139900))).toEqual(money(130000));
  });

  it("sums an empty list to zero", () => {
    expect(sumMoney([])).toEqual(ZERO_INR);
  });

  it("scales a unit price by an integer quantity", () => {
    expect(scaleMoney(money(99900), 3)).toEqual(money(299700));
    expect(scaleMoney(money(99900), 0)).toEqual(money(0));
    expect(() => scaleMoney(money(99900), 1.5)).toThrow(TypeError);
    expect(() => scaleMoney(money(99900), -1)).toThrow(TypeError);
  });

  it("compares by amount and currency", () => {
    expect(moneyEquals(money(100), money(100))).toBe(true);
    expect(moneyEquals(money(100), money(101))).toBe(false);
  });
});

describe("formatINR", () => {
  it("groups in the Indian system", () => {
    expect(formatINR(money(12_499_900))).toBe("₹1,24,999");
    expect(formatINR(money(269_900))).toBe("₹2,699");
    expect(formatINR(money(409_800))).toBe("₹4,098");
  });

  it("drops decimals for whole rupees and keeps them otherwise", () => {
    expect(formatINR(money(49_900))).toBe("₹499");
    expect(formatINR(money(49_950))).toBe("₹499.50");
  });

  it("formats zero", () => {
    expect(formatINR(ZERO_INR)).toBe("₹0");
  });
});

describe("discountPercent", () => {
  it("floors the percentage", () => {
    // (99900 - 74900) * 100 / 99900 = 25.02… -> 25
    expect(discountPercent(money(99_900), money(74_900))).toBe(25);
  });

  it("is null when there is no MRP or the MRP does not beat the price", () => {
    expect(discountPercent(null, money(74_900))).toBeNull();
    expect(discountPercent(undefined, money(74_900))).toBeNull();
    expect(discountPercent(money(74_900), money(74_900))).toBeNull();
    expect(discountPercent(money(60_000), money(74_900))).toBeNull();
    expect(discountPercent(money(0), money(74_900))).toBeNull();
  });
});

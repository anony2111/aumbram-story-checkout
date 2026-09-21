import { describe, expect, it } from "vitest";
import { money } from "./money";
import {
  defaultSelection,
  findVariantForSelection,
  needsPicker,
  variantOptionGroups,
} from "./variants";
import type { Variant } from "./types";

const variant = (id: string, options: Record<string, string>, stock: number): Variant => ({
  id,
  productId: "prd_0034",
  sku: `sku-${id}`,
  options,
  price: money(159_900),
  stock,
});

// prd_0034 Meenakari Nose Pin, as the fixture has it.
const noseP1n = [
  variant("var_00121", { finish: "Oxidised" }, 13),
  variant("var_00122", { finish: "Gold-plated" }, 0),
  variant("var_00123", { finish: "Silver" }, 11),
];

describe("variantOptionGroups", () => {
  it("derives one group per option key, in first-seen order", () => {
    const groups = variantOptionGroups(noseP1n);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe("finish");
    expect(groups[0]?.values.map((v) => v.value)).toEqual(["Oxidised", "Gold-plated", "Silver"]);
  });

  it("marks a value unavailable when nothing carrying it is in stock", () => {
    const groups = variantOptionGroups(noseP1n);
    expect(groups[0]?.values).toEqual([
      { value: "Oxidised", available: true },
      { value: "Gold-plated", available: false },
      { value: "Silver", available: true },
    ]);
  });

  it("handles more than one option key", () => {
    const groups = variantOptionGroups([
      variant("a", { size: "M", colour: "Indigo" }, 2),
      variant("b", { size: "L", colour: "Indigo" }, 0),
    ]);
    expect(groups.map((group) => group.name)).toEqual(["size", "colour"]);
    expect(groups[1]?.values).toEqual([{ value: "Indigo", available: true }]);
  });

  it("is empty for a product whose variant has no options", () => {
    expect(variantOptionGroups([variant("var_00576", {}, 3)])).toEqual([]);
  });
});

describe("findVariantForSelection", () => {
  it("matches on every option", () => {
    expect(findVariantForSelection(noseP1n, { finish: "Silver" })?.id).toBe("var_00123");
  });

  it("returns nothing for an incomplete or unknown selection", () => {
    expect(findVariantForSelection(noseP1n, {})).toBeUndefined();
    expect(findVariantForSelection(noseP1n, { finish: "Rose gold" })).toBeUndefined();
    expect(
      findVariantForSelection([variant("a", { size: "M", colour: "Indigo" }, 2)], { size: "M" })
    ).toBeUndefined();
  });

  it("finds the option-less variant with an empty selection", () => {
    expect(findVariantForSelection([variant("var_00576", {}, 3)], {})?.id).toBe("var_00576");
  });
});

describe("defaultSelection", () => {
  it("starts on the first variant that is actually buyable", () => {
    expect(defaultSelection([variant("a", { finish: "Gold" }, 0), noseP1n[0] as Variant])).toEqual({
      finish: "Oxidised",
    });
  });

  it("falls back to the first variant when everything is sold out, so a price still shows", () => {
    expect(defaultSelection([variant("a", { finish: "Gold" }, 0)])).toEqual({ finish: "Gold" });
  });

  it("is empty for no variants at all", () => {
    expect(defaultSelection([])).toEqual({});
  });
});

describe("needsPicker", () => {
  it("is false for a single option-less variant", () => {
    expect(needsPicker([variant("var_00576", {}, 3)])).toBe(false);
  });

  it("is true when there is a real choice to make", () => {
    expect(needsPicker(noseP1n)).toBe(true);
  });
});

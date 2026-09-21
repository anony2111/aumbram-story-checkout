import type { Variant } from "./types";

/**
 * Turning a flat variant list into a picker.
 *
 * The dataset gives each variant an `options` record ({ colour: "Indigo" }), and
 * most products key on a single option — but nothing guarantees that, so the
 * picker is derived rather than assumed. Kept pure so the "which chip is
 * disabled" question is answered by a test, not by clicking around.
 */

export interface VariantOptionValue {
  value: string;
  /** False when no variant carrying this value has stock left. */
  available: boolean;
}

export interface VariantOptionGroup {
  name: string;
  values: VariantOptionValue[];
}

export type VariantSelection = Record<string, string>;

/** Option groups in first-seen order, values in first-seen order. */
export function variantOptionGroups(variants: readonly Variant[]): VariantOptionGroup[] {
  const groups = new Map<string, Map<string, boolean>>();

  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.options)) {
      const values = groups.get(name) ?? new Map<string, boolean>();
      values.set(value, (values.get(value) ?? false) || variant.stock > 0);
      groups.set(name, values);
    }
  }

  return [...groups.entries()].map(([name, values]) => ({
    name,
    values: [...values.entries()].map(([value, available]) => ({ value, available })),
  }));
}

/** The variant matching every selected option, if the selection is complete. */
export function findVariantForSelection(
  variants: readonly Variant[],
  selection: VariantSelection
): Variant | undefined {
  return variants.find((variant) => {
    const entries = Object.entries(variant.options);
    if (entries.length !== Object.keys(selection).length) return false;
    return entries.every(([name, value]) => selection[name] === value);
  });
}

/**
 * What the picker starts on: the first variant with stock, falling back to the
 * first variant so a sold-out product still shows a price rather than a blank.
 */
export function defaultSelection(variants: readonly Variant[]): VariantSelection {
  const preferred = variants.find((variant) => variant.stock > 0) ?? variants[0];
  return preferred ? { ...preferred.options } : {};
}

/** A product with exactly one variant and no options needs no picker at all. */
export function needsPicker(variants: readonly Variant[]): boolean {
  if (variants.length <= 1) return false;
  return variantOptionGroups(variants).length > 0;
}

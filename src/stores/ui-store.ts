"use client";

import { create } from "zustand";
import type { Attribution } from "@/domain/types";

/**
 * Transient UI state that several islands need to agree on.
 *
 * Only what genuinely crosses component boundaries lives here. Which product
 * sheet is open is one of those: a feed card, a story hotspot and the cart all
 * open the same sheet, and the story viewer has to know a sheet is open so it can
 * pause. Everything local to one component stays in that component.
 */

export interface ProductSheetRequest {
  productId: string;
  /** Carried into the cart line — this is how a creator gets paid. */
  attribution: Attribution;
  /** Pre-selected variant, e.g. when reopening from a cart line. */
  variantId?: string;
}

interface UiState {
  productSheet: ProductSheetRequest | null;
  openProductSheet: (request: ProductSheetRequest) => void;
  closeProductSheet: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  productSheet: null,
  openProductSheet: (request) => set({ productSheet: request }),
  closeProductSheet: () => set({ productSheet: null }),
}));

/** True when any sheet is open — the story timer subscribes to this. */
export const selectSheetOpen = (state: UiState): boolean => state.productSheet !== null;

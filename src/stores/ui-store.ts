"use client";

import { create } from "zustand";
import type { ProductDetail } from "@/domain/api";
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
  /**
   * The product, when the opener already has it — the story viewer is handed
   * every tagged product by the server render. Passing it means the sheet opens
   * with no request at all, which is the difference between working and not
   * working in a tunnel, and one less round trip everywhere else.
   */
  product?: ProductDetail;
}

/**
 * The cover a story card was showing when it was tapped.
 *
 * The viewer route is server-rendered, so on a slow connection there is a gap
 * between the tap and the first byte. Handing the cover across lets the loading
 * state paint the exact frame the reader just tapped, from their own cache,
 * instead of a black screen.
 */
export interface PendingStory {
  storyId: string;
  coverUrl: string;
  caption: string;
  segmentCount: number;
}

interface UiState {
  productSheet: ProductSheetRequest | null;
  openProductSheet: (request: ProductSheetRequest) => void;
  closeProductSheet: () => void;
  pendingStory: PendingStory | null;
  setPendingStory: (story: PendingStory | null) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  productSheet: null,
  openProductSheet: (request) => set({ productSheet: request }),
  closeProductSheet: () => set({ productSheet: null }),
  pendingStory: null,
  setPendingStory: (story) => set({ pendingStory: story }),
}));

/** True when any sheet is open — the story timer subscribes to this. */
export const selectSheetOpen = (state: UiState): boolean => state.productSheet !== null;

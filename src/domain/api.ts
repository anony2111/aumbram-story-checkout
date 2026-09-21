import type { Quote } from "./quote";
import type {
  Attribution,
  CartLine,
  Creator,
  Money,
  Order,
  Product,
  Story,
  Variant,
  VendorSummary,
} from "./types";

/**
 * The wire contract between the mock backend and the client.
 *
 * Two deliberate extensions of the shared domain model, both noted in the README:
 *
 * 1. Feed responses carry a trimmed `ProductCardView` rather than a whole `Product`.
 *    The generated `feed.json` embeds full products with every variant — 1.3 MB for
 *    300 items. Cards render a title, one image, a price range and a stock hint, so
 *    that is what the wire carries. Full products come from `/products/:id` and
 *    `/stories/:id`, which is also where the variant picker gets its data.
 * 2. Cart lines carry the product projection they are rendered with, so `/cart` does
 *    not have to fan out to N product requests on a 3G connection.
 */

// ------------------------------------------------------------------ errors

export type ApiErrorCode =
  | "INVALID_BODY"
  | "NOT_FOUND"
  | "CART_EMPTY"
  | "INVALID_PINCODE"
  | "VARIANT_NOT_FOUND"
  | "QUANTITY_OUT_OF_RANGE"
  | "OUT_OF_STOCK"
  | "PRICE_CHANGED"
  | "PINCODE_NOT_SERVICEABLE"
  | "COD_NOT_AVAILABLE"
  | "IDEMPOTENCY_KEY_MISSING"
  | "IDEMPOTENCY_KEY_REUSED"
  | "SERVICE_UNAVAILABLE";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface PriceChangedDetails {
  lines: { variantId: string; expected: Money; current: Money }[];
}

export interface OutOfStockDetails {
  variantId: string;
  available: number;
}

export interface PincodeNotServiceableDetails {
  vendorIds: string[];
}

// -------------------------------------------------------------------- feed

/** What a card needs, and nothing else. */
export interface ProductCardView {
  id: string;
  /**
   * The full summary rather than just an id: a quick-add that happens offline has
   * to render a cart line with a seller name on it, and there is nobody to ask.
   */
  vendor: VendorSummary;
  title: string;
  image: { url: string; width: number; height: number } | null;
  priceRange: { min: Money; max: Money };
  mrp: Money | null;
  /** Summed across variants; drives "Sold out" and "Only N left". */
  totalStock: number;
  variantCount: number;
  /** Needed to sum live stock updates, which arrive per variant. */
  variantIds: string[];
  /**
   * Set only when exactly one variant is purchasable, which makes quick-add a
   * single tap. Anything else has to go through the picker in the sheet.
   */
  quickAddVariantId: string | null;
}

export interface StoryCardView {
  id: string;
  creatorId: string;
  caption: string;
  /** First segment's poster (video) or image, shown instantly when the viewer opens. */
  coverUrl: string;
  segmentCount: number;
  taggedProductCount: number;
}

export type FeedCard =
  | {
      id: string;
      type: "product";
      product: ProductCardView;
      reason?: "trending" | "followed_vendor" | "similar";
    }
  | {
      id: string;
      type: "story";
      story: StoryCardView;
      creator: Creator;
      products: ProductCardView[];
    }
  | { id: string; type: "creator"; creator: Creator; sampleProducts: ProductCardView[] }
  | { id: string; type: "promo"; title: string; imageUrl: string; deeplink: string; endsAt: string };

export interface FeedPage {
  items: FeedCard[];
  nextCursor: string | null;
}

// ------------------------------------------------------------------ story

export interface ProductDetail extends Omit<Product, "variants"> {
  variants: Variant[];
  vendor: VendorSummary;
}

export interface StoryResponse {
  story: Story;
  creator: Creator;
  products: ProductDetail[];
  /** Creator order in the feed, so the viewer knows which group a swipe lands on. */
  creatorFeedOrder: string[];
}

export interface CreatorStoriesResponse {
  items: Story[];
}

// ------------------------------------------------------------------- cart

export interface CartLineView extends CartLine {
  productTitle: string;
  imageUrl: string | null;
  variantOptions: Record<string, string>;
  /** Current price, which may have moved since `priceAtAdd`. */
  unitPrice: Money;
  stock: number;
  vendor: VendorSummary;
}

export interface CartResponse {
  lines: CartLineView[];
  itemCount: number;
  subtotal: Money;
}

// --------------------------------------------------------------- checkout

export type QuoteResponse = Quote;

export interface PlaceOrderResponse {
  orders: Order[];
}

export interface OrdersByKeyResponse {
  items: Order[];
}

// ------------------------------------------------------------------ misc

export interface CartMutationRequest {
  variantId: string;
  quantity: number;
  attribution?: Attribution;
  clientMutationId: string;
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const error = (value as { error?: unknown }).error;
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string";
}

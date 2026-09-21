/**
 * Domain entities, mirroring shared/domain-model.md.
 *
 * These types are framework-free on purpose: every rule in this folder is a pure
 * function over them, so the rules can be unit-tested without React, Next or fetch.
 * Runtime validation of anything crossing the network lives in `schemas.ts`.
 */

export type Currency = "INR";

/** Money is always an integer number of paise. Never a float, never a rupee. */
export interface Money {
  readonly amount: number;
  readonly currency: Currency;
}

export type Locale = "en" | "hi";

export interface Creator {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  followerCount: number;
  commissionRateBps: number;
  verified: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  city: string;
  state: string;
  gstin?: string | null;
  rating: number;
  codEnabled: boolean;
  serviceablePincodePrefixes: string[];
}

/** The subset of a vendor the client needs; never ship serviceability lists to the browser. */
export interface VendorSummary {
  id: string;
  name: string;
  codEnabled: boolean;
}

export interface Variant {
  id: string;
  productId: string;
  sku: string;
  options: Record<string, string>;
  price: Money;
  stock: number;
}

export interface ProductImage {
  url: string;
  width: number;
  height: number;
  blurhash?: string | null;
}

export type ProductCategory =
  | "apparel"
  | "home-decor"
  | "jewellery"
  | "beauty"
  | "food"
  | "crafts";

export type ProductStatus = "draft" | "active" | "archived";

export interface Product {
  id: string;
  vendorId: string;
  title: string;
  description: string;
  category: ProductCategory;
  images: ProductImage[];
  priceRange: { min: Money; max: Money };
  mrp?: Money | null;
  tags: string[];
  status: ProductStatus;
  ratingAvg: number;
  ratingCount: number;
  variants: Variant[];
}

/** A product as served to the client: variants plus just enough vendor context. */
export interface ProductWithVendor extends Product {
  vendor: VendorSummary;
}

export type StorySegmentType = "image" | "video";

export interface StorySegment {
  type: StorySegmentType;
  url: string;
  durationMs: number;
  posterUrl?: string | null;
}

export interface TaggedProduct {
  productId: string;
  segmentIndex: number;
  /** 0-1, relative to the original 720x1280 frame. */
  x: number;
  /** 0-1, relative to the original 720x1280 frame. */
  y: number;
}

export interface Story {
  id: string;
  creatorId: string;
  segments: StorySegment[];
  caption: string;
  taggedProducts: TaggedProduct[];
  publishedAt: string;
  expiresAt?: string | null;
  stats: { views: number; likes: number; shares: number };
}

export type FeedItem =
  | {
      id: string;
      type: "product";
      product: Product;
      reason?: "trending" | "followed_vendor" | "similar";
    }
  | { id: string; type: "story"; story: Story; creator: Creator; products: Product[] }
  | { id: string; type: "creator"; creator: Creator; sampleProducts: Product[] }
  | { id: string; type: "promo"; title: string; imageUrl: string; deeplink: string; endsAt: string };

export type FeedItemType = FeedItem["type"];

export type LiveUpdate =
  | { type: "stock"; variantId: string; stock: number }
  | { type: "price_drop"; productId: string; newMin: Money }
  | { type: "live_viewers"; storyId: string; count: number };

/** Where an add-to-cart happened. Carried all the way to the order — it is someone's commission. */
export interface Attribution {
  storyId?: string;
  creatorId?: string;
}

export interface CartLine {
  variantId: string;
  productId: string;
  quantity: number;
  priceAtAdd: Money;
  attribution: Attribution;
  /** Server-side add order, used to pick the most recent attribution per vendor. */
  addedAt: string;
}

export interface Cart {
  lines: CartLine[];
  itemCount: number;
  subtotal: Money;
}

export type PaymentMethod = "upi" | "card" | "cod";

export type OrderStatus =
  | "pending_payment"
  | "confirmed"
  | "paid"
  | "packed"
  | "shipped"
  | "delivered"
  | "return_requested"
  | "returned"
  | "cancelled";

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  /** E.164, e.g. +919876543210. */
  phone: string;
}

export interface OrderLine {
  variantId: string;
  quantity: number;
  unitPrice: Money;
}

export interface Order {
  id: string;
  userId: string;
  vendorId: string;
  lines: OrderLine[];
  subtotal: Money;
  shippingFee: Money;
  total: Money;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  shippingAddress: ShippingAddress;
  attribution: Attribution;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

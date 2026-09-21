import { z } from "zod";
import { MAX_LINE_QUANTITY, MOBILE_PATTERN, PINCODE_PATTERN } from "./rules";

/**
 * Runtime validation at every boundary.
 *
 * Two boundaries matter here: the generated mock dataset read off disk (it is
 * synthetic and deliberately quirky), and request bodies arriving at the route
 * handlers. Parsing both means a malformed shape fails loudly at the edge instead
 * of surfacing as `undefined` three layers in.
 */

export const moneySchema = z.object({
  amount: z.number().int(),
  currency: z.literal("INR"),
});

// ------------------------------------------------------------- entities

export const vendorSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  state: z.string(),
  gstin: z.string().nullish(),
  rating: z.number(),
  codEnabled: z.boolean(),
  serviceablePincodePrefixes: z.array(z.string()),
});

export const creatorSchema = z.object({
  id: z.string(),
  userId: z.string(),
  handle: z.string(),
  displayName: z.string(),
  avatarUrl: z.string(),
  followerCount: z.number().int(),
  commissionRateBps: z.number().int(),
  verified: z.boolean(),
});

export const variantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string(),
  options: z.record(z.string(), z.string()),
  price: moneySchema,
  stock: z.number().int().min(0),
});

export const productSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.enum(["apparel", "home-decor", "jewellery", "beauty", "food", "crafts"]),
  images: z.array(
    z.object({
      url: z.string(),
      width: z.number().int(),
      height: z.number().int(),
      blurhash: z.string().nullish(),
    })
  ),
  priceRange: z.object({ min: moneySchema, max: moneySchema }),
  mrp: moneySchema.nullish(),
  tags: z.array(z.string()),
  status: z.enum(["draft", "active", "archived"]),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  variants: z.array(variantSchema),
});

export const storySchema = z.object({
  id: z.string(),
  creatorId: z.string(),
  segments: z.array(
    z.object({
      type: z.enum(["image", "video"]),
      url: z.string(),
      durationMs: z.number().int().positive(),
      posterUrl: z.string().nullish(),
    })
  ),
  caption: z.string(),
  taggedProducts: z.array(
    z.object({
      productId: z.string(),
      segmentIndex: z.number().int().min(0),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
  ),
  publishedAt: z.string(),
  expiresAt: z.string().nullish(),
  stats: z.object({
    views: z.number().int(),
    likes: z.number().int(),
    shares: z.number().int(),
  }),
});

/**
 * Feed items are normalised to references on load: the generated `feed.json`
 * embeds whole product objects, which is 1.3 MB of duplication we never send.
 */
export const feedEntrySchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("product"),
    product: z.object({ id: z.string() }),
    reason: z.enum(["trending", "followed_vendor", "similar"]).optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("story"),
    story: z.object({ id: z.string() }),
    creator: z.object({ id: z.string() }),
    products: z.array(z.object({ id: z.string() })),
  }),
  z.object({
    id: z.string(),
    type: z.literal("creator"),
    creator: z.object({ id: z.string() }),
    sampleProducts: z.array(z.object({ id: z.string() })),
  }),
  z.object({
    id: z.string(),
    type: z.literal("promo"),
    title: z.string(),
    imageUrl: z.string(),
    // Promo deeplinks are rendered as links; only our own scheme is ever followed.
    deeplink: z.string(),
    endsAt: z.string(),
  }),
]);

export const liveUpdateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stock"), variantId: z.string(), stock: z.number().int().min(0) }),
  z.object({ type: z.literal("price_drop"), productId: z.string(), newMin: moneySchema }),
  z.object({ type: z.literal("live_viewers"), storyId: z.string(), count: z.number().int().min(0) }),
]);

// ------------------------------------------------------- request bodies

export const attributionSchema = z.object({
  storyId: z.string().optional(),
  creatorId: z.string().optional(),
});

export const addCartLineSchema = z.object({
  variantId: z.string().min(1),
  /** A delta, so the same endpoint serves "add one more". */
  quantity: z.number().int().refine((n) => n !== 0, "quantity delta must not be 0"),
  attribution: attributionSchema.default({}),
  clientMutationId: z.string().min(1),
});

export const patchCartLineSchema = z.object({
  quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY),
  clientMutationId: z.string().min(1),
});

export const quoteRequestSchema = z.object({
  pincode: z.string(),
});

export const shippingAddressSchema = z.object({
  name: z.string().min(1).max(80),
  line1: z.string().min(1).max(120),
  line2: z.string().max(120).optional(),
  city: z.string().min(1).max(60),
  state: z.string().min(1).max(60),
  pincode: z.string().regex(PINCODE_PATTERN),
  phone: z.string().regex(/^\+91[6-9][0-9]{9}$/),
});

export const placeOrderSchema = z.object({
  shippingAddress: shippingAddressSchema,
  paymentMethod: z.enum(["upi", "card", "cod"]),
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
        expectedUnitPrice: moneySchema,
        attribution: attributionSchema.default({}),
      })
    )
    .min(1),
});

export const analyticsEventSchema = z.object({
  id: z.string().min(1),
  name: z.enum([
    "feed_impression",
    "card_tap",
    "story_view",
    "story_product_tap",
    "add_to_cart",
    "checkout_start",
    "purchase",
  ]),
  props: z.record(z.string(), z.unknown()).default({}),
  clientTs: z.string(),
  sessionId: z.string(),
  userId: z.string().nullish(),
  device: z
    .object({
      os: z.string().optional(),
      network: z.string().optional(),
    })
    .optional(),
});

export const eventBatchSchema = z.object({
  events: z.array(analyticsEventSchema).max(100),
});

export const rumSchema = z.object({
  buildId: z.string(),
  route: z.string(),
  locale: z.string(),
  effectiveType: z.string().optional(),
  metric: z.object({
    name: z.enum(["LCP", "CLS", "INP", "TTFB", "FCP"]),
    value: z.number(),
    rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
    id: z.string().optional(),
    attribution: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const clientErrorSchema = z.object({
  buildId: z.string(),
  route: z.string(),
  correlationId: z.string(),
  name: z.string(),
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  componentStack: z.string().max(4000).optional(),
});

/** Mobile numbers are validated as ten digits in the form, then stored as E.164. */
export const mobileSchema = z.string().regex(MOBILE_PATTERN);

export type AddCartLineBody = z.infer<typeof addCartLineSchema>;
export type PatchCartLineBody = z.infer<typeof patchCartLineSchema>;
export type PlaceOrderBody = z.infer<typeof placeOrderSchema>;
export type QuoteRequestBody = z.infer<typeof quoteRequestSchema>;
export type AnalyticsEventBody = z.infer<typeof analyticsEventSchema>;
export type RumBody = z.infer<typeof rumSchema>;
export type ClientErrorBody = z.infer<typeof clientErrorSchema>;

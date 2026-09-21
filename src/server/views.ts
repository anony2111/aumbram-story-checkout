import { getDataset } from "./dataset";
import { currentPrice, currentStock, totalStockForProduct } from "./store";
import type { CartLineView, ProductCardView, ProductDetail, StoryCardView } from "@/domain/api";
import type { CartLine, Money, Product, Story, Variant, Vendor, VendorSummary } from "@/domain/types";

/**
 * Projections from seed entities to what the wire carries.
 *
 * Live stock and price overrides are applied here, once, so every surface —
 * feed card, product sheet, cart, quote — reports the same number.
 */

export function vendorSummary(vendor: Vendor): VendorSummary {
  return { id: vendor.id, name: vendor.name, codEnabled: vendor.codEnabled };
}

function liveVariant(variant: Variant): Variant {
  return {
    ...variant,
    price: currentPrice(variant.id) ?? variant.price,
    stock: currentStock(variant.id),
  };
}

/** Recomputed from live variant prices, so a price drop moves the card too. */
function livePriceRange(product: Product): { min: Money; max: Money } {
  const amounts = product.variants.map((variant) => (currentPrice(variant.id) ?? variant.price).amount);
  if (amounts.length === 0) return product.priceRange;
  return {
    min: { amount: Math.min(...amounts), currency: "INR" },
    max: { amount: Math.max(...amounts), currency: "INR" },
  };
}

export function productCard(product: Product): ProductCardView {
  const image = product.images[0];
  const inStock = product.variants.filter((variant) => currentStock(variant.id) > 0);
  const vendor = getDataset().vendors.get(product.vendorId);
  if (!vendor) throw new Error(`Unknown vendor ${product.vendorId}`);
  return {
    id: product.id,
    vendor: vendorSummary(vendor),
    title: product.title,
    image: image ? { url: image.url, width: image.width, height: image.height } : null,
    priceRange: livePriceRange(product),
    mrp: product.mrp ?? null,
    totalStock: totalStockForProduct(product.id),
    variantCount: product.variants.length,
    variantIds: product.variants.map((variant) => variant.id),
    quickAddVariantId: inStock.length === 1 ? (inStock[0]?.id ?? null) : null,
  };
}

export function productCardById(productId: string): ProductCardView | null {
  const product = getDataset().products.get(productId);
  return product ? productCard(product) : null;
}

export function productDetail(product: Product): ProductDetail {
  const dataset = getDataset();
  const vendor = dataset.vendors.get(product.vendorId);
  if (!vendor) throw new Error(`Unknown vendor ${product.vendorId}`);
  return {
    ...product,
    priceRange: livePriceRange(product),
    mrp: product.mrp ?? null,
    variants: product.variants.map(liveVariant),
    vendor: vendorSummary(vendor),
  };
}

/** The first frame a story shows: a video segment's poster, or the image itself. */
export function storyCoverUrl(story: Story): string {
  const first = story.segments[0];
  if (!first) return "";
  if (first.type === "video") return first.posterUrl ?? first.url;
  return first.url;
}

export function storyCard(story: Story): StoryCardView {
  return {
    id: story.id,
    creatorId: story.creatorId,
    caption: story.caption,
    coverUrl: storyCoverUrl(story),
    segmentCount: story.segments.length,
    taggedProductCount: story.taggedProducts.length,
  };
}

export function cartLineView(line: CartLine): CartLineView | null {
  const ref = getDataset().variants.get(line.variantId);
  if (!ref) return null;
  const image = ref.product.images[0];
  return {
    ...line,
    productTitle: ref.product.title,
    imageUrl: image ? image.url : null,
    variantOptions: ref.variant.options,
    unitPrice: currentPrice(line.variantId) ?? ref.variant.price,
    stock: currentStock(line.variantId),
    vendor: vendorSummary(ref.vendor),
  };
}

/**
 * English messages — the source of truth for the key set.
 *
 * A value is either a string or a record of plural categories. Placeholders are
 * `{braces}`; product content (titles, captions, vendor names) is never a message,
 * it is data passed through as a placeholder value.
 */
export const en = {
  // ---------------------------------------------------------------- app
  "app.name": "Aumbram",
  "app.cart": "Cart",
  "app.cartWithCount": { one: "Cart, {count} item", other: "Cart, {count} items" },
  "app.language": "Language",
  "app.back": "Back",
  "app.close": "Close",
  "app.retry": "Try again",
  "app.loading": "Loading…",
  "app.buildId": "Build {id}",

  // --------------------------------------------------------------- feed
  "feed.title": "For you",
  "feed.loadMore": "Load more",
  "feed.loadingMore": "Loading more…",
  "feed.end": "You've reached the end",
  "feed.cardFailed": "This card couldn't load.",
  "feed.failed": "The feed couldn't load.",
  "feed.storyProducts": { one: "{count} product", other: "{count} products" },
  "feed.reason.trending": "Trending",
  "feed.reason.followed_vendor": "From a seller you follow",
  "feed.reason.similar": "Similar to what you viewed",
  "feed.promoEnds": "Ends {date}",

  // ------------------------------------------------------------ product
  "product.from": "From",
  "product.onlyLeft": { one: "Only {count} left", other: "Only {count} left" },
  "product.soldOut": "Sold out",
  "product.discount": "{percent}% off",
  "product.mrp": "M.R.P. {price}",
  "product.quickAdd": "Add to cart",
  "product.quickAddNamed": "Add {title} to cart",
  "product.choose": "Choose options",
  "product.added": "Added",

  // -------------------------------------------------------------- sheet
  "sheet.addToCart": "Add to cart",
  "sheet.added": "Added to cart",
  "sheet.adding": "Adding…",
  "sheet.soldOutVariant": "Sold out",
  "sheet.soldBy": "Sold by {vendor}",
  "sheet.selectOption": "Choose {option}",
  "sheet.addFailed": "Couldn't add that. Try again.",

  // -------------------------------------------------------------- story
  "story.paused": "Paused",
  "story.pause": "Pause",
  "story.play": "Play",
  "story.previous": "Previous segment",
  "story.next": "Next segment",
  "story.close": "Close story",
  "story.loadFailed": "Couldn't load",
  "story.loadFailedHint": "This frame didn't arrive in time.",
  "story.viewers": { one: "{count} watching", other: "{count} watching" },
  "story.hotspot": "{title}, {price}",
  "story.failed": "This story couldn't be played.",
  "story.backToFeed": "Back to the feed",
  "story.segmentProgress": "Segment {current} of {total}",

  // --------------------------------------------------------------- cart
  "cart.title": "Cart",
  "cart.empty": "Your cart is empty.",
  "cart.emptyAction": "Find something in the feed",
  "cart.soldBy": "Sold by {vendor}",
  "cart.remove": "Remove",
  "cart.removeNamed": "Remove {title}",
  "cart.increase": "Increase quantity",
  "cart.decrease": "Decrease quantity",
  "cart.quantity": "Quantity",
  "cart.priceWas": "Was {price}",
  "cart.priceChanged": "The price changed since you added this.",
  "cart.pending": "Saved on this phone, not sent yet",
  "cart.pendingCount": { one: "{count} change pending", other: "{count} changes pending" },
  "cart.outOfStock": "Only {count} left — update the quantity to continue.",
  "cart.outOfStockNone": "This sold out while it was in your cart.",
  "cart.resolveFirst": "Resolve the flagged items before checking out.",
  "cart.subtotal": "Subtotal",
  "cart.checkout": "Checkout",
  "cart.discoveredVia": "Discovered via {creatorHandle}",
  "cart.fromStory": "From a story you watched",
  "cart.problemsTitle": "Needs your attention",
  "cart.lineCount": { one: "{count} item", other: "{count} items" },

  // ----------------------------------------------------------- checkout
  "checkout.title": "Checkout",
  "checkout.addressSection": "Address",
  "checkout.deliverySection": "Delivery",
  "checkout.paymentSection": "Payment",
  "checkout.name": "Full name",
  "checkout.phone": "Mobile number",
  "checkout.phoneHint": "10 digits, starting 6-9",
  "checkout.phoneInvalid": "Enter a valid 10-digit mobile number",
  "checkout.line1": "Address",
  "checkout.line2": "Landmark (optional)",
  "checkout.city": "City",
  "checkout.state": "State",
  "checkout.pincode": "Delivery pincode",
  "checkout.pincodeInvalid": "Enter a valid 6-digit pincode",
  "checkout.required": "{field} is required",
  "checkout.checkingPincode": "Checking delivery…",
  "checkout.orderOf": "Order {index} · {vendor}",
  "checkout.freeDelivery": "Free delivery",
  "checkout.deliveryFee": "Delivery {fee}",
  "checkout.notServiceable": "{vendorName} doesn't deliver to {pincode} yet",
  "checkout.removeThese": "Remove these items",
  "checkout.codUnavailable": "{vendorName} doesn't offer Cash on Delivery",
  "checkout.codTooHigh": "Cash on Delivery is limited to {limit} per order",
  "checkout.splitNotice": {
    one: "Your items ship from {count} seller, so you'll get {count} order",
    other: "Your items ship from {count} sellers, so you'll get {count} orders",
  },
  "checkout.payUpi": "UPI",
  "checkout.payCard": "Card",
  "checkout.payCod": "Cash on Delivery",
  "checkout.codDisabled": "Cash on Delivery: unavailable",
  "checkout.placeOrder": "Place order · {total}",
  "checkout.placeOrders": { one: "Place {count} order · {total}", other: "Place {count} orders · {total}" },
  "checkout.confirming": "Confirming your order…",
  "checkout.unknownOutcome": "We couldn't confirm your order yet",
  "checkout.unknownOutcomeHint":
    "Your order may have gone through. We'll check again rather than place it twice.",
  "checkout.checkAgain": "Check again",
  "checkout.priceChangedTitle": "Prices changed",
  "checkout.priceChangedLine": "{title}: {oldPrice} → {newPrice}",
  "checkout.acceptNewPrices": "Accept new prices",
  "checkout.outOfStockTitle": "Something sold out",
  "checkout.backToCart": "Back to cart",
  "checkout.emptyCart": "There's nothing to check out.",
  "checkout.blockedByUnserviceable": "Remove the items we can't deliver to continue.",
  "checkout.total": "Total",
  "checkout.subtotal": "Subtotal",
  "checkout.delivery": "Delivery",

  // -------------------------------------------------------------- order
  "order.confirmedTitle": { one: "Order placed", other: "{count} orders placed" },
  "order.number": "Order {id}",
  "order.placedAt": "Placed {datetime} IST",
  "order.attributedTo": "Discovered via {creatorHandle}",
  "order.payNow": "Pay {total} via UPI",
  "order.paying": "Waiting for payment…",
  "order.continueShopping": "Continue shopping",
  "order.notFound": "We couldn't find that order.",
  "order.status.pending_payment": "Payment pending",
  "order.status.confirmed": "Confirmed",
  "order.status.paid": "Paid",
  "order.status.packed": "Packed",
  "order.status.shipped": "Shipped",
  "order.status.delivered": "Delivered",
  "order.status.return_requested": "Return requested",
  "order.status.returned": "Returned",
  "order.status.cancelled": "Cancelled",

  // ------------------------------------------------------------ offline
  "offline.banner": "You're offline. Your cart is saved on this phone.",
  "offline.syncing": "Syncing your cart…",
  "offline.orderBlocked": "You need to be online to place an order.",

  // ------------------------------------------------------------- errors
  "error.title": "Something went wrong",
  "error.body": "We've logged it. You can try again.",
  "error.reference": "Reference {id}",
} as const;

export type Messages = typeof en;
export type MessageKey = keyof Messages;

/** A plural message must always define `other`; the rest depend on the language. */
export type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export type MessageValue = string | PluralMessage;

/**
 * Every other locale is checked against English: same keys, and a key that is
 * plural in English must be plural everywhere. A missing key is a type error, not
 * a blank on screen.
 */
export type Dictionary = {
  [K in MessageKey]: Messages[K] extends string ? string : PluralMessage;
};

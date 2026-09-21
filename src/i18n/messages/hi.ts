import type { Dictionary } from "./en";

/**
 * Hindi messages.
 *
 * Typed as `Dictionary`, so a key that exists in English and not here is a build
 * error. Hindi runs 30-40% longer than English in places ("Cash on Delivery" ->
 * "कैश ऑन डिलीवरी"), which is what the layouts are checked against.
 *
 * Note `Intl.PluralRules("hi")` puts both 0 and 1 in the `one` category, so
 * `one` has to read naturally for "0 बचे" as well.
 */
export const hi: Dictionary = {
  // ---------------------------------------------------------------- app
  "app.name": "आम्ब्रम",
  "app.cart": "कार्ट",
  "app.cartWithCount": { one: "कार्ट, {count} चीज़", other: "कार्ट, {count} चीज़ें" },
  "app.language": "भाषा",
  "app.back": "वापस",
  "app.close": "बंद करें",
  "app.retry": "फिर कोशिश करें",
  "app.loading": "लोड हो रहा है…",
  "app.buildId": "बिल्ड {id}",

  // --------------------------------------------------------------- feed
  "feed.title": "आपके लिए",
  "feed.loadMore": "और देखें",
  "feed.loadingMore": "और लोड हो रहा है…",
  "feed.end": "बस इतना ही",
  "feed.cardFailed": "यह कार्ड लोड नहीं हो पाया।",
  "feed.failed": "फ़ीड लोड नहीं हो पाई।",
  "feed.storyProducts": { one: "{count} प्रोडक्ट", other: "{count} प्रोडक्ट" },
  "feed.reason.trending": "ट्रेंडिंग",
  "feed.reason.followed_vendor": "आपके फ़ॉलो किए विक्रेता से",
  "feed.reason.similar": "आपने जो देखा उससे मिलता-जुलता",
  "feed.promoEnds": "{date} तक",

  // ------------------------------------------------------------ product
  "product.from": "से शुरू",
  "product.onlyLeft": { one: "सिर्फ़ {count} बचा है", other: "सिर्फ़ {count} बचे हैं" },
  "product.soldOut": "स्टॉक ख़त्म",
  "product.discount": "{percent}% छूट",
  "product.mrp": "एम.आर.पी. {price}",
  "product.quickAdd": "कार्ट में डालें",
  "product.quickAddNamed": "{title} कार्ट में डालें",
  "product.choose": "विकल्प चुनें",
  "product.added": "जोड़ दिया",

  // -------------------------------------------------------------- sheet
  "sheet.addToCart": "कार्ट में डालें",
  "sheet.added": "कार्ट में जोड़ दिया गया",
  "sheet.adding": "जोड़ा जा रहा है…",
  "sheet.soldOutVariant": "स्टॉक ख़त्म",
  "sheet.soldBy": "{vendor} द्वारा बेचा गया",
  "sheet.selectOption": "{option} चुनें",
  "sheet.addFailed": "जोड़ नहीं पाए। फिर कोशिश करें।",

  // -------------------------------------------------------------- story
  "story.paused": "रुका हुआ",
  "story.pause": "रोकें",
  "story.play": "चलाएँ",
  "story.previous": "पिछला हिस्सा",
  "story.next": "अगला हिस्सा",
  "story.close": "स्टोरी बंद करें",
  "story.loadFailed": "लोड नहीं हुआ",
  "story.loadFailedHint": "यह फ़्रेम समय पर नहीं आ पाया।",
  "story.viewers": { one: "{count} देख रहा है", other: "{count} देख रहे हैं" },
  "story.hotspot": "{title}, {price}",
  "story.failed": "यह स्टोरी नहीं चल पाई।",
  "story.backToFeed": "फ़ीड पर वापस",
  "story.segmentProgress": "{total} में से {current} हिस्सा",

  // --------------------------------------------------------------- cart
  "cart.title": "कार्ट",
  "cart.empty": "आपका कार्ट ख़ाली है।",
  "cart.emptyAction": "फ़ीड में कुछ ढूँढें",
  "cart.soldBy": "{vendor} द्वारा बेचा गया",
  "cart.remove": "हटाएँ",
  "cart.removeNamed": "{title} हटाएँ",
  "cart.increase": "संख्या बढ़ाएँ",
  "cart.decrease": "संख्या घटाएँ",
  "cart.quantity": "संख्या",
  "cart.priceWas": "पहले {price}",
  "cart.priceChanged": "जोड़ने के बाद क़ीमत बदल गई है।",
  "cart.pending": "इस फ़ोन पर सेव है, अभी भेजा नहीं गया",
  "cart.pendingCount": { one: "{count} बदलाव बाक़ी", other: "{count} बदलाव बाक़ी" },
  "cart.outOfStock": "सिर्फ़ {count} बचे हैं — आगे बढ़ने के लिए संख्या बदलें।",
  "cart.outOfStockNone": "कार्ट में रहते हुए यह ख़त्म हो गया।",
  "cart.resolveFirst": "चेकआउट से पहले चिह्नित चीज़ें ठीक करें।",
  "cart.subtotal": "उप-योग",
  "cart.checkout": "चेकआउट",
  "cart.discoveredVia": "{creatorHandle} के ज़रिए मिला",
  "cart.fromStory": "एक स्टोरी से जो आपने देखी",
  "cart.problemsTitle": "आपके ध्यान की ज़रूरत है",
  "cart.lineCount": { one: "{count} चीज़", other: "{count} चीज़ें" },

  // ----------------------------------------------------------- checkout
  "checkout.title": "चेकआउट",
  "checkout.addressSection": "पता",
  "checkout.deliverySection": "डिलीवरी",
  "checkout.paymentSection": "भुगतान",
  "checkout.name": "पूरा नाम",
  "checkout.phone": "मोबाइल नंबर",
  "checkout.phoneHint": "10 अंक, 6-9 से शुरू",
  "checkout.phoneInvalid": "सही 10 अंकों का मोबाइल नंबर डालें",
  "checkout.line1": "पता",
  "checkout.line2": "लैंडमार्क (वैकल्पिक)",
  "checkout.city": "शहर",
  "checkout.state": "राज्य",
  "checkout.pincode": "डिलीवरी पिनकोड",
  "checkout.pincodeInvalid": "सही 6 अंकों का पिनकोड डालें",
  "checkout.required": "{field} ज़रूरी है",
  "checkout.checkingPincode": "डिलीवरी देखी जा रही है…",
  "checkout.orderOf": "ऑर्डर {index} · {vendor}",
  "checkout.freeDelivery": "मुफ़्त डिलीवरी",
  "checkout.deliveryFee": "डिलीवरी {fee}",
  "checkout.notServiceable": "{vendorName} अभी {pincode} पर डिलीवरी नहीं करता",
  "checkout.removeThese": "ये चीज़ें हटाएँ",
  "checkout.codUnavailable": "{vendorName} कैश ऑन डिलीवरी की सुविधा नहीं देता",
  "checkout.codTooHigh": "कैश ऑन डिलीवरी हर ऑर्डर पर {limit} तक ही है",
  "checkout.splitNotice": {
    one: "आपका सामान {count} विक्रेता से आएगा, इसलिए आपको {count} ऑर्डर मिलेगा",
    other: "आपका सामान {count} विक्रेताओं से आएगा, इसलिए आपको {count} ऑर्डर मिलेंगे",
  },
  "checkout.payUpi": "यूपीआई",
  "checkout.payCard": "कार्ड",
  "checkout.payCod": "कैश ऑन डिलीवरी",
  "checkout.codDisabled": "कैश ऑन डिलीवरी: उपलब्ध नहीं",
  "checkout.placeOrder": "ऑर्डर करें · {total}",
  "checkout.placeOrders": {
    one: "{count} ऑर्डर करें · {total}",
    other: "{count} ऑर्डर करें · {total}",
  },
  "checkout.confirming": "आपका ऑर्डर कन्फ़र्म हो रहा है…",
  "checkout.unknownOutcome": "हम अभी आपका ऑर्डर कन्फ़र्म नहीं कर पाए",
  "checkout.unknownOutcomeHint":
    "हो सकता है ऑर्डर लग चुका हो। दोबारा ऑर्डर करने के बजाय हम फिर से देखेंगे।",
  "checkout.checkAgain": "फिर से देखें",
  "checkout.priceChangedTitle": "क़ीमतें बदल गईं",
  "checkout.priceChangedLine": "{title}: {oldPrice} → {newPrice}",
  "checkout.acceptNewPrices": "नई क़ीमतें मंज़ूर करें",
  "checkout.outOfStockTitle": "कुछ ख़त्म हो गया",
  "checkout.backToCart": "कार्ट पर वापस",
  "checkout.emptyCart": "चेकआउट के लिए कुछ नहीं है।",
  "checkout.blockedByUnserviceable": "आगे बढ़ने के लिए वे चीज़ें हटाएँ जो हम डिलीवर नहीं कर सकते।",
  "checkout.total": "कुल",
  "checkout.subtotal": "उप-योग",
  "checkout.delivery": "डिलीवरी",

  // -------------------------------------------------------------- order
  "order.confirmedTitle": { one: "ऑर्डर हो गया", other: "{count} ऑर्डर हो गए" },
  "order.number": "ऑर्डर {id}",
  "order.placedAt": "{datetime} IST पर किया गया",
  "order.attributedTo": "{creatorHandle} के ज़रिए मिला",
  "order.payNow": "यूपीआई से {total} दें",
  "order.paying": "भुगतान का इंतज़ार…",
  "order.continueShopping": "और देखें",
  "order.notFound": "वह ऑर्डर नहीं मिला।",
  "order.status.pending_payment": "भुगतान बाक़ी",
  "order.status.confirmed": "कन्फ़र्म",
  "order.status.paid": "भुगतान हो गया",
  "order.status.packed": "पैक हो गया",
  "order.status.shipped": "भेज दिया",
  "order.status.delivered": "पहुँच गया",
  "order.status.return_requested": "रिटर्न माँगा",
  "order.status.returned": "वापस हो गया",
  "order.status.cancelled": "रद्द",

  // ------------------------------------------------------------ offline
  "offline.banner": "आप ऑफ़लाइन हैं। आपका कार्ट इस फ़ोन पर सेव है।",
  "offline.syncing": "आपका कार्ट सिंक हो रहा है…",
  "offline.orderBlocked": "ऑर्डर करने के लिए ऑनलाइन होना ज़रूरी है।",

  // ------------------------------------------------------------- errors
  "error.title": "कुछ ग़लत हो गया",
  "error.body": "हमने इसे नोट कर लिया है। आप फिर कोशिश कर सकते हैं।",
  "error.reference": "संदर्भ {id}",
};

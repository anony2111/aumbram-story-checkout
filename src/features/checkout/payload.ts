import { isValidMobile, isValidPincode, toE164 } from "@/domain/rules";
import type { Quote } from "@/domain/quote";
import type { PlaceOrderBody } from "@/domain/schemas";
import type { PaymentMethod, ShippingAddress } from "@/domain/types";
import type { MessageKey } from "@/i18n/messages/en";

/**
 * Turning a filled-in form and a quote into the exact bytes that get posted, and
 * deciding when two of those are "the same order".
 *
 * Pure, because this is where a mistake costs money in both directions: a
 * fingerprint that is too loose lets a changed cart silently reuse a key and
 * replay the old order, and one that is too tight makes an innocent reordering
 * look like a new order and creates a duplicate.
 */

export interface AddressFormValues {
  name: string;
  /** Ten digits as typed; converted to E.164 only once it is valid. */
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

export const EMPTY_ADDRESS: AddressFormValues = {
  name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
};

export type AddressField = keyof AddressFormValues;

export type AddressErrors = Partial<Record<AddressField, MessageKey>>;

/** Order matters: the first invalid field is the one that gets focus. */
export const ADDRESS_FIELD_ORDER: AddressField[] = [
  "name",
  "phone",
  "line1",
  "line2",
  "city",
  "state",
  "pincode",
];

export interface AddressValidation {
  errors: AddressErrors;
  /** Present only when every field passes. */
  address?: ShippingAddress;
}

export function validateAddress(values: AddressFormValues): AddressValidation {
  const errors: AddressErrors = {};

  if (values.name.trim().length === 0) errors.name = "checkout.required";
  if (values.line1.trim().length === 0) errors.line1 = "checkout.required";
  if (values.city.trim().length === 0) errors.city = "checkout.required";
  if (values.state.trim().length === 0) errors.state = "checkout.required";

  const phone = values.phone.replace(/\s|-/g, "");
  if (phone.length === 0) errors.phone = "checkout.required";
  else if (!isValidMobile(phone)) errors.phone = "checkout.phoneInvalid";

  if (values.pincode.length === 0) errors.pincode = "checkout.required";
  else if (!isValidPincode(values.pincode)) errors.pincode = "checkout.pincodeInvalid";

  if (Object.keys(errors).length > 0) return { errors };

  const line2 = values.line2.trim();
  return {
    errors,
    address: {
      name: values.name.trim(),
      line1: values.line1.trim(),
      ...(line2 ? { line2 } : {}),
      city: values.city.trim(),
      state: values.state.trim(),
      pincode: values.pincode,
      // Stored in E.164; what was typed is a display concern.
      phone: toE164(phone),
    },
  };
}

export function firstInvalidField(errors: AddressErrors): AddressField | undefined {
  return ADDRESS_FIELD_ORDER.find((field) => errors[field] !== undefined);
}

/**
 * The lines that will actually be ordered: serviceable groups only.
 *
 * `expectedUnitPrice` is what the shopper was shown. Sending it is what turns a
 * price change into a 409 they get to accept or decline, rather than a silent
 * charge at a price they never saw.
 */
export function buildOrderPayload(
  quote: Quote,
  address: ShippingAddress,
  paymentMethod: PaymentMethod
): PlaceOrderBody {
  return {
    shippingAddress: address,
    paymentMethod,
    lines: quote.groups
      .filter((group) => group.serviceable)
      .flatMap((group) =>
        group.lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          expectedUnitPrice: line.unitPrice,
          attribution: line.attribution,
        }))
      ),
  };
}

/**
 * The canonical form of a payload: everything that changes the outcome, nothing
 * that does not.
 *
 * Lines are sorted so the array order cannot affect it. Attribution is excluded
 * on purpose — it decides who gets paid a commission, not what is bought or what
 * it costs, so re-attributing a line is not a different order.
 */
export function canonicalisePayload(payload: PlaceOrderBody): string {
  return JSON.stringify({
    paymentMethod: payload.paymentMethod,
    address: {
      name: payload.shippingAddress.name,
      line1: payload.shippingAddress.line1,
      line2: payload.shippingAddress.line2 ?? "",
      city: payload.shippingAddress.city,
      state: payload.shippingAddress.state,
      pincode: payload.shippingAddress.pincode,
      phone: payload.shippingAddress.phone,
    },
    lines: [...payload.lines]
      .map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        expectedUnitPrice: line.expectedUnitPrice.amount,
      }))
      .sort((a, b) => a.variantId.localeCompare(b.variantId)),
  });
}

/**
 * A short non-reversible digest of the canonical payload (FNV-1a, 64-bit).
 *
 * It is a fingerprint, never an identifier: only ever compared with another
 * fingerprint. Hashing matters because this is what gets written to
 * `localStorage`, and the canonical form contains a name, a phone number and an
 * address. Keeping a digest there instead means a shared phone holds no readable
 * copy of someone's address, while a reload mid-request can still recognise the
 * payload it was about to send.
 *
 * `crypto.subtle` would be stronger but is async, and the key has to be written
 * *before* the request goes out — a synchronous step is the point.
 */
export function fingerprintPayload(payload: PlaceOrderBody): string {
  return fnv1a64(canonicalisePayload(payload));
}

function fnv1a64(input: string): string {
  // 64-bit FNV-1a over two 32-bit halves, to stay inside safe integers.
  let high = 0x811c9dc5;
  let low = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    high ^= code & 0xff;
    low ^= (code >>> 8) & 0xff;
    high = Math.imul(high, 0x01000193) >>> 0;
    low = Math.imul(low, 0x01000193) >>> 0;
  }
  return `${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
}

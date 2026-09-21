/**
 * Scrubbing for anything that leaves the device as telemetry.
 *
 * Error messages are written by developers but interpolate runtime values, and a
 * checkout is exactly where those values are a phone number or an address. The
 * policy is to send no PII at all; this is the last line of defence for the free
 * text we cannot fully control, not a substitute for not collecting it.
 */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** +919876543210, 9876543210, 98765 43210 — any run of 10 or more digits. */
const LONG_NUMBER = /\+?\d[\d\s-]{8,}\d/g;

export function scrubPii(text: string): string {
  return text.replace(EMAIL, "[email]").replace(LONG_NUMBER, "[number]");
}

/** Truncate as well as scrub: a stack is useful, a novel is not. */
export function scrubAndTruncate(text: string, maxLength: number): string {
  const scrubbed = scrubPii(text);
  return scrubbed.length <= maxLength ? scrubbed : `${scrubbed.slice(0, maxLength - 1)}…`;
}

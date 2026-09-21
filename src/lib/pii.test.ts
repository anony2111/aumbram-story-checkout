import { describe, expect, it } from "vitest";
import { scrubAndTruncate, scrubPii } from "./pii";

describe("scrubPii", () => {
  it("removes phone numbers in the shapes a checkout produces", () => {
    expect(scrubPii("Invalid phone +919876543210")).toBe("Invalid phone [number]");
    expect(scrubPii("Invalid phone 9876543210")).toBe("Invalid phone [number]");
    expect(scrubPii("Invalid phone 98765 43210")).toBe("Invalid phone [number]");
  });

  it("removes email addresses", () => {
    expect(scrubPii("failed for nandini.das@example.com")).toBe("failed for [email]");
  });

  it("leaves short numbers alone, so ids and counts stay debuggable", () => {
    expect(scrubPii("var_00576 stock 3")).toBe("var_00576 stock 3");
    expect(scrubPii("order ord_000801 total 409800")).toBe("order ord_000801 total 409800");
  });

  it("is a no-op on text with nothing to hide", () => {
    expect(scrubPii("Cannot read properties of undefined")).toBe(
      "Cannot read properties of undefined"
    );
  });
});

describe("scrubAndTruncate", () => {
  it("scrubs before it truncates", () => {
    expect(scrubAndTruncate("call +919876543210 now", 200)).toBe("call [number] now");
  });

  it("caps the length with an ellipsis", () => {
    expect(scrubAndTruncate("abcdefghij", 5)).toBe("abcd…");
    expect(scrubAndTruncate("abcde", 5)).toBe("abcde");
  });
});

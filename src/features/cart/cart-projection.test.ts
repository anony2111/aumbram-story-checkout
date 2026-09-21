import { describe, expect, it } from "vitest";
import { enqueue, projectCart } from "./cart-projection";
import type { CartLinePreview, PendingMutation } from "./cart-projection";
import { money } from "@/domain/money";
import type { CartResponse } from "@/domain/api";

/**
 * The offline cart's derivation: last acknowledged server cart + ordered queue of
 * unacknowledged mutations = what the shopper sees.
 */

const STORY = { storyId: "sty_0022", creatorId: "crt_0008" };

const preview = (over: Partial<CartLinePreview> = {}): CartLinePreview => ({
  productId: "prd_0179",
  productTitle: "Handcrafted Bamboo Basket",
  imageUrl: "https://example.test/basket.jpg",
  variantOptions: {},
  unitPrice: money(269_900),
  stock: 3,
  vendor: { id: "vnd_0017", name: "Kolkata Looms", codEnabled: true },
  ...over,
});

const serverCart = (lines: CartResponse["lines"]): CartResponse => ({
  lines,
  itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  subtotal: money(lines.reduce((sum, line) => sum + line.unitPrice.amount * line.quantity, 0)),
});

const serverLine = (variantId: string, quantity = 1, amount = 269_900) => ({
  variantId,
  productId: "prd_0179",
  quantity,
  priceAtAdd: money(amount),
  attribution: STORY,
  addedAt: "2026-09-21T10:00:00.000Z",
  productTitle: "Handcrafted Bamboo Basket",
  imageUrl: null,
  variantOptions: {},
  unitPrice: money(amount),
  stock: 3,
  vendor: { id: "vnd_0017", name: "Kolkata Looms", codEnabled: true },
});

const add = (variantId: string, over: Partial<Extract<PendingMutation, { kind: "add" }>> = {}): PendingMutation => ({
  kind: "add",
  id: `m-${variantId}-${Math.random()}`,
  variantId,
  delta: 1,
  attribution: {},
  preview: preview(),
  at: "2026-09-21T11:00:00.000Z",
  ...over,
});

describe("projectCart", () => {
  it("is empty before the server has ever answered", () => {
    expect(projectCart(null, [])).toMatchObject({ lines: [], itemCount: 0, pendingCount: 0 });
  });

  it("passes the server cart through untouched when nothing is queued", () => {
    const projected = projectCart(serverCart([serverLine("var_00576")]), []);
    expect(projected.lines).toHaveLength(1);
    expect(projected.lines[0]?.pending).toBe(false);
    expect(projected.subtotal).toEqual(money(269_900));
  });

  it("shows a line the server has never seen, from the preview captured on add", () => {
    const projected = projectCart(null, [add("var_00576", { attribution: STORY })]);
    expect(projected.lines).toHaveLength(1);
    expect(projected.lines[0]).toMatchObject({
      variantId: "var_00576",
      quantity: 1,
      productTitle: "Handcrafted Bamboo Basket",
      pending: true,
      attribution: STORY,
    });
    expect(projected.subtotal).toEqual(money(269_900));
    expect(projected.pendingCount).toBe(1);
  });

  it("adds deltas, so two offline taps are quantity 2", () => {
    const projected = projectCart(null, [add("var_00576"), add("var_00576")]);
    expect(projected.lines[0]?.quantity).toBe(2);
    expect(projected.itemCount).toBe(2);
  });

  it("adds onto what the server already had", () => {
    const projected = projectCart(serverCart([serverLine("var_00576", 1)]), [add("var_00576")]);
    expect(projected.lines[0]?.quantity).toBe(2);
    expect(projected.lines[0]?.pending).toBe(true);
  });

  it("never lets a plain add erase an existing story attribution", () => {
    const projected = projectCart(serverCart([serverLine("var_00576")]), [
      add("var_00576", { attribution: {} }),
    ]);
    expect(projected.lines[0]?.attribution).toEqual(STORY);
  });

  it("caps a line at ten", () => {
    const queue = Array.from({ length: 14 }, () => add("var_00576"));
    expect(projectCart(null, queue).lines[0]?.quantity).toBe(10);
  });

  it("applies a quantity change", () => {
    const projected = projectCart(serverCart([serverLine("var_00576", 1)]), [
      { kind: "set", id: "m1", variantId: "var_00576", quantity: 3, at: "2026-09-21T11:00:00.000Z" },
    ]);
    expect(projected.lines[0]).toMatchObject({ quantity: 3, pending: true });
  });

  it("treats a quantity of zero as a removal", () => {
    const projected = projectCart(serverCart([serverLine("var_00576", 2)]), [
      { kind: "set", id: "m1", variantId: "var_00576", quantity: 0, at: "2026-09-21T11:00:00.000Z" },
    ]);
    expect(projected.lines).toHaveLength(0);
  });

  it("applies a removal", () => {
    const projected = projectCart(serverCart([serverLine("var_00576"), serverLine("var_00305")]), [
      { kind: "remove", id: "m1", variantId: "var_00305", at: "2026-09-21T11:00:00.000Z" },
    ]);
    expect(projected.lines.map((line) => line.variantId)).toEqual(["var_00576"]);
  });

  it("applies mutations in order, so the last word wins", () => {
    const projected = projectCart(null, [
      add("var_00576"),
      { kind: "set", id: "m2", variantId: "var_00576", quantity: 5, at: "2026-09-21T11:01:00.000Z" },
      { kind: "set", id: "m3", variantId: "var_00576", quantity: 2, at: "2026-09-21T11:02:00.000Z" },
    ]);
    expect(projected.lines[0]?.quantity).toBe(2);
  });

  it("ignores a change to a line that is not there", () => {
    const projected = projectCart(null, [
      { kind: "set", id: "m1", variantId: "var_ghost", quantity: 3, at: "2026-09-21T11:00:00.000Z" },
      { kind: "remove", id: "m2", variantId: "var_ghost", at: "2026-09-21T11:00:01.000Z" },
    ]);
    expect(projected.lines).toHaveLength(0);
  });

  it("orders lines by when they were added, not by mutation order", () => {
    const projected = projectCart(
      serverCart([
        { ...serverLine("var_b"), addedAt: "2026-09-21T10:05:00.000Z" },
        { ...serverLine("var_a"), addedAt: "2026-09-21T10:00:00.000Z" },
      ]),
      []
    );
    expect(projected.lines.map((line) => line.variantId)).toEqual(["var_a", "var_b"]);
  });
});

describe("enqueue", () => {
  const set = (variantId: string, quantity: number, id: string): PendingMutation => ({
    kind: "set",
    id,
    variantId,
    quantity,
    at: "2026-09-21T11:00:00.000Z",
  });
  const remove = (variantId: string, id: string): PendingMutation => ({
    kind: "remove",
    id,
    variantId,
    at: "2026-09-21T11:00:00.000Z",
  });

  it("collapses a run of stepper taps into one write", () => {
    let queue: PendingMutation[] = [];
    queue = enqueue(queue, set("var_00576", 2, "a"));
    queue = enqueue(queue, set("var_00576", 3, "b"));
    queue = enqueue(queue, set("var_00576", 4, "c"));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ quantity: 4, id: "c" });
  });

  it("does not collapse across different variants", () => {
    let queue: PendingMutation[] = [];
    queue = enqueue(queue, set("var_00576", 2, "a"));
    queue = enqueue(queue, set("var_00305", 2, "b"));
    queue = enqueue(queue, set("var_00576", 3, "c"));
    expect(queue).toHaveLength(3);
  });

  it("never touches a mutation that may already be in flight", () => {
    const queue = enqueue([set("var_00576", 2, "sent")], set("var_00576", 3, "new"), 1);
    expect(queue).toHaveLength(2);
    expect(queue[0]?.id).toBe("sent");
  });

  it("drops an add that was removed again before either reached the server", () => {
    let queue: PendingMutation[] = [];
    queue = enqueue(queue, add("var_00576", { id: "a" }));
    queue = enqueue(queue, set("var_00576", 3, "b"));
    queue = enqueue(queue, remove("var_00576", "c"));
    // The server never heard of this line, so there is nothing to tell it.
    expect(queue).toEqual([]);
  });

  it("keeps a removal of a line the server does know about", () => {
    let queue: PendingMutation[] = [];
    queue = enqueue(queue, set("var_00576", 3, "b"));
    queue = enqueue(queue, remove("var_00576", "c"));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: "remove", id: "c" });
  });

  it("leaves other variants alone when collapsing a removal", () => {
    let queue: PendingMutation[] = [];
    queue = enqueue(queue, add("var_00305", { id: "keep" }));
    queue = enqueue(queue, add("var_00576", { id: "a" }));
    queue = enqueue(queue, remove("var_00576", "c"));
    expect(queue.map((entry) => entry.id)).toEqual(["keep"]);
  });

  it("produces the same projection as the un-collapsed queue", () => {
    const raw: PendingMutation[] = [
      add("var_00576", { id: "a" }),
      set("var_00576", 3, "b"),
      set("var_00576", 5, "c"),
    ];
    let collapsed: PendingMutation[] = [];
    for (const mutation of raw) collapsed = enqueue(collapsed, mutation);

    expect(projectCart(null, collapsed).lines[0]?.quantity).toBe(
      projectCart(null, raw).lines[0]?.quantity
    );
  });
});

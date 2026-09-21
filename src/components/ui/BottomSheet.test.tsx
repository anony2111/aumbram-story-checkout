// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";

/**
 * The BottomSheet is the app's only modal primitive, so its accessibility
 * contract is tested here once rather than re-asserted at every call site.
 */

beforeAll(() => {
  // jsdom has no matchMedia; the sheet asks it for prefers-reduced-motion.
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  }
});

/** A page with a trigger, so focus has somewhere real to return to. */
function Harness({ onCloseSpy }: { onCloseSpy?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <h1>Feed</h1>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <a href="/cart">Behind the sheet</a>
      <BottomSheet
        open={open}
        onClose={() => {
          onCloseSpy?.();
          setOpen(false);
        }}
        title="Upcycled Dhurrie"
        closeLabel="Close"
        testId="sheet"
      >
        <button type="button">Indigo</button>
        <button type="button">Terracotta</button>
        <button type="button">Add to cart</button>
      </BottomSheet>
    </div>
  );
}

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open sheet" }));
  return screen.findByRole("dialog");
}

describe("BottomSheet", () => {
  it("renders nothing until it is opened", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a labelled modal dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await openSheet(user);

    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The accessible name comes from the heading, via aria-labelledby.
    expect(dialog).toHaveAccessibleName("Upcycled Dhurrie");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId as string)).toHaveTextContent("Upcycled Dhurrie");
  });

  it("moves focus into the sheet on open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openSheet(user);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    });
  });

  it("returns focus to whatever opened it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open sheet" });
    await openSheet(user);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onCloseSpy={onClose} />);
    await openSheet(user);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<Harness onCloseSpy={onClose} />);
    await openSheet(user);
    const backdrop = document.querySelector("[data-testid='sheet'] > [aria-hidden='true']");
    expect(backdrop).toBeTruthy();
    await user.click(backdrop as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container).toBeTruthy();
  });

  it("keeps Tab inside the sheet", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openSheet(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toHaveFocus());

    // Close -> Indigo -> Terracotta -> Add to cart -> back to Close.
    await user.tab();
    expect(screen.getByRole("button", { name: "Indigo" })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Add to cart" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("wraps backwards too", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openSheet(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toHaveFocus());

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Add to cart" })).toHaveFocus();
  });

  it("makes the rest of the page inert and restores it on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const pageRoot = document.body.firstElementChild as HTMLElement;

    await openSheet(user);
    await waitFor(() => expect(pageRoot).toHaveAttribute("inert"));
    // The sheet's own layer is not inert.
    expect(screen.getByTestId("sheet").closest("[inert]")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(pageRoot).not.toHaveAttribute("inert"));
  });

  it("locks page scroll while open and restores it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const before = document.body.style.overflow;

    await openSheet(user);
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.body.style.overflow).toBe(before));
  });

  it("has no axe violations while open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openSheet(user);
    // The dialog is portalled to body, so the whole document is the subject.
    const results = await axe(document.body);
    expect(results.violations).toEqual([]);
  });
});

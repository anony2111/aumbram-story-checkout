"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./bottom-sheet.module.css";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import type { ReactNode, RefObject } from "react";

/**
 * BottomSheet — the app's modal primitive.
 *
 * Built here rather than taken from a library because the assignment asks for it,
 * and because the interesting parts (focus restoration across a route change,
 * `inert` on the rest of the page, a drag that respects reduced motion) are
 * exactly the parts a library hides.
 *
 * ## Props
 *
 * | Prop | Meaning |
 * |---|---|
 * | `open` | Controlled. The sheet stays mounted through its exit transition. |
 * | `onClose` | Called by Esc, the backdrop, the close button and a completed drag. The caller owns `open`. |
 * | `title` | Rendered as the sheet's heading and wired to `aria-labelledby`. |
 * | `titleId` | Optional, for when the caller wants to label the sheet with its own element. |
 * | `children` | Sheet body. Scrolls independently; scroll chaining is contained. |
 * | `initialFocusRef` | Element to focus on open. Defaults to the close button, never the page behind. |
 * | `dismissDragRatio` | Fraction of sheet height that must be dragged before release dismisses. Default 0.28. |
 * | `describedBy` | Optional id for `aria-describedby`. |
 * | `testId` | Optional hook for tests. |
 *
 * ## Behaviour
 *
 * - `role="dialog"`, `aria-modal="true"`, labelled by its heading.
 * - Focus moves into the sheet on open and returns to the element that had it
 *   when the sheet closes — including when that element has been re-rendered,
 *   because the node is captured, not the selector.
 * - Tab and Shift+Tab cycle inside the sheet; focus that escapes (browser UI,
 *   programmatic) is pulled back.
 * - Every other child of `<body>` is made `inert` while the sheet is open, so
 *   assistive technology and pointer events cannot reach the page behind it.
 * - The page cannot scroll behind the sheet; the sheet's own body can.
 * - Drag the grabber down past the threshold to dismiss; release short of it and
 *   it returns. Fully keyboard-accessible without the drag.
 * - SSR-safe: nothing touches `window` during render, and the portal only exists
 *   after mount.
 */

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  titleId?: string;
  describedBy?: string;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  dismissDragRatio?: number;
  closeLabel: string;
  testId?: string;
}

/** Matches the exit transition in the stylesheet. */
const EXIT_DURATION_MS = 260;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(root: HTMLElement): HTMLElement[] {
  // Deliberately not a layout-based visibility test: everything inside an open
  // sheet is visible by construction, and `offsetParent` is always null under
  // jsdom, which would make the trap untestable.
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.closest("[inert]") === null
  );
}

type Phase = "closed" | "opening" | "open" | "closing";

/**
 * Pointer capture keeps the drag alive when the finger leaves the grabber. It is
 * an enhancement, and not every environment implements it, so a failure here must
 * not break the gesture.
 */
function capturePointer(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    // Unsupported; the drag still works from the pointermove stream.
  }
}

function releasePointer(element: Element, pointerId: number): void {
  try {
    if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture?.(pointerId);
  } catch {
    // Same as above.
  }
}

export function BottomSheet({
  open,
  onClose,
  title,
  titleId,
  describedBy,
  children,
  initialFocusRef,
  dismissDragRatio = 0.28,
  closeLabel,
  testId,
}: BottomSheetProps) {
  const generatedTitleId = useId();
  const headingId = titleId ?? generatedTitleId;

  const layerRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  const reducedMotion = usePrefersReducedMotion();

  // Nothing renders on the server; `mounted` gates the portal.
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("closed");
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => setMounted(true), []);

  // ---------------------------------------------------------- transition
  useEffect(() => {
    setPhase((current) => {
      if (open) return current === "open" ? "open" : "opening";
      return current === "closed" ? "closed" : "closing";
    });
  }, [open]);

  useEffect(() => {
    if (phase === "opening") {
      // One frame at translateY(100%) so the transition to 0 actually runs.
      const frame = requestAnimationFrame(() => setPhase("open"));
      return () => cancelAnimationFrame(frame);
    }
    if (phase === "closing") {
      if (reducedMotion) {
        setPhase("closed");
        return;
      }
      const timer = setTimeout(() => setPhase("closed"), EXIT_DURATION_MS);
      return () => clearTimeout(timer);
    }
    return;
  }, [phase, reducedMotion]);

  const visible = phase !== "closed";

  // --------------------------------------------- keyboard and focus trap
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = focusableWithin(sheet);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !sheet.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      if (event.target instanceof Node && sheet.contains(event.target)) return;
      // Focus escaped (browser UI, a stray programmatic focus): pull it back.
      (focusableWithin(sheet)[0] ?? sheet).focus({ preventScroll: true });
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open, onClose]);

  // ------------------------------------------------ inert and scroll lock
  useEffect(() => {
    if (!open) return;

    const layer = layerRef.current;
    const madeInert: HTMLElement[] = [];
    for (const child of [...document.body.children]) {
      if (!(child instanceof HTMLElement)) continue;
      if (layer && child.contains(layer)) continue;
      // The attribute rather than the property: it reflects to the accessibility
      // tree everywhere, including in environments that have not implemented the
      // IDL attribute.
      if (child.hasAttribute("inert")) continue;
      child.setAttribute("inert", "");
      madeInert.push(child);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      for (const element of madeInert) element.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // ------------------------------------------------- focus in and back
  //
  // Declared last of the three on purpose. React runs cleanups in declaration
  // order, and this one has to happen after both of the others:
  //
  //  - after the trap's, or the focusin guard would see the trigger take focus
  //    and drag it straight back into the closing sheet;
  //  - after the inert cleanup, because focusing an element that is still inside
  //    an inert subtree silently does nothing in a real browser. jsdom does not
  //    implement inert, so only an end-to-end test catches that one.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    restoreFocusTo.current = previouslyFocused instanceof HTMLElement ? previouslyFocused : null;

    // The ref is resolved inside the frame, not before it: on the render that
    // opens the sheet its contents have not been committed yet.
    const frame = requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? closeButtonRef.current;
      target?.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(frame);
      const restore = restoreFocusTo.current;
      restoreFocusTo.current = null;
      // Only restore if the node is still in the document; otherwise leave focus
      // where React put it rather than throwing it to <body>.
      if (restore && restore.isConnected) restore.focus({ preventScroll: true });
    };
  }, [open, initialFocusRef]);

  // ------------------------------------------------------------- drag
  const dragStartY = useRef<number | null>(null);

  const onGrabberPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragStartY.current = event.clientY;
    setDragging(true);
    capturePointer(event.currentTarget, event.pointerId);
  }, []);

  const onGrabberPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    // Downwards only: dragging up should not detach the sheet from the edge.
    setDragOffset(Math.max(0, event.clientY - dragStartY.current));
  }, []);

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (dragStartY.current === null) return;
      const travelled = Math.max(0, event.clientY - dragStartY.current);
      const height = sheetRef.current?.getBoundingClientRect().height ?? 0;
      dragStartY.current = null;
      setDragging(false);
      setDragOffset(0);
      releasePointer(event.currentTarget, event.pointerId);
      if (height > 0 && travelled > height * dismissDragRatio) onClose();
    },
    [dismissDragRatio, onClose]
  );

  if (!mounted || !visible) return null;

  return createPortal(
    <div
      ref={layerRef}
      className={styles.layer}
      data-state={phase === "open" ? "open" : "closed"}
      data-dragging={dragging ? "true" : undefined}
      data-testid={testId}
    >
      <div
        className={styles.backdrop}
        // The backdrop is decoration; Esc and the close button are the
        // accessible ways out, so it is hidden from assistive technology.
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        {...(describedBy ? { "aria-describedby": describedBy } : {})}
        style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
      >
        <div
          className={styles.grabber}
          aria-hidden="true"
          onPointerDown={onGrabberPointerDown}
          onPointerMove={onGrabberPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className={styles.grabberBar} />
        </div>

        <div className={styles.header}>
          <h2 className={styles.title} id={headingId}>
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            aria-label={closeLabel}
            onClick={onClose}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className={styles.content}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

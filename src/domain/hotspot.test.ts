import { describe, expect, it } from "vitest";
import { placeHotspot, STORY_FRAME } from "./hotspot";
import type { SafeArea } from "./hotspot";

/** Room for the progress bars and close button at the top, captions at the bottom. */
const safeArea: SafeArea = { top: 72, right: 16, bottom: 96, left: 16 };
/** Nothing in the way, for the pure-geometry cases. */
const noSafeArea: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

describe("placeHotspot on a 9:16 viewport", () => {
  const container = { width: 360, height: 640 };

  it("maps the centre to the centre when nothing is cropped", () => {
    const placement = placeHotspot({ x: 0.5, y: 0.5, container, safeArea: noSafeArea });
    expect(placement.left).toBeCloseTo(180);
    expect(placement.top).toBeCloseTo(320);
    expect(placement.clamped).toBe(false);
    expect(placement.offscreen).toBe(false);
  });

  it("maps the first tag of sty_0022 (0.86, 0.39) proportionally", () => {
    const placement = placeHotspot({ x: 0.86, y: 0.39, container, safeArea: noSafeArea });
    expect(placement.left).toBeCloseTo(0.86 * 360);
    expect(placement.top).toBeCloseTo(0.39 * 640);
  });
});

describe("placeHotspot when the viewport is wider than 9:16", () => {
  // 720x1000 is wider than 9:16, so the frame is cropped top and bottom.
  const container = { width: 720, height: 1000 };

  it("accounts for the vertical crop", () => {
    // scale = max(720/720, 1000/1280) = 1, so 140px is cut from each end.
    const placement = placeHotspot({ x: 0.5, y: 0.5, container, safeArea: noSafeArea });
    expect(placement.left).toBeCloseTo(360);
    expect(placement.top).toBeCloseTo(1280 * 0.5 - 140);
  });

  it("reports a tag cropped out of view, and pins it to the edge", () => {
    // y = 0.02 sits 25.6px down the frame, well inside the 140px that was cut.
    const placement = placeHotspot({ x: 0.5, y: 0.02, container, safeArea: noSafeArea });
    expect(placement.offscreen).toBe(true);
    // Pinned to the edge, but still a half-target in, so all 44px stay tappable.
    expect(placement.top).toBe(22);
    expect(placement.clamped).toBe(true);
  });
});

describe("placeHotspot when the viewport is taller than 9:16", () => {
  // 360x800 is a common mid-range Android; the frame is cropped left and right.
  const container = { width: 360, height: 800 };

  it("accounts for the horizontal crop", () => {
    // scale = max(0.5, 0.625) = 0.625 -> rendered 450x800, 45px cut from each side.
    const placement = placeHotspot({ x: 0.5, y: 0.5, container, safeArea: noSafeArea });
    expect(placement.left).toBeCloseTo(720 * 0.625 * 0.5 - 45);
    expect(placement.top).toBeCloseTo(400);
  });

  it("does not put an edge tag where a finger cannot reach it", () => {
    const naive = 0.97 * 360;
    const placement = placeHotspot({ x: 0.97, y: 0.5, container, safeArea });
    expect(placement.left).toBeLessThan(naive);
    // Kept a full half-target clear of the right edge.
    expect(placement.left).toBeLessThanOrEqual(360 - 16 - 22);
    expect(placement.clamped).toBe(true);
  });
});

describe("the safe area", () => {
  const container = { width: 360, height: 800 };

  it("keeps a tag out from under the progress bars", () => {
    const placement = placeHotspot({ x: 0.5, y: 0.01, container, safeArea });
    expect(placement.top).toBe(72 + 22);
  });

  it("keeps a tag off the caption at the bottom", () => {
    const placement = placeHotspot({ x: 0.5, y: 0.99, container, safeArea });
    expect(placement.top).toBe(800 - 96 - 22);
  });

  it("leaves a comfortably placed tag exactly where it was authored", () => {
    const placement = placeHotspot({ x: 0.5, y: 0.45, container, safeArea });
    expect(placement.clamped).toBe(false);
  });
});

describe("degenerate containers", () => {
  it("returns something usable before layout has happened", () => {
    const placement = placeHotspot({ x: 0.5, y: 0.5, container: { width: 0, height: 0 }, safeArea });
    expect(placement).toEqual({ left: 0, top: 0, clamped: true, offscreen: true });
  });

  it("centres rather than inverting when the safe area exceeds the container", () => {
    const placement = placeHotspot({
      x: 0.9,
      y: 0.9,
      container: { width: 60, height: 120 },
      safeArea,
    });
    expect(placement.left).toBe(30);
    expect(placement.top).toBe(60);
  });
});

describe("the frame constant", () => {
  it("is the 9:16 frame the dataset authors against", () => {
    expect(STORY_FRAME).toEqual({ width: 720, height: 1280 });
  });
});

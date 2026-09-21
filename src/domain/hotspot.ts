/**
 * Placing a product hotspot on a cropped story frame.
 *
 * Tags are authored as 0-1 coordinates on the original 720x1280 (9:16) frame, but
 * the frame is displayed with `object-fit: cover` into whatever shape the phone
 * has. On anything that is not 9:16 the image is cropped, so a naive
 * `left: x * 100%` puts the dot on the wrong thing.
 *
 * 67 of the dataset's 259 tags sit within 8% of an edge, so clamping into a safe
 * area is the normal case rather than a defensive extra: without it, hotspots
 * land under the progress bars, under the close button, or half off-screen where
 * they cannot be tapped.
 */

export const STORY_FRAME = { width: 720, height: 1280 } as const;

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface HotspotInput {
  /** 0-1 on the original frame. */
  x: number;
  y: number;
  container: { width: number; height: number };
  frame?: { width: number; height: number };
  safeArea: SafeArea;
  /** Minimum tappable size; the centre is kept at least half of it from an edge. */
  hitSize?: number;
}

export interface HotspotPlacement {
  /** Centre of the hit target, in CSS pixels inside the container. */
  left: number;
  top: number;
  /** The safe area moved it away from where the tag actually sits. */
  clamped: boolean;
  /** The tagged point is cropped out of view entirely; the dot marks its edge. */
  offscreen: boolean;
}

export const DEFAULT_HIT_SIZE = 44;

export function placeHotspot({
  x,
  y,
  container,
  frame = STORY_FRAME,
  safeArea,
  hitSize = DEFAULT_HIT_SIZE,
}: HotspotInput): HotspotPlacement {
  if (container.width <= 0 || container.height <= 0) {
    return { left: 0, top: 0, clamped: true, offscreen: true };
  }

  // `object-fit: cover`: scale to the larger ratio, then centre and crop.
  const scale = Math.max(container.width / frame.width, container.height / frame.height);
  const renderedWidth = frame.width * scale;
  const renderedHeight = frame.height * scale;
  const offsetX = (renderedWidth - container.width) / 2;
  const offsetY = (renderedHeight - container.height) / 2;

  const rawLeft = x * renderedWidth - offsetX;
  const rawTop = y * renderedHeight - offsetY;

  const offscreen =
    rawLeft < 0 || rawTop < 0 || rawLeft > container.width || rawTop > container.height;

  const half = hitSize / 2;
  const minLeft = safeArea.left + half;
  const maxLeft = container.width - safeArea.right - half;
  const minTop = safeArea.top + half;
  const maxTop = container.height - safeArea.bottom - half;

  // A container narrower than its own safe area would invert the bounds; centring
  // is the only sensible answer.
  const left = minLeft > maxLeft ? container.width / 2 : clamp(rawLeft, minLeft, maxLeft);
  const top = minTop > maxTop ? container.height / 2 : clamp(rawTop, minTop, maxTop);

  return {
    left,
    top,
    clamped: Math.abs(left - rawLeft) > 0.5 || Math.abs(top - rawTop) > 0.5,
    offscreen,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

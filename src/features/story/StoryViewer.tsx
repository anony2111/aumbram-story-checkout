"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preload } from "react-dom";
import styles from "./story.module.css";
import { StoryHotspots } from "./StoryHotspots";
import { StoryProgress } from "./StoryProgress";
import { useStoryNavigation } from "./useStoryNavigation";
import { useStoryPlayer } from "./useStoryPlayer";
import { CartBadge } from "@/components/chrome/CartBadge";
import { useTranslator } from "@/i18n/client";
import { apiGet } from "@/lib/api-client";
import { useUiStore } from "@/stores/ui-store";
import type { CreatorStoriesResponse, ProductDetail } from "@/domain/api";
import type { Creator, Story, StorySegment } from "@/domain/types";

/**
 * The full-screen story viewer.
 *
 * Deliberately one component: the timer, the gestures and the hotspots all read
 * the same segment index, and splitting them would mean lifting that state into
 * a context and re-rendering more, not less. The parts that are genuinely
 * independent — the timer state machine, the hotspot geometry, the navigation
 * ordering — are separate modules and are unit-tested there.
 */

export interface StoryViewerProps {
  story: Story;
  creator: Creator;
  products: ProductDetail[];
  creatorFeedOrder: string[];
}

/** Pointer held for at least this long is a pause, not a tap. */
const HOLD_MS = 200;
/** Movement beyond this is a swipe, and cancels both the tap and the hold. */
const SWIPE_SLOP_PX = 12;
const HORIZONTAL_SWIPE_PX = 60;
const DOWN_SWIPE_PX = 90;

/** Video URLs in the dataset are fake, so the poster is what actually renders. */
export function frameUrl(segment: StorySegment): string {
  if (segment.type === "video") return segment.posterUrl ?? segment.url;
  return segment.url;
}

export function StoryViewer({ story, creator, products, creatorFeedOrder }: StoryViewerProps) {
  const t = useTranslator();
  const openProductSheet = useUiStore((state) => state.openProductSheet);
  const sheetOpen = useUiStore((state) => state.productSheet !== null);

  const durations = useMemo(
    () => story.segments.map((segment) => segment.durationMs),
    [story.segments]
  );
  const { state, dispatch, paused, manuallyPaused, toggleManualPause } = useStoryPlayer(durations);

  const navigation = useStoryNavigation({
    storyId: story.id,
    creatorId: creator.id,
    creatorFeedOrder,
  });

  const segment = story.segments[state.segmentIndex];
  const nextSegment = story.segments[state.segmentIndex + 1];

  // ------------------------------------------------- preload the next frame
  //
  // Exactly one frame ahead, never further: on a metered connection, prefetching
  // a whole story is someone's data spent on frames they may never reach.
  // `preload` emits a <link rel="preload" as="image">, which is visible in the
  // network panel and assertable in an end-to-end test.
  //
  // On the last segment there is no next frame in this story, so the thing worth
  // having ready is the first frame of the story that follows. The creator's
  // story list is only fetched once the reader actually gets that far.
  const onLastSegment = state.segmentIndex === story.segments.length - 1;
  const creatorStories = useQuery({
    queryKey: ["creator-stories", creator.id],
    queryFn: ({ signal }) =>
      apiGet<CreatorStoriesResponse>(`/creators/${creator.id}/stories`, { signal }),
    enabled: onLastSegment,
    staleTime: 60_000,
  });

  if (nextSegment) {
    preload(frameUrl(nextSegment), { as: "image", fetchPriority: "low" });
  } else if (onLastSegment && creatorStories.data) {
    const items = creatorStories.data.items;
    const index = items.findIndex((item) => item.id === story.id);
    const upcoming = index === -1 ? undefined : items[index + 1];
    const firstSegment = upcoming?.segments[0];
    if (firstSegment) preload(frameUrl(firstSegment), { as: "image", fetchPriority: "low" });
  }

  // ------------------------------------------------------------- overflow
  const { goToAdjacentStory } = navigation;
  useEffect(() => {
    if (state.overflow === "none") return;
    dispatch({ type: "clear-overflow" });
    void goToAdjacentStory(state.overflow === "next-story" ? 1 : -1);
  }, [state.overflow, dispatch, goToAdjacentStory]);

  // ------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // While a sheet is open it owns the keyboard, including Escape.
      if (sheetOpen) return;
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          dispatch({ type: "previous" });
          break;
        case "ArrowRight":
          event.preventDefault();
          dispatch({ type: "next" });
          break;
        case " ":
        case "Spacebar":
          event.preventDefault();
          toggleManualPause();
          break;
        case "Escape":
          event.preventDefault();
          navigation.close();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, navigation, sheetOpen, toggleManualPause]);

  // ------------------------------------------------------------- gestures
  const gesture = useRef<{
    x: number;
    y: number;
    holdTimer: ReturnType<typeof setTimeout> | null;
    held: boolean;
    moved: boolean;
  } | null>(null);

  const endHold = useCallback(() => {
    const current = gesture.current;
    if (!current) return;
    if (current.holdTimer) clearTimeout(current.holdTimer);
    if (current.held) dispatch({ type: "resume", reason: "hold" });
  }, [dispatch]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const holdTimer = setTimeout(() => {
        if (!gesture.current || gesture.current.moved) return;
        gesture.current.held = true;
        dispatch({ type: "pause", reason: "hold" });
      }, HOLD_MS);
      gesture.current = { x: event.clientX, y: event.clientY, holdTimer, held: false, moved: false };
    },
    [dispatch]
  );

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current) return;
    const dx = Math.abs(event.clientX - current.x);
    const dy = Math.abs(event.clientY - current.y);
    if (!current.moved && Math.hypot(dx, dy) > SWIPE_SLOP_PX) {
      current.moved = true;
      // A drag is not a hold: cancel the pending pause, and undo one already taken.
      if (current.holdTimer) clearTimeout(current.holdTimer);
      if (current.held) {
        current.held = false;
        dispatch({ type: "resume", reason: "hold" });
      }
    }
  }, [dispatch]);

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = gesture.current;
      gesture.current = null;
      if (!current) return;
      if (current.holdTimer) clearTimeout(current.holdTimer);

      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;

      if (current.held) {
        // Releasing a hold resumes and does nothing else — never navigates.
        dispatch({ type: "resume", reason: "hold" });
        return;
      }

      if (current.moved) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > HORIZONTAL_SWIPE_PX) {
          void navigation.goToAdjacentCreator(dx < 0 ? 1 : -1);
          return;
        }
        if (dy > DOWN_SWIPE_PX) {
          navigation.close();
        }
        return;
      }

      // A tap. Left third goes back, the rest goes forward.
      const bounds = event.currentTarget.getBoundingClientRect();
      const relativeX = event.clientX - bounds.left;
      dispatch({ type: relativeX < bounds.width / 3 ? "previous" : "next" });
    },
    [dispatch, navigation]
  );

  const onPointerCancel = useCallback(() => {
    endHold();
    gesture.current = null;
  }, [endHold]);

  // --------------------------------------------------------------- media
  //
  // Keyed by URL so a segment change resets it, and so a cached image that fires
  // `load` before React attaches the handler is still caught by the `complete`
  // check below.
  const imageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
      dispatch({ type: "media-ready" });
    }
  }, [dispatch, state.segmentIndex]);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setContainerSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const tags = useMemo(
    () => story.taggedProducts.filter((tag) => tag.segmentIndex === state.segmentIndex),
    [story.taggedProducts, state.segmentIndex]
  );

  if (!segment) return null;

  const showFallback = state.media === "failed";

  return (
    <div className={styles.viewer} ref={containerRef} data-testid="story-viewer" data-story-id={story.id}>
      <div className={styles.frame}>
        {showFallback ? (
          <div className={styles.fallback} data-testid="story-fallback">
            <p className={styles.fallbackTitle}>{t("story.loadFailed")}</p>
            <p className={styles.fallbackCaption}>{story.caption}</p>
            <p className={styles.fallbackHint}>{t("story.loadFailedHint")}</p>
          </div>
        ) : (
          /*
           * A plain <img>, not next/image: the feed card shows the same URL, and
           * the two must match byte for byte for the browser's cache to make this
           * transition instant. An optimiser that picks a different `w` for a
           * full-screen frame than for a card would guarantee a cache miss on the
           * one paint that has to be immediate.
           */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imageRef}
            key={frameUrl(segment)}
            className={styles.frameImage}
            src={frameUrl(segment)}
            alt=""
            decoding="async"
            fetchPriority="high"
            data-testid="story-frame"
            data-segment-index={state.segmentIndex}
            onLoad={() => dispatch({ type: "media-ready" })}
            onError={() => dispatch({ type: "media-failed" })}
          />
        )}
        <div className={styles.scrim} />
      </div>

      <div
        className={styles.tapLayer}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className={styles.tapPrevious} data-testid="tap-previous" />
        <div className={styles.tapNext} data-testid="tap-next" />
      </div>

      <StoryProgress segments={story.segments} state={state} durations={durations} t={t} />

      <div className={styles.header}>
        <p className={styles.creator}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.avatar} src={creator.avatarUrl} alt="" width={26} height={26} />
          <span>{creator.handle}</span>
        </p>
        <span className={styles.spacer} />
        {/* The brief wants the cart count on every surface; the viewer has no app bar. */}
        <CartBadge tone="overlay" />
        <button
          type="button"
          className={styles.chromeButton}
          aria-pressed={manuallyPaused}
          aria-label={manuallyPaused ? t("story.play") : t("story.pause")}
          data-testid="story-pause"
          onClick={toggleManualPause}
        >
          {manuallyPaused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button
          type="button"
          className={styles.chromeButton}
          aria-label={t("story.close")}
          data-testid="story-close"
          onClick={navigation.close}
        >
          <CloseIcon />
        </button>
      </div>

      <StoryHotspots
        tags={tags}
        products={products}
        container={containerSize}
        t={t}
        onOpen={(productId) => {
          const product = products.find((candidate) => candidate.id === productId);
          openProductSheet({
            productId,
            // The whole point of the viewer: this is what a creator gets paid on.
            attribution: { storyId: story.id, creatorId: creator.id },
            // Already server-rendered with this page, so the sheet needs no request.
            ...(product ? { product } : {}),
          });
        }}
      />

      <p className={styles.caption}>{story.caption}</p>

      {paused ? (
        <p className={styles.pausedBadge} role="status" data-testid="story-paused">
          {t("story.paused")}
        </p>
      ) : null}
    </div>
  );
}

function PauseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M8 5.5v13l11-6.5L8 5.5Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Shared between the mock backend and the client, so neither imports the other.
 * (`server/feed.ts` reaches for `node:fs` through its dataset; a client component
 * importing it would drag that into the browser bundle.)
 */

export const DEFAULT_FEED_LIMIT = 20;

/**
 * Cards rendered before the Suspense boundary.
 *
 * Six covers the first viewport plus a little on a 360x800 phone, which is what
 * the LCP element has to be inside. Everything after it streams in behind a
 * skeleton, so a slow data read cannot hold up the first paint.
 */
export const ABOVE_FOLD_COUNT = 6;

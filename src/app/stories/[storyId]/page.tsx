import { notFound } from "next/navigation";
import { StoryViewer } from "@/features/story/StoryViewer";
import { loadStoryBundle } from "@/server/rsc";

/**
 * The viewer route.
 *
 * Server-rendered and deep-linkable: a hard refresh of /stories/sty_0022 paints
 * the first frame from HTML, with no client fetch in the way. Arriving from a
 * feed card, `loading.tsx` bridges the round trip with the cover the card was
 * already showing.
 *
 * `key` on the viewer is deliberate: moving to the next story replaces the URL,
 * and the timer, the gesture state and the media state must all start again
 * rather than inherit the previous story's.
 */

export const dynamic = "force-dynamic";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const bundle = loadStoryBundle(storyId);
  if (!bundle) notFound();

  return (
    <StoryViewer
      key={bundle.story.id}
      story={bundle.story}
      creator={bundle.creator}
      products={bundle.products}
      creatorFeedOrder={bundle.creatorFeedOrder}
    />
  );
}

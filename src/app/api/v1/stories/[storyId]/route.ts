import { getDataset } from "@/server/dataset";
import { json, notFound, withApi } from "@/server/http";
import { productDetail } from "@/server/views";
import type { StoryResponse } from "@/domain/api";

export const dynamic = "force-dynamic";

export const GET = withApi(
  async (_request: Request, context: { params: Promise<{ storyId: string }> }) => {
    const { storyId } = await context.params;
    const dataset = getDataset();
    const story = dataset.stories.get(storyId);
    if (!story) return notFound(`Story ${storyId}`);

    const creator = dataset.creators.get(story.creatorId);
    if (!creator) return notFound(`Creator ${story.creatorId}`);

    // Deduped: a story can tag the same product on more than one segment.
    const productIds = [...new Set(story.taggedProducts.map((tag) => tag.productId))];
    const products = productIds
      .map((id) => dataset.products.get(id))
      .filter((product) => product !== undefined)
      .map(productDetail);

    const body: StoryResponse = {
      story,
      creator,
      products,
      creatorFeedOrder: [...dataset.creatorFeedOrder],
    };
    return json(body);
  }
);

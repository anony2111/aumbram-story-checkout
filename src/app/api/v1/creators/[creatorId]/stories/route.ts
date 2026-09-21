import { getDataset } from "@/server/dataset";
import { json, notFound, withApi } from "@/server/http";
import type { CreatorStoriesResponse } from "@/domain/api";

export const dynamic = "force-dynamic";

export const GET = withApi(
  async (_request: Request, context: { params: Promise<{ creatorId: string }> }) => {
    const { creatorId } = await context.params;
    const dataset = getDataset();
    if (!dataset.creators.has(creatorId)) return notFound(`Creator ${creatorId}`);

    // Already sorted by publishedAt ascending when the dataset was indexed.
    const body: CreatorStoriesResponse = { items: dataset.storiesByCreator.get(creatorId) ?? [] };
    return json(body);
  }
);

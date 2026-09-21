import { DEFAULT_FEED_LIMIT, getFeedPage } from "@/server/feed";
import { json, withApi } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withApi(async (request: Request) => {
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  return json(
    getFeedPage(url.searchParams.get("cursor"), Number.isFinite(limit) ? limit : DEFAULT_FEED_LIMIT)
  );
});

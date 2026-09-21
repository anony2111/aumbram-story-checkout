import { json, readJsonBody, withApi } from "@/server/http";
import { recordTelemetry } from "@/server/store";
import { eventBatchSchema } from "@/domain/schemas";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request: Request) => {
  const body = await readJsonBody(request, eventBatchSchema);
  for (const event of body.events) recordTelemetry("event", event);
  return json({ accepted: body.events.length }, { status: 202 });
});

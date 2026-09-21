import { json, readJsonBody, withApi } from "@/server/http";
import { recordTelemetry } from "@/server/store";
import { rumSchema } from "@/domain/schemas";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request: Request) => {
  const body = await readJsonBody(request, rumSchema);
  recordTelemetry("rum", body);
  return json({ accepted: true }, { status: 202 });
});

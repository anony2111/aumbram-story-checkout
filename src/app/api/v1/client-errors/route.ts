import { json, readJsonBody, withApi } from "@/server/http";
import { recordTelemetry } from "@/server/store";
import { clientErrorSchema } from "@/domain/schemas";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request: Request) => {
  const body = await readJsonBody(request, clientErrorSchema);
  recordTelemetry("client-error", body);
  console.error(
    JSON.stringify({
      at: new Date().toISOString(),
      event: "client_error",
      buildId: body.buildId,
      route: body.route,
      correlationId: body.correlationId,
      name: body.name,
      message: body.message,
    })
  );
  return json({ accepted: true }, { status: 202 });
});

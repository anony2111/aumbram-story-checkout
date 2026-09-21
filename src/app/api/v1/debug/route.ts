import {
  applyDebugCommand,
  assertDebugEnabled,
  debugCommandSchema,
  readDebugState,
} from "@/server/debug";
import { json, readJsonBody, withApi } from "@/server/http";

export const dynamic = "force-dynamic";

// `faultless`: a reviewer must always be able to turn the failure rate back down,
// so these two never get the injected latency or the injected 503.
export const GET = withApi(async () => {
  assertDebugEnabled();
  return json(readDebugState());
}, { faultless: true });

export const POST = withApi(async (request: Request) => {
  assertDebugEnabled();
  const command = await readJsonBody(request, debugCommandSchema);
  return json(applyDebugCommand(command));
}, { faultless: true });

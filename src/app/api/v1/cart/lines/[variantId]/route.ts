import { removeCartLine, setCartLineQuantity } from "@/server/cart";
import { fail, json, readJsonBody, withApi } from "@/server/http";
import { patchCartLineSchema } from "@/domain/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ variantId: string }> };

export const PATCH = withApi(async (request: Request, context: Context) => {
  const { variantId } = await context.params;
  const body = await readJsonBody(request, patchCartLineSchema);
  return json(setCartLineQuantity(variantId, body));
});

export const DELETE = withApi(async (request: Request, context: Context) => {
  const { variantId } = await context.params;
  const clientMutationId = new URL(request.url).searchParams.get("clientMutationId");
  if (!clientMutationId) {
    fail(422, "INVALID_BODY", "clientMutationId is required so a replayed remove is a no-op");
  }
  return json(removeCartLine(variantId, clientMutationId));
});

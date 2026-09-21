import { addCartLine } from "@/server/cart";
import { json, readJsonBody, withApi } from "@/server/http";
import { addCartLineSchema } from "@/domain/schemas";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request: Request) => {
  const body = await readJsonBody(request, addCartLineSchema);
  return json(addCartLine(body), { status: 200 });
});

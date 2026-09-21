import { quoteForCart } from "@/server/checkout";
import { json, readJsonBody, withApi } from "@/server/http";
import { quoteRequestSchema } from "@/domain/schemas";

export const dynamic = "force-dynamic";

export const POST = withApi(async (request: Request) => {
  const body = await readJsonBody(request, quoteRequestSchema);
  return json(quoteForCart(body.pincode));
});

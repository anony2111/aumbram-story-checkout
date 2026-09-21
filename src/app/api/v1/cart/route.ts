import { readCart } from "@/server/cart";
import { json, withApi } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => json(readCart()));

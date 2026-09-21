import { json, notFound, withApi } from "@/server/http";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = withApi(
  async (_request: Request, context: { params: Promise<{ orderId: string }> }) => {
    const { orderId } = await context.params;
    const order = getStore().orders.get(orderId);
    if (!order) return notFound(`Order ${orderId}`);
    return json(order);
  }
);

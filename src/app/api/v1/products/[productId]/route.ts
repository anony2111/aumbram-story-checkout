import { getDataset } from "@/server/dataset";
import { json, notFound, withApi } from "@/server/http";
import { productDetail } from "@/server/views";

export const dynamic = "force-dynamic";

export const GET = withApi(
  async (_request: Request, context: { params: Promise<{ productId: string }> }) => {
    const { productId } = await context.params;
    const product = getDataset().products.get(productId);
    if (!product) return notFound(`Product ${productId}`);
    return json(productDetail(product));
  }
);

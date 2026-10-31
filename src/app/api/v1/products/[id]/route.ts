import { expectedVersion, jsonBody } from "../../../../../lib/api/validation";
import type { UpdateProductInput } from "../../../../../modules/catalog/contracts";
import { catalogResponse } from "../../../../../modules/catalog/http";
import { getProduct, updateProduct } from "../../../../../modules/catalog/service";

type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return catalogResponse(request, "catalog.products.get", async actor => {
    const { id } = await context.params;
    const product = await getProduct(actor, id);
    return { data: product, version: product.version };
  });
}
export function PATCH(request: Request, context: Context) {
  return catalogResponse(request, "catalog.products.update", async actor => {
    const { id } = await context.params;
    const expected_version = expectedVersion(request.headers);
    const product = await updateProduct(actor, id, { ...await jsonBody(request) as UpdateProductInput, expected_version });
    return { data: product, version: product.version };
  });
}

import { jsonBody } from "../../../../lib/api/validation";
import type { CreateProductInput } from "../../../../modules/catalog/contracts";
import { catalogResponse, catalogPageQuery } from "../../../../modules/catalog/http";
import { createProduct, listProducts } from "../../../../modules/catalog/service";

export function GET(request: Request) {
  return catalogResponse(request, "catalog.products.list", async actor => {
    const page = await listProducts(actor, catalogPageQuery(request));
    return { data: page.items, next_cursor: page.next_cursor };
  });
}
export function POST(request: Request) {
  return catalogResponse(request, "catalog.products.create", async actor => {
    const product = await createProduct(actor, await jsonBody(request) as CreateProductInput);
    return { data: product, status: 201, version: product.version };
  });
}

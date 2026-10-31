import { jsonBody } from "../../../../lib/api/validation";
import type { CreateVariantInput } from "../../../../modules/catalog/contracts";
import { catalogResponse, catalogPageQuery } from "../../../../modules/catalog/http";
import { createVariant, listVariants } from "../../../../modules/catalog/service";

export function GET(request: Request) {
  return catalogResponse(request, "catalog.variants.list", async actor => {
    const page = await listVariants(actor, catalogPageQuery(request));
    return { data: page.items, next_cursor: page.next_cursor };
  });
}
export function POST(request: Request) {
  return catalogResponse(request, "catalog.variants.create", async actor => {
    const variant = await createVariant(actor, await jsonBody(request) as CreateVariantInput);
    return { data: variant, status: 201, version: variant.version };
  });
}

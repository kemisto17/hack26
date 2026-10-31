import { expectedVersion, jsonBody } from "../../../../../lib/api/validation";
import type { UpdateVariantInput } from "../../../../../modules/catalog/contracts";
import { catalogResponse } from "../../../../../modules/catalog/http";
import { getVariant, updateVariant } from "../../../../../modules/catalog/service";

type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return catalogResponse(request, "catalog.variants.get", async actor => {
    const { id } = await context.params;
    const variant = await getVariant(actor, id);
    return { data: variant, version: variant.version };
  });
}
export function PATCH(request: Request, context: Context) {
  return catalogResponse(request, "catalog.variants.update", async actor => {
    const { id } = await context.params;
    const expected_version = expectedVersion(request.headers);
    const variant = await updateVariant(actor, id, { ...await jsonBody(request) as UpdateVariantInput, expected_version });
    return { data: variant, version: variant.version };
  });
}

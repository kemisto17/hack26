import { catalogResponse } from "../../../../../modules/catalog/http";
import { getDiscount } from "../../../../../modules/catalog/service";

type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return catalogResponse(request, "catalog.discounts.get", async actor => {
    const { id } = await context.params;
    const discount = await getDiscount(actor, id);
    return { data: discount, version: discount.version };
  });
}

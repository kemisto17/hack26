import { catalogResponse, catalogPageQuery } from "../../../../modules/catalog/http";
import { listDiscounts } from "../../../../modules/catalog/service";

export function GET(request: Request) {
  return catalogResponse(request, "catalog.discounts.list", async actor => {
    const page = await listDiscounts(actor, catalogPageQuery(request));
    return { data: page.items, next_cursor: page.next_cursor };
  });
}

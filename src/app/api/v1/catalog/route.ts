import { catalogResponse, catalogPageQuery } from "../../../../modules/catalog/http";
import { getCatalog } from "../../../../modules/catalog/service";

export function GET(request: Request) {
  return catalogResponse(request, "catalog.list", async actor => {
    const result = await getCatalog(actor, catalogPageQuery(request));
    return { data: result.catalog, next_cursor: result.next_cursor };
  });
}

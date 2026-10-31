import { jsonBody } from "../../../../lib/api/validation";
import type { CreateTaxRuleInput } from "../../../../modules/catalog/contracts";
import { catalogResponse, catalogPageQuery } from "../../../../modules/catalog/http";
import { createTaxRule, listTaxRules } from "../../../../modules/catalog/service";

export function GET(request: Request) {
  return catalogResponse(request, "catalog.tax-rules.list", async actor => {
    const page = await listTaxRules(actor, catalogPageQuery(request));
    return { data: page.items, next_cursor: page.next_cursor };
  });
}
export function POST(request: Request) {
  return catalogResponse(request, "catalog.tax-rules.create", async actor => {
    const rule = await createTaxRule(actor, await jsonBody(request) as CreateTaxRuleInput);
    return { data: rule, status: 201, version: rule.version };
  });
}

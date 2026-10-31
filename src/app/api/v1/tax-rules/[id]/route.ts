import { expectedVersion, jsonBody } from "../../../../../lib/api/validation";
import type { UpdateTaxRuleInput } from "../../../../../modules/catalog/contracts";
import { catalogResponse } from "../../../../../modules/catalog/http";
import { getTaxRule, updateTaxRule } from "../../../../../modules/catalog/service";

type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return catalogResponse(request, "catalog.tax-rules.get", async actor => {
    const { id } = await context.params;
    const rule = await getTaxRule(actor, id);
    return { data: rule, version: rule.version };
  });
}
export function PATCH(request: Request, context: Context) {
  return catalogResponse(request, "catalog.tax-rules.update", async actor => {
    const { id } = await context.params;
    const expected_version = expectedVersion(request.headers);
    const rule = await updateTaxRule(actor, id, { ...await jsonBody(request) as UpdateTaxRuleInput, expected_version });
    return { data: rule, version: rule.version };
  });
}

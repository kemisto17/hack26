import { expectedVersion, jsonBody } from "../../../../../lib/api/validation";
import type { UpdatePlanInput } from "../../../../../modules/catalog/contracts";
import { catalogResponse } from "../../../../../modules/catalog/http";
import { getPlan, updatePlan } from "../../../../../modules/catalog/service";

type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return catalogResponse(request, "catalog.plans.get", async actor => {
    const { id } = await context.params;
    const plan = await getPlan(actor, id);
    return { data: plan, version: plan.version };
  });
}
export function PATCH(request: Request, context: Context) {
  return catalogResponse(request, "catalog.plans.update", async actor => {
    const { id } = await context.params;
    const expected_version = expectedVersion(request.headers);
    const plan = await updatePlan(actor, id, { ...await jsonBody(request) as UpdatePlanInput, expected_version });
    return { data: plan, version: plan.version };
  });
}

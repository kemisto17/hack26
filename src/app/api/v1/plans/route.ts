import { jsonBody } from "../../../../lib/api/validation";
import type { CreatePlanInput } from "../../../../modules/catalog/contracts";
import { catalogResponse, catalogPageQuery } from "../../../../modules/catalog/http";
import { createPlan, listPlans } from "../../../../modules/catalog/service";

export function GET(request: Request) {
  return catalogResponse(request, "catalog.plans.list", async actor => {
    const page = await listPlans(actor, catalogPageQuery(request));
    return { data: page.items, next_cursor: page.next_cursor };
  });
}
export function POST(request: Request) {
  return catalogResponse(request, "catalog.plans.create", async actor => {
    const plan = await createPlan(actor, await jsonBody(request) as CreatePlanInput);
    return { data: plan, status: 201, version: plan.version };
  });
}

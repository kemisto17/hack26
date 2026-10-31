/**
 * The documented POST /api/v1/billing/run entry point, expressed as a handler
 * factory so D1's distinct job-secret verifier is mandatory and no cookie/session
 * fallback can be introduced here. D1 owns BILLING_JOB_SECRET, constant-time
 * comparison and redacted logs; this module never reads the secret or headers.
 *
 * Integration: D1 registers `src/app/api/v1/billing/run/route.ts` as
 * `export const POST = createBillingRunHandler({ verifyJob: verifyBillingJob, services })`
 * after its verifier and transactional RPCs land. No route is registered while
 * those dependencies are absent.
 */
import "server-only";
import { AppError } from "@/lib/api/errors";
import type { Actor } from "@/lib/api/contracts";
import { errorResponse, successResponse } from "@/lib/api/response";
import { jsonBody } from "@/lib/api/validation";
import type { BillingRunInput } from "./contracts";
import type { BillingServices } from "./service";

export type BillingJobVerifier = (request: Request) => Promise<Actor>;

export function createBillingRunHandler(deps: {
  verifyJob: BillingJobVerifier;
  services: BillingServices;
}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      if (request.method !== "POST") throw new AppError("NOT_FOUND", "Not found.");
      // D1's verifier is the only source of jobActor. It must reject cookie-only
      // requests and compare the job secret in constant time.
      const jobActor = await deps.verifyJob(request);
      const body = (await jsonBody(request)) as BillingRunInput;
      const result = await deps.services.runBilling(jobActor, body);
      return successResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { Actor } from "./contracts";
import { AppError } from "../../lib/api/errors";
import { assertOrigin } from "../../lib/api/validation";
import { errorResponse, successResponse } from "../../lib/api/response";
import { appOrigin } from "../../lib/env/server";
import { requireActor } from "../identity/service";

type OperationResult<T> = { data: T; status?: number; version?: string; next_cursor?: string | null };
export async function catalogResponse<T>(request: Request, action: string, operation: (actor: Actor) => Promise<OperationResult<T>>): Promise<Response> {
  const request_id = crypto.randomUUID();
  let actor_id: string | null = null;
  try {
    if (request.method !== "GET") assertOrigin(request, appOrigin());
    const actor = await requireActor();
    actor_id = actor.id;
    const { data, ...options } = await operation(actor);
    console.info(JSON.stringify({ request_id, action, actor_id, outcome: "success" }));
    return successResponse(data, { ...options, request_id });
  } catch (error) {
    unstable_rethrow(error);
    console.warn(JSON.stringify({ request_id, action, actor_id, outcome: error instanceof AppError ? error.code : "INTERNAL_ERROR" }));
    return errorResponse(error, request_id);
  }
}

export function catalogPageQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== "limit" && key !== "cursor") || params.getAll("limit").length > 1 || params.getAll("cursor").length > 1) throw new AppError("VALIDATION_ERROR", "Invalid pagination query.");
  const rawLimit = params.get("limit");
  const cursor = params.get("cursor");
  if (rawLimit !== null && !/^\d+$/.test(rawLimit)) throw new AppError("VALIDATION_ERROR", "Invalid page limit.");
  return { ...(rawLimit === null ? {} : { limit: Number(rawLimit) }), ...(cursor === null ? {} : { cursor }) };
}

export function versionOf<T extends { version: string }>(data: T) { return data.version; }

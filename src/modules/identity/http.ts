import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import type { Actor } from '@/lib/api/contracts';
import { AppError } from '@/lib/api/errors';
import { errorResponse, successResponse } from '@/lib/api/response';
import { assertOrigin } from '@/lib/api/validation';
import { appOrigin } from '@/lib/env/server';
import { requireActor } from './service';

type Result<T> = { data: T; status?: number; version?: string; next_cursor?: string | null };
/** One transport boundary for D1 routes, with credentials/PII excluded from audit logs. */
export async function identityResponse<T>(request: Request, action: string, operation: (actor: Actor) => Promise<Result<T>>) {
  const request_id = crypto.randomUUID();
  let actor_id: string | null = null;
  try {
    if (request.method !== 'GET') assertOrigin(request, appOrigin());
    const actor = await requireActor();
    actor_id = actor.id;
    const { data, ...options } = await operation(actor);
    console.info(JSON.stringify({ request_id, action, actor_id, outcome: 'success' }));
    return successResponse(data, { ...options, request_id });
  } catch (error) {
    unstable_rethrow(error);
    console.warn(JSON.stringify({ request_id, action, actor_id, outcome: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }));
    return errorResponse(error, request_id);
  }
}

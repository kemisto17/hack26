import { AppError, errorStatus } from './errors';
import type { Failure, Success } from './contracts';

const headers = { 'Cache-Control': 'private, no-store' };
export function successResponse<T>(data: T, options: { status?: number; version?: string; next_cursor?: string | null; request_id?: string } = {}) {
  const body: Success<T> = { data, request_id: options.request_id ?? crypto.randomUUID() };
  if (options.next_cursor !== undefined) body.page = { next_cursor: options.next_cursor };
  return Response.json(body, { status: options.status ?? 200, headers: { ...headers, ...(options.version ? { ETag: `"${options.version}"` } : {}) } });
}
export function errorResponse(error: unknown, request_id: string = crypto.randomUUID()) {
  const safe = error instanceof AppError && error.code !== 'INTERNAL_ERROR' ? error : new AppError('INTERNAL_ERROR', 'An unexpected error occurred.');
  const body: Failure = { error: { code: safe.code, message: safe.message, fields: safe.fields }, request_id };
  return Response.json(body, { status: errorStatus[safe.code], headers });
}

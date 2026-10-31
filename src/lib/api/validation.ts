import { AppError } from './errors';

export function invalid(message = 'Invalid request.'): never { throw new AppError('VALIDATION_ERROR', message); }
export function strictObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid();
  return value as Record<string, unknown>;
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)) invalid('A valid UUID is required.');
  return value.toLowerCase();
}
export function version(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) invalid('Invalid version.');
  return value;
}
export function expectedVersion(headers: Headers): string {
  const header = headers.get('if-match');
  if (!header) throw new AppError('PRECONDITION_REQUIRED', 'If-Match is required.');
  if (!/^"[1-9]\d*"$/.test(header)) invalid('If-Match must contain one quoted version.');
  return version(header.slice(1, -1));
}
export function assertOrigin(request: Request, allowedOrigin: string) {
  if (request.headers.get('origin') !== allowedOrigin) throw new AppError('FORBIDDEN', 'Request origin is not allowed.');
}
export async function jsonBody(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') invalid('Expected application/json.');
  try { return await request.json(); } catch { return invalid('Invalid JSON.'); }
}

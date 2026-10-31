import type { PageQuery, Role } from '@/lib/api/contracts';
import { invalid, strictObject, uuid } from '@/lib/api/validation';

export const passwordHelp = 'Use at least 9 characters, including uppercase, lowercase, a number and a special character.';
export function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 9 || !/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(value)) invalid(passwordHelp);
  return value;
}
export function callbackPath(value: unknown): string {
  return typeof value === 'string' && ['/', '/portal', '/update-password'].includes(value) ? value : '/';
}
export function displayName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) invalid('Display name must contain 1–200 characters.');
  return value.trim();
}
export function emailAddress(value: unknown): string {
  if (typeof value !== 'string') invalid('Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('Enter a valid email address.');
  return email;
}
export function profileInput(value: unknown) {
  const input = strictObject(value, ['display_name']);
  return { display_name: displayName(input.display_name) };
}
export function invitationInput(value: unknown) {
  const input = strictObject(value, ['email', 'display_name']);
  return { email: emailAddress(input.email), display_name: displayName(input.display_name) };
}
export function accessInput(value: unknown): { role?: Role; is_active?: boolean } {
  const input = strictObject(value, ['role', 'is_active']);
  if (!Object.keys(input).length) invalid('Supply a role or active flag.');
  if (input.role !== undefined && !['admin', 'internal', 'customer'].includes(String(input.role))) invalid('Invalid role.');
  if (input.is_active !== undefined && typeof input.is_active !== 'boolean') invalid('Invalid active flag.');
  return { ...(input.role !== undefined ? { role: input.role as Role } : {}), ...(input.is_active !== undefined ? { is_active: input.is_active as boolean } : {}) };
}
export type DirectoryCursor = { scope: 'customers' | 'users'; created_at: string; id: string };
export function pageInput(query: PageQuery, scope: DirectoryCursor['scope'] = 'customers'): { limit: number; after: DirectoryCursor | null } {
  strictObject(query, ['limit', 'cursor']);
  const limit = query.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid('Limit must be 1–100.');
  let after: DirectoryCursor | null = null;
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== 'string' || query.cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(query.cursor)) invalid('Invalid cursor.');
    let decoded: Record<string, unknown>;
    try { decoded = strictObject(JSON.parse(atob(query.cursor.replace(/-/g, '+').replace(/_/g, '/'))), ['scope', 'created_at', 'id']); }
    catch { return invalid('Invalid cursor.'); }
    if (decoded.scope !== scope || typeof decoded.created_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(decoded.created_at) || !Number.isFinite(Date.parse(decoded.created_at))) invalid('Invalid cursor.');
    after = { scope, created_at: decoded.created_at, id: uuid(decoded.id) };
  }
  return { limit, after };
}

import 'server-only';
import type { Actor, Mutation, Page, PageQuery, Role } from '@/lib/api/contracts';
import { AppError, errorStatus, type ErrorCode } from '@/lib/api/errors';
import { strictObject, uuid, version } from '@/lib/api/validation';
import { appOrigin } from '@/lib/env/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSessionClient } from '@/lib/supabase/server';
import type { UserDTO } from './contracts';
import { accessInput, invitationInput, pageInput, profileInput } from './validation';

const profileColumns = 'id,display_name,role,is_active,version,created_at,updated_at';
function databaseError(error: { message: string; code?: string }): never {
  if (Object.hasOwn(errorStatus, error.message)) {
    const code = error.message as ErrorCode;
    const messages: Partial<Record<ErrorCode, string>> = {
      FORBIDDEN: 'You do not have access to this action.', NOT_FOUND: 'User not found.',
      VERSION_CONFLICT: 'This profile changed. Refresh and try again.',
      INVALID_TRANSITION: 'This change is not allowed. Keep at least one active admin.',
      IDEMPOTENCY_CONFLICT: 'This email belongs to an existing account or a different invitation.',
      RATE_LIMITED: 'An invitation is already in progress. Try again shortly.', VALIDATION_ERROR: 'Invalid identity request.',
    };
    throw new AppError(code, messages[code] ?? 'The operation could not be completed.');
  }
  throw new AppError('INTERNAL_ERROR', 'Identity operation failed.');
}
function userDTO(row: { id: string; display_name: string; role: string; is_active: boolean; version: number | string; created_at: string; updated_at: string }): UserDTO {
  if (!['admin', 'internal', 'customer'].includes(row.role)) throw new AppError('FORBIDDEN', 'Invalid account role.');
  if (typeof row.version === 'number' && !Number.isSafeInteger(row.version)) throw new AppError('INTERNAL_ERROR', 'Unsafe database version.');
  return { id: row.id, display_name: row.display_name, role: row.role as Role, is_active: row.is_active, version: String(row.version), created_at: row.created_at, updated_at: row.updated_at };
}
async function currentProfile(expectedActor?: Actor): Promise<UserDTO> {
  const client = await createSessionClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || !user.email_confirmed_at) throw new AppError('UNAUTHENTICATED', 'Sign in with a confirmed email account.');
  if (expectedActor && expectedActor.id !== user.id) throw new AppError('FORBIDDEN', 'Actor does not match this session.');
  const result = await client.from('users').select(profileColumns).eq('id', user.id).maybeSingle();
  if (result.error) databaseError(result.error);
  if (!result.data?.is_active) throw new AppError('FORBIDDEN', 'This account is disabled or has no profile.');
  return userDTO(result.data);
}
export async function requireActor(): Promise<Actor> {
  const profile = await currentProfile();
  return { id: profile.id, role: profile.role };
}
export async function getMe(actor: Actor): Promise<UserDTO> { return currentProfile(actor); }
export async function updateMe(actor: Actor, input: { display_name: string } & Mutation): Promise<UserDTO> {
  strictObject(input, ['display_name', 'expected_version']);
  const values = profileInput({ display_name: input.display_name });
  const expected = version(input.expected_version);
  const current = await currentProfile(actor);
  // PostgREST accepts decimal strings for bigint; generated RPC types use lossy JS numbers.
  const result = await createAdminClient().rpc('identity_update_profile', { p_actor_id: current.id, p_expected_version: expected as unknown as number, p_display_name: values.display_name });
  if (result.error) databaseError(result.error);
  return result.data as unknown as UserDTO;
}
export async function setAccess(actor: Actor, id: string, input: { role?: Role; is_active?: boolean } & Mutation): Promise<UserDTO> {
  strictObject(input, ['role', 'is_active', 'expected_version']);
  const { expected_version, ...changes } = input;
  const values = accessInput(changes);
  const target = uuid(id);
  const expected = version(expected_version);
  const current = await currentProfile(actor);
  if (current.role !== 'admin') throw new AppError('FORBIDDEN', 'Admin access is required.');
  const result = await createAdminClient().rpc('identity_set_access', { p_actor_id: current.id, p_user_id: target, p_expected_version: expected as unknown as number, p_role: values.role, p_is_active: values.is_active });
  if (result.error) databaseError(result.error);
  return result.data as unknown as UserDTO;
}
async function listProfiles(actor: Actor, query: PageQuery, scope: 'customers' | 'users'): Promise<Page<UserDTO>> {
  const { limit, after } = pageInput(query, scope);
  const current = await currentProfile(actor);
  if (current.role === 'customer' || (scope === 'users' && current.role !== 'admin')) throw new AppError('FORBIDDEN', 'Staff access is required.');
  const client = await createSessionClient();
  let request = client.from('users').select(profileColumns).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
  if (scope === 'customers') request = request.eq('role', 'customer');
  if (after) request = request.or(`created_at.lt.${after.created_at},and(created_at.eq.${after.created_at},id.lt.${after.id})`);
  const result = await request;
  if (result.error) databaseError(result.error);
  const rows = result.data ?? [];
  const items = rows.slice(0, limit).map(userDTO);
  const last = items.at(-1);
  return { items, next_cursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ scope, created_at: last.created_at, id: last.id })).toString('base64url') : null };
}
export async function listCustomers(actor: Actor, query: PageQuery): Promise<Page<UserDTO>> { return listProfiles(actor, query, 'customers'); }
/** D1 admin shell only; no additional HTTP directory or Auth email exposure. */
export async function listAccessUsers(actor: Actor, query: PageQuery): Promise<Page<UserDTO>> { return listProfiles(actor, query, 'users'); }
export async function getBillingContact(actor: Actor, customer_id: string): Promise<{ display_name: string; email: string }> {
  const id = uuid(customer_id);
  const current = await currentProfile(actor);
  if (current.role === 'customer') throw new AppError('FORBIDDEN', 'Staff access is required.');
  const session = await createSessionClient();
  const profile = await session.from('users').select('display_name').eq('id', id).eq('role', 'customer').maybeSingle();
  if (profile.error) databaseError(profile.error);
  if (!profile.data) throw new AppError('NOT_FOUND', 'Customer not found.');
  const result = await createAdminClient().auth.admin.getUserById(id);
  if (result.error) throw new AppError('INTERNAL_ERROR', 'Customer contact lookup failed.');
  if (!result.data.user?.email) throw new AppError('NOT_FOUND', 'Customer contact unavailable.');
  return { display_name: profile.data.display_name, email: result.data.user.email };
}
export async function inviteStaff(actor: Actor, input: { email: string; display_name: string }): Promise<{ accepted: true }> {
  const values = invitationInput(input);
  const current = await currentProfile(actor);
  if (current.role !== 'admin') throw new AppError('FORBIDDEN', 'Admin access is required.');
  const admin = createAdminClient();
  const prepared = await admin.rpc('identity_prepare_invitation', { p_actor_id: current.id, p_email: values.email, p_display_name: values.display_name });
  if (prepared.error) databaseError(prepared.error);
  const invitation = prepared.data as { status: string; id: string; claim_token: string; needs_delivery: boolean };
  if (invitation.status === 'accepted') return { accepted: true };
  const args = { p_actor_id: current.id, p_invitation_id: invitation.id, p_claim_token: invitation.claim_token };
  try {
    if (invitation.needs_delivery) {
      const delivery = await admin.auth.admin.inviteUserByEmail(values.email, { data: { display_name: values.display_name }, redirectTo: `${appOrigin()}/auth/callback?next=/update-password` });
      if (delivery.error) {
        // A lost provider response may still have created the invited Auth user.
        const recovered = await admin.rpc('identity_finish_invitation', args);
        if (!recovered.error) return { accepted: true };
        if (recovered.error.message === 'FORBIDDEN') databaseError(recovered.error);
        throw new AppError(delivery.error.status === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR', 'The invitation could not be delivered. Retry shortly.');
      }
    }
    const finished = await admin.rpc('identity_finish_invitation', args);
    if (finished.error) databaseError(finished.error);
    return { accepted: true };
  } catch (error) {
    await admin.rpc('identity_release_invitation', args);
    throw error;
  }
}

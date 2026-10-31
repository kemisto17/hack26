import type { Role } from '@/lib/api/contracts';
import type { UserDTO } from '@/modules/identity/contracts';

export class IdentityRequestError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message); }
}

async function responseData(response: Response): Promise<unknown> {
  let body;
  try { body = await response.json(); }
  catch { throw new IdentityRequestError('The server response could not be read. Refresh before trying again.', 'UNREADABLE_RESPONSE', response.status); }
  if (!response.ok) {
    throw new IdentityRequestError(body.error?.message ?? 'The request could not be completed.', body.error?.code ?? 'REQUEST_FAILED', response.status);
  }
  return body.data;
}

export async function inviteAccount(input: { display_name: string; email: string }): Promise<void> {
  const data = await responseData(await fetch('/api/v1/staff/invitations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }));
  if (!data || typeof data !== 'object' || !('accepted' in data) || data.accepted !== true) {
    throw new Error('The invitation was not acknowledged. Retry the same email to reconcile its status.');
  }
}

export async function updateAccountAccess(user: UserDTO, input: { role: Role; is_active: boolean }): Promise<UserDTO> {
  const data = await responseData(await fetch(`/api/v1/users/${encodeURIComponent(user.id)}/access`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `"${user.version}"` },
    body: JSON.stringify(input),
  }));
  const result = data as Partial<UserDTO> | null;
  if (!result || result.id !== user.id || !['admin', 'internal', 'customer'].includes(result.role ?? '') || typeof result.is_active !== 'boolean' || !/^[1-9]\d*$/.test(String(result.version ?? ''))) {
    throw new Error('The update response could not be verified. Refresh this account before making another change.');
  }
  return result as UserDTO;
}

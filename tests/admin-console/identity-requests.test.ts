import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserDTO } from '@/modules/identity/contracts';
import { inviteAccount, updateAccountAccess } from '@/components/admin-console/identity-requests';
const user: UserDTO = { id: '11111111-1111-4111-8111-111111111111', display_name: 'Fixture', role: 'internal', is_active: true, version: '9007199254740993', created_at: '2026-10-31T00:00:00Z', updated_at: '2026-10-31T00:00:00Z' };
const request = vi.fn();
beforeEach(() => { request.mockReset(); vi.stubGlobal('fetch', request); });
afterEach(() => vi.unstubAllGlobals());

describe('identity HTTP consumer', () => {
  it('sends access changes to the existing endpoint with the exact version', async () => {
    const updated = { ...user, role: 'customer', version: '9007199254740994' };
    request.mockResolvedValue(new Response(JSON.stringify({ data: updated })));
    expect(await updateAccountAccess(user, { role: 'customer', is_active: true })).toEqual(updated);
    expect(request).toHaveBeenCalledWith(`/api/v1/users/${user.id}/access`, expect.objectContaining({ method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': '"9007199254740993"' }, body: '{"role":"customer","is_active":true}' }));
    expect(user.role).toBe('internal');
  });
  it.each([['VERSION_CONFLICT', 409], ['FORBIDDEN', 403], ['UNAUTHENTICATED', 401], ['INVALID_TRANSITION', 409], ['VALIDATION_ERROR', 400]] as const)('preserves %s errors and never retries', async (code, status) => {
    request.mockResolvedValue(new Response(JSON.stringify({ error: { code, message: 'Fixture denial' } }), { status }));
    await expect(updateAccountAccess(user, { role: 'admin', is_active: true })).rejects.toMatchObject({ code, status });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not report success after a network failure', async () => {
    request.mockRejectedValue(new TypeError('Network failure'));
    await expect(updateAccountAccess(user, { role: 'internal', is_active: false })).rejects.toThrow('Network failure');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects a success response for the wrong account', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ data: { ...user, id: 'another-account' } })));
    await expect(updateAccountAccess(user, { role: 'admin', is_active: true })).rejects.toThrow('could not be verified');
  });
  it('rejects unreadable responses', async () => {
    request.mockResolvedValue(new Response('<html>Unavailable</html>', { status: 503 }));
    await expect(inviteAccount({ display_name: 'Fixture', email: 'fixture@example.com' })).rejects.toMatchObject({ code: 'UNREADABLE_RESPONSE' });
  });
  it('invites internal staff without accepting a browser-selected administrator role', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ data: { accepted: true } }), { status: 202 }));
    await inviteAccount({ display_name: 'Fixture', email: 'fixture@example.com' });
    expect(request).toHaveBeenCalledWith('/api/v1/staff/invitations', expect.objectContaining({ body: '{"display_name":"Fixture","email":"fixture@example.com"}' }));
  });
  it('requires explicit invitation acknowledgement', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ data: { accepted: false } })));
    await expect(inviteAccount({ display_name: 'Fixture', email: 'fixture@example.com' })).rejects.toThrow('not acknowledged');
  });
});

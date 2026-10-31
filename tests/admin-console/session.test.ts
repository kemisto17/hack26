import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/api/errors';
const identity = vi.hoisted(() => ({ requireActor: vi.fn(), getMe: vi.fn(), listAccessUsers: vi.fn(), listCustomers: vi.fn() }));
vi.mock('@/modules/identity/service', () => identity);
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import { requireAdmin, adminDirectory } from '@/components/admin-console/session';
import { adminRecords } from '@/components/admin-console/data';

beforeEach(() => {
  vi.clearAllMocks();
  identity.requireActor.mockResolvedValue({ id: 'verified-admin', role: 'admin' });
  identity.getMe.mockResolvedValue({ id: 'verified-admin', role: 'admin', is_active: true });
  identity.listAccessUsers.mockResolvedValue({ items: [], next_cursor: null });
  identity.listCustomers.mockResolvedValue({ items: [], next_cursor: null });
});
describe('administrator server boundaries', () => {
  it('accepts the current verified administrator', async () => {
    expect((await requireAdmin()).id).toBe('verified-admin');
    expect(identity.getMe).toHaveBeenCalledWith({ id: 'verified-admin', role: 'admin' });
  });
  it.each([['internal', '/staff/dashboard'], ['customer', '/portal/dashboard'], ['unknown', '/login?reason=account']])('denies %s before directory access', async (role, path) => {
    identity.getMe.mockResolvedValue({ id: 'verified-admin', role });
    await expect(adminDirectory('users')).rejects.toThrow(`REDIRECT:${path}`);
    expect(identity.listAccessUsers).not.toHaveBeenCalled();
  });
  it.each(['UNAUTHENTICATED', 'FORBIDDEN'] as const)('denies %s sessions', async code => {
    identity.requireActor.mockRejectedValue(new AppError(code, 'Denied'));
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/login?reason=account');
  });
  it('propagates infrastructure failures instead of pretending the directory is empty', async () => {
    identity.getMe.mockRejectedValue(new Error('Offline'));
    await expect(adminDirectory('users')).rejects.toThrow('Offline');
  });
  it('passes cursor and verified actor to the correct existing service', async () => {
    await adminDirectory('users', 'opaque');
    expect(identity.listAccessUsers).toHaveBeenCalledWith({ id: 'verified-admin', role: 'admin' }, { limit: 100, cursor: 'opaque' });
    await adminDirectory('customers');
    expect(identity.listCustomers).toHaveBeenCalledWith({ id: 'verified-admin', role: 'admin' }, { limit: 100 });
  });
  it('keeps operational reads unavailable and checks authorization for each call', async () => {
    for (const kind of ['quotations', 'subscriptions', 'invoices', 'payments', 'subscription', 'invoice', 'report'] as const) {
      expect(await adminRecords(kind)).toMatchObject({ state: 'unavailable' });
    }
    expect(identity.requireActor).toHaveBeenCalledTimes(7);
  });
});

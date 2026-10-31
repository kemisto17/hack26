import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/api/errors';
const identity = vi.hoisted(() => ({ requireActor: vi.fn(), getMe: vi.fn(), listCustomers: vi.fn() }));
vi.mock('@/modules/identity/service', () => identity);
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import { requireStaff, customerDirectory } from '@/components/staff-console/session';
import { operationData } from '@/components/staff-console/data';
beforeEach(() => {
  vi.clearAllMocks();
  identity.requireActor.mockResolvedValue({ id: 'staff', role: 'internal' });
  identity.getMe.mockResolvedValue({ id: 'staff', role: 'internal', is_active: true });
  identity.listCustomers.mockResolvedValue({ items: [], next_cursor: null });
});
describe('staff frontend authorization delegation', () => {
  it.each(['internal', 'admin'])('allows a D1-verified %s profile', async role => {
    identity.getMe.mockResolvedValue({ id: 'staff', role, is_active: true });
    expect((await requireStaff()).role).toBe(role);
    expect(identity.getMe).toHaveBeenCalledWith({ id: 'staff', role: 'internal' });
  });
  it('does not accept a stale actor role over the current customer profile', async () => {
    identity.getMe.mockResolvedValue({ id: 'staff', role: 'customer' });
    await expect(customerDirectory()).rejects.toThrow('REDIRECT:/portal/dashboard');
    expect(identity.listCustomers).not.toHaveBeenCalled();
  });
  it.each(['UNAUTHENTICATED', 'FORBIDDEN'] as const)('denies %s before loading data', async code => {
    identity.requireActor.mockRejectedValue(new AppError(code, 'Fixture error'));
    await expect(customerDirectory()).rejects.toThrow('REDIRECT:/login?reason=account');
    expect(identity.listCustomers).not.toHaveBeenCalled();
  });
  it('does not disguise infrastructure errors as empty results', async () => {
    identity.getMe.mockRejectedValue(new Error('Offline'));
    await expect(customerDirectory()).rejects.toThrow('Offline');
  });
  it('passes cursor and verified actor to the owned customer directory', async () => {
    await customerDirectory('opaque-cursor');
    expect(identity.listCustomers).toHaveBeenCalledWith({ id: 'staff', role: 'internal' }, { limit: 50, cursor: 'opaque-cursor' });
  });
  it('leaves unsupported operational reads unavailable, not zero or empty', async () => {
    for (const kind of ['subscriptions', 'quotations', 'invoices', 'payments', 'report', 'subscription', 'invoice'] as const) {
      const result = await operationData(kind);
      expect(result.state).toBe('unavailable');
      expect(result).not.toHaveProperty('data');
    }
    expect(identity.requireActor).toHaveBeenCalledTimes(7);
  });
});

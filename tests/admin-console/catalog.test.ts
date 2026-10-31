import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
const mocks = vi.hoisted(() => ({ guard: vi.fn(), list: vi.fn() }));
vi.mock('@/components/admin-console/session', () => ({ requireAdmin: mocks.guard }));
vi.mock('@/modules/catalog/service', () => ({ listProducts: mocks.list, listVariants: mocks.list, listPlans: mocks.list, listTaxRules: mocks.list, listDiscounts: mocks.list }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { AdminCatalog } from '@/components/admin-console/catalog';
beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue({ id: 'admin-fixture', role: 'admin' }); mocks.list.mockResolvedValue({ items: [], next_cursor: null }); });
it('uses the verified admin actor for every public catalog read and renders D2 configuration', async () => {
  const html = renderToStaticMarkup(await AdminCatalog());
  expect(mocks.list).toHaveBeenCalledTimes(5);
  expect(mocks.list).toHaveBeenCalledWith({ id: 'admin-fixture', role: 'admin' }, { limit: 100 });
  expect(html).toContain('Add a product');
  expect(html).toContain('first 100 records');
});
it('does not read catalog data when the admin guard rejects access', async () => {
  mocks.guard.mockRejectedValue(new Error('forbidden'));
  await expect(AdminCatalog()).rejects.toThrow('forbidden');
  expect(mocks.list).not.toHaveBeenCalled();
});
it('propagates a failed catalog read instead of displaying an empty successful catalog', async () => {
  mocks.list.mockRejectedValueOnce(new Error('unavailable'));
  await expect(AdminCatalog()).rejects.toThrow('unavailable');
});

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { UserDTO } from '@/modules/identity/contracts';
vi.stubGlobal('React', React);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/admin/settings/billing' }));
import { AccessEditor } from '@/components/admin-console/access-editor';
import { AdminInviteForm } from '@/components/admin-console/invite-form';
import { DirectoryTable } from '@/components/admin-console/directory-table';
import { RelatedTabs } from '@/components/admin-console/related-tabs';
import { AdminReports } from '@/components/admin-console/reports';
import { activeAdminItem, adminNavigation } from '@/components/admin-console/navigation';

const base: UserDTO = { id: 'fixture', display_name: 'Fixture', role: 'internal', is_active: true, version: '1', created_at: '2026-10-31T00:00:00Z', updated_at: '2026-10-31T00:00:00Z' };
describe('administrator interface', () => {
  it('lists staff only and preserves the directory cursor in detail links', () => {
    const html = renderToStaticMarkup(createElement(DirectoryTable, { items: [base, { ...base, id: 'customer', display_name: 'CUSTOMER-NOT-STAFF', role: 'customer' }], kind: 'staff', cursor: 'opaque', nextCursor: 'next' }));
    expect(html).toContain('/admin/staff/fixture?cursor=opaque');
    expect(html).not.toContain('CUSTOMER-NOT-STAFF');
    expect(html).toContain('Load next batch');
  });
  it('lists customers only and never renders unsupported email fields', () => {
    const html = renderToStaticMarkup(createElement(DirectoryTable, { items: [base, { ...base, id: 'customer', role: 'customer', display_name: 'CUSTOMER' }], kind: 'customers', nextCursor: null }));
    expect(html).toContain('CUSTOMER');
    expect(html).not.toContain('/admin/customers/fixture');
    expect(html).not.toContain('name="email"');
  });
  it('requires review for access changes and explains last-admin protection', () => {
    const html = renderToStaticMarkup(createElement(AccessEditor, { user: base, currentAdminId: base.id }));
    expect(html).toContain('Review access change');
    expect(html).toContain('last active administrator');
    expect(html).toContain('your own account');
    expect(html).toContain('disabled');
    expect(html).not.toContain('Account access updated.');
  });
  it('restricts invitations to the actual internal role and validates required inputs', () => {
    const html = renderToStaticMarkup(createElement(AdminInviteForm));
    expect(html).toContain('Review invitation');
    expect(html).toContain('type="email"');
    expect(html).toContain('required');
    expect(html).toContain('Internal staff');
    expect(html).not.toContain('<option value="admin"');
  });
  it('links accessible record tabs and labels missing data', () => {
    const html = renderToStaticMarkup(createElement(RelatedTabs, { kind: 'customer' }));
    expect(html.match(/role="tab"/g)?.length).toBe(6);
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-controls=');
    expect(html).toContain('not connected');
  });
  it('does not imply unavailable reports are real zeroes or charts', () => {
    const html = renderToStaticMarkup(createElement(AdminReports));
    expect(html).toContain('Report unavailable');
    expect(html).toContain('Review date range');
    expect(html).not.toContain('$0.00');
    expect(html).not.toContain('Download CSV');
  });
  it('selects the most specific settings navigation and omits unreliable system health', () => {
    expect(activeAdminItem('/admin/settings/billing')?.path).toBe('settings/billing');
    expect(activeAdminItem('/admin/staff/invite')?.path).toBe('staff');
    expect(activeAdminItem('/admin/roles')?.path).toBe('staff');
    expect(activeAdminItem('/admin/staff-other')).toBeUndefined();
    expect(adminNavigation.flatMap(group => group.items).some(item => item.path === 'system')).toBe(false);
  });
});

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
vi.stubGlobal('React', React);
const directory = vi.hoisted(() => vi.fn());
vi.mock('@/components/admin-console/session', () => ({ adminDirectory: directory }));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/dashboard' }));
vi.mock('@/modules/identity/sign-out', () => ({ SignOut: () => createElement('button', { type: 'button' }, 'Sign out') }));
import { AdminDashboard } from '@/components/admin-console/dashboard';
import { AdminShell } from '@/components/admin-console/shell';

const user = { id: 'fixture-admin', display_name: 'Admin preview', role: 'admin' as const, is_active: true, version: '1', created_at: '2026-10-31T00:00:00Z', updated_at: '2026-10-31T00:00:00Z' };
beforeEach(() => directory.mockResolvedValue({ items: [user], next_cursor: null }));
describe('admin overview data honesty and layout', () => {
  it('shows verified counts only when the complete account directory fits in the batch', async () => {
    const html = renderToStaticMarkup(await AdminDashboard());
    expect(html).toContain('Verified account directory');
    expect(html).toContain('Includes administrators');
    expect(html.match(/aria-label="Unavailable"/g)?.length).toBe(6);
    expect(html).not.toContain('$0.00');
  });
  it('never labels a partial directory page as a business-wide account count', async () => {
    directory.mockResolvedValue({ items: [user], next_cursor: 'older-accounts' });
    const html = renderToStaticMarkup(await AdminDashboard());
    expect(html.match(/aria-label="Unavailable"/g)?.length).toBe(8);
    expect(html).toContain('Full count not available');
  });
  it('renders grouped admin navigation and an isolated optional visual fixture', async () => {
    const html = renderToStaticMarkup(createElement(AdminShell, { user } as React.ComponentProps<typeof AdminShell>, await AdminDashboard()));
    expect(html).toContain('aria-label="Administrator navigation"');
    expect(html).toContain('/admin/settings/security');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Skip to content');
    expect(html).not.toContain('SUPABASE_SECRET_KEY');
    const output = process.env.ADMIN_VISUAL_OUTPUT;
    if (output) {
      mkdirSync(output, { recursive: true });
      const css = readFileSync('src/app/staff/staff.css', 'utf8') + '\n' + readFileSync('src/app/admin/admin.css', 'utf8');
      writeFileSync(join(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Admin console layout fixture</title><style>body{margin:0;font-family:Arial,sans-serif}a{color:inherit}.brand-mark{display:inline-flex;align-items:center;justify-content:center}.brand-mark svg{width:24px;height:24px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}${css}</style></head><body>${html}</body></html>`, 'utf8');
    }
  });
});

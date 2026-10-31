import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
vi.stubGlobal('React', React);
vi.mock('next/navigation', () => ({ usePathname: () => '/staff/dashboard' }));
vi.mock('@/modules/identity/sign-out', () => ({ SignOut: () => createElement('button', { type: 'button' }, 'Sign out') }));
vi.mock('@/components/staff-console/session', () => ({ requireStaff: async () => ({ id: 'fixture', display_name: 'Staff preview', role: 'internal', is_active: true }) }));
import { StaffShell } from '@/components/staff-console/shell';
import { Dashboard } from '@/components/staff-console/dashboard';

describe('staff shell and dashboard', () => {
  it('renders operational navigation without invented metrics or admin controls', async () => {
    const user = { id: 'fixture', display_name: 'Staff preview', role: 'internal' as const, is_active: true, version: '1', created_at: '2026-10-31T00:00:00Z', updated_at: '2026-10-31T00:00:00Z' };
    const html = renderToStaticMarkup(createElement(StaffShell, { user } as React.ComponentProps<typeof StaffShell>, await Dashboard()));
    expect(html).toContain('aria-label="Staff navigation"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Skip to content');
    expect(html).toContain('Internal staff');
    expect(html).not.toContain('Invite staff');
    expect(html).not.toContain('$0.00');
    expect(html.match(/aria-label="Unavailable"/g)?.length).toBe(5);
    // Optional isolated visual fixture; never served by the real app or committed.
    const directory = process.env.STAFF_VISUAL_OUTPUT;
    if (directory) {
      mkdirSync(directory, { recursive: true });
      const css = readFileSync('src/app/staff/staff.css', 'utf8');
      writeFileSync(join(directory, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Staff console layout fixture</title><style>body{margin:0;font-family:Arial,sans-serif}a{color:inherit}button{font-family:inherit}.brand-mark{display:inline-flex;background:#5046e5;color:white;padding:5px}.brand-mark svg{width:24px;height:24px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}${css}</style></head><body>${html}</body></html>`, 'utf8');
    }
  });
});

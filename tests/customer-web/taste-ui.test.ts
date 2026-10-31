import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('React', React);
const location = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => location.pathname }));
import { WorkspaceNavigation } from '@/modules/identity/workspace-navigation';
import { ProductPreview } from '@/components/customer-web/marketing';

describe('redesigned workspace navigation', () => {
  it('marks overview current only at the exact root', () => {
    location.pathname = '/';
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation, { portal: false }));
    expect(html).toContain('aria-label="Staff navigation"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0]).toContain('href="/"');
  });
  it('keeps nested resource routes current without prefix collisions', () => {
    location.pathname = '/invoices/11111111-1111-4111-8111-111111111111';
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation, { portal: false }));
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0]).toContain('href="/invoices"');
    location.pathname = '/invoices-archive';
    expect(renderToStaticMarkup(createElement(WorkspaceNavigation, { portal: false }))).not.toContain('aria-current="page"');
  });
  it('keeps customer and staff destinations separate', () => {
    location.pathname = '/portal/subscriptions';
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation, { portal: true }));
    expect(html).toContain('aria-label="Customer navigation"');
    expect(html).toContain('href="/portal/subscriptions"');
    expect(html).not.toContain('href="/reports"');
  });
});

it('explains the product workflow without simulating live account data', () => {
  const html = renderToStaticMarkup(createElement(ProductPreview));
  expect(html).toContain('Subscription workflow');
  expect(html).toContain('Quotation');
  expect(html).toContain('Subscription');
  expect(html).toContain('Invoice');
  expect(html).not.toContain('preview-metrics');
  expect(html).not.toContain('CUSTOMER WORKSPACE · ILLUSTRATION');
});

import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
import { DataTable, selectRows, type TableRow } from '@/components/staff-console/table';
import { QuotationEditor } from '@/components/staff-console/quotation-editor';
import { PaymentForm } from '@/components/staff-console/payment-form';
import { CustomerTabs } from '@/components/staff-console/customer-tabs';
import { currentSection, navigation } from '@/components/staff-console/navigation';
const rows: TableRow[] = [
  { id: 'one', cells: ['Example 12', 'Active'], status: 'Active' },
  { id: 'two', cells: ['Example 2', 'Inactive'], status: 'Inactive' },
  { id: 'three', cells: ['Other', 'Active'], status: 'Active' },
];
describe('loaded-result controls', () => {
  it('combines case-insensitive search and exact status without mutating input', () => {
    expect(selectRows(rows, ' EXAMPLE ', 'Active', 0, false).map(row => row.id)).toEqual(['one']);
    expect(rows.map(row => row.id)).toEqual(['one', 'two', 'three']);
  });
  it('sorts natural text in either direction', () => {
    expect(selectRows(rows, 'example', 'all', 0, false).map(row => row.id)).toEqual(['two', 'one']);
    expect(selectRows(rows, 'example', 'all', 0, true).map(row => row.id)).toEqual(['one', 'two']);
  });
  it('handles empty and no-match results', () => {
    expect(selectRows([], '', 'all', 0, false)).toEqual([]);
    expect(selectRows(rows, 'missing', 'all', 0, false)).toEqual([]);
  });
  it('paginates a loaded batch and describes scope honestly', () => {
    const many = Array.from({ length: 22 }, (_, index) => ({ id: String(index), cells: [`Row ${index}`], status: 'Active' }));
    const html = renderToStaticMarkup(createElement(DataTable, { title: 'Customers', columns: ['Name'], rows: many, nextHref: '/staff/customers?cursor=fixture' }));
    expect(html.match(/<td/g)?.length).toBe(10);
    expect(html).toContain('Page 1 of 3');
    expect(html).toContain('Search customers in loaded results');
    expect(html).toContain('Load next batch');
    expect(html).toContain('aria-sort="ascending"');
  });
  it('distinguishes unavailable reads from a valid empty collection', () => {
    const props = { title: 'Invoices', columns: ['Number'], rows: [] };
    const missing = renderToStaticMarkup(createElement(DataTable, { ...props, unavailable: 'Billing not connected' }));
    const empty = renderToStaticMarkup(createElement(DataTable, props));
    expect(missing).toContain('Invoices unavailable');
    expect(missing).not.toContain('0 matching records');
    expect(empty).toContain('No invoices yet');
    expect(empty).toContain('0 matching records');
  });
});
describe('staff workflow presentation', () => {
  it('does not imply an unsaved preparation has pricing or creation support', () => {
    const html = renderToStaticMarkup(createElement(QuotationEditor, { customers: [], hasMore: false }));
    expect(html).toContain('Preparation only');
    expect(html).toContain('nothing is submitted or persisted');
    expect(html).toContain('Save draft unavailable');
    expect(html).toContain('required');
    expect(html).not.toContain('$0.00');
  });
  it('does not collect or submit financial input before billing is connected', () => {
    const html = renderToStaticMarkup(createElement(PaymentForm));
    expect(html).toContain('<fieldset disabled');
    expect(html).toContain('Review payment unavailable');
    expect(html).toContain('Customer-visible receipt note');
    expect(html).not.toContain('Payment recorded successfully');
  });
  it('exposes correctly linked keyboard tab controls', () => {
    const html = renderToStaticMarkup(createElement(CustomerTabs, { customerId: 'fixture' }));
    expect(html.match(/role="tab"/g)?.length).toBe(6);
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-labelledby="customer-tab-0"');
    expect(html).toContain('aria-selected="true"');
  });
  it('matches nested navigation without matching similar prefixes', () => {
    expect(currentSection('/staff/invoices/fixture')?.slug).toBe('invoices');
    expect(currentSection('/staff/invoices-other')).toBeUndefined();
    expect(navigation.flatMap(group => group.items).some(item => item.slug.includes('admin'))).toBe(false);
  });
});

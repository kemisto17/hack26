import { describe, expect, it } from 'vitest';
import type { InvoiceSummaryDTO } from '@/modules/billing/contracts';
import { invoiceRow } from '@/components/staff-console/record-rows';
import { selectRows } from '@/components/staff-console/table';
const now = '2026-10-31T12:00:00Z';
const invoice: InvoiceSummaryDTO = {
  id: 'invoice', number: 'INV-FIXTURE', subscription_id: 'subscription', customer_id: 'customer',
  currency: 'USD', status: 'confirmed', period_start: now, period_end: '2026-11-30T00:00:00Z',
  issued_at: now, due_on: '2026-10-31', sent_at: null, subtotal_minor: '100000', discount_minor: '0',
  tax_minor: '0', total_minor: '100000', paid_minor: '100', outstanding_minor: '99900', version: '1', created_at: now, updated_at: now,
};
describe('staff financial read presentation', () => {
  it('never labels a draft as overdue or issued', () => {
    expect(invoiceRow({ ...invoice, status: 'draft', issued_at: null, due_on: '2020-01-01' }, now).status).toBe('Draft');
  });
  it('uses partial/overdue display conditions without changing the source state', () => {
    expect(invoiceRow(invoice, now).status).toBe('Partially paid');
    expect(invoiceRow({ ...invoice, due_on: '2026-10-30' }, now).status).toBe('Overdue');
    expect(invoice.status).toBe('confirmed');
    expect(invoice.outstanding_minor).toBe('99900');
  });
  it('keeps paid and cancelled states independent of old due dates', () => {
    expect(invoiceRow({ ...invoice, status: 'paid' }, now).status).toBe('Paid');
    expect(invoiceRow({ ...invoice, status: 'cancelled' }, now).status).toBe('Cancelled');
  });
  it('sorts raw minor values rather than formatted thousands separators', () => {
    const higher = invoiceRow(invoice, now);
    const lower = invoiceRow({ ...invoice, id: 'lower', total_minor: '90000' }, now);
    expect(higher.cells[5]).toBe('$1,000.00');
    expect(selectRows([higher, lower], '', 'all', 5, false).map(row => row.id)).toEqual(['lower', 'invoice']);
  });
});

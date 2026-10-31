import { describe, expect, it } from 'vitest';
import type { InvoiceSummaryDTO, PaymentDTO } from '@/modules/billing/contracts';
import type { SubscriptionSummaryDTO } from '@/modules/subscriptions/contracts';
import { invoiceRow, paymentRow, subscriptionRow } from '@/components/staff-console/record-rows';
import { selectRows } from '@/components/staff-console/table';
const now = '2026-10-31T12:00:00Z';
const invoice: InvoiceSummaryDTO = {
  id: 'invoice', number: 'INV-FIXTURE', subscription_id: 'subscription', customer_id: 'customer',
  currency: 'USD', status: 'confirmed', period_start: now, period_end: '2026-11-30T00:00:00Z',
  issued_at: now, due_on: '2026-10-31', sent_at: null, subtotal_minor: '100000', discount_minor: '0',
  tax_minor: '0', total_minor: '100000', paid_minor: '100', outstanding_minor: '99900', version: '1', created_at: now, updated_at: now,
};
describe('staff financial read presentation', () => {
  it.each([false, true])('sorts subscription and quotation dates chronologically (quotation: %s)', quotation => {
    const later: SubscriptionSummaryDTO = { id: 'later', number: 'SUB-LATER', customer_id: 'customer', plan_id: 'plan', currency: 'USD', status: 'active', start_at: '2026-11-01T00:00:00Z', expires_at: '2027-01-01T00:00:00Z', next_billing_at: '2026-12-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z', updated_at: now, version: '1' };
    const earlier = { ...later, id: 'earlier', start_at: '2026-10-31T00:00:00Z', next_billing_at: '2026-11-30T00:00:00Z', created_at: '2026-10-31T00:00:00Z' };
    const rows = [subscriptionRow(later, quotation), subscriptionRow(earlier, quotation)];
    for (const column of quotation ? [2] : [3, 4]) {
      expect(selectRows(rows, '', 'all', column, false).map(row => row.id)).toEqual(['earlier', 'later']);
      expect(selectRows(rows, '', 'all', column, true).map(row => row.id)).toEqual(['later', 'earlier']);
    }
  });
  it.each([3, 4])('sorts payment column %s by raw values rather than formatted text', column => {
    const later: PaymentDTO = { id: 'later', invoice_id: 'invoice', customer_id: 'customer', currency: 'USD', amount_minor: '100000', method: 'cash', paid_at: '2026-11-01T00:00:00Z', note: '', external_reference: null, created_at: now };
    const earlier = { ...later, id: 'earlier', amount_minor: '90000', paid_at: '2026-10-31T00:00:00Z' };
    const rows = [paymentRow(later), paymentRow(earlier)];
    expect(selectRows(rows, '', 'all', column, false).map(row => row.id)).toEqual(['earlier', 'later']);
    expect(selectRows(rows, '', 'all', column, true).map(row => row.id)).toEqual(['later', 'earlier']);
  });
  it('keeps payment amounts above the safe integer limit in exact order', () => {
    const later: PaymentDTO = { id: 'later', invoice_id: 'invoice', customer_id: 'customer', currency: 'USD', amount_minor: '100000', method: 'cash', paid_at: now, note: '', external_reference: null, created_at: now };
    const huge = paymentRow({ ...later, id: 'huge', amount_minor: '9007199254740993' });
    const smaller = paymentRow({ ...later, id: 'smaller', amount_minor: '9007199254740992' });
    expect(selectRows([huge, smaller], '', 'all', 4, false).map(row => row.id)).toEqual(['smaller', 'huge']);
  });
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

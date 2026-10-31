import type { InvoiceSummaryDTO, PaymentDTO } from '@/modules/billing/contracts';
import type { SubscriptionSummaryDTO } from '@/modules/subscriptions/contracts';
import { invoiceLabel } from '@/components/customer-web/collection-model';
import { amount, date } from '@/components/customer-web/format';
import type { TableRow } from './table';

export function subscriptionRow(row: SubscriptionSummaryDTO, quotation = false): TableRow {
  return { id: row.id, href: `/staff/${quotation ? 'quotations' : 'subscriptions'}/${row.id}`, status: row.status, cells: quotation
    ? [row.number, row.customer_id, date(row.created_at), row.plan_id, row.status]
    : [row.number, row.customer_id, row.plan_id, date(row.start_at), date(row.next_billing_at), row.status] };
}
export function invoiceRow(row: InvoiceSummaryDTO, now: string): TableRow {
  const status = row.status === "draft" ? "Draft" : invoiceLabel(row, now);
  return { id: row.id, href: `/staff/invoices/${row.id}`, status, sortKeys: [row.number, row.customer_id, row.subscription_id, row.issued_at || "", row.due_on, `${row.currency} ${row.total_minor}`, `${row.currency} ${row.paid_minor}`, `${row.currency} ${row.outstanding_minor}`, status], cells: [row.number, row.customer_id, row.subscription_id, date(row.issued_at), date(row.due_on), amount(row.total_minor, row.currency), amount(row.paid_minor, row.currency), amount(row.outstanding_minor, row.currency), status] };
}
export function paymentRow(row: PaymentDTO): TableRow {
  return { id: row.id, status: row.method, href: `/staff/invoices/${row.invoice_id}`, cells: [row.external_reference || row.id, row.customer_id, row.invoice_id, date(row.paid_at), amount(row.amount_minor, row.currency), row.method.replaceAll('_', ' '), 'Recorded'] };
}

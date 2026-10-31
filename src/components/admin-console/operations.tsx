import type { InvoiceSummaryDTO, PaymentDTO } from '@/modules/billing/contracts';
import type { SubscriptionSummaryDTO } from '@/modules/subscriptions/contracts';
import { DataTable, type TableRow } from '@/components/staff-console/table';
import { invoiceRow, paymentRow, subscriptionRow } from '@/components/staff-console/record-rows';
import { adminRecords } from './data';
import { AdminHeading, Card, Notice, Unavailable } from './ui';

export type OperationKind = 'quotations' | 'subscriptions' | 'invoices' | 'payments';
const columns = {
  quotations: ['Quotation', 'Customer', 'Created', 'Plan', 'Status'],
  subscriptions: ['Subscription', 'Customer', 'Plan', 'Starts', 'Next billing', 'Status'],
  invoices: ['Invoice', 'Customer', 'Subscription', 'Issued', 'Due', 'Total', 'Paid', 'Balance', 'Status'],
  payments: ['Reference', 'Customer', 'Invoice', 'Received', 'Amount', 'Method', 'Status'],
};
const statuses = {
  quotations: ['draft', 'quotation', 'confirmed'],
  subscriptions: ['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed'],
  invoices: ['Draft', 'Issued', 'Partially paid', 'Paid', 'Overdue', 'Cancelled'],
  payments: ['bank_transfer', 'cash', 'card', 'other'],
};

export async function AdminOperations({ kind }: { kind: OperationKind }) {
  const result = await adminRecords(kind);
  let rows: TableRow[] = [];
  if (result.state === 'ready') {
    if (kind === 'quotations' || kind === 'subscriptions') rows = (result.data.items as SubscriptionSummaryDTO[]).map(row => subscriptionRow(row, kind === 'quotations'));
    if (kind === 'invoices') rows = (result.data.items as InvoiceSummaryDTO[]).map(row => invoiceRow(row, new Date().toISOString()));
    if (kind === 'payments') rows = (result.data.items as PaymentDTO[]).map(paymentRow);
    rows = rows.map(row => ({ ...row, href: row.href?.replace('/staff/', '/admin/') }));
  }
  const title = kind.charAt(0).toUpperCase() + kind.slice(1);
  return <><AdminHeading title={title} description={`Business-wide ${kind}, restricted to your verified administrator account.`} />
    <Notice>{kind === 'quotations' ? 'Quotations use subscription states. Staff attribution, quote totals and expiry are not in the list DTO. No approval override or silent edit of accepted pricing is supported.' : kind === 'subscriptions' ? 'Lifecycle actions require plan rules and transactional service checks. Closed is the supported terminal state; renewal creates a new subscription.' : kind === 'invoices' ? 'Totals, received amounts and balances come from the billing service. Partial payment and overdue are display conditions, not new database states.' : 'Only verified receipts are recorded. Refunds, reversals, failed gateway payments and reconciliation workflows are not supported by the current contract.'}</Notice>
    <DataTable title={title} columns={columns[kind]} rows={rows} statuses={statuses[kind]} unavailable={result.state === 'unavailable' ? result.message : undefined} />
    <div className="staff-two-column"><Card title={kind === 'payments' ? 'Daily & monthly collections' : 'Status overview'}><Unavailable icon="chart">A complete authorized dataset is required for reliable summaries. No totals have been estimated.</Unavailable></Card><Card title={kind === 'payments' ? 'Partial payments & reconciliation' : 'Activity & attribution'}><Unavailable>Related records and event history are not connected to the console.</Unavailable></Card></div>
  </>;
}

import type { InvoiceSummaryDTO, PaymentDTO } from '@/modules/billing/contracts';
import type { SubscriptionSummaryDTO } from '@/modules/subscriptions/contracts';
import { DataTable, type TableRow } from './table';
import { operationData } from './data';
import { ButtonLink, Heading, Notice } from './ui';
import { subscriptionRow, invoiceRow, paymentRow } from './record-rows';

export async function OperationsList({ kind }: { kind: 'subscriptions' | 'quotations' | 'invoices' | 'payments' }) {
  const result = await operationData(kind);
  const title = kind.charAt(0).toUpperCase() + kind.slice(1);
  const columns = kind === 'quotations' ? ['Quotation', 'Customer', 'Created', 'Plan', 'Status'] : kind === 'subscriptions' ? ['Subscription', 'Customer', 'Plan', 'Starts', 'Next billing', 'Status'] : kind === 'invoices' ? ['Invoice', 'Customer', 'Subscription', 'Issued', 'Due', 'Total', 'Paid', 'Balance', 'Status'] : ['Reference', 'Customer', 'Invoice', 'Payment date', 'Amount', 'Method', 'Status'];
  let rows: TableRow[] = [];
  if (result.state === 'ready') {
    if (kind === 'subscriptions' || kind === 'quotations') rows = (result.data.items as SubscriptionSummaryDTO[]).map(row => subscriptionRow(row, kind === 'quotations'));
    if (kind === 'invoices') rows = (result.data.items as InvoiceSummaryDTO[]).map(row => invoiceRow(row, new Date().toISOString()));
    if (kind === 'payments') rows = (result.data.items as PaymentDTO[]).map(paymentRow);
  }
  return <><Heading title={title} description={kind === 'quotations' ? 'Prepare commercial terms and move each quotation toward confirmation.' : kind === 'subscriptions' ? 'Follow the lifecycle of every customer agreement.' : kind === 'invoices' ? 'Review issued documents, due dates and authoritative balances.' : 'Review verified receipts and reconcile them with invoices.'}>
    {kind === 'quotations' && <ButtonLink href="/staff/quotations/new">Create quotation</ButtonLink>}{kind === 'payments' && <ButtonLink href="/staff/payments/new">Record payment</ButtonLink>}
  </Heading><Notice>{kind === 'quotations' ? 'Quotations are subscription records. Draft, quotation and confirmed are supported states; sending and customer acceptance tracking are not connected. Totals and validity require a full priced detail response.' : kind === 'subscriptions' ? 'Lifecycle actions require the subscription service and plan permissions. Closed is the supported terminal state; renewal creates a new agreement.' : kind === 'invoices' ? 'All totals and balances come from billing. Partial payment and overdue are display conditions on confirmed invoices, not independent lifecycle states.' : 'Receipts record money already received. This workspace does not process online payments or change invoice balances locally.'}</Notice>
    <DataTable title={title} columns={columns} rows={rows} statuses={kind === 'subscriptions' ? ['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed'] : kind === 'quotations' ? ['draft', 'quotation', 'confirmed'] : kind === 'invoices' ? ['Draft', 'Issued', 'Partially paid', 'Paid', 'Overdue', 'Cancelled'] : ['bank_transfer', 'cash', 'card', 'other']} unavailable={result.state === 'unavailable' ? result.reason : undefined} />
  </>;
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { amount, date, validResourceId } from '@/components/customer-web/format';
import { PrintDocument } from '@/components/customer-web/print-document';
import { adminRecords } from './data';
import { AdminHeading, ButtonLink, Card, DetailGrid, Notice, Unavailable } from './ui';

export async function AdminSubscriptionDetail({ id, quotation = false }: { id: string; quotation?: boolean }) {
  const result = await adminRecords('subscription');
  if (!validResourceId(id)) notFound();
  const type = quotation ? 'Quotation' : 'Subscription';
  if (result.state === 'unavailable') return <>
    <AdminHeading title={`${type} oversight`} description="Agreement details, pricing snapshots and related business records."><ButtonLink secondary href={`/admin/${quotation ? 'quotations' : 'subscriptions'}`}>Back to {quotation ? 'quotations' : 'subscriptions'}</ButtonLink></AdminHeading>
    <Card title="Agreement details"><Unavailable title={`${type} unavailable`}>{result.message} This record has not been loaded or verified.</Unavailable></Card>
    <div className="staff-two-column"><Card title="Pricing & commercial terms"><Unavailable>Accepted lines, discount references and quote validity require the verified detail response.</Unavailable></Card><Card title="Activity & related invoices"><Unavailable>History and staff attribution are not connected.</Unavailable></Card></div>
    <Notice>Lifecycle actions remain unavailable. Administrator access does not bypass accepted-pricing protection, quote expiry, expected versions or plan rules.</Notice>
  </>;
  const record = result.data;
  if (record.id !== id) notFound();
  return <><AdminHeading title={record.number} description={`${type} · ${record.status}`}><ButtonLink secondary href="/admin/customers">Customer directory</ButtonLink></AdminHeading>
    <Card title="Agreement information"><DetailGrid items={[
      ['Customer', record.customer_id], ['Plan', record.plan_id], ['Status', record.status], ['Starts', date(record.start_at)], ['Expires', date(record.expires_at)], ['Quote valid until', date(record.quote_expires_at)], ['Next billing', date(record.next_billing_at)], ['Payment terms', `${record.payment_terms_days} days`], ['Renewed from', record.renewed_from_id || 'No previous agreement'], ['Currency', record.currency],
    ]} /></Card>
    <Card title="Stored line prices"><div className="staff-table-scroll"><table><thead><tr>{['Item', 'Variant', 'Quantity', 'Unit price'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{record.lines.map(line => <tr key={line.id}><td>{line.description}</td><td>{line.variant_label || 'Standard'}</td><td>{line.quantity}</td><td>{amount(line.unit_price_minor, record.currency)}</td></tr>)}</tbody></table></div></Card>
    <Notice>Tax and discount totals come from billing. Lifecycle actions are unavailable until the transaction service is connected. Renewal creates a new agreement and retains this record.</Notice>
    <Card title="Timeline & invoice history"><Unavailable>Related-record reads and audited attribution are not connected.</Unavailable></Card>
  </>;
}

export async function AdminInvoiceDetail({ id }: { id: string }) {
  const result = await adminRecords('invoice');
  if (!validResourceId(id)) notFound();
  if (result.state === 'unavailable') return <><AdminHeading title="Invoice oversight" description="The authoritative document, balances and receipt history."><ButtonLink secondary href="/admin/invoices">Back to invoices</ButtonLink></AdminHeading>
    <Card title="Invoice document"><Unavailable title="Invoice unavailable">{result.message} A verified invoice is required before printing or making a financial change.</Unavailable></Card>
    <div className="staff-two-column"><Card title="Line items & totals"><Unavailable>Immutable financial snapshots have not been loaded.</Unavailable></Card><Card title="Payment history"><Unavailable>Invoice-scoped receipts are not connected.</Unavailable></Card></div>
  </>;
  const invoice = result.data;
  if (invoice.id !== id) notFound();
  return <><AdminHeading title={invoice.number} description={`Invoice · ${invoice.status}`}><PrintDocument label="Print invoice" /><ButtonLink secondary href="/admin/invoices">All invoices</ButtonLink></AdminHeading>
    <div className="staff-document"><div className="staff-document-head"><div><p className="staff-eyebrow">INVOICE</p><h2>{invoice.number}</h2><p>Issuer business details are not configured in the current contract.</p></div><span className="staff-status">{invoice.status}</span></div>
      <DetailGrid items={[
        ['Bill to', invoice.customer_snapshot?.display_name || 'Contact frozen on confirmation'], ['Email', invoice.customer_snapshot?.email || 'Not confirmed'], ['Issued', date(invoice.issued_at)], ['Due', date(invoice.due_on)], ['Billing period', `${date(invoice.period_start)} – ${date(invoice.period_end)}`], ['Subscription', <Link key="sub" href={`/admin/subscriptions/${invoice.subscription_id}`}>{invoice.subscription_id}</Link>],
      ]} />
      <div className="staff-table-scroll"><table><thead><tr>{['Description', 'Qty', 'Unit price', 'Discount', 'Tax', 'Amount'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{invoice.lines.map(line => <tr key={line.id}><td>{line.description}{line.variant_label && <small>{line.variant_label}</small>}</td><td>{line.quantity}</td><td>{amount(line.unit_price_minor, invoice.currency)}</td><td>{amount(line.discount_minor, invoice.currency)}</td><td>{amount(line.tax_minor, invoice.currency)}<small>{line.tax_rate_bps} basis points</small></td><td>{amount(line.amount_minor, invoice.currency)}</td></tr>)}</tbody></table></div>
      <dl className="staff-invoice-totals">{[['Subtotal', invoice.subtotal_minor], ['Discount', invoice.discount_minor], ['Tax', invoice.tax_minor], ['Total', invoice.total_minor], ['Amount paid', invoice.paid_minor], ['Outstanding', invoice.outstanding_minor]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{amount(value, invoice.currency)}</dd></div>)}</dl>
    </div><Notice>Confirmation, cancellation and recording payments require connected billing transactions. The balances above are returned by the billing service and are never recomputed here.</Notice><Card title="Payments"><Unavailable>Receipt history is not connected.</Unavailable></Card>
  </>;
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { amount, date, validResourceId } from '@/components/customer-web/format';
import { PrintDocument } from '@/components/customer-web/print-document';
import { operationData } from './data';
import { ButtonLink, Card, DetailGrid, Heading, Notice, Unavailable } from './ui';

export async function SubscriptionDetail({ id, quotation = false }: { id: string; quotation?: boolean }) {
  const result = await operationData('subscription');
  if (!validResourceId(id)) notFound();
  const type = quotation ? 'Quotation' : 'Subscription';
  if (result.state === 'unavailable') return <><Heading title={`${type} details`} description="Review agreement terms, lifecycle and related records."><ButtonLink secondary href={`/staff/${quotation ? 'quotations' : 'subscriptions'}`}>Back to {quotation ? 'quotations' : 'subscriptions'}</ButtonLink></Heading><Card title="Agreement"><Unavailable title={`${type} unavailable`}>{result.reason} This record has not been loaded or verified.</Unavailable></Card><div className="staff-two-column"><Card title="Pricing & terms"><Unavailable>Accepted line prices and terms are unavailable.</Unavailable></Card><Card title="Activity & related invoices"><Unavailable>History and billing links require the verified record.</Unavailable></Card></div></>;
  const record = result.data;
  if (record.id !== id) notFound();
  return <><Heading title={record.number} description={`${type} · ${record.status}`}><ButtonLink secondary href={`/staff/customers/${record.customer_id}`}>View customer</ButtonLink></Heading><Notice>Accepted prices are preserved. Lifecycle mutations and delivery are not connected; no local status changes are offered.</Notice><Card title="Agreement terms"><DetailGrid items={[
    ['Customer', <Link key="customer" href={`/staff/customers/${record.customer_id}`}>{record.customer_id}</Link>], ['Plan', record.plan_id], ['Starts', date(record.start_at)], ['Expires', date(record.expires_at)], ['Quote valid until', date(record.quote_expires_at)], ['Next billing', date(record.next_billing_at)], ['Payment terms', `${record.payment_terms_days} days`], ['Status', record.status],
  ]} /></Card><Card title="Accepted line prices"><div className="staff-table-scroll"><table><thead><tr>{['Description', 'Variant', 'Quantity', 'Unit price'].map(value => <th key={value}>{value}</th>)}</tr></thead><tbody>{record.lines.map(line => <tr key={line.id}><td>{line.description}</td><td>{line.variant_label || 'Standard'}</td><td>{line.quantity}</td><td>{amount(line.unit_price_minor, record.currency)}</td></tr>)}</tbody></table></div><div className="staff-card-padding"><p>Tax, discount and final invoice totals are supplied by billing; they are not calculated here.</p></div></Card><Card title="Lifecycle & activity"><Unavailable>Activate, pause, resume, close and renewal require the connected service and current plan gates. Confirmation must preserve the accepted pricing snapshot.</Unavailable></Card></>;
}

export async function InvoiceDetail({ id }: { id: string }) {
  const result = await operationData('invoice');
  if (!validResourceId(id)) notFound();
  if (result.state === 'unavailable') return <><Heading title="Invoice details" description="The complete financial document, from issue to settlement."><ButtonLink secondary href="/staff/invoices">Back to invoices</ButtonLink></Heading><Card title="Invoice preview"><Unavailable title="Invoice unavailable">{result.reason} A verified invoice is required before printing, confirming, cancelling or recording a receipt.</Unavailable></Card><div className="staff-two-column"><Card title="Line items & totals"><Unavailable>Financial snapshots have not been loaded.</Unavailable></Card><Card title="Payment records"><Unavailable>Receipt history has not been loaded.</Unavailable></Card></div></>;
  const invoice = result.data;
  if (invoice.id !== id) notFound();
  return <><Heading title={invoice.number} description={`Invoice · ${invoice.status}`}><PrintDocument label="Print invoice" /><ButtonLink secondary href={`/staff/customers/${invoice.customer_id}`}>View customer</ButtonLink></Heading><div className="staff-document"><div className="staff-document-head"><div><p className="staff-eyebrow">INVOICE</p><h2>{invoice.number}</h2><p>Issuer details are not configured in the current contract.</p></div><span className="staff-status">{invoice.status}</span></div><DetailGrid items={[
    ['Bill to', invoice.customer_snapshot?.display_name ?? 'Not confirmed'], ['Email', invoice.customer_snapshot?.email ?? 'Not confirmed'], ['Issued', date(invoice.issued_at)], ['Due', date(invoice.due_on)], ['Billing period', `${date(invoice.period_start)} – ${date(invoice.period_end)}`], ['Subscription', <Link key="subscription" href={`/staff/subscriptions/${invoice.subscription_id}`}>{invoice.subscription_id}</Link>],
  ]} /><div className="staff-table-scroll"><table><thead><tr>{['Item', 'Qty', 'Unit price', 'Discount', 'Tax', 'Amount'].map(value => <th key={value}>{value}</th>)}</tr></thead><tbody>{invoice.lines.map(line => <tr key={line.id}><td>{line.description}{line.variant_label && <small>{line.variant_label}</small>}</td><td>{line.quantity}</td><td>{amount(line.unit_price_minor, invoice.currency)}</td><td>{amount(line.discount_minor, invoice.currency)}</td><td>{amount(line.tax_minor, invoice.currency)}</td><td>{amount(line.amount_minor, invoice.currency)}</td></tr>)}</tbody></table></div><dl className="staff-invoice-totals">{[
    ['Subtotal', invoice.subtotal_minor], ['Discount', invoice.discount_minor], ['Tax', invoice.tax_minor], ['Total', invoice.total_minor], ['Amount paid', invoice.paid_minor], ['Outstanding balance', invoice.outstanding_minor],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{amount(value, invoice.currency)}</dd></div>)}</dl></div><Notice>Confirmation, cancellation and payment recording are unavailable until the billing transactions are connected. Invoice balances are displayed exactly as returned by the service.</Notice><Card title="Payments"><Unavailable>Invoice-scoped receipts are not connected.</Unavailable></Card></>;
}

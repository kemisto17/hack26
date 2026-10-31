import Link from "next/link";
import type { SubscriptionDTO } from "@/modules/subscriptions/contracts";
import type { InvoiceDTO } from "@/modules/billing/contracts";
import type { CustomerData } from "./data";
import { ownInvoices, ownQuotations, ownSubscriptions } from "./collection-model";
import { amount, date } from "./format";
import { Brand } from "./public-shell";
import { EmptyState, Notice, Panel, PageHeader } from "./ui";
import { Status } from "./collections";
import { PrintDocument } from "./print-document";
export function RecordDetail(props: {
    ownerId: string;
    kind: "subscriptions" | "quotations";
    result: CustomerData<SubscriptionDTO>;
} | {
    ownerId: string;
    kind: "invoices";
    result: CustomerData<InvoiceDTO>;
}) {
    if (props.result.state === "ready") {
        if (props.kind === "invoices") {
            const row = props.result.data as InvoiceDTO;
            if (!ownInvoices([row], props.ownerId).length)
                return <MissingRecord />;
            return <InvoiceDocument invoice={row}/>;
        }
        const row = props.result.data as SubscriptionDTO;
        if (!ownSubscriptions([row], props.ownerId).length || (props.kind === "quotations" && !ownQuotations([row], props.ownerId).length))
            return <MissingRecord />;
        if (props.kind === "quotations")
            return <QuotationDocument subscription={row}/>;
        return <SubscriptionDocument subscription={row}/>;
    }
    const title = props.kind === "invoices" ? "Invoice details" : props.kind === "quotations" ? "Quotation details" : "Subscription details";
    return <><PageHeader eyebrow="Your records" title={title} description="The details behind your customer relationship." action={<Link className="button button-secondary small" href={`/portal/${props.kind}`}>Back to {props.kind}</Link>}/>{props.kind === "subscriptions" ? <div className="detail-grid"><Panel title="Subscription information"><UnavailableFields labels={["Subscription", "Plan", "Status", "Start date", "End date", "Next billing", "Billing frequency", "Billing amount"]}/></Panel><Panel title="Plan & actions"><EmptyState unavailable icon="repeat" title="Details are not available yet" description="Your subscription read connection and plan-based actions have not been connected."/></Panel></div> : <Panel title={title}><div className="document-surface"><div className="document-header"><Brand /><div><h2>{props.kind === "invoices" ? "INVOICE" : "QUOTATION"}</h2><p>Document unavailable</p></div></div><div className="document-parties"><div><h3>Provider</h3><p>Details unavailable</p></div><div><h3>Customer</h3><p>Document details will be supplied by your verified account connection.</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr>{["Description", "Quantity", "Unit price", "Amount"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody /></table></div><EmptyState unavailable icon="document" title="We can’t load this document yet" description="The document connection is not ready. No customer details or financial amounts have been inferred."/><div className="document-terms">Document actions and totals become available only with your own verified record. No payment, acceptance or delivery has been recorded.</div></div></Panel>}<Panel title={props.kind === "invoices" ? "Associated payments" : "Related invoices"}><EmptyState unavailable icon="wallet" title="Related records unavailable" description="Related financial records will be shown only after their read integration is connected."/></Panel></>;
}
function MissingRecord() { return <EmptyState icon="document" title="Record not found" description="This record is unavailable for your account."/>; }
function UnavailableFields({ labels }: {
    labels: string[];
}) { return <dl className="detail-fields">{labels.map(label => <div key={label}><dt>{label}</dt><dd>Unavailable</dd></div>)}</dl>; }
function SubscriptionDocument({ subscription: s }: {
    subscription: SubscriptionDTO;
}) { return <><PageHeader eyebrow="Your subscription" title={s.number} description="Your agreed terms and current subscription state." action={<Link href="/portal/subscriptions" className="button button-secondary small">All subscriptions</Link>}/><div className="detail-grid"><Panel title="Subscription information"><dl className="detail-fields">{[["Status", s.status], ["Currency", s.currency], ["Plan reference", s.plan_id], ["Start date", date(s.start_at)], ["End date", date(s.expires_at)], ["Next billing", date(s.next_billing_at)], ["Payment terms", `${s.payment_terms_days} days`], ["Renewed from", s.renewed_from_id ?? "Original subscription"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></Panel><Panel title="Plan actions"><div className="panel-body"><Notice>Permitted actions depend on your plan. Pause, resume, close and renewal controls are not connected yet. Contact your provider for a change.</Notice></div></Panel></div><Panel title="Agreed subscription lines"><SubscriptionLines subscription={s}/></Panel><Panel title="Associated invoices" action={<Link className="text-link" href="/portal/invoices">All invoices</Link>}><EmptyState unavailable icon="document" title="Related invoices aren’t connected" description="Your invoice connection is required before associated documents can be shown."/></Panel><Panel title="Subscription history"><dl className="detail-fields"><div><dt>Created</dt><dd>{date(s.created_at)}</dd></div>{s.closed_at && <div><dt>Closed</dt><dd>{date(s.closed_at)}</dd></div>}</dl><div className="panel-body"><p className="field-help">A detailed change history is not available in the current customer read contract.</p></div></Panel></>; }
function SubscriptionLines({ subscription: s }: {
    subscription: SubscriptionDTO;
}) { return <div className="table-scroll"><table className="data-table"><thead><tr>{["Product / variant", "Quantity", "Unit price"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{s.lines.map(line => <tr key={line.id}><td>{line.description}{line.variant_label && <small style={{ display: "block", marginTop: 5 }}>{line.variant_label}</small>}</td><td>{line.quantity}</td><td>{amount(line.unit_price_minor, s.currency)}</td></tr>)}</tbody></table></div>; }
function QuotationDocument({ subscription: s }: {
    subscription: SubscriptionDTO;
}) { return <><PageHeader title={s.number} eyebrow="Your quotation" description="Review the proposed selections and discuss the next step with your provider." action={<PrintDocument label="Print quotation"/>}/><Panel title="Quotation"><div className="document-surface"><div className="document-header"><Brand /><div><h2>QUOTATION</h2><p>{s.number}<br />Valid until {date(s.quote_expires_at)}</p></div></div><div className="document-parties"><div><h3>For your account</h3><p>Account reference: {s.customer_id}</p></div><div><h3>Terms</h3><p>Start: {date(s.start_at)}<br />Payment terms: {s.payment_terms_days} days</p></div></div><SubscriptionLines subscription={s}/><div className="document-terms" style={{ marginTop: 25 }}>Quoted unit prices are shown above. Taxes, discounts and final invoice totals are determined by billing; quotation totals are not provided by the current read contract.</div></div></Panel><Notice>Customer acceptance and rejection are not supported by the current service contract. Ask your provider to confirm the quotation or prepare a revision. Printing does not accept or confirm it.</Notice></>; }
function InvoiceDocument({ invoice: i }: {
    invoice: InvoiceDTO;
}) { return <><PageHeader eyebrow="Your issued document" title={i.number} description="A historical snapshot of your invoice and its recorded balance." action={<PrintDocument label="Print invoice"/>}/><Panel title="Invoice details"><div className="document-surface"><div className="document-header"><Brand /><div><h2>INVOICE</h2><p>{i.number}<br />Issued {date(i.issued_at)}<br />Due {date(i.due_on)}</p><Status label={i.status === "paid" ? "Paid" : i.status === "cancelled" ? "Cancelled" : "Issued"}/></div></div><div className="document-parties"><div><h3>Billed to</h3><p>{i.customer_snapshot?.display_name}<br />{i.customer_snapshot?.email}</p></div><div><h3>Billing period</h3><p>{date(i.period_start)} – {date(i.period_end)}<br />Currency: {i.currency}</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr>{["Description", "Qty", "Unit price", "Discount", "Tax", "Amount"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{i.lines.map(line => <tr key={line.id}><td>{line.description}{line.variant_label && <small style={{ display: "block" }}>{line.variant_label}</small>}</td><td>{line.quantity}</td><td>{amount(line.unit_price_minor, i.currency)}</td><td>{amount(line.discount_minor, i.currency)}</td><td>{amount(line.tax_minor, i.currency)}</td><td>{amount(line.amount_minor, i.currency)}</td></tr>)}</tbody></table></div><div className="document-totals">{[["Subtotal", i.subtotal_minor], ["Discount", i.discount_minor], ["Tax", i.tax_minor], ["Total", i.total_minor], ["Amount paid", i.paid_minor], ["Remaining balance", i.outstanding_minor]].map(([label, value]) => <div key={label}><span>{label}</span><span>{amount(value, i.currency)}</span></div>)}</div><div className="document-terms">This view shows a recorded invoice. An online payment gateway is not connected. Please contact your provider for payment instructions. Your provider records verified receipts; this page does not process payments.</div></div></Panel><Panel title="Payment records" action={<Link className="text-link" href="/portal/payments">View payments</Link>}><EmptyState unavailable icon="wallet" title="Related receipt list not connected" description="The balance above comes from this invoice. Individual receipts require the payment read connection."/></Panel></>; }

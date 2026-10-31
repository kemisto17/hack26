"use client";
import Link from "next/link";
import { useState } from "react";
import type { SubscriptionDTO, SubscriptionSummaryDTO } from "@/modules/subscriptions/contracts";
import type { InvoiceSummaryDTO, PaymentDTO } from "@/modules/billing/contracts";
import type { CustomerData } from "./data";
import { ownSubscriptions, ownQuotations, ownInvoices, ownPayments, invoiceLabel, quotationLabel, subscriptionLabel } from "./collection-model";
import { Icon } from "./icons";
import { amount, date } from "./format";
import { Badge, EmptyState, Panel } from "./ui";
type Kind = "subscriptions" | "quotations" | "invoices" | "payments";
type Props = {
    ownerId: string;
    now: string;
} & ({
    kind: "subscriptions";
    result: CustomerData<SubscriptionSummaryDTO[]>;
} | {
    kind: "quotations";
    result: CustomerData<SubscriptionDTO[]>;
} | {
    kind: "invoices";
    result: CustomerData<InvoiceSummaryDTO[]>;
} | {
    kind: "payments";
    result: CustomerData<PaymentDTO[]>;
});
const labels: Record<Kind, string> = { subscriptions: "Subscriptions", quotations: "Quotations", invoices: "Invoices", payments: "Payments" };
const filters: Record<Kind, string[]> = { subscriptions: ["All", "Active", "Pending activation", "Paused", "Closed"], quotations: ["All", "Awaiting confirmation", "Confirmed", "Expired"], invoices: ["All", "Issued", "Partially paid", "Paid", "Overdue", "Cancelled"], payments: ["All", "Bank transfer", "Cash", "Card", "Other"] };
const columns: Record<Kind, string[]> = { subscriptions: ["Subscription", "Status", "Start date", "Next billing", "Currency", ""], quotations: ["Quotation", "Created", "Valid until", "Status", ""], invoices: ["Invoice", "Issued", "Due date", "Total", "Paid", "Balance", "Status", ""], payments: ["Reference", "Payment date", "Method", "Amount", "Invoice", "Status"] };
export function RecordCollection(props: Props) {
    const [filter, setFilter] = useState("All");
    const [search, setSearch] = useState("");
    const { kind, result, ownerId, now } = props;
    const title = labels[kind];
    let records: React.ReactNode[] = [];
    let count = 0;
    const matches = (text: string, status: string) => text.toLowerCase().includes(search.toLowerCase().trim()) && (filter === "All" || filter === status);
    if (result.state === "ready") {
        if (props.kind === "subscriptions" && props.result.state === "ready")
            records = ownSubscriptions(props.result.data, ownerId).filter(row => matches(row.number, subscriptionLabel(row))).map(row => <tr key={row.id}><td><Link href={`/portal/subscriptions/${row.id}`}>{row.number}</Link></td><td><Status label={subscriptionLabel(row)}/></td><td>{date(row.start_at)}</td><td>{date(row.next_billing_at)}</td><td>{row.currency}</td><td><Link href={`/portal/subscriptions/${row.id}`} aria-label={`View subscription ${row.number}`}><Icon name="arrow" size={14}/></Link></td></tr>);
        if (props.kind === "quotations" && props.result.state === "ready")
            records = ownQuotations(props.result.data, ownerId).filter(row => matches(row.number, quotationLabel(row, now))).map(row => <tr key={row.id}><td><Link href={`/portal/quotations/${row.id}`}>{row.number}</Link></td><td>{date(row.created_at)}</td><td>{date(row.quote_expires_at)}</td><td><Status label={quotationLabel(row, now)}/></td><td><Link href={`/portal/quotations/${row.id}`} aria-label={`View quotation ${row.number}`}><Icon name="arrow" size={14}/></Link></td></tr>);
        if (props.kind === "invoices" && props.result.state === "ready")
            records = ownInvoices(props.result.data, ownerId).filter(row => matches(row.number, invoiceLabel(row, now))).map(row => <tr key={row.id}><td><Link href={`/portal/invoices/${row.id}`}>{row.number}</Link></td><td>{date(row.issued_at)}</td><td>{date(row.due_on)}</td><td>{amount(row.total_minor, row.currency)}</td><td>{amount(row.paid_minor, row.currency)}</td><td>{amount(row.outstanding_minor, row.currency)}</td><td><Status label={invoiceLabel(row, now)}/></td><td><Link href={`/portal/invoices/${row.id}`} aria-label={`View invoice ${row.number}`}><Icon name="arrow" size={14}/></Link></td></tr>);
        if (props.kind === "payments" && props.result.state === "ready")
            records = ownPayments(props.result.data, ownerId).filter(row => matches(row.external_reference ?? row.id, row.method.replaceAll("_", " ").replace(/^./, c => c.toUpperCase()))).map(row => <tr key={row.id}><td>{row.external_reference ?? row.id.slice(0, 8)}</td><td>{date(row.paid_at)}</td><td>{row.method.replaceAll("_", " ")}</td><td>{amount(row.amount_minor, row.currency)}</td><td><Link href={`/portal/invoices/${row.invoice_id}`}>View invoice <Icon name="external" size={11}/></Link></td><td><Badge tone="green">Recorded</Badge></td></tr>);
        count = records.length;
    }
    return <Panel title={`Your ${title.toLowerCase()}`} description={kind === "payments" ? "Verified receipts recorded by your provider." : "Your records, in one place."}>
    <div className="web-toolbar"><div className="filter-tabs" aria-label={`Filter ${kind}`}>{filters[kind].map(item => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div><label className="search-field"><Icon name="search"/><span className="sr-only">Search {kind}</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${kind}…`}/></label></div>
    <div className="table-scroll"><table className="data-table"><caption className="sr-only">Customer {kind} records</caption><thead><tr>{columns[kind].map((column, index) => <th key={index} scope="col">{column || <span className="sr-only">View details</span>}</th>)}</tr></thead><tbody>{records}</tbody></table></div>
    {result.state === "unavailable" ? <EmptyState unavailable icon={kind === "payments" ? "wallet" : kind === "subscriptions" ? "repeat" : "document"} title={`${title} aren’t available right now`} description={`Your ${kind} connection is not ready yet. This does not mean your account has no records. Please check back or ask your provider for help.`}/> : count === 0 ? <EmptyState icon="search" title={search || filter !== "All" ? "No matching records" : "Nothing here yet"} description={search || filter !== "All" ? "Try another search or return to All." : `Your ${kind} will appear here once there are records to show.`}/> : null}
    <div className="table-footer"><span>{result.state === "unavailable" ? "Records unavailable" : `${count} matching ${kind}`}</span><span>{result.state === "unavailable" ? "No account totals inferred" : "Showing the supplied page of records"}</span></div>
  </Panel>;
}
export function Status({ label }: {
    label: string;
}) { return <Badge tone={["Active", "Paid", "Confirmed", "Recorded"].includes(label) ? "green" : ["Overdue", "Expired", "Cancelled", "Closed"].includes(label) ? "red" : ["Paused", "Awaiting confirmation", "Partially paid", "Pending activation"].includes(label) ? "amber" : "blue"}>{label}</Badge>; }

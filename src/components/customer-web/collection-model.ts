import type { SubscriptionDTO, SubscriptionSummaryDTO } from "@/modules/subscriptions/contracts";
import type { InvoiceSummaryDTO, PaymentDTO } from "@/modules/billing/contracts";
export function ownSubscriptions(rows: SubscriptionSummaryDTO[], ownerId: string) { return rows.filter(row => row.customer_id === ownerId && row.status !== "draft"); }
export function ownQuotations(rows: SubscriptionDTO[], ownerId: string) { return rows.filter(row => row.customer_id === ownerId && row.status !== "draft" && row.quote_expires_at !== null); }
export function ownInvoices(rows: InvoiceSummaryDTO[], ownerId: string) { return rows.filter(row => row.customer_id === ownerId && row.issued_at !== null && row.status !== "draft"); }
export function ownPayments(rows: PaymentDTO[], ownerId: string) { return rows.filter(row => row.customer_id === ownerId); }
/** Presentation labels only; never write these derived states to the backend. */
export function invoiceLabel(row: InvoiceSummaryDTO, now: string) { if (row.status === "paid")
    return "Paid"; if (row.status === "cancelled")
    return "Cancelled"; if (BigInt(row.outstanding_minor) > BigInt(0) && row.due_on < now.slice(0, 10))
    return "Overdue"; if (BigInt(row.paid_minor) > BigInt(0) && BigInt(row.outstanding_minor) > BigInt(0))
    return "Partially paid"; return "Issued"; }
export function quotationLabel(row: SubscriptionDTO, now: string) { if (row.status !== "quotation")
    return "Confirmed"; if (row.quote_expires_at && Date.parse(row.quote_expires_at) <= Date.parse(now))
    return "Expired"; return "Awaiting confirmation"; }
export function subscriptionLabel(row: SubscriptionSummaryDTO) { return ({ draft: "Draft", quotation: "Quotation", confirmed: "Pending activation", active: "Active", paused: "Paused", closed: "Closed" })[row.status]; }

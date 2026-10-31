import "server-only";
import type { SubscriptionDTO, SubscriptionSummaryDTO } from "@/modules/subscriptions/contracts";
import type { InvoiceDTO, InvoiceSummaryDTO, PaymentDTO } from "@/modules/billing/contracts";
import { requireCustomer } from "./session";
/** D3/D4 service factories have no live read composition on main. No direct
 * table reads, invented APIs or mock records substitute for those services. */
export type CustomerData<T> = {
    state: "ready";
    data: T;
} | {
    state: "unavailable";
};
export type CustomerReadModel = {
    subscriptions: SubscriptionSummaryDTO[];
    quotations: SubscriptionDTO[];
    invoices: InvoiceSummaryDTO[];
    payments: PaymentDTO[];
};
export async function customerCollection<K extends keyof CustomerReadModel>(kind: K): Promise<CustomerData<CustomerReadModel[K]>> { await requireCustomer(); void kind; return { state: "unavailable" }; }
export async function customerDetail<K extends "subscriptions" | "quotations" | "invoices">(kind: K, id: string): Promise<CustomerData<K extends "invoices" ? InvoiceDTO : SubscriptionDTO>> { await requireCustomer(); void kind; void id; return { state: "unavailable" }; }

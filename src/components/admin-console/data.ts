import 'server-only';
import type { Page } from '@/lib/api/contracts';
import type { SubscriptionDTO, SubscriptionSummaryDTO } from '@/modules/subscriptions/contracts';
import type { InvoiceDTO, InvoiceSummaryDTO, PaymentDTO, ReportDTO } from '@/modules/billing/contracts';
import { requireAdmin } from './session';

export type AdminResult<T> = { state: 'ready'; data: T } | { state: 'unavailable'; message: string };
export type AdminRecords = {
  quotations: Page<SubscriptionSummaryDTO>;
  subscriptions: Page<SubscriptionSummaryDTO>;
  invoices: Page<InvoiceSummaryDTO>;
  payments: Page<PaymentDTO>;
  subscription: SubscriptionDTO;
  invoice: InvoiceDTO;
  report: ReportDTO;
};

/** Typed integration seam. Never substitute sample rows or unbound service factories. */
export async function adminRecords<K extends keyof AdminRecords>(kind: K): Promise<AdminResult<AdminRecords[K]>> {
  await requireAdmin();
  return { state: 'unavailable', message: ['quotations', 'subscriptions', 'subscription'].includes(kind)
    ? 'The subscription service is not connected to application reads and transactions yet.'
    : 'The billing service is not connected to application reads and transactions yet.' };
}

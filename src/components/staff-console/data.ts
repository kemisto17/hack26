import 'server-only';
import type { Page } from '@/lib/api/contracts';
import type { SubscriptionDTO, SubscriptionSummaryDTO } from '@/modules/subscriptions/contracts';
import type { InvoiceDTO, InvoiceSummaryDTO, PaymentDTO, ReportDTO } from '@/modules/billing/contracts';
import { requireStaff } from './session';

export type StaffData<T> = { state: 'ready'; data: T } | { state: 'unavailable'; reason: string };
export type OperationsData = {
  subscriptions: Page<SubscriptionSummaryDTO>;
  quotations: Page<SubscriptionSummaryDTO>;
  invoices: Page<InvoiceSummaryDTO>;
  payments: Page<PaymentDTO>;
  report: ReportDTO;
  subscription: SubscriptionDTO;
  invoice: InvoiceDTO;
};
/** No service factory is instantiated without its owning workstream's real bindings. */
export async function operationData<K extends keyof OperationsData>(kind: K): Promise<StaffData<OperationsData[K]>> {
  await requireStaff();
  return { state: 'unavailable', reason: ['invoices', 'payments', 'report', 'invoice'].includes(kind)
    ? 'Billing reads and transactions are not connected to this workspace yet.'
    : 'Subscription reads and lifecycle actions are not connected to this workspace yet.' };
}

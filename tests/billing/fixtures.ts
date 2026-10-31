import type { BillingBindings, BillingContactInput } from "@/modules/billing/service";
import type {
  Actor,
  InvoiceDTO,
  InvoiceLineDTO,
  InvoiceSummaryDTO,
  PaymentDTO,
  ReportDTO,
} from "@/modules/billing/contracts";

export const IDS = {
  admin: "11111111-1111-4111-8111-111111111111",
  staff: "22222222-2222-4222-8222-222222222222",
  customerA: "33333333-3333-4333-8333-333333333333",
  customerB: "44444444-4444-4444-8444-444444444444",
  subscription: "55555555-5555-4555-8555-555555555555",
  invoice: "66666666-6666-4666-8666-666666666666",
  otherInvoice: "77777777-7777-4777-8777-777777777777",
  line: "88888888-8888-4888-8888-888888888888",
  subscriptionLine: "99999999-9999-4999-8999-999999999999",
  payment: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  requestKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  secondRequestKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  taxRule: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  discount: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
} as const;

export const admin: Actor = { id: IDS.admin, role: "admin" };
export const staff: Actor = { id: IDS.staff, role: "internal" };
export const customerA: Actor = { id: IDS.customerA, role: "customer" };
export const customerB: Actor = { id: IDS.customerB, role: "customer" };

export const contact: BillingContactInput = {
  display_name: "Ada Lovelace",
  email: "ada@example.test",
};

export function makeLine(overrides: Partial<InvoiceLineDTO> = {}): InvoiceLineDTO {
  return {
    id: IDS.line,
    subscription_line_id: IDS.subscriptionLine,
    description: "Analytical engine licence",
    variant_label: "Standard",
    quantity: 2,
    unit_price_minor: "5000",
    discount_minor: "1000",
    tax_rule_id: IDS.taxRule,
    tax_rate_bps: 2000,
    tax_minor: "1800",
    amount_minor: "10800",
    ...overrides,
  };
}

/**
 * Consistent invoice: 2 x 5000 - 1000 + 1800 = 10800.
 * Override monetary fields together when changing the arithmetic.
 */
export function makeInvoice(overrides: Partial<InvoiceDTO> = {}): InvoiceDTO {
  return {
    id: IDS.invoice,
    number: "INV-66666666666646668666666666666666",
    subscription_id: IDS.subscription,
    customer_id: IDS.customerA,
    currency: "USD",
    status: "confirmed",
    period_start: "2026-01-01T00:00:00.000Z",
    period_end: "2026-02-01T00:00:00.000Z",
    issued_at: "2026-01-01T00:00:00.000Z",
    due_on: "2026-01-31",
    sent_at: null,
    subtotal_minor: "10000",
    discount_minor: "1000",
    tax_minor: "1800",
    total_minor: "10800",
    paid_minor: "0",
    outstanding_minor: "10800",
    version: "2",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    customer_snapshot: { ...contact },
    lines: [makeLine()],
    ...overrides,
  };
}

export function makeSummary(invoice: InvoiceDTO = makeInvoice()): InvoiceSummaryDTO {
  const { customer_snapshot: contact, lines, ...summary } = invoice;
  void contact;
  void lines;
  return summary;
}

export function makePayment(overrides: Partial<PaymentDTO> = {}): PaymentDTO {
  return {
    id: IDS.payment,
    invoice_id: IDS.invoice,
    customer_id: IDS.customerA,
    currency: "USD",
    amount_minor: "4000",
    method: "bank_transfer",
    paid_at: "2026-01-15T12:00:00.000Z",
    note: "Receipt 123",
    external_reference: "BANK-123",
    created_at: "2026-01-15T12:01:00.000Z",
    ...overrides,
  };
}

export function makeReport(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return {
    as_of: "2026-10-31T12:00:00.000Z",
    active_subscriptions: 2,
    currencies: [
      {
        currency: "USD",
        billed_minor: "10800",
        collected_minor: "4000",
        outstanding_minor: "6800",
        overdue_minor: "6800",
        overdue_invoice_count: 1,
      },
      {
        currency: "EUR",
        billed_minor: "5000",
        collected_minor: "5000",
        outstanding_minor: "0",
        overdue_minor: "0",
        overdue_invoice_count: 0,
      },
    ],
    ...overrides,
  };
}

export function makeBindings(overrides: Partial<BillingBindings> = {}): BillingBindings {
  return {
    requireActor: async () => staff,
    getBillingContact: async () => ({ ...contact }),
    readInvoice: async () => makeInvoice(),
    readInvoices: async () => ({ items: [], next_cursor: null }),
    readPayments: async () => ({ items: [], next_cursor: null }),
    readReport: async () => makeReport(),
    generateNextInvoiceTransaction: async () => IDS.invoice,
    confirmInvoiceTransaction: async () => makeInvoice({ status: "confirmed" }),
    cancelInvoiceTransaction: async () => makeInvoice({ status: "cancelled" }),
    recordPaymentTransaction: async () => ({
      payment: makePayment(),
      invoice: makeSummary(makeInvoice({ paid_minor: "4000", outstanding_minor: "6800" })),
    }),
    listDueSubscriptionIds: async () => [],
    ...overrides,
  };
}

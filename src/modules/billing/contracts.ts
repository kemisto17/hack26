/**
 * D4 public wire contracts for invoices, payments, reports and billing runs.
 *
 * Shared scalar/Actor/Page types come from D1. Money is always an integer
 * minor-unit decimal string at this boundary; never a JavaScript number.
 * D2 pricing DTOs are intentionally not duplicated here: invoice pricing is
 * executed inside the D1/D2-reviewed SQL transaction, not by this module.
 */
import type {
  Actor,
  Creation,
  Minor,
  Mutation,
  Page,
  PageQuery,
  UUID,
  Version,
} from "@/lib/api/contracts";

export type { Actor, Creation, Minor, Mutation, Page, PageQuery, UUID, Version };

export const INVOICE_STATUSES = ["draft", "confirmed", "paid", "cancelled"] as const;
export const PAYMENT_METHODS = ["bank_transfer", "cash", "card", "other"] as const;
export const BILLING_INTERVALS = ["daily", "weekly", "monthly", "yearly"] as const;
export const SUBSCRIPTION_STATUSES = [
  "draft",
  "quotation",
  "confirmed",
  "active",
  "paused",
  "closed",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Customer-visible billing identity frozen onto an invoice at confirmation. */
export type BillingContact = {
  display_name: string;
  email: string;
};

export type InvoiceLineDTO = {
  id: UUID;
  subscription_line_id: UUID;
  description: string;
  variant_label: string | null;
  quantity: number;
  unit_price_minor: Minor;
  discount_minor: Minor;
  tax_rule_id: UUID | null;
  tax_rate_bps: number;
  tax_minor: Minor;
  amount_minor: Minor;
};

export type InvoiceSummaryDTO = {
  id: UUID;
  number: string;
  subscription_id: UUID;
  customer_id: UUID;
  currency: string;
  status: InvoiceStatus;
  period_start: string;
  period_end: string;
  issued_at: string | null;
  due_on: string;
  sent_at: string | null;
  subtotal_minor: Minor;
  discount_minor: Minor;
  tax_minor: Minor;
  total_minor: Minor;
  paid_minor: Minor;
  outstanding_minor: Minor;
  version: Version;
  created_at: string;
  updated_at: string;
};

/**
 * Only customer-visible billing contact fields; no Auth object or audit data.
 * A draft/cancelled-draft invoice has no confirmed contact snapshot yet, so the
 * field is null until confirmation freezes it. Every issued invoice (and every
 * row a customer can read) must have a snapshot.
 */
export type InvoiceDTO = InvoiceSummaryDTO & {
  customer_snapshot: BillingContact | null;
  lines: InvoiceLineDTO[];
};

export type PaymentDTO = {
  id: UUID;
  invoice_id: UUID;
  customer_id: UUID;
  currency: string;
  amount_minor: Minor;
  method: PaymentMethod;
  paid_at: string;
  note: string;
  external_reference: string | null;
  created_at: string;
};

export type InvoiceQuery = PageQuery & {
  status?: InvoiceStatus;
  customer_id?: UUID;
  overdue?: boolean;
};

export type PaymentQuery = PageQuery & {
  customer_id?: UUID;
  invoice_id?: UUID;
  /** Inclusive UTC instant lower bound on paid_at. */
  from?: string;
  /** Exclusive UTC instant upper bound on paid_at. */
  to?: string;
};

export type GenerateInvoiceInput = {
  subscription_id: UUID;
};

export type RecordPaymentInput = {
  amount_minor: Minor;
  currency: string;
  method: PaymentMethod;
  paid_at: string;
  note?: string;
  external_reference?: string;
};

export type SummaryQuery = {
  /** Inclusive UTC instant lower bound on issued_at/paid_at. */
  from: string;
  /** Exclusive UTC instant upper bound on issued_at/paid_at. */
  to: string;
  customer_id?: UUID;
  status?: InvoiceStatus;
  currency?: string;
};

export type ReportCurrencyBucket = {
  currency: string;
  billed_minor: Minor;
  collected_minor: Minor;
  outstanding_minor: Minor;
  overdue_minor: Minor;
  overdue_invoice_count: number;
};

/**
 * `currencies` is intentionally an array of independent buckets. Different
 * currencies are never added together.
 */
export type ReportDTO = {
  as_of: string;
  active_subscriptions: number;
  currencies: ReportCurrencyBucket[];
};

export type BillingRunInput = {
  limit?: number;
};

export type BillingRunResult = {
  processed: number;
  failed: number;
  has_more: boolean;
};

export type SendInvoiceResult = {
  invoice_id: UUID;
  accepted: true;
};

/** Minimal D3-owned snapshot read by billing. D4 never writes it in TypeScript. */
export type BillingScheduleSnapshot = {
  id: UUID;
  customer_id: UUID;
  currency: string;
  status: SubscriptionStatus;
  start_at: string;
  expires_at: string;
  payment_terms_days: number;
  billing_interval: BillingInterval;
  billing_anchor_at: string | null;
  next_billing_at: string | null;
  closed_at: string | null;
};

export type InvoicePeriod = {
  period_start: string;
  period_end: string;
};

/**
 * D2-owned discount snapshot consumed read-only by D4's confirmation preflight
 * and proposed SQL. D4 never calculates discount amounts.
 */
export type DiscountSnapshot = {
  id: UUID;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  max_uses: number | null;
  uses: number;
  currency: string | null;
  min_quantity: number;
  min_subtotal_minor: Minor;
};

export type DiscountContext = {
  at: string;
  currency: string;
  subtotal_minor: Minor;
  eligible_quantity: number;
};

export type InvoicePeriodPlan =
  | ({ kind: "due" } & InvoicePeriod)
  | { kind: "not_due"; next_billing_at: string }
  | {
      kind: "not_billable";
      reason:
        | "status"
        | "missing_schedule"
        | "expired"
        | "closed"
        | "before_start";
      next_billing_at: string | null;
    };

export const DEFAULT_BILLING_RUN_LIMIT = 100;
export const MAX_BILLING_RUN_LIMIT = 500;
export const MAX_PAYMENT_NOTE_LENGTH = 2000;
export const MAX_EXTERNAL_REFERENCE_LENGTH = 200;
export const MAX_INVOICE_LINE_QUANTITY = 1_000_000;
export const MAX_MINOR_AMOUNT = "9000000000000000";
export const MAX_UNIT_AMOUNT = "9000000000000";

/**
 * Delivery has no mail/provider integration in this baseline. The service
 * reports this explicitly and no send route is registered; never set sent_at
 * without a confirmed delivery integration.
 */
export const SEND_UNAVAILABLE_MESSAGE =
  "Invoice delivery is not available because no delivery integration is configured.";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  other: "Other",
};

/**
 * Pure D4 billing rules.
 *
 * This file deliberately contains no catalog repricing and no database writes.
 * Invoice pricing/redemption belongs to the D2-reviewed SQL transaction; this
 * module validates snapshots, schedules, balances and report integrity so the
 * service and tests can reject unsafe input before/after a transaction.
 */
import { AppError } from "@/lib/api/errors";
import type {
  BillingInterval,
  BillingScheduleSnapshot,
  DiscountContext,
  DiscountSnapshot,
  InvoiceLineDTO,
  InvoicePeriod,
  InvoicePeriodPlan,
  InvoiceStatus,
  InvoiceSummaryDTO,
  Minor,
  ReportCurrencyBucket,
  ReportDTO,
  UUID,
} from "./contracts";
import { BILLING_INTERVALS, INVOICE_STATUSES, MAX_MINOR_AMOUNT, SUBSCRIPTION_STATUSES } from "./contracts";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
export const MAX_MINOR = BigInt(MAX_MINOR_AMOUNT);
export const MAX_UNIT_MINOR = 9_000_000_000_000n;
export const MAX_LINE_QUANTITY = 1_000_000;

export function invalid(message = "Invalid request."): never {
  throw new AppError("VALIDATION_ERROR", message);
}

/** Parse a canonical nonnegative integer minor-unit string. */
export function parseMinor(
  value: unknown,
  options: { allowZero?: boolean; max?: bigint; field?: string } = {},
): bigint {
  const { allowZero = false, max = MAX_MINOR, field = "amount_minor" } = options;
  if (typeof value !== "string" || !/^\d{1,19}$/.test(value)) {
    invalid(`${field} must be a nonnegative integer decimal string.`);
  }
  const parsed = BigInt(value);
  if (!allowZero && parsed === 0n) invalid(`${field} must be positive.`);
  if (parsed > max) invalid(`${field} is out of range.`);
  return parsed;
}

export function canonicalMinor(value: bigint): Minor {
  return value.toString();
}

/** Strict UTC instant used by API money/timestamp contracts. */
export function parseInstant(value: unknown, field = "timestamp"): Date {
  if (typeof value !== "string") invalid(`${field} must be an ISO-8601 UTC timestamp.`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match) invalid(`${field} must be an ISO-8601 UTC timestamp.`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = ""] = match;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction.padEnd(3, "0").slice(0, 3));
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(hour, minute, second, millisecond);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    invalid(`${field} must be a valid UTC timestamp.`);
  }
  return date;
}

export function normalizeInstant(value: unknown, field = "timestamp"): string {
  return parseInstant(value, field).toISOString();
}

export function utcDate(value: Date | string): string {
  return (typeof value === "string" ? parseInstant(value) : value).toISOString().slice(0, 10);
}

export function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Advance one billing boundary in UTC.
 *
 * Monthly/yearly periods retain the anchor's UTC day and time and clamp at
 * month end: Jan 31 -> Feb 28/29 -> Mar 31. A leap-day yearly anchor clamps in
 * common years and returns to Feb 29 in the next leap year. This mirrors the
 * private SQL helper proposed in SQL-PROPOSALS.md.
 */
export function advancePeriod(
  start: Date,
  interval: BillingInterval,
  anchor: Date,
): Date {
  if (!BILLING_INTERVALS.includes(interval)) invalid("Unsupported billing interval.");
  if (interval === "daily") return new Date(start.getTime() + DAY_MS);
  if (interval === "weekly") return new Date(start.getTime() + WEEK_MS);

  const anchorDay = anchor.getUTCDate();
  const anchorMonth = anchor.getUTCMonth();
  const hour = anchor.getUTCHours();
  const minute = anchor.getUTCMinutes();
  const second = anchor.getUTCSeconds();
  const millisecond = anchor.getUTCMilliseconds();

  let year: number;
  let month: number;
  if (interval === "monthly") {
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth();
  } else {
    year = start.getUTCFullYear() + 1;
    month = anchorMonth;
  }
  const day = Math.min(anchorDay, daysInUtcMonth(year, month));
  const result = new Date(Date.UTC(year, month, day, hour, minute, second, millisecond));
  if (result.getTime() <= start.getTime()) {
    throw new AppError("INTERNAL_ERROR", "Billing period did not advance.");
  }
  return result;
}

export function assertSubscriptionStatus(value: string): asserts value is BillingScheduleSnapshot["status"] {
  if (!SUBSCRIPTION_STATUSES.includes(value as BillingScheduleSnapshot["status"])) {
    throw new AppError("INTERNAL_ERROR", "Subscription schedule is invalid.");
  }
}

/**
 * Determine the next period for a due subscription. The caller's SQL RPC is
 * authoritative; this pure implementation documents/tests the shared rules and
 * rejects impossible snapshots before any write.
 *
 * `allowClosedCutoff` is for the D3 close/pause transaction, which materializes
 * due periods before its cutoff in the same lock. The standalone generator only
 * bills active subscriptions and never closes or pauses them.
 */
export function planInvoicePeriod(
  snapshot: BillingScheduleSnapshot,
  now: Date,
  options: { allowClosedCutoff?: boolean; cutoff?: Date } = {},
): InvoicePeriodPlan {
  assertSubscriptionStatus(snapshot.status);
  if (!BILLING_INTERVALS.includes(snapshot.billing_interval)) {
    throw new AppError("INTERNAL_ERROR", "Subscription billing interval is invalid.");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid("Invalid billing time.");

  const closed = snapshot.closed_at ? parseInstant(snapshot.closed_at, "closed_at") : null;
  const isClosedCutoff = snapshot.status === "closed" && options.allowClosedCutoff && closed !== null;
  if (snapshot.status !== "active" && !isClosedCutoff) {
    return {
      kind: "not_billable",
      reason: snapshot.status === "closed" ? "closed" : "status",
      next_billing_at: snapshot.next_billing_at,
    };
  }
  if (!snapshot.billing_anchor_at || !snapshot.next_billing_at) {
    return { kind: "not_billable", reason: "missing_schedule", next_billing_at: snapshot.next_billing_at };
  }

  const start = parseInstant(snapshot.next_billing_at, "next_billing_at");
  const anchor = parseInstant(snapshot.billing_anchor_at, "billing_anchor_at");
  const subscriptionStart = parseInstant(snapshot.start_at, "start_at");
  const expires = parseInstant(snapshot.expires_at, "expires_at");
  if (anchor > start || start < subscriptionStart) {
    return { kind: "not_billable", reason: "before_start", next_billing_at: snapshot.next_billing_at };
  }

  let cutoff = options.cutoff && options.cutoff < expires ? options.cutoff : expires;
  if (closed && closed.getTime() < cutoff.getTime()) cutoff = closed;
  if (start.getTime() >= cutoff.getTime()) {
    return { kind: "not_billable", reason: "expired", next_billing_at: snapshot.next_billing_at };
  }
  if (start.getTime() > now.getTime()) {
    return { kind: "not_due", next_billing_at: snapshot.next_billing_at };
  }

  let end = advancePeriod(start, snapshot.billing_interval, anchor);
  if (end.getTime() > cutoff.getTime()) end = cutoff;
  if (end.getTime() <= start.getTime()) {
    return { kind: "not_billable", reason: "expired", next_billing_at: snapshot.next_billing_at };
  }
  return {
    kind: "due",
    period_start: start.toISOString(),
    period_end: end.toISOString(),
  };
}

/** Catch-up preview: one period at a time, never past expiry/cutoff. */
export function duePeriods(
  snapshot: BillingScheduleSnapshot,
  now: Date,
  options: { allowClosedCutoff?: boolean; maxPeriods?: number } = {},
): InvoicePeriod[] {
  const maxPeriods = options.maxPeriods ?? 1_000;
  if (!Number.isInteger(maxPeriods) || maxPeriods < 1) invalid("Invalid catch-up limit.");
  let next = snapshot.next_billing_at;
  const periods: InvoicePeriod[] = [];
  for (let index = 0; index < maxPeriods; index += 1) {
    const plan = planInvoicePeriod(
      { ...snapshot, next_billing_at: next },
      now,
      { allowClosedCutoff: options.allowClosedCutoff },
    );
    if (plan.kind !== "due") break;
    periods.push({ period_start: plan.period_start, period_end: plan.period_end });
    next = plan.period_end;
    if (plan.period_end === snapshot.expires_at) break;
  }
  return periods;
}

export type InvoiceBalance = {
  subtotal: bigint;
  discount: bigint;
  tax: bigint;
  total: bigint;
  paid: bigint;
  outstanding: bigint;
};

function integrity(message = "Invoice data is inconsistent."): never {
  throw new AppError("INTERNAL_ERROR", message);
}

/** Validate stored header/line arithmetic; a bad row is never shown as money. */
export function validateInvoice(invoice: InvoiceSummaryDTO, lines?: InvoiceLineDTO[]): InvoiceBalance {
  const subtotal = parseMinor(invoice.subtotal_minor, { allowZero: true, field: "subtotal_minor" });
  const discount = parseMinor(invoice.discount_minor, { allowZero: true, field: "discount_minor" });
  const tax = parseMinor(invoice.tax_minor, { allowZero: true, field: "tax_minor" });
  const total = parseMinor(invoice.total_minor, { allowZero: true, field: "total_minor" });
  const paid = parseMinor(invoice.paid_minor, { allowZero: true, field: "paid_minor" });
  const outstanding = parseMinor(invoice.outstanding_minor, {
    allowZero: true,
    field: "outstanding_minor",
  });
  if (discount > subtotal) integrity();
  if (total !== subtotal - discount + tax) integrity();
  if (paid > total) integrity();
  if (outstanding !== total - paid) integrity();
  if (!INVOICE_STATUSES.includes(invoice.status)) integrity();

  if (lines) {
    if (lines.length === 0) integrity();
    let lineSubtotal = 0n;
    let lineDiscount = 0n;
    let lineTax = 0n;
    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
        integrity();
      }
      const unit = parseMinor(line.unit_price_minor, { allowZero: true, max: MAX_UNIT_MINOR });
      const lineDiscountMinor = parseMinor(line.discount_minor, { allowZero: true });
      const lineTaxMinor = parseMinor(line.tax_minor, { allowZero: true });
      const amount = parseMinor(line.amount_minor, { allowZero: true });
      const gross = BigInt(line.quantity) * unit;
      if (lineDiscountMinor > gross) integrity();
      if (!Number.isInteger(line.tax_rate_bps) || line.tax_rate_bps < 0 || line.tax_rate_bps > 10_000) {
        integrity();
      }
      if (amount !== gross - lineDiscountMinor + lineTaxMinor) integrity();
      lineSubtotal += gross;
      lineDiscount += lineDiscountMinor;
      lineTax += lineTaxMinor;
    }
    if (lineSubtotal !== subtotal || lineDiscount !== discount || lineTax !== tax) integrity();
  }

  return { subtotal, discount, tax, total, paid, outstanding };
}

export type PaymentDecision = {
  amount: bigint;
  balance: bigint;
  outstandingAfter: bigint;
  settles: boolean;
};

/**
 * Preflight a verified receipt. The database transaction rechecks under the
 * invoice lock; this only rejects obviously invalid/overpaying input early.
 */
export function decidePayment(
  invoice: InvoiceSummaryDTO,
  amountValue: unknown,
  currency: string,
): PaymentDecision {
  const amount = parseMinor(amountValue, { field: "amount_minor" });
  if (!/^[A-Z]{3}$/.test(currency)) invalid("currency must be an uppercase three-letter code.");
  if (currency !== invoice.currency) invalid("Payment currency must match the invoice currency.");
  if (invoice.status !== "confirmed") {
    throw new AppError("INVALID_TRANSITION", "Payments can only be recorded on confirmed invoices.");
  }
  const balance = validateInvoice(invoice);
  if (amount > balance.outstanding) {
    throw new AppError("PAYMENT_EXCEEDS_BALANCE", "Payment exceeds the outstanding balance.");
  }
  const outstandingAfter = balance.outstanding - amount;
  return {
    amount,
    balance: balance.outstanding,
    outstandingAfter,
    settles: outstandingAfter === 0n,
  };
}

/** Customer visibility: issued and non-draft. Cancelled drafts stay staff-only. */
export function invoiceVisibleToCustomer(
  invoice: Pick<InvoiceSummaryDTO, "customer_id" | "issued_at" | "status">,
  customerId: UUID,
): boolean {
  return (
    invoice.customer_id === customerId &&
    invoice.issued_at !== null &&
    invoice.status !== "draft" &&
    INVOICE_STATUSES.includes(invoice.status)
  );
}

export function invoiceOverdue(
  invoice: Pick<InvoiceSummaryDTO, "status" | "due_on" | "outstanding_minor">,
  today: string,
): boolean {
  if (!/^\d{4}-\d\d-\d\d$/.test(today)) invalid("Invalid report date.");
  if (invoice.status !== "confirmed") return false;
  const outstanding = parseMinor(invoice.outstanding_minor, { allowZero: true });
  if (outstanding === 0n) return false;
  return invoice.due_on < today;
}

/**
 * Limit/date/scope checks only. D2 owns discount arithmetic and the confirmation
 * RPC owns the locked redemption; this function never computes a discount.
 */
export function discountEligible(discount: DiscountSnapshot, context: DiscountContext): boolean {
  const at = parseInstant(context.at, "discount time");
  const starts = parseInstant(discount.starts_at, "discount starts_at");
  const ends = discount.ends_at ? parseInstant(discount.ends_at, "discount ends_at") : null;
  if (!discount.is_active) return false;
  if (starts.getTime() > at.getTime()) return false;
  if (ends && at.getTime() >= ends.getTime()) return false;
  if (discount.max_uses !== null) {
    if (!Number.isInteger(discount.max_uses) || discount.max_uses < 1) integrity();
    if (discount.uses >= discount.max_uses) return false;
  }
  if (!Number.isInteger(discount.uses) || discount.uses < 0) integrity();
  if (discount.currency !== null && discount.currency !== context.currency) return false;
  const minimumSubtotal = parseMinor(discount.min_subtotal_minor, {
    allowZero: true,
    field: "min_subtotal_minor",
  });
  const subtotal = parseMinor(context.subtotal_minor, { allowZero: true, field: "subtotal_minor" });
  if (subtotal < minimumSubtotal) return false;
  if (!Number.isInteger(context.eligible_quantity) || context.eligible_quantity < 0) integrity();
  return context.eligible_quantity >= discount.min_quantity;
}

function parseCount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) integrity(`${field} is invalid.`);
  return value;
}

/** Validate separate-currency report buckets. Never combines currencies. */
export function validateReport(report: ReportDTO): ReportDTO {
  parseInstant(report.as_of, "as_of");
  if (!Number.isSafeInteger(report.active_subscriptions) || report.active_subscriptions < 0) integrity();
  const seen = new Set<string>();
  const currencies = report.currencies.map(bucket => {
    if (!/^[A-Z]{3}$/.test(bucket.currency) || seen.has(bucket.currency)) integrity();
    seen.add(bucket.currency);
    const billed = parseMinor(bucket.billed_minor, { allowZero: true, field: "billed_minor" });
    const collected = parseMinor(bucket.collected_minor, { allowZero: true, field: "collected_minor" });
    const outstanding = parseMinor(bucket.outstanding_minor, {
      allowZero: true,
      field: "outstanding_minor",
    });
    const overdue = parseMinor(bucket.overdue_minor, { allowZero: true, field: "overdue_minor" });
    const overdueCount = parseCount(bucket.overdue_invoice_count, "overdue_invoice_count");
    if (overdue > outstanding) integrity();
    return {
      currency: bucket.currency,
      billed_minor: billed.toString(),
      collected_minor: collected.toString(),
      outstanding_minor: outstanding.toString(),
      overdue_minor: overdue.toString(),
      overdue_invoice_count: overdueCount,
    } satisfies ReportCurrencyBucket;
  });
  return { as_of: new Date(report.as_of).toISOString(), active_subscriptions: report.active_subscriptions, currencies };
}

export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return typeof value === "string" && INVOICE_STATUSES.includes(value as InvoiceStatus);
}

export function assertCurrency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
    invalid("currency must be an uppercase three-letter code.");
  }
  return value;
}

export function assertUuid(value: unknown, field = "id"): UUID {
  if (
    typeof value !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)
  ) {
    invalid(`${field} must be a UUID.`);
  }
  return value.toLowerCase();
}

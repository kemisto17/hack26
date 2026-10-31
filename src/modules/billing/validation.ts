/** Strict transport input validation for D4. Unknown mutation keys are rejected. */
import { strictObject, version } from "@/lib/api/validation";
import type {
  BillingRunInput,
  GenerateInvoiceInput,
  InvoiceQuery,
  InvoiceStatus,
  PaymentMethod,
  PaymentQuery,
  RecordPaymentInput,
  SummaryQuery,
} from "./contracts";
import {
  DEFAULT_BILLING_RUN_LIMIT,
  INVOICE_STATUSES,
  MAX_BILLING_RUN_LIMIT,
  MAX_EXTERNAL_REFERENCE_LENGTH,
  MAX_PAYMENT_NOTE_LENGTH,
  PAYMENT_METHODS,
} from "./contracts";
import {
  assertCurrency,
  assertUuid,
  canonicalMinor,
  invalid,
  normalizeInstant,
  parseInstant,
  parseMinor,
} from "./domain";

function page(query: unknown, keys: readonly string[]): Record<string, unknown> {
  const value = strictObject(query, ["limit", "cursor", ...keys]);
  const limit = value.limit ?? 25;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    invalid("limit must be an integer from 1 to 100.");
  }
  if (value.cursor !== undefined && (typeof value.cursor !== "string" || !value.cursor || value.cursor.length > 4096)) {
    invalid("Invalid cursor.");
  }
  return { ...value, limit };
}

function optionalUuid(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : assertUuid(value, field);
}

function status(value: unknown): InvoiceStatus | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !INVOICE_STATUSES.includes(value as InvoiceStatus)) {
    invalid("Invalid invoice status.");
  }
  return value as InvoiceStatus;
}

export function parseInvoiceQuery(query: InvoiceQuery): InvoiceQuery {
  const value = page(query, ["status", "customer_id", "overdue"]);
  if (value.overdue !== undefined && typeof value.overdue !== "boolean") invalid("overdue must be a boolean.");
  const customerId = optionalUuid(value.customer_id, "customer_id");
  const invoiceStatus = status(value.status);
  return {
    limit: value.limit as number,
    ...(value.cursor !== undefined ? { cursor: value.cursor as string } : {}),
    ...(invoiceStatus ? { status: invoiceStatus } : {}),
    ...(customerId ? { customer_id: customerId } : {}),
    ...(value.overdue !== undefined ? { overdue: value.overdue as boolean } : {}),
  };
}

export function parsePaymentQuery(query: PaymentQuery): PaymentQuery {
  const value = page(query, ["customer_id", "invoice_id", "from", "to"]);
  const from = value.from === undefined ? undefined : normalizeInstant(value.from, "from");
  const to = value.to === undefined ? undefined : normalizeInstant(value.to, "to");
  if (from && to && Date.parse(from) >= Date.parse(to)) invalid("from must precede to.");
  const customerId = optionalUuid(value.customer_id, "customer_id");
  const invoiceId = optionalUuid(value.invoice_id, "invoice_id");
  return {
    limit: value.limit as number,
    ...(value.cursor !== undefined ? { cursor: value.cursor as string } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(customerId ? { customer_id: customerId } : {}),
    ...(invoiceId ? { invoice_id: invoiceId } : {}),
  };
}

export function parseSummaryQuery(query: SummaryQuery): SummaryQuery {
  const value = strictObject(query, ["from", "to", "customer_id", "status", "currency"]);
  const from = normalizeInstant(value.from, "from");
  const to = normalizeInstant(value.to, "to");
  if (Date.parse(from) >= Date.parse(to)) invalid("from must precede to.");
  const customerId = optionalUuid(value.customer_id, "customer_id");
  const invoiceStatus = status(value.status);
  const currency = value.currency === undefined ? undefined : assertCurrency(value.currency);
  return {
    from,
    to,
    ...(customerId ? { customer_id: customerId } : {}),
    ...(invoiceStatus ? { status: invoiceStatus } : {}),
    ...(currency ? { currency } : {}),
  };
}

export function parseGenerateInput(input: GenerateInvoiceInput): GenerateInvoiceInput {
  const value = strictObject(input, ["subscription_id"]);
  return { subscription_id: assertUuid(value.subscription_id, "subscription_id") };
}

function note(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string") invalid("note must be a string.");
  const trimmed = value.trim();
  if (trimmed.length > MAX_PAYMENT_NOTE_LENGTH) invalid("note is too long.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed)) invalid("note contains control characters.");
  if (containsCardLikeNumber(trimmed)) invalid("note must not contain card numbers.");
  return trimmed;
}

function externalReference(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalid("external_reference must be a string.");
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_EXTERNAL_REFERENCE_LENGTH) {
    invalid("external_reference has an invalid length.");
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) invalid("external_reference contains control characters.");
  return trimmed;
}

/**
 * Reject likely payment-card numbers in free-text receipt notes. No card data
 * may be stored; this is defense in depth, not a card processor.
 */
export function containsCardLikeNumber(text: string): boolean {
  const candidates = text.match(/\d(?:[ -]?\d){12,18}/g) ?? [];
  return candidates.some(candidate => {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    let double = false;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      let digit = Number(digits[index]);
      if (double) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      double = !double;
    }
    return sum % 10 === 0;
  });
}

export function parseRecordPaymentInput(
  input: RecordPaymentInput,
  now: Date = new Date(),
): RecordPaymentInput {
  const value = strictObject(input, [
    "amount_minor",
    "currency",
    "method",
    "paid_at",
    "note",
    "external_reference",
  ]);
  const amount = parseMinor(value.amount_minor, { field: "amount_minor" });
  const currency = assertCurrency(value.currency);
  if (typeof value.method !== "string" || !PAYMENT_METHODS.includes(value.method as PaymentMethod)) {
    invalid("Invalid payment method.");
  }
  const paidAt = parseInstant(value.paid_at, "paid_at");
  // A receipt may be backdated, but it cannot be a future promise. Allow only a
  // small clock-skew window so a staff browser is not the source of truth.
  if (paidAt.getTime() > now.getTime() + 5 * 60_000) invalid("paid_at cannot be in the future.");
  const reference = externalReference(value.external_reference);
  return {
    amount_minor: canonicalMinor(amount),
    currency,
    method: value.method as PaymentMethod,
    paid_at: paidAt.toISOString(),
    note: note(value.note),
    ...(reference ? { external_reference: reference } : {}),
  };
}

export function parseBillingRunInput(input: BillingRunInput): Required<BillingRunInput> {
  const value = strictObject(input, ["limit"]);
  const limit = value.limit ?? DEFAULT_BILLING_RUN_LIMIT;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > MAX_BILLING_RUN_LIMIT) {
    invalid(`limit must be an integer from 1 to ${MAX_BILLING_RUN_LIMIT}.`);
  }
  return { limit };
}

export function parseExpectedVersion(value: unknown): string {
  return version(value);
}

export function parseId(value: unknown, field = "id"): string {
  return assertUuid(value, field);
}

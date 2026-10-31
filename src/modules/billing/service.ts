/**
 * D4 server-only billing services.
 *
 * Bindings are supplied per request by D1's verified Auth/session and database
 * layer. Every financial mutation binding MUST be backed by one of the atomic,
 * service-role-only PostgreSQL RPCs in SQL-PROPOSALS.md. This module never
 * writes invoice/payment/subscription rows itself, never reprices catalog data,
 * and never advances a subscription schedule from TypeScript.
 */
import "server-only";
import { AppError } from "@/lib/api/errors";
import { fingerprintRequest } from "@/lib/api/idempotency";
import type {
  Actor,
  BillingRunInput,
  BillingRunResult,
  Creation,
  GenerateInvoiceInput,
  InvoiceDTO,
  InvoiceQuery,
  InvoiceSummaryDTO,
  Mutation,
  Page,
  PageQuery,
  PaymentDTO,
  PaymentQuery,
  RecordPaymentInput,
  ReportDTO,
  SendInvoiceResult,
  SummaryQuery,
  UUID,
} from "./contracts";
import {
  SEND_UNAVAILABLE_MESSAGE,
} from "./contracts";
import {
  assertCurrency,
  invoiceVisibleToCustomer,
  parseInstant,
  parseMinor,
  validateInvoice,
  validateReport,
} from "./domain";
import { renderInvoiceHtml } from "./invoice-html";
import {
  parseBillingRunInput,
  parseExpectedVersion,
  parseGenerateInput,
  parseId,
  parseInvoiceQuery,
  parsePaymentQuery,
  parseRecordPaymentInput,
  parseSummaryQuery,
} from "./validation";

export type BillingContactInput = {
  display_name: string;
  email: string;
};

/**
 * D1-approved additive RPC arguments are called out explicitly below. The
 * authoritative base signatures remain the ones in docs/api-contracts.md; D1
 * must update that document with producer/consumer review before landing these
 * two arguments.
 */
export type BillingBindings = {
  /** D1: verified Auth user + current active public.users role. */
  requireActor(): Promise<Actor>;
  /** D1: staff/admin only, current profile plus Auth email. */
  getBillingContact(actor: Actor, customerId: UUID): Promise<BillingContactInput>;
  /** RLS-scoped reads or safe service-role projections. */
  readInvoice(actor: Actor, id: UUID): Promise<InvoiceDTO | null>;
  readInvoices(actor: Actor, query: InvoiceQuery): Promise<Page<InvoiceSummaryDTO>>;
  readPayments(actor: Actor, query: PaymentQuery): Promise<Page<PaymentDTO>>;
  readReport(actor: Actor, query: SummaryQuery): Promise<ReportDTO>;

  /** Service-role-only public.generate_next_invoice(p_subscription_id). */
  generateNextInvoiceTransaction(args: { p_subscription_id: UUID }): Promise<UUID | null>;
  /**
   * Service-role-only public.confirm_invoice(...). D1 must approve the additive
   * p_customer_snapshot argument so D4 can pass D1's billing-contact contract
   * atomically instead of re-reading Auth profile data from SQL.
   */
  confirmInvoiceTransaction(args: {
    p_actor_id: UUID;
    p_invoice_id: UUID;
    p_expected_version: string;
    p_customer_snapshot: BillingContactInput;
  }): Promise<InvoiceDTO>;
  /** Service-role-only public.cancel_invoice(...). */
  cancelInvoiceTransaction(args: {
    p_actor_id: UUID;
    p_invoice_id: UUID;
    p_expected_version: string;
  }): Promise<InvoiceDTO>;
  /**
   * Service-role-only public.record_payment(...). D1 must approve the additive
   * p_request_fingerprint argument produced by D1's fingerprintRequest helper.
   */
  recordPaymentTransaction(args: {
    p_actor_id: UUID;
    p_invoice_id: UUID;
    p_expected_version: string;
    p_request_key: UUID;
    p_input: RecordPaymentInput;
    p_request_fingerprint: string;
  }): Promise<{ payment: PaymentDTO; invoice: InvoiceSummaryDTO }>;

  /** Bounded due-subscription selection; may return the same ID to concurrent jobs. */
  listDueSubscriptionIds(limit: number): Promise<UUID[]>;
  hasMoreDueSubscriptions?(): Promise<boolean>;
  /** Receives a safe code and subscription ID only — never a raw error or PII. */
  logBillingFailure?(subscriptionId: UUID, code: "NOT_DUE" | "NOT_FOUND" | "FORBIDDEN" | "INTERNAL_ERROR"): void;
};

const STAFF = new Set(["admin", "internal"]);
const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

function internal(message = "Billing data is inconsistent."): never {
  throw new AppError("INTERNAL_ERROR", message);
}

function normalizeMoney(value: string, allowZero = true): string {
  return parseMinor(value, { allowZero }).toString();
}

function safeText(value: unknown, max: number, field: string): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    internal(`${field} is invalid.`);
  }
  return value;
}

function safeContact(contact: BillingContactInput): BillingContactInput {
  const displayName = safeText(contact.display_name, 200, "customer_snapshot.display_name");
  const email = safeText(contact.email, 320, "customer_snapshot.email").trim();
  if (!email || !email.includes("@")) internal("Billing contact email is invalid.");
  return { display_name: displayName, email };
}

function safeInstant(value: unknown): string {
  return parseInstant(value).toISOString();
}

function summaryDTO(row: InvoiceSummaryDTO): InvoiceSummaryDTO {
  if (!UUID_RE.test(row.id) || !UUID_RE.test(row.subscription_id) || !UUID_RE.test(row.customer_id)) internal();
  if (typeof row.number !== "string" || !row.number || row.number.length > 100) internal();
  if (!/^[A-Z]{3}$/.test(row.currency)) internal();
  if (!/^[1-9]\d{0,18}$/.test(row.version)) internal();
  const start = safeInstant(row.period_start);
  const end = safeInstant(row.period_end);
  if (Date.parse(end) <= Date.parse(start)) internal();
  if (!/^\d{4}-\d\d-\d\d$/.test(row.due_on) || !Number.isFinite(Date.parse(`${row.due_on}T00:00:00Z`))) internal();
  const issued = row.issued_at === null ? null : safeInstant(row.issued_at);
  const sent = row.sent_at === null ? null : safeInstant(row.sent_at);
  validateInvoice(row);
  return {
    id: row.id,
    number: row.number,
    subscription_id: row.subscription_id,
    customer_id: row.customer_id,
    currency: row.currency,
    status: row.status,
    period_start: start,
    period_end: end,
    issued_at: issued,
    due_on: row.due_on,
    sent_at: sent,
    subtotal_minor: normalizeMoney(row.subtotal_minor),
    discount_minor: normalizeMoney(row.discount_minor),
    tax_minor: normalizeMoney(row.tax_minor),
    total_minor: normalizeMoney(row.total_minor),
    paid_minor: normalizeMoney(row.paid_minor),
    outstanding_minor: normalizeMoney(row.outstanding_minor),
    version: row.version,
    created_at: safeInstant(row.created_at),
    updated_at: safeInstant(row.updated_at),
  };
}

function invoiceDTO(row: InvoiceDTO): InvoiceDTO {
  const summary = summaryDTO(row);
  validateInvoice(summary, row.lines);
  // Drafts (and cancelled drafts) are staff-only and have no frozen contact yet.
  // An issued row without one is corrupt and must never be rendered to a customer.
  const contact = row.customer_snapshot === null ? null : safeContact(row.customer_snapshot);
  if (contact === null && row.issued_at !== null) {
    internal("Issued invoice is missing its customer snapshot.");
  }
  return {
    ...summary,
    customer_snapshot: contact,
    lines: row.lines.map(line => {
      if (
        !UUID_RE.test(line.id) ||
        !UUID_RE.test(line.subscription_line_id) ||
        typeof line.description !== "string" ||
        !line.description ||
        line.description.length > 1000 ||
        !Number.isInteger(line.quantity) ||
        !Number.isInteger(line.tax_rate_bps)
      ) {
        internal();
      }
      return {
        id: line.id,
        subscription_line_id: line.subscription_line_id,
        description: line.description,
        variant_label: line.variant_label === null ? null : safeText(line.variant_label, 200, "variant_label"),
        quantity: line.quantity,
        unit_price_minor: normalizeMoney(line.unit_price_minor),
        discount_minor: normalizeMoney(line.discount_minor),
        tax_rule_id: line.tax_rule_id,
        tax_rate_bps: line.tax_rate_bps,
        tax_minor: normalizeMoney(line.tax_minor),
        amount_minor: normalizeMoney(line.amount_minor),
      };
    }),
  };
}

function paymentDTO(row: PaymentDTO): PaymentDTO {
  if (!UUID_RE.test(row.id) || !UUID_RE.test(row.invoice_id) || !UUID_RE.test(row.customer_id)) internal();
  if (!/^[A-Z]{3}$/.test(row.currency)) internal();
  if (!["bank_transfer", "cash", "card", "other"].includes(row.method)) internal();
  const amount = parseMinor(row.amount_minor).toString();
  const paidAt = safeInstant(row.paid_at);
  const note = safeText(row.note, 2000, "payment.note");
  const reference = row.external_reference === null ? null : safeText(row.external_reference, 200, "external_reference");
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    customer_id: row.customer_id,
    currency: row.currency,
    amount_minor: amount,
    method: row.method,
    paid_at: paidAt,
    note,
    external_reference: reference,
    created_at: safeInstant(row.created_at),
  };
}

export function bindBillingServices(bindings: BillingBindings) {
  async function current(actor: Actor): Promise<Actor> {
    if (!actor || !UUID_RE.test(actor.id)) throw new AppError("UNAUTHENTICATED", "A verified session is required.");
    const verified = await bindings.requireActor();
    if (!verified || verified.id !== actor.id) throw new AppError("FORBIDDEN", "Session actor mismatch.");
    return verified;
  }

  async function staff(actor: Actor): Promise<Actor> {
    const verified = await current(actor);
    if (!STAFF.has(verified.role)) throw new AppError("FORBIDDEN", "Staff access required.");
    return verified;
  }

  function readable(actor: Actor, invoice: InvoiceDTO | InvoiceSummaryDTO): boolean {
    return actor.role !== "customer" || invoiceVisibleToCustomer(invoice, actor.id);
  }

  async function readInvoiceFor(actor: Actor, id: string): Promise<InvoiceDTO> {
    const row = await bindings.readInvoice(actor, parseId(id));
    if (!row || !readable(actor, row)) throw new AppError("NOT_FOUND", "Invoice not found.");
    return invoiceDTO(row);
  }

  return {
    async listInvoices(actor: Actor, query: InvoiceQuery = {}): Promise<Page<InvoiceSummaryDTO>> {
      const verified = await current(actor);
      const parsed = parseInvoiceQuery(query);
      const scoped: InvoiceQuery = {
        ...parsed,
        ...(verified.role === "customer" ? { customer_id: verified.id } : {}),
      };
      // A customer can never list or discover draft invoices, including
      // cancelled drafts that were never issued.
      if (verified.role === "customer" && parsed.status === "draft") {
        return { items: [], next_cursor: null };
      }
      const page = await bindings.readInvoices(verified, scoped);
      return {
        items: page.items
          .filter(item => readable(verified, item))
          .map(summaryDTO),
        next_cursor: page.next_cursor,
      };
    },

    async getInvoice(actor: Actor, id: string): Promise<InvoiceDTO> {
      const verified = await current(actor);
      return readInvoiceFor(verified, id);
    },

    async generateNextInvoice(actor: Actor, input: GenerateInvoiceInput): Promise<InvoiceDTO> {
      const verified = await staff(actor);
      const parsed = parseGenerateInput(input);
      const invoiceId = await bindings.generateNextInvoiceTransaction({ p_subscription_id: parsed.subscription_id });
      if (invoiceId === null) {
        throw new AppError("NOT_DUE", "No invoice is due for this subscription.");
      }
      const row = await bindings.readInvoice(verified, parseId(invoiceId));
      if (!row) internal("Generated invoice could not be read.");
      return invoiceDTO(row);
    },

    async confirmInvoice(actor: Actor, id: string, input: Mutation): Promise<InvoiceDTO> {
      const verified = await staff(actor);
      const invoiceId = parseId(id);
      const expectedVersion = parseExpectedVersion(input.expected_version);
      // Read for a safe preflight and to obtain the billing-contact owner. The
      // RPC still locks and rechecks status/version/totals/discount atomically.
      const currentInvoice = await readInvoiceFor(verified, invoiceId);
      if (currentInvoice.status !== "draft") {
        throw new AppError("INVALID_TRANSITION", "Only draft invoices can be confirmed.");
      }
      const customerSnapshot = safeContact(await bindings.getBillingContact(verified, currentInvoice.customer_id));
      const result = await bindings.confirmInvoiceTransaction({
        p_actor_id: verified.id,
        p_invoice_id: invoiceId,
        p_expected_version: expectedVersion,
        p_customer_snapshot: customerSnapshot,
      });
      return invoiceDTO(result);
    },

    async cancelInvoice(actor: Actor, id: string, input: Mutation): Promise<InvoiceDTO> {
      const verified = await staff(actor);
      const result = await bindings.cancelInvoiceTransaction({
        p_actor_id: verified.id,
        p_invoice_id: parseId(id),
        p_expected_version: parseExpectedVersion(input.expected_version),
      });
      return invoiceDTO(result);
    },

    /**
     * Delivery is explicitly unavailable. There is intentionally no route and
     * no sent_at write until a real delivery integration exists.
     */
    async sendInvoice(actor: Actor, id: string, input: Mutation): Promise<SendInvoiceResult> {
      void id;
      void input;
      await staff(actor);
      throw new AppError("INVALID_TRANSITION", SEND_UNAVAILABLE_MESSAGE);
    },

    async renderInvoice(actor: Actor, id: string): Promise<string> {
      const verified = await current(actor);
      return renderInvoiceHtml(await readInvoiceFor(verified, id));
    },

    async listPayments(actor: Actor, query: PaymentQuery = {}): Promise<Page<PaymentDTO>> {
      const verified = await current(actor);
      const parsed = parsePaymentQuery(query);
      const scoped: PaymentQuery = {
        ...parsed,
        ...(verified.role === "customer" ? { customer_id: verified.id } : {}),
      };
      const page = await bindings.readPayments(verified, scoped);
      return {
        items: page.items
          .filter(item => verified.role !== "customer" || item.customer_id === verified.id)
          .map(paymentDTO),
        next_cursor: page.next_cursor,
      };
    },

    async recordPayment(
      actor: Actor,
      invoiceId: string,
      input: RecordPaymentInput & Mutation & Creation,
    ): Promise<{ payment: PaymentDTO; invoice: InvoiceSummaryDTO }> {
      const verified = await staff(actor);
      const id = parseId(invoiceId);
      const { expected_version, request_key, ...rawInput } = input;
      const customerInput = parseRecordPaymentInput(rawInput);
      const expectedVersion = parseExpectedVersion(expected_version);
      const requestKey = parseId(request_key, "request_key");

      // Do not preflight outstanding balance: a retry of an earlier partial
      // receipt must reach the RPC's idempotency lookup before any version or
      // balance rejection. The RPC locks the invoice and rechecks everything.
      const invoice = await bindings.readInvoice(verified, id);
      if (!invoice) throw new AppError("NOT_FOUND", "Invoice not found.");
      if (invoice.status === "draft" || invoice.status === "cancelled") {
        throw new AppError("INVALID_TRANSITION", "Payments can only be recorded on confirmed invoices.");
      }
      if (customerInput.currency !== invoice.currency) {
        throw new AppError("VALIDATION_ERROR", "Payment currency must match the invoice currency.");
      }

      const fingerprint = fingerprintRequest("record_payment", id, customerInput);
      const result = await bindings.recordPaymentTransaction({
        p_actor_id: verified.id,
        p_invoice_id: id,
        p_expected_version: expectedVersion,
        p_request_key: requestKey,
        p_input: customerInput,
        p_request_fingerprint: fingerprint,
      });
      return { payment: paymentDTO(result.payment), invoice: summaryDTO(result.invoice) };
    },

    async getReport(actor: Actor, query: SummaryQuery): Promise<ReportDTO> {
      const verified = await staff(actor);
      const parsed = parseSummaryQuery(query);
      return validateReport(await bindings.readReport(verified, parsed));
    },

    /**
     * Scheduler entry point. D1's job verifier is the ONLY source of jobActor;
     * this service does not read cookies, Authorization headers or env directly.
     */
    async runBilling(jobActor: Actor, input: BillingRunInput = {}): Promise<BillingRunResult> {
      if (!jobActor || !UUID_RE.test(jobActor.id) || !STAFF.has(jobActor.role)) {
        throw new AppError("FORBIDDEN", "A verified billing job actor is required.");
      }
      const { limit } = parseBillingRunInput(input);
      const ids = Array.from(new Set(await bindings.listDueSubscriptionIds(limit))).filter(id => UUID_RE.test(id));
      let processed = 0;
      let failed = 0;
      for (const subscriptionId of ids) {
        try {
          await bindings.generateNextInvoiceTransaction({ p_subscription_id: subscriptionId });
          processed += 1;
        } catch (error) {
          failed += 1;
          const code =
            error instanceof AppError &&
            (error.code === "NOT_DUE" ||
              error.code === "NOT_FOUND" ||
              error.code === "FORBIDDEN" ||
              error.code === "INTERNAL_ERROR")
              ? error.code
              : "INTERNAL_ERROR";
          bindings.logBillingFailure?.(subscriptionId, code);
        }
      }
      const hasMore = bindings.hasMoreDueSubscriptions
        ? await bindings.hasMoreDueSubscriptions()
        : ids.length === limit;
      return { processed, failed, has_more: hasMore };
    },
  };
}

export type BillingServices = ReturnType<typeof bindBillingServices>;

/** Narrow helpers exported for route/UI preflight only; not persistence. */
export const billingReadOnlyHelpers = {
  assertCurrency,
  invoiceVisibleToCustomer,
} as const;

/** Keep PageQuery referenced for public type compatibility with D1 lists. */
export type BillingPageQuery = PageQuery;

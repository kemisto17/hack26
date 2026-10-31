/**
 * D4 HTTP adapters for the documented invoice, payment and report routes.
 *
 * The route files stay thin: D1 composes `createBillingHttpHandlers` with the
 * verified `requireActor` and the exact-Origin mutation guard, then re-exports
 * the relevant method. Keeping the transport logic here makes the Origin,
 * If-Match, Idempotency-Key and error boundaries testable without mounting a
 * live route or bypassing D1's authentication.
 *
 * No handler is mounted by this module, and no handler is allowed to accept an
 * actor, role, price, total or payment confirmation from the request body.
 * The server services below re-verify the actor and recheck every invariant.
 */
import "server-only";
import type { Actor } from "@/lib/api/contracts";
import { AppError } from "@/lib/api/errors";
import { errorResponse, successResponse } from "@/lib/api/response";
import { expectedVersion, jsonBody, strictObject, uuid } from "@/lib/api/validation";
import type {
  GenerateInvoiceInput,
  InvoiceQuery,
  InvoiceStatus,
  PaymentQuery,
  PaymentMethod,
  RecordPaymentInput,
  SummaryQuery,
} from "./contracts";
import {
  INVOICE_STATUSES,
  PAYMENT_METHODS,
} from "./contracts";
import type { BillingServices } from "./service";

export type BillingHttpDependencies = {
  /** Services bound per request by D1's composition layer. */
  services: BillingServices;
  /** D1: verified Auth user plus the current active `public.users` role. */
  requireActor(): Promise<Actor>;
  /**
   * D1: reject a cookie mutation whose exact Origin is not the app origin.
   * Injected so D4 never guesses the environment or accepts a browser origin.
   */
  assertMutationOrigin(request: Request): void;
};

type RouteContext = { params: Promise<{ id: string }> };

/** The print view is self-contained; scripts, frames and form posts are denied. */
const PRINT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const INVOICE_QUERY_KEYS = ["limit", "cursor", "status", "customer_id", "overdue"] as const;
const PAYMENT_QUERY_KEYS = ["limit", "cursor", "customer_id", "invoice_id", "from", "to"] as const;
const SUMMARY_QUERY_KEYS = ["from", "to", "customer_id", "status", "currency"] as const;

function invalid(message = "Invalid request."): never {
  throw new AppError("VALIDATION_ERROR", message);
}

/** Keep a safe, PII-free failure log without leaking SQL, values or headers. */
function logFailure(action: string, error: unknown): void {
  const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
  console.warn(JSON.stringify({ scope: "billing.http", action, outcome: code }));
}

async function respond(action: string, operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    logFailure(action, error);
    return errorResponse(error);
  }
}

function requireMethod(request: Request, method: "GET" | "POST"): void {
  if (request.method !== method) throw new AppError("NOT_FOUND", "Not found.");
}

function query(request: Request, allowed: readonly string[]): URLSearchParams {
  const params = new URL(request.url).searchParams;
  for (const key of new Set(params.keys())) {
    if (!allowed.includes(key)) invalid(`Unknown query parameter: ${key}.`);
    if (params.getAll(key).length !== 1) invalid(`Repeated query parameter: ${key}.`);
  }
  return params;
}

function textParam(params: URLSearchParams, key: string): string | undefined {
  if (!params.has(key)) return undefined;
  const value = params.get(key);
  if (value === null || value.length === 0) invalid(`${key} must not be empty.`);
  return value;
}

function limitParam(params: URLSearchParams): number | undefined {
  const raw = textParam(params, "limit");
  if (raw === undefined) return undefined;
  if (!/^[1-9]\d{0,2}$/.test(raw)) invalid("limit must be an integer from 1 to 100.");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    invalid("limit must be an integer from 1 to 100.");
  }
  return value;
}

function booleanParam(params: URLSearchParams, key: string): boolean | undefined {
  const raw = textParam(params, key);
  if (raw === undefined) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return invalid(`${key} must be true or false.`);
}

function statusParam(params: URLSearchParams): InvoiceStatus | undefined {
  const raw = textParam(params, "status");
  if (raw === undefined) return undefined;
  if (!INVOICE_STATUSES.includes(raw as InvoiceStatus)) invalid("Invalid invoice status.");
  return raw as InvoiceStatus;
}

function invoiceQuery(request: Request): InvoiceQuery {
  const params = query(request, INVOICE_QUERY_KEYS);
  const limit = limitParam(params);
  const cursor = textParam(params, "cursor");
  const invoiceStatus = statusParam(params);
  const customerId = textParam(params, "customer_id");
  const overdue = booleanParam(params, "overdue");
  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(invoiceStatus !== undefined ? { status: invoiceStatus } : {}),
    ...(customerId !== undefined ? { customer_id: customerId } : {}),
    ...(overdue !== undefined ? { overdue } : {}),
  };
}

function paymentQuery(request: Request): PaymentQuery {
  const params = query(request, PAYMENT_QUERY_KEYS);
  const limit = limitParam(params);
  const cursor = textParam(params, "cursor");
  const customerId = textParam(params, "customer_id");
  const invoiceId = textParam(params, "invoice_id");
  const from = textParam(params, "from");
  const to = textParam(params, "to");
  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(customerId !== undefined ? { customer_id: customerId } : {}),
    ...(invoiceId !== undefined ? { invoice_id: invoiceId } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
  };
}

function summaryQuery(request: Request): SummaryQuery {
  const params = query(request, SUMMARY_QUERY_KEYS);
  const from = textParam(params, "from");
  const to = textParam(params, "to");
  if (from === undefined || to === undefined) invalid("from and to are required.");
  const customerId = textParam(params, "customer_id");
  const invoiceStatus = statusParam(params);
  const currency = textParam(params, "currency");
  return {
    from,
    to,
    ...(customerId !== undefined ? { customer_id: customerId } : {}),
    ...(invoiceStatus !== undefined ? { status: invoiceStatus } : {}),
    ...(currency !== undefined ? { currency } : {}),
  };
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

async function emptyBody(request: Request): Promise<void> {
  strictObject(await jsonBody(request), []);
}

function generateInput(body: unknown): GenerateInvoiceInput {
  const value = strictObject(body, ["subscription_id"]);
  return value as unknown as GenerateInvoiceInput;
}

function paymentInput(body: unknown): RecordPaymentInput {
  const value = objectBody(body);
  // The service repeats strict key validation and canonical money checks; this
  // guard only ensures the transport carries a JSON object, never row fields.
  if (typeof value.method === "string" && !PAYMENT_METHODS.includes(value.method as PaymentMethod)) {
    invalid("Invalid payment method.");
  }
  return value as unknown as RecordPaymentInput;
}

function idempotencyKey(headers: Headers): string {
  const value = headers.get("idempotency-key");
  if (!value) throw new AppError("PRECONDITION_REQUIRED", "Idempotency-Key is required.");
  return uuid(value);
}

async function pathId(context: RouteContext): Promise<string> {
  const params = await context.params;
  if (!params || typeof params.id !== "string" || params.id.length === 0) {
    throw new AppError("NOT_FOUND", "Not found.");
  }
  return params.id;
}

/**
 * Handler factories. Mount each method from a thin route file after D1 lands the
 * shared identity layer and the transactional RPCs; no route may be registered
 * against a missing binding.
 */
export function createBillingHttpHandlers(deps: BillingHttpDependencies) {
  const { services } = deps;

  return {
    /** GET /api/v1/invoices */
    listInvoices(request: Request): Promise<Response> {
      return respond("invoices.list", async () => {
        requireMethod(request, "GET");
        const actor = await deps.requireActor();
        const page = await services.listInvoices(actor, invoiceQuery(request));
        return successResponse(page.items, { next_cursor: page.next_cursor });
      });
    },

    /** GET /api/v1/invoices/:id */
    getInvoice(request: Request, context: RouteContext): Promise<Response> {
      return respond("invoices.get", async () => {
        requireMethod(request, "GET");
        const actor = await deps.requireActor();
        const invoice = await services.getInvoice(actor, await pathId(context));
        return successResponse(invoice, { version: invoice.version });
      });
    },

    /** POST /api/v1/invoices/generate */
    generateInvoice(request: Request): Promise<Response> {
      return respond("invoices.generate", async () => {
        requireMethod(request, "POST");
        deps.assertMutationOrigin(request);
        const actor = await deps.requireActor();
        const invoice = await services.generateNextInvoice(actor, generateInput(await jsonBody(request)));
        return successResponse(invoice, { version: invoice.version });
      });
    },

    /** POST /api/v1/invoices/:id/confirm */
    confirmInvoice(request: Request, context: RouteContext): Promise<Response> {
      return respond("invoices.confirm", async () => {
        requireMethod(request, "POST");
        deps.assertMutationOrigin(request);
        const actor = await deps.requireActor();
        const expected_version = expectedVersion(request.headers);
        await emptyBody(request);
        const invoice = await services.confirmInvoice(actor, await pathId(context), { expected_version });
        return successResponse(invoice, { version: invoice.version });
      });
    },

    /** POST /api/v1/invoices/:id/cancel */
    cancelInvoice(request: Request, context: RouteContext): Promise<Response> {
      return respond("invoices.cancel", async () => {
        requireMethod(request, "POST");
        deps.assertMutationOrigin(request);
        const actor = await deps.requireActor();
        const expected_version = expectedVersion(request.headers);
        await emptyBody(request);
        const invoice = await services.cancelInvoice(actor, await pathId(context), { expected_version });
        return successResponse(invoice, { version: invoice.version });
      });
    },

    /** POST /api/v1/invoices/:id/payments */
    recordPayment(request: Request, context: RouteContext): Promise<Response> {
      return respond("invoices.payments.create", async () => {
        requireMethod(request, "POST");
        deps.assertMutationOrigin(request);
        const actor = await deps.requireActor();
        const expected_version = expectedVersion(request.headers);
        const request_key = idempotencyKey(request.headers);
        const result = await services.recordPayment(actor, await pathId(context), {
          ...paymentInput(await jsonBody(request)),
          expected_version,
          request_key,
        });
        // The receipt is a new append-only row; the returned invoice carries the
        // current aggregate version for the next If-Match.
        return successResponse(result, { status: 201, version: result.invoice.version });
      });
    },

    /** GET /api/v1/invoices/:id/print */
    renderInvoice(request: Request, context: RouteContext): Promise<Response> {
      return respond("invoices.print", async () => {
        requireMethod(request, "GET");
        const actor = await deps.requireActor();
        const html = await services.renderInvoice(actor, await pathId(context));
        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": PRINT_CSP,
            "Cache-Control": "private, no-store",
          },
        });
      });
    },

    /** GET /api/v1/payments */
    listPayments(request: Request): Promise<Response> {
      return respond("payments.list", async () => {
        requireMethod(request, "GET");
        const actor = await deps.requireActor();
        const page = await services.listPayments(actor, paymentQuery(request));
        return successResponse(page.items, { next_cursor: page.next_cursor });
      });
    },

    /** GET /api/v1/reports/summary */
    getReport(request: Request): Promise<Response> {
      return respond("reports.summary", async () => {
        requireMethod(request, "GET");
        const actor = await deps.requireActor();
        const report = await services.getReport(actor, summaryQuery(request));
        return successResponse(report);
      });
    },
  };
}

export type BillingHttpHandlers = ReturnType<typeof createBillingHttpHandlers>;

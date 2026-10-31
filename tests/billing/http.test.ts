import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/api/contracts";
import { AppError } from "@/lib/api/errors";
import { createBillingHttpHandlers } from "@/modules/billing/http";
import { bindBillingServices, type BillingBindings } from "@/modules/billing/service";
import {
  IDS,
  customerA,
  customerB,
  makeBindings,
  makeInvoice,
  makePayment,
  makeSummary,
  staff,
} from "./fixtures";

const APP_ORIGIN = "https://app.example.test";

function setup(overrides: Partial<BillingBindings> = {}, actor: Actor = staff) {
  const bindings = makeBindings({ requireActor: async () => actor, ...overrides });
  const services = bindBillingServices(bindings);
  const assertMutationOrigin = vi.fn();
  const http = createBillingHttpHandlers({
    services,
    requireActor: () => bindings.requireActor(),
    assertMutationOrigin,
  });
  return { http, bindings, assertMutationOrigin };
}

function request(
  method: "GET" | "POST",
  path: string,
  options: { headers?: Record<string, string>; body?: unknown } = {},
): Request {
  const hasBody = options.body !== undefined;
  return new Request(`${APP_ORIGIN}${path}`, {
    method,
    headers: {
      origin: APP_ORIGIN,
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
  });
}

const context = { params: Promise.resolve({ id: IDS.invoice }) };

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("GET /invoices", () => {
  it("returns the page items and cursor with a no-store envelope", async () => {
    const readInvoices = vi.fn(async () => ({ items: [makeSummary()], next_cursor: "next-1" }));
    const { http, assertMutationOrigin } = setup({ readInvoices });

    const response = await http.listInvoices(
      request("GET", "/api/v1/invoices?limit=10&status=confirmed&overdue=true"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await body(response)).toMatchObject({
      data: [{ id: IDS.invoice, status: "confirmed", total_minor: "10800" }],
      page: { next_cursor: "next-1" },
    });
    expect(readInvoices).toHaveBeenCalledWith(staff, { limit: 10, status: "confirmed", overdue: true });
    expect(assertMutationOrigin).not.toHaveBeenCalled();
  });

  it("scopes a customer to the verified actor even when another customer_id is supplied", async () => {
    const readInvoices = vi.fn(async () => ({ items: [makeSummary()], next_cursor: null }));
    const { http } = setup({ readInvoices }, customerA);

    await http.listInvoices(
      request("GET", `/api/v1/invoices?customer_id=${customerB.id}&status=paid`),
    );

    expect(readInvoices).toHaveBeenCalledWith(customerA, {
      limit: 25,
      status: "paid",
      customer_id: customerA.id,
    });
  });

  it.each([
    "/api/v1/invoices?unknown=1",
    "/api/v1/invoices?limit=0",
    "/api/v1/invoices?limit=101",
    "/api/v1/invoices?limit=ten",
    "/api/v1/invoices?limit=10&limit=11",
    "/api/v1/invoices?cursor=",
    "/api/v1/invoices?overdue=yes",
    "/api/v1/invoices?status=open",
    "/api/v1/invoices?customer_id=not-a-uuid",
  ])("rejects invalid query %s", async path => {
    const readInvoices = vi.fn(async () => ({ items: [], next_cursor: null }));
    const { http, assertMutationOrigin } = setup({ readInvoices });

    const response = await http.listInvoices(request("GET", path));

    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(readInvoices).not.toHaveBeenCalled();
    expect(assertMutationOrigin).not.toHaveBeenCalled();
  });
});

describe("GET /invoices/:id", () => {
  it("returns an ETag and the safe invoice snapshot", async () => {
    const { http } = setup();
    const response = await http.getInvoice(request("GET", `/api/v1/invoices/${IDS.invoice}`), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"2"');
    expect(await body(response)).toMatchObject({
      data: { id: IDS.invoice, customer_snapshot: { email: "ada@example.test" } },
    });
  });

  it("hides another customer's invoice behind 404", async () => {
    const { http } = setup({ readInvoice: async () => makeInvoice({ customer_id: customerB.id }) }, customerA);
    const response = await http.getInvoice(request("GET", `/api/v1/invoices/${IDS.invoice}`), context);

    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});

describe("invoice mutations", () => {
  it("requires the exact Origin on every mutation before reading the body", async () => {
    const assertMutationOrigin = vi.fn(() => {
      throw new AppError("FORBIDDEN", "Request origin is not allowed.");
    });
    const guarded = createBillingHttpHandlers({
      services: bindBillingServices(makeBindings()),
      requireActor: async () => staff,
      assertMutationOrigin,
    });

    const response = await guarded.generateInvoice(
      request("POST", "/api/v1/invoices/generate", { body: { subscription_id: IDS.subscription } }),
    );

    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(assertMutationOrigin).toHaveBeenCalledTimes(1);
  });

  it("generates the next due invoice and returns its current version", async () => {
    const { http, assertMutationOrigin } = setup();
    const response = await http.generateInvoice(
      request("POST", "/api/v1/invoices/generate", { body: { subscription_id: IDS.subscription } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"2"');
    expect(await body(response)).toMatchObject({ data: { id: IDS.invoice } });
    expect(assertMutationOrigin).toHaveBeenCalledTimes(1);
  });

  it("rejects a generate body with unknown keys or a missing subscription", async () => {
    const { http } = setup();
    for (const bodyValue of [{}, { subscription_id: IDS.subscription, price_minor: "1" }]) {
      const response = await http.generateInvoice(
        request("POST", "/api/v1/invoices/generate", { body: bodyValue }),
      );
      expect(response.status).toBe(400);
      expect(await body(response)).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    }
  });

  it("requires If-Match and an empty JSON object for confirmation", async () => {
    const { http } = setup();
    const noHeader = await http.confirmInvoice(
      request("POST", `/api/v1/invoices/${IDS.invoice}/confirm`, { body: {} }),
      context,
    );
    expect(noHeader.status).toBe(428);
    expect(await body(noHeader)).toMatchObject({ error: { code: "PRECONDITION_REQUIRED" } });

    const extraBody = await http.confirmInvoice(
      request("POST", `/api/v1/invoices/${IDS.invoice}/confirm`, {
        headers: { "if-match": '"2"' },
        body: { total_minor: "0" },
      }),
      context,
    );
    expect(extraBody.status).toBe(400);
    expect(await body(extraBody)).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("confirms with the verified billing contact and the exact expected version", async () => {
    const getBillingContact = vi.fn(async () => ({ display_name: "Ada Lovelace", email: "ada@example.test" }));
    const confirmInvoiceTransaction = vi.fn(async () => makeInvoice({ status: "confirmed", version: "3" }));
    const { http } = setup({
      getBillingContact,
      confirmInvoiceTransaction,
      readInvoice: async () => makeInvoice({ status: "draft", issued_at: null, customer_snapshot: null }),
    });

    const response = await http.confirmInvoice(
      request("POST", `/api/v1/invoices/${IDS.invoice}/confirm`, {
        headers: { "if-match": '"2"' },
        body: {},
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"3"');
    expect(confirmInvoiceTransaction).toHaveBeenCalledWith({
      p_actor_id: staff.id,
      p_invoice_id: IDS.invoice,
      p_expected_version: "2",
      p_customer_snapshot: { display_name: "Ada Lovelace", email: "ada@example.test" },
    });
  });

  it("cancels through the transactional binding only", async () => {
    const cancelInvoiceTransaction = vi.fn(async () => makeInvoice({ status: "cancelled" }));
    const { http } = setup({ cancelInvoiceTransaction });

    const response = await http.cancelInvoice(
      request("POST", `/api/v1/invoices/${IDS.invoice}/cancel`, {
        headers: { "if-match": '"2"' },
        body: {},
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(cancelInvoiceTransaction).toHaveBeenCalledWith({
      p_actor_id: staff.id,
      p_invoice_id: IDS.invoice,
      p_expected_version: "2",
    });
  });
});

describe("POST /invoices/:id/payments", () => {
  const validBody = {
    amount_minor: "4000",
    currency: "USD",
    method: "bank_transfer",
    paid_at: "2026-01-15T12:00:00.000Z",
    note: "Receipt 123",
  };

  it("requires both If-Match and an Idempotency-Key UUID", async () => {
    const { http } = setup();
    const noVersion = await http.recordPayment(
      request("POST", `/api/v1/invoices/${IDS.invoice}/payments`, {
        headers: { "idempotency-key": IDS.requestKey },
        body: validBody,
      }),
      context,
    );
    expect(noVersion.status).toBe(428);
    expect(await body(noVersion)).toMatchObject({ error: { code: "PRECONDITION_REQUIRED" } });

    const noKey = await http.recordPayment(
      request("POST", `/api/v1/invoices/${IDS.invoice}/payments`, {
        headers: { "if-match": '"2"' },
        body: validBody,
      }),
      context,
    );
    expect(noKey.status).toBe(428);
    expect(await body(noKey)).toMatchObject({ error: { code: "PRECONDITION_REQUIRED" } });

    const badKey = await http.recordPayment(
      request("POST", `/api/v1/invoices/${IDS.invoice}/payments`, {
        headers: { "if-match": '"2"', "idempotency-key": "not-a-uuid" },
        body: validBody,
      }),
      context,
    );
    expect(badKey.status).toBe(400);
    expect(await body(badKey)).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 201 with a canonical hashed fingerprint and the invoice version", async () => {
    const recordPaymentTransaction = vi.fn(
      async (args: Parameters<BillingBindings["recordPaymentTransaction"]>[0]) => {
        void args;
        return {
          payment: makePayment(),
          invoice: makeSummary(makeInvoice({ paid_minor: "4000", outstanding_minor: "6800", version: "4" })),
        };
      },
    );
    const { http } = setup({ recordPaymentTransaction });

    const response = await http.recordPayment(
      request("POST", `/api/v1/invoices/${IDS.invoice}/payments`, {
        headers: { "if-match": '"2"', "idempotency-key": IDS.requestKey },
        body: validBody,
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("etag")).toBe('"4"');
    const parsed = await body(response);
    expect(parsed).toMatchObject({
      data: {
        payment: { id: IDS.payment, amount_minor: "4000" },
        invoice: { paid_minor: "4000", outstanding_minor: "6800" },
      },
    });
    const call = recordPaymentTransaction.mock.calls[0]![0];
    expect(call).toMatchObject({
      p_actor_id: staff.id,
      p_invoice_id: IDS.invoice,
      p_expected_version: "2",
      p_request_key: IDS.requestKey,
      p_input: { amount_minor: "4000", currency: "USD", method: "bank_transfer" },
    });
    expect(call.p_request_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects browser-supplied money/actor/state fields and future receipts", async () => {
    const recordPaymentTransaction = vi.fn(async () => ({
      payment: makePayment(),
      invoice: makeSummary(makeInvoice()),
    }));
    const { http } = setup({ recordPaymentTransaction });
    const extra = await http.recordPayment(
      request("POST", `/api/v1/invoices/${IDS.invoice}/payments`, {
        headers: { "if-match": '"2"', "idempotency-key": IDS.requestKey },
        body: { ...validBody, actor_id: IDS.admin, total_minor: "0" },
      }),
      context,
    );
    expect(extra.status).toBe(400);
    expect(await body(extra)).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const future = await http.recordPayment(
      request("POST", `/api/v1/invoices/${IDS.invoice}/payments`, {
        headers: { "if-match": '"2"', "idempotency-key": IDS.requestKey },
        body: { ...validBody, paid_at: "2999-01-01T00:00:00.000Z" },
      }),
      context,
    );
    expect(future.status).toBe(400);
    expect(await body(future)).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    expect(recordPaymentTransaction).not.toHaveBeenCalled();
  });
});

describe("GET /invoices/:id/print", () => {
  it("returns escaped HTML with a strict CSP and no-store", async () => {
    const { http } = setup();
    const response = await http.renderInvoice(
      request("GET", `/api/v1/invoices/${IDS.invoice}/print`),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toContain("INV-");
  });
});

describe("GET /payments and /reports/summary", () => {
  it("canonicalizes payment filters and scopes a customer to self", async () => {
    const readPayments = vi.fn(async () => ({ items: [makePayment()], next_cursor: null }));
    const { http } = setup({ readPayments }, customerA);

    const response = await http.listPayments(
      request(
        "GET",
        `/api/v1/payments?invoice_id=${IDS.invoice}&customer_id=${customerB.id}&from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z`,
      ),
    );

    expect(response.status).toBe(200);
    expect(readPayments).toHaveBeenCalledWith(customerA, {
      limit: 25,
      invoice_id: IDS.invoice,
      customer_id: customerA.id,
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
    });
    expect(await body(response)).toMatchObject({ data: [{ id: IDS.payment }] });
  });

  it("requires both report bounds and returns independent currency buckets", async () => {
    const { http } = setup();
    const missing = await http.getReport(request("GET", "/api/v1/reports/summary?from=2026-01-01T00:00:00Z"));
    expect(missing.status).toBe(400);
    expect(await body(missing)).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const response = await http.getReport(
      request("GET", "/api/v1/reports/summary?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z&currency=USD"),
    );
    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      data: { currencies: [{ currency: "USD" }, { currency: "EUR" }] },
    });
  });

  it("rejects malformed report ranges and unknown filters", async () => {
    const { http } = setup();
    for (const path of [
      "/api/v1/reports/summary?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z",
      "/api/v1/reports/summary?from=yesterday&to=2026-02-01T00:00:00Z",
      "/api/v1/reports/summary?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z&actor_id=x",
      "/api/v1/reports/summary?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z&currency=usd",
    ]) {
      const response = await http.getReport(request("GET", path));
      expect(response.status).toBe(400);
      expect(await body(response)).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    }
  });
});

describe("transport error boundary", () => {
  it("never leaks a raw binding error or SQL detail", async () => {
    const { http } = setup({
      readInvoice: async () => {
        throw new Error("postgres detail: password=secret");
      },
    });

    const response = await http.getInvoice(request("GET", `/api/v1/invoices/${IDS.invoice}`), context);
    const parsed = await body(response);

    expect(response.status).toBe(500);
    expect(parsed).toMatchObject({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } });
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });

  it("rejects the wrong method with 404", async () => {
    const { http } = setup();
    const response = await http.generateInvoice(request("GET", "/api/v1/invoices/generate"));
    expect(response.status).toBe(404);
  });

  it("uses only the verified actor role for staff-only actions", async () => {
    const { http } = setup({}, customerA);
    const response = await http.generateInvoice(
      request("POST", "/api/v1/invoices/generate", { body: { subscription_id: IDS.subscription } }),
    );
    expect(response.status).toBe(403);
  });
});

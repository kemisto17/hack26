import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";
import { fingerprintRequest } from "@/lib/api/idempotency";
import { bindBillingServices, billingReadOnlyHelpers } from "@/modules/billing/service";
import { SEND_UNAVAILABLE_MESSAGE } from "@/modules/billing/contracts";
import {
  IDS,
  admin,
  contact,
  customerA,
  customerB,
  makeBindings,
  makeInvoice,
  makePayment,
  makeReport,
  makeSummary,
  staff,
} from "./fixtures";

function bind(overrides: Parameters<typeof makeBindings>[0] = {}) {
  return bindBillingServices(makeBindings(overrides));
}

describe("session verification", () => {
  it("rejects actor mismatches and uses the freshly verified role", async () => {
    const services = bind({ requireActor: async () => staff });
    await expect(services.getInvoice({ ...staff, id: customerA.id }, IDS.invoice)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const downgraded = bind({ requireActor: async () => customerA, readInvoice: async () => makeInvoice() });
    const forgedAdmin = { id: customerA.id, role: "admin" as const };
    await expect(downgraded.generateNextInvoice(forgedAdmin, { subscription_id: IDS.subscription })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(downgraded.recordPayment(forgedAdmin, IDS.invoice, {
      amount_minor: "1",
      currency: "USD",
      method: "cash",
      paid_at: "2026-10-30T00:00:00.000Z",
      expected_version: "2",
      request_key: IDS.requestKey,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("invoice reads", () => {
  it("scopes a customer list to self, hides drafts and keeps staff filters", async () => {
    const readInvoices = vi.fn(async () => ({
      items: [
        makeSummary(makeInvoice()),
        makeSummary(makeInvoice({ id: IDS.otherInvoice, status: "draft", issued_at: null })),
      ],
      next_cursor: "next",
    }));
    const services = bind({ requireActor: async () => customerA, readInvoices });
    const page = await services.listInvoices(customerA, { customer_id: customerB.id, status: "confirmed" });
    expect(readInvoices).toHaveBeenCalledWith(customerA, { limit: 25, status: "confirmed", customer_id: customerA.id });
    expect(page.items).toHaveLength(1);
    expect(page.next_cursor).toBe("next");

    const empty = await services.listInvoices(customerA, { status: "draft" });
    expect(empty).toEqual({ items: [], next_cursor: null });
    expect(readInvoices).toHaveBeenCalledTimes(1);

    const staffRead = vi.fn(async () => ({ items: [makeSummary()], next_cursor: null }));
    const staffServices = bind({ readInvoices: staffRead });
    await staffServices.listInvoices(staff, { customer_id: customerB.id, limit: 10 });
    expect(staffRead).toHaveBeenCalledWith(staff, { limit: 10, customer_id: customerB.id });
  });

  it("returns only issued invoices to their owner", async () => {
    const mine = bind({ requireActor: async () => customerA, readInvoice: async () => makeInvoice() });
    await expect(mine.getInvoice(customerA, IDS.invoice)).resolves.toMatchObject({ id: IDS.invoice });

    const other = bind({ requireActor: async () => customerA, readInvoice: async () => makeInvoice({ customer_id: customerB.id }) });
    await expect(other.getInvoice(customerA, IDS.invoice)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const draft = bind({
      requireActor: async () => customerA,
      readInvoice: async () => makeInvoice({ status: "draft", issued_at: null }),
    });
    await expect(draft.getInvoice(customerA, IDS.invoice)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const missing = bind({ readInvoice: async () => null });
    await expect(missing.getInvoice(staff, IDS.invoice)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to expose an issued invoice without a frozen billing contact", async () => {
    const corrupt = bind({
      readInvoice: async () => makeInvoice({ customer_snapshot: null }),
    });
    await expect(corrupt.getInvoice(staff, IDS.invoice)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});

describe("invoice mutations", () => {
  it("generates one server-priced invoice for staff and reports not-due", async () => {
    const generate = vi.fn(async () => IDS.invoice);
    const services = bind({
      generateNextInvoiceTransaction: generate,
      readInvoice: async () => makeInvoice({ status: "draft", issued_at: null, customer_snapshot: null }),
    });
    const generated = await services.generateNextInvoice(staff, { subscription_id: IDS.subscription });
    expect(generated).toMatchObject({ id: IDS.invoice });
    // A draft has not frozen a billing contact yet; confirmation supplies it.
    expect(generated.customer_snapshot).toBeNull();
    expect(generate).toHaveBeenCalledWith({ p_subscription_id: IDS.subscription });

    const notDue = bind({ generateNextInvoiceTransaction: async () => null });
    await expect(notDue.generateNextInvoice(staff, { subscription_id: IDS.subscription })).rejects.toMatchObject({
      code: "NOT_DUE",
    });
    await expect(services.generateNextInvoice(customerA, { subscription_id: IDS.subscription })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("passes the frozen billing contact and expected version to confirmation", async () => {
    const confirm = vi.fn(async () => makeInvoice());
    const getContact = vi.fn(async () => ({ ...contact }));
    const services = bind({
      confirmInvoiceTransaction: confirm,
      getBillingContact: getContact,
      readInvoice: async () => makeInvoice({ status: "draft", issued_at: null }),
    });
    await services.confirmInvoice(staff, IDS.invoice, { expected_version: "2" });
    expect(getContact).toHaveBeenCalledWith(staff, IDS.customerA);
    expect(confirm).toHaveBeenCalledWith({
      p_actor_id: staff.id,
      p_invoice_id: IDS.invoice,
      p_expected_version: "2",
      p_customer_snapshot: contact,
    });

    const alreadyIssued = bind({ readInvoice: async () => makeInvoice() });
    await expect(alreadyIssued.confirmInvoice(staff, IDS.invoice, { expected_version: "2" })).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });

  it("cancels through the transaction and never fabricates delivery", async () => {
    const cancel = vi.fn(async () => makeInvoice({ status: "cancelled" }));
    const services = bind({ cancelInvoiceTransaction: cancel });
    await expect(services.cancelInvoice(staff, IDS.invoice, { expected_version: "3" })).resolves.toMatchObject({
      status: "cancelled",
    });
    expect(cancel).toHaveBeenCalledWith({
      p_actor_id: staff.id,
      p_invoice_id: IDS.invoice,
      p_expected_version: "3",
    });

    await expect(services.sendInvoice(staff, IDS.invoice, { expected_version: "3" })).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
      message: SEND_UNAVAILABLE_MESSAGE,
    });
    await expect(services.sendInvoice(customerA, IDS.invoice, { expected_version: "3" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("prints through the same visibility check", async () => {
    const services = bind({ readInvoice: async () => makeInvoice({ status: "draft", issued_at: null }) });
    await expect(services.renderInvoice(staff, IDS.invoice)).resolves.toContain("DRAFT");

    const customer = bind({
      requireActor: async () => customerA,
      readInvoice: async () => makeInvoice({ status: "draft", issued_at: null }),
    });
    await expect(customer.renderInvoice(customerA, IDS.invoice)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("payments", () => {
  it("lists only the customer's own receipts", async () => {
    const readPayments = vi.fn(async () => ({
      items: [makePayment(), makePayment({ id: IDS.otherInvoice, customer_id: customerB.id })],
      next_cursor: null,
    }));
    const services = bind({ requireActor: async () => customerA, readPayments });
    const page = await services.listPayments(customerA, { customer_id: customerB.id });
    expect(readPayments).toHaveBeenCalledWith(customerA, { limit: 25, customer_id: customerA.id });
    expect(page.items.map(item => item.id)).toEqual([IDS.payment]);

    const staffPage = bind({ readPayments });
    await staffPage.listPayments(staff, {});
    expect(readPayments).toHaveBeenLastCalledWith(staff, { limit: 25 });
  });

  it("calls the idempotent receipt RPC with canonical input and fingerprint", async () => {
    const record = vi.fn(async () => ({
      payment: makePayment(),
      invoice: makeSummary(makeInvoice({ paid_minor: "4000", outstanding_minor: "6800" })),
    }));
    const services = bind({ recordPaymentTransaction: record });
    await services.recordPayment(staff, IDS.invoice, {
      amount_minor: "005000",
      currency: "USD",
      method: "cash",
      paid_at: "2026-10-30T10:00:00Z",
      note: "  Cash receipt  ",
      expected_version: "2",
      request_key: IDS.requestKey.toUpperCase(),
    });
    const input = {
      amount_minor: "5000",
      currency: "USD",
      method: "cash",
      paid_at: "2026-10-30T10:00:00.000Z",
      note: "Cash receipt",
    };
    expect(record).toHaveBeenCalledWith({
      p_actor_id: staff.id,
      p_invoice_id: IDS.invoice,
      p_expected_version: "2",
      p_request_key: IDS.requestKey,
      p_input: input,
      p_request_fingerprint: fingerprintRequest("record_payment", IDS.invoice, input),
    });
  });

  it("lets the RPC decide overpayment after a retry-safe read", async () => {
    const exhausted = makeInvoice({ paid_minor: "10799", outstanding_minor: "1" });
    const record = vi.fn(async () => {
      throw new AppError("PAYMENT_EXCEEDS_BALANCE", "Payment exceeds the outstanding balance.");
    });
    const services = bind({ readInvoice: async () => exhausted, recordPaymentTransaction: record });
    await expect(services.recordPayment(staff, IDS.invoice, {
      amount_minor: "5000",
      currency: "USD",
      method: "cash",
      paid_at: "2026-10-30T10:00:00.000Z",
      expected_version: "2",
      request_key: IDS.requestKey,
    })).rejects.toMatchObject({ code: "PAYMENT_EXCEEDS_BALANCE" });
    expect(record).toHaveBeenCalledOnce();
  });

  it("rejects drafts, cancelled invoices, wrong currency and non-staff before the RPC", async () => {
    for (const invoice of [
      makeInvoice({ status: "draft", issued_at: null }),
      makeInvoice({ status: "cancelled" }),
    ]) {
      const record = vi.fn();
      const services = bind({ readInvoice: async () => invoice, recordPaymentTransaction: record as never });
      await expect(services.recordPayment(staff, IDS.invoice, {
        amount_minor: "100",
        currency: "USD",
        method: "cash",
        paid_at: "2026-10-30T10:00:00.000Z",
        expected_version: "2",
        request_key: IDS.requestKey,
      })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
      expect(record).not.toHaveBeenCalled();
    }

    const record = vi.fn();
    const wrongCurrency = bind({ recordPaymentTransaction: record as never });
    await expect(wrongCurrency.recordPayment(staff, IDS.invoice, {
      amount_minor: "100",
      currency: "EUR",
      method: "cash",
      paid_at: "2026-10-30T10:00:00.000Z",
      expected_version: "2",
      request_key: IDS.requestKey,
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(record).not.toHaveBeenCalled();

    const services = bind();
    await expect(services.recordPayment(customerA, IDS.invoice, {
      amount_minor: "100",
      currency: "USD",
      method: "cash",
      paid_at: "2026-10-30T10:00:00.000Z",
      expected_version: "2",
      request_key: IDS.requestKey,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("reports and billing runs", () => {
  it("keeps reports staff-only and validates the read projection", async () => {
    const services = bind();
    await expect(services.getReport(staff, { from: "2026-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z" })).resolves.toMatchObject({
      as_of: "2026-10-31T12:00:00.000Z",
      currencies: [{ currency: "USD" }, { currency: "EUR" }],
    });
    await expect(services.getReport(customerA, { from: "2026-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const corrupt = bind({ readReport: async () => makeReport({ active_subscriptions: -1 }) });
    await expect(corrupt.getReport(staff, { from: "2026-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z" })).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("runs a bounded batch, deduplicates IDs and records only safe failure codes", async () => {
    const list = vi.fn(async () => [IDS.subscription, IDS.subscription, "not-a-uuid", IDS.otherInvoice]);
    const generate = vi.fn(async ({ p_subscription_id }: { p_subscription_id: string }) => {
      if (p_subscription_id === IDS.otherInvoice) throw new AppError("NOT_DUE", "No invoice is due.");
      return IDS.invoice;
    });
    const log = vi.fn();
    const hasMore = vi.fn(async () => true);
    const services = bind({
      listDueSubscriptionIds: list,
      generateNextInvoiceTransaction: generate,
      logBillingFailure: log,
      hasMoreDueSubscriptions: hasMore,
    });
    await expect(services.runBilling(admin, { limit: 5 })).resolves.toEqual({ processed: 1, failed: 1, has_more: true });
    expect(list).toHaveBeenCalledWith(5);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(IDS.otherInvoice, "NOT_DUE");
    expect(hasMore).toHaveBeenCalledOnce();

    await expect(services.runBilling(customerA, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(services.runBilling(admin, { limit: 501 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("derives has_more from a full batch when the binding cannot answer", async () => {
    const services = bind({ listDueSubscriptionIds: async () => [IDS.subscription, IDS.otherInvoice] });
    await expect(services.runBilling(staff, { limit: 2 })).resolves.toMatchObject({ has_more: true });
    const short = bind({ listDueSubscriptionIds: async () => [IDS.subscription] });
    await expect(short.runBilling(staff, { limit: 2 })).resolves.toMatchObject({ has_more: false });
  });
});

describe("preflight helpers", () => {
  it("exports only safe read-only helpers", () => {
    expect(billingReadOnlyHelpers.invoiceVisibleToCustomer(makeInvoice({ status: "draft", issued_at: null }), customerA.id)).toBe(false);
    expect(billingReadOnlyHelpers.assertCurrency("USD")).toBe("USD");
  });
});

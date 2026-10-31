import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import type {
  BillingScheduleSnapshot,
  DiscountContext,
  DiscountSnapshot,
} from "@/modules/billing/contracts";
import {
  advancePeriod,
  assertCurrency,
  assertUuid,
  decidePayment,
  daysInUtcMonth,
  discountEligible,
  duePeriods,
  invoiceOverdue,
  invoiceVisibleToCustomer,
  isInvoiceStatus,
  normalizeInstant,
  parseInstant,
  parseMinor,
  planInvoicePeriod,
  utcDate,
  validateInvoice,
  validateReport,
} from "@/modules/billing/domain";
import { IDS, makeInvoice, makeLine, makeReport } from "./fixtures";

function makeSchedule(overrides: Partial<BillingScheduleSnapshot> = {}): BillingScheduleSnapshot {
  return {
    id: IDS.subscription,
    customer_id: IDS.customerA,
    currency: "USD",
    status: "active",
    start_at: "2026-01-01T00:00:00.000Z",
    expires_at: "2027-01-01T00:00:00.000Z",
    payment_terms_days: 30,
    billing_interval: "monthly",
    billing_anchor_at: "2026-01-01T00:00:00.000Z",
    next_billing_at: "2026-01-01T00:00:00.000Z",
    closed_at: null,
    ...overrides,
  };
}

function at(value: string): Date {
  return new Date(value);
}

const discount: DiscountSnapshot = {
  id: IDS.discount,
  is_active: true,
  starts_at: "2026-01-01T00:00:00.000Z",
  ends_at: "2026-12-31T00:00:00.000Z",
  max_uses: 2,
  uses: 0,
  currency: "USD",
  min_quantity: 1,
  min_subtotal_minor: "5000",
};

const discountContext: DiscountContext = {
  at: "2026-06-01T00:00:00.000Z",
  currency: "USD",
  subtotal_minor: "5000",
  eligible_quantity: 1,
};

describe("minor units and instants", () => {
  it("parses canonical nonnegative money without floating point", () => {
    expect(parseMinor("00012").toString()).toBe("12");
    expect(parseMinor("0", { allowZero: true }).toString()).toBe("0");
    expect(parseMinor("9000000000000000").toString()).toBe("9000000000000000");
    for (const value of ["", "1.5", "-1", " 1", 1, null, "9000000000000001"]) {
      expect(() => parseMinor(value)).toThrow(AppError);
    }
    expect(() => parseMinor("0")).toThrow(AppError);
  });

  it("accepts only real UTC instants and normalizes fractional seconds", () => {
    expect(normalizeInstant("2026-02-28T23:59:59Z")).toBe("2026-02-28T23:59:59.000Z");
    expect(normalizeInstant("2026-02-28T23:59:59.123456789Z")).toBe("2026-02-28T23:59:59.123Z");
    for (const value of [
      "2026-02-31T00:00:00Z",
      "2026-13-01T00:00:00Z",
      "2026-01-01T24:00:00Z",
      "2026-01-01T00:00:00+01:00",
      "2026-01-01",
      0,
      null,
    ]) {
      expect(() => parseInstant(value)).toThrow(AppError);
    }
    expect(utcDate("2026-01-01T23:59:59.999Z")).toBe("2026-01-01");
  });

  it("validates currencies, statuses and UUIDs", () => {
    expect(assertCurrency("USD")).toBe("USD");
    for (const value of ["usd", "US", "USDX", undefined]) expect(() => assertCurrency(value)).toThrow(AppError);
    expect(isInvoiceStatus("paid")).toBe(true);
    expect(isInvoiceStatus("refunded")).toBe(false);
    expect(assertUuid(IDS.customerA.toUpperCase(), "customer_id")).toBe(IDS.customerA);
    expect(() => assertUuid("not-a-uuid")).toThrow(AppError);
  });
});

describe("billing period anchor", () => {
  it("clamps monthly anchors at month end and returns to the anchor day", () => {
    const anchor = at("2026-01-31T10:15:00.123Z");
    const february = advancePeriod(anchor, "monthly", anchor);
    expect(february.toISOString()).toBe("2026-02-28T10:15:00.123Z");
    expect(advancePeriod(february, "monthly", anchor).toISOString()).toBe("2026-03-31T10:15:00.123Z");
    expect(daysInUtcMonth(2028, 1)).toBe(29);
  });

  it("keeps a leap-day yearly anchor and clamps common years", () => {
    const anchor = at("2024-02-29T08:00:00.000Z");
    const first = advancePeriod(anchor, "yearly", anchor);
    expect(first.toISOString()).toBe("2025-02-28T08:00:00.000Z");
    expect(advancePeriod(first, "yearly", anchor).toISOString()).toBe("2026-02-28T08:00:00.000Z");
    expect(advancePeriod(at("2027-02-28T08:00:00.000Z"), "yearly", anchor).toISOString()).toBe(
      "2028-02-29T08:00:00.000Z",
    );
  });

  it("advances daily and weekly intervals in fixed UTC durations", () => {
    const start = at("2026-12-31T23:00:00.000Z");
    expect(advancePeriod(start, "daily", start).toISOString()).toBe("2027-01-01T23:00:00.000Z");
    expect(advancePeriod(start, "weekly", start).toISOString()).toBe("2027-01-07T23:00:00.000Z");
  });

  it("rejects unknown intervals and non-advancing periods", () => {
    expect(() => advancePeriod(at("2026-01-01T00:00:00Z"), "hourly" as never, at("2026-01-01T00:00:00Z"))).toThrow(AppError);
  });
});

describe("due-period planning", () => {
  it("bills a period that started exactly now and clamps the final end to expiry", () => {
    const due = planInvoicePeriod(makeSchedule(), at("2026-01-01T00:00:00.000Z"));
    expect(due).toEqual({
      kind: "due",
      period_start: "2026-01-01T00:00:00.000Z",
      period_end: "2026-02-01T00:00:00.000Z",
    });
    const final = planInvoicePeriod(
      makeSchedule({ expires_at: "2026-02-15T00:00:00.000Z", next_billing_at: "2026-02-01T00:00:00.000Z" }),
      at("2026-02-10T00:00:00.000Z"),
    );
    expect(final).toEqual({
      kind: "due",
      period_start: "2026-02-01T00:00:00.000Z",
      period_end: "2026-02-15T00:00:00.000Z",
    });
  });

  it("does not bill future, paused, closed, unscheduled, pre-start or expired subscriptions", () => {
    expect(planInvoicePeriod(makeSchedule({ next_billing_at: "2026-02-01T00:00:00.000Z" }), at("2026-01-15T00:00:00.000Z"))).toEqual({
      kind: "not_due",
      next_billing_at: "2026-02-01T00:00:00.000Z",
    });
    expect(planInvoicePeriod(makeSchedule({ status: "paused" }), at("2026-01-15T00:00:00.000Z"))).toMatchObject({
      kind: "not_billable",
      reason: "status",
    });
    expect(planInvoicePeriod(makeSchedule({ status: "closed" }), at("2026-01-15T00:00:00.000Z"))).toMatchObject({
      kind: "not_billable",
      reason: "closed",
    });
    expect(planInvoicePeriod(makeSchedule({ billing_anchor_at: null }), at("2026-01-15T00:00:00.000Z"))).toMatchObject({
      kind: "not_billable",
      reason: "missing_schedule",
    });
    expect(
      planInvoicePeriod(
        makeSchedule({ start_at: "2026-02-01T00:00:00.000Z", billing_anchor_at: "2026-02-01T00:00:00.000Z" }),
        at("2026-01-15T00:00:00.000Z"),
      ),
    ).toMatchObject({ kind: "not_billable", reason: "before_start" });
    expect(
      planInvoicePeriod(
        makeSchedule({ expires_at: "2026-01-01T00:00:00.000Z", next_billing_at: "2026-01-01T00:00:00.000Z" }),
        at("2026-06-01T00:00:00.000Z"),
      ),
    ).toMatchObject({ kind: "not_billable", reason: "expired" });
  });

  it("recovers an overdue pre-expiry period executed after expiry", () => {
    const plan = planInvoicePeriod(
      makeSchedule({
        expires_at: "2026-01-15T00:00:00.000Z",
        next_billing_at: "2026-01-01T00:00:00.000Z",
      }),
      at("2026-03-01T00:00:00.000Z"),
    );
    expect(plan).toEqual({
      kind: "due",
      period_start: "2026-01-01T00:00:00.000Z",
      period_end: "2026-01-15T00:00:00.000Z",
    });
  });

  it("only bills a closed cutoff when the D3 close transaction opts in", () => {
    const closed = makeSchedule({
      status: "closed",
      closed_at: "2026-02-01T00:00:00.000Z",
      next_billing_at: "2026-01-01T00:00:00.000Z",
    });
    expect(planInvoicePeriod(closed, at("2026-04-01T00:00:00.000Z"))).toMatchObject({ kind: "not_billable", reason: "closed" });
    expect(planInvoicePeriod(closed, at("2026-04-01T00:00:00.000Z"), { allowClosedCutoff: true })).toEqual({
      kind: "due",
      period_start: "2026-01-01T00:00:00.000Z",
      period_end: "2026-02-01T00:00:00.000Z",
    });
  });

  it("catches up every missed period without starting at or after expiry", () => {
    const periods = duePeriods(makeSchedule(), at("2026-04-15T00:00:00.000Z"));
    expect(periods.map(period => period.period_start)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
      "2026-04-01T00:00:00.000Z",
    ]);
    expect(periods.at(-1)?.period_end).toBe("2026-05-01T00:00:00.000Z");

    const capped = duePeriods(
      makeSchedule({ expires_at: "2026-03-15T00:00:00.000Z" }),
      at("2026-06-01T00:00:00.000Z"),
    );
    expect(capped).toEqual([
      { period_start: "2026-01-01T00:00:00.000Z", period_end: "2026-02-01T00:00:00.000Z" },
      { period_start: "2026-02-01T00:00:00.000Z", period_end: "2026-03-01T00:00:00.000Z" },
      { period_start: "2026-03-01T00:00:00.000Z", period_end: "2026-03-15T00:00:00.000Z" },
    ]);
    expect(duePeriods(makeSchedule(), at("2026-04-15T00:00:00.000Z"), { maxPeriods: 2 })).toHaveLength(2);
    expect(duePeriods(makeSchedule({ status: "paused" }), at("2026-04-15T00:00:00.000Z"))).toEqual([]);
  });
});

describe("stored invoice integrity", () => {
  it("returns exact integer balances for a consistent snapshot", () => {
    expect(validateInvoice(makeInvoice(), [makeLine()])).toEqual({
      subtotal: 10000n,
      discount: 1000n,
      tax: 1800n,
      total: 10800n,
      paid: 0n,
      outstanding: 10800n,
    });
  });

  it("rejects broken header and line arithmetic", () => {
    expect(() => validateInvoice(makeInvoice({ total_minor: "10801" }))).toThrow(AppError);
    expect(() => validateInvoice(makeInvoice({ discount_minor: "10001" }))).toThrow(AppError);
    expect(() => validateInvoice(makeInvoice({ paid_minor: "10801", outstanding_minor: "0" }))).toThrow(AppError);
    expect(() => validateInvoice(makeInvoice({ outstanding_minor: "1" }))).toThrow(AppError);
    expect(() => validateInvoice(makeInvoice(), [])).toThrow(AppError);
    expect(() => validateInvoice(makeInvoice(), [makeLine({ quantity: 0 })])).toThrow(AppError);
    expect(() => validateInvoice(makeInvoice(), [makeLine({ tax_rate_bps: 10001 })])).toThrow(AppError);
    expect(() => validateInvoice(makeInvoice(), [makeLine({ amount_minor: "10799" })])).toThrow(AppError);
    expect(() =>
      validateInvoice(makeInvoice(), [makeLine({ discount_minor: "10001", amount_minor: "999" })]),
    ).toThrow(AppError);
  });

  it("requires line sums to match the frozen header", () => {
    const twoLines = [makeLine(), makeLine({ id: IDS.otherInvoice, subscription_line_id: IDS.otherInvoice, quantity: 1, unit_price_minor: "0", discount_minor: "0", tax_minor: "0", amount_minor: "0" })];
    expect(validateInvoice(makeInvoice(), twoLines)).toBeDefined();
    expect(() =>
      validateInvoice(makeInvoice(), [
        makeLine({ id: IDS.otherInvoice, quantity: 1, discount_minor: "0", tax_minor: "0", amount_minor: "5000" }),
      ]),
    ).toThrow(AppError);
  });
});

describe("payment decisions", () => {
  it("accepts a partial receipt and marks exact balance as settled", () => {
    const invoice = makeInvoice({ paid_minor: "4000", outstanding_minor: "6800" });
    expect(decidePayment(invoice, "1000", "USD")).toEqual({
      amount: 1000n,
      balance: 6800n,
      outstandingAfter: 5800n,
      settles: false,
    });
    expect(decidePayment(invoice, "6800", "USD")).toEqual({
      amount: 6800n,
      balance: 6800n,
      outstandingAfter: 0n,
      settles: true,
    });
  });

  it("rejects overpayment, zero, wrong currency, drafts and paid invoices", () => {
    const invoice = makeInvoice({ paid_minor: "4000", outstanding_minor: "6800" });
    expect(() => decidePayment(invoice, "6801", "USD")).toThrow(expect.objectContaining({ code: "PAYMENT_EXCEEDS_BALANCE" }));
    expect(() => decidePayment(invoice, "0", "USD")).toThrow(AppError);
    expect(() => decidePayment(invoice, "100", "EUR")).toThrow(AppError);
    expect(() => decidePayment(makeInvoice({ status: "draft", issued_at: null }), "100", "USD")).toThrow(
      expect.objectContaining({ code: "INVALID_TRANSITION" }),
    );
    expect(() => decidePayment(makeInvoice({ status: "paid", paid_minor: "10800", outstanding_minor: "0" }), "100", "USD")).toThrow(
      expect.objectContaining({ code: "INVALID_TRANSITION" }),
    );
  });
});

describe("customer visibility and overdue", () => {
  it("hides drafts, cancelled drafts and another customer's issued invoice", () => {
    expect(invoiceVisibleToCustomer(makeInvoice(), IDS.customerA)).toBe(true);
    expect(invoiceVisibleToCustomer(makeInvoice({ status: "cancelled" }), IDS.customerA)).toBe(true);
    expect(invoiceVisibleToCustomer(makeInvoice({ status: "draft", issued_at: null }), IDS.customerA)).toBe(false);
    expect(invoiceVisibleToCustomer(makeInvoice({ status: "cancelled", issued_at: null }), IDS.customerA)).toBe(false);
    expect(invoiceVisibleToCustomer(makeInvoice(), IDS.customerB)).toBe(false);
  });

  it("marks only confirmed outstanding invoices past their due date", () => {
    expect(invoiceOverdue(makeInvoice(), "2026-02-01")).toBe(true);
    expect(invoiceOverdue(makeInvoice(), "2026-01-31")).toBe(false);
    expect(invoiceOverdue(makeInvoice({ status: "paid", outstanding_minor: "0" }), "2026-02-01")).toBe(false);
    expect(invoiceOverdue(makeInvoice({ status: "draft", issued_at: null }), "2026-02-01")).toBe(false);
    expect(invoiceOverdue(makeInvoice({ outstanding_minor: "0" }), "2026-02-01")).toBe(false);
    expect(() => invoiceOverdue(makeInvoice(), "31-01-2026")).toThrow(AppError);
  });
});

describe("discount eligibility preflight", () => {
  it("checks active window, uses, currency, subtotal and quantity", () => {
    expect(discountEligible(discount, discountContext)).toBe(true);
    expect(discountEligible({ ...discount, starts_at: "2026-07-01T00:00:00.000Z" }, discountContext)).toBe(false);
    expect(discountEligible({ ...discount, ends_at: "2026-06-01T00:00:00.000Z" }, discountContext)).toBe(false);
    expect(discountEligible({ ...discount, uses: 2 }, discountContext)).toBe(false);
    expect(discountEligible({ ...discount, currency: "EUR" }, discountContext)).toBe(false);
    expect(discountEligible({ ...discount, currency: null }, discountContext)).toBe(true);
    expect(discountEligible({ ...discount, min_subtotal_minor: "5001" }, discountContext)).toBe(false);
    expect(discountEligible({ ...discount, min_quantity: 2 }, discountContext)).toBe(false);
    expect(discountEligible({ ...discount, is_active: false }, discountContext)).toBe(false);
  });

  it("rejects corrupt usage counters instead of guessing", () => {
    expect(() => discountEligible({ ...discount, max_uses: 0 }, discountContext)).toThrow(AppError);
    expect(() => discountEligible({ ...discount, uses: -1, max_uses: null }, discountContext)).toThrow(AppError);
    expect(() =>
      discountEligible(discount, { ...discountContext, eligible_quantity: -1 }),
    ).toThrow(AppError);
  });
});

describe("report integrity", () => {
  it("normalizes as_of and keeps currencies in independent buckets", () => {
    const report = validateReport(makeReport({ currencies: makeReport().currencies.map(bucket => ({ ...bucket, billed_minor: `00${bucket.billed_minor}` })) }));
    expect(report.as_of).toBe("2026-10-31T12:00:00.000Z");
    expect(report.currencies.map(bucket => bucket.currency)).toEqual(["USD", "EUR"]);
    expect(report.currencies[0].billed_minor).toBe("10800");
  });

  it("rejects duplicate currencies and inconsistent or negative aggregates", () => {
    expect(() => validateReport(makeReport({ currencies: [makeReport().currencies[0], makeReport().currencies[0]] }))).toThrow(AppError);
    expect(() => validateReport(makeReport({ currencies: [{ ...makeReport().currencies[0], currency: "usd" }] }))).toThrow(AppError);
    expect(() =>
      validateReport(makeReport({ currencies: [{ ...makeReport().currencies[0], overdue_minor: "999999" }] })),
    ).toThrow(AppError);
    expect(() =>
      validateReport(makeReport({ currencies: [{ ...makeReport().currencies[0], overdue_invoice_count: -1 }] })),
    ).toThrow(AppError);
    expect(() => validateReport(makeReport({ as_of: "2026-02-31T00:00:00Z" }))).toThrow(AppError);
    expect(() => validateReport(makeReport({ active_subscriptions: -1 }))).toThrow(AppError);
  });
});

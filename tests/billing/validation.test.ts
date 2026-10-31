import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import type { InvoiceQuery, SummaryQuery } from "@/modules/billing/contracts";
import {
  containsCardLikeNumber,
  parseBillingRunInput,
  parseExpectedVersion,
  parseGenerateInput,
  parseId,
  parseInvoiceQuery,
  parsePaymentQuery,
  parseRecordPaymentInput,
  parseSummaryQuery,
} from "@/modules/billing/validation";
import {
  currencyExponent,
  formatMoney,
  formatUtcInstant,
  invoiceStatusLabel,
  parseMoneyToMinor,
  paymentMethodLabel,
} from "@/modules/billing/presentation";
import { IDS } from "./fixtures";

const now = new Date("2026-10-31T12:00:00.000Z");

function payment(overrides: Record<string, unknown> = {}) {
  return parseRecordPaymentInput(
    {
      amount_minor: "1250",
      currency: "USD",
      method: "bank_transfer",
      paid_at: "2026-10-30T09:30:00Z",
      note: "  Receipt 42  ",
      external_reference: "BANK-42",
      ...overrides,
    } as never,
    now,
  );
}

describe("list query validation", () => {
  it("applies safe defaults and normalizes known filters", () => {
    expect(parseInvoiceQuery({})).toEqual({ limit: 25 });
    expect(
      parseInvoiceQuery({
        limit: 10,
        cursor: "abc",
        status: "confirmed",
        customer_id: IDS.customerA.toUpperCase(),
        overdue: true,
      }),
    ).toEqual({
      limit: 10,
      cursor: "abc",
      status: "confirmed",
      customer_id: IDS.customerA,
      overdue: true,
    });
    expect(
      parsePaymentQuery({
        from: "2026-01-01T00:00:00Z",
        to: "2026-02-01T00:00:00Z",
        invoice_id: IDS.invoice,
      }),
    ).toEqual({
      limit: 25,
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
      invoice_id: IDS.invoice,
    });
  });

  it("rejects unknown keys, bad paging, invalid status/date ranges and UUIDs", () => {
    for (const query of [
      { sort: "total" },
      { limit: 0 },
      { limit: 101 },
      { limit: 1.5 },
      { limit: "25" },
      { cursor: "" },
      { status: "refunded" },
      { customer_id: "nope" },
      { overdue: "yes" },
    ]) {
      expect(() => parseInvoiceQuery(query as InvoiceQuery)).toThrow(AppError);
    }
    expect(() => parsePaymentQuery({ from: "2026-02-01T00:00:00Z", to: "2026-02-01T00:00:00Z" })).toThrow(AppError);
    expect(() => parsePaymentQuery({ from: "2026-03-01T00:00:00Z", to: "2026-02-01T00:00:00Z" })).toThrow(AppError);
    expect(() => parsePaymentQuery({ from: "not-a-date" })).toThrow(AppError);
    expect(() => parseSummaryQuery({ from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z", sort: "x" } as SummaryQuery)).toThrow(
      AppError,
    );
    expect(() => parseSummaryQuery({ from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z", currency: "usd" })).toThrow(
      AppError,
    );
  });
});

describe("mutation validation", () => {
  it("accepts only documented generate/version/id shapes", () => {
    expect(parseGenerateInput({ subscription_id: IDS.subscription.toUpperCase() })).toEqual({
      subscription_id: IDS.subscription,
    });
    expect(parseExpectedVersion("42")).toBe("42");
    expect(parseId(IDS.invoice.toUpperCase())).toBe(IDS.invoice);
    for (const value of [{}, { subscription_id: IDS.subscription, extra: true }, { subscription_id: "x" }]) {
      expect(() => parseGenerateInput(value as never)).toThrow(AppError);
    }
    for (const value of ["0", "01", 1, "9223372036854775808"]) expect(() => parseExpectedVersion(value)).toThrow(AppError);
  });

  it("normalizes a verified receipt and trims customer-visible text", () => {
    expect(payment()).toEqual({
      amount_minor: "1250",
      currency: "USD",
      method: "bank_transfer",
      paid_at: "2026-10-30T09:30:00.000Z",
      note: "Receipt 42",
      external_reference: "BANK-42",
    });
    expect(payment({ note: undefined, external_reference: undefined })).toEqual({
      amount_minor: "1250",
      currency: "USD",
      method: "bank_transfer",
      paid_at: "2026-10-30T09:30:00.000Z",
      note: "",
    });
    expect(payment({ paid_at: "2026-10-31T12:04:59Z" }).paid_at).toBe("2026-10-31T12:04:59.000Z");
    expect(payment({ amount_minor: "0001250" }).amount_minor).toBe("1250");
  });

  it("rejects unknown keys, future receipts, bad money, currency and methods", () => {
    for (const overrides of [
      { extra: true },
      { paid_at: "2026-10-31T12:05:01Z" },
      { paid_at: "2026-10-31T12:30:00Z" },
      { amount_minor: "0" },
      { amount_minor: "1.25" },
      { amount_minor: "-100" },
      { amount_minor: 100 },
      { currency: "usd" },
      { currency: "US" },
      { method: "cheque" },
      { note: 123 },
      { note: "x".repeat(2001) },
      { note: "bad\u0001note" },
      { external_reference: "" },
      { external_reference: "x".repeat(201) },
      { external_reference: "bad\u0001ref" },
    ]) {
      expect(() => payment(overrides)).toThrow(AppError);
    }
  });

  it("detects Luhn-valid card-like numbers in receipt notes", () => {
    expect(containsCardLikeNumber("Card 4111 1111 1111 1111 received")).toBe(true);
    expect(containsCardLikeNumber("Card 4111-1111-1111-1111")).toBe(true);
    expect(containsCardLikeNumber("Card 4111 1111 1111 1112")).toBe(false);
    expect(containsCardLikeNumber("Invoice 2026 0001 1234")).toBe(false);
    expect(() => payment({ note: "paid with 4111 1111 1111 1111" })).toThrow(AppError);
  });

  it("bounds billing-run batches", () => {
    expect(parseBillingRunInput({})).toEqual({ limit: 100 });
    expect(parseBillingRunInput({ limit: 500 })).toEqual({ limit: 500 });
    for (const value of [{ limit: 0 }, { limit: 501 }, { limit: 1.2 }, { limit: "5" }, { extra: true }]) {
      expect(() => parseBillingRunInput(value as never)).toThrow(AppError);
    }
  });
});

describe("exact money presentation", () => {
  it("formats minor units with the currency exponent and no float conversion", () => {
    expect(formatMoney("123456", "USD")).toBe("1,234.56 USD");
    expect(formatMoney("0", "USD")).toBe("0.00 USD");
    expect(formatMoney("123456", "JPY")).toBe("123,456 JPY");
    expect(formatMoney("1234567", "KWD")).toBe("1,234.567 KWD");
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("XXX")).toBe(2);
    expect(() => formatMoney("-1", "USD")).toThrow(AppError);
    expect(() => formatMoney("1", "usd")).toThrow(AppError);
  });

  it("converts operator decimal entry to minor units without silent rounding", () => {
    expect(parseMoneyToMinor("12.5", "USD")).toBe("1250");
    expect(parseMoneyToMinor(" 12.50 ", "USD")).toBe("1250");
    expect(parseMoneyToMinor("0.01", "USD")).toBe("1");
    expect(parseMoneyToMinor("12.345", "KWD")).toBe("12345");
    for (const [value, currency] of [
      ["12.345", "USD"],
      ["1.5", "JPY"],
      ["-1.00", "USD"],
      ["1,000.00", "USD"],
      ["abc", "USD"],
      ["", "USD"],
    ]) {
      expect(() => parseMoneyToMinor(value, currency)).toThrow(AppError);
    }
    expect(parseMoneyToMinor("12", "USD")).toBe("1200");
  });

  it("formats UTC instants and known labels", () => {
    expect(formatUtcInstant("2026-01-01T00:00:00.000Z")).toBe("2026-01-01 00:00:00 UTC");
    expect(formatUtcInstant("bad")).toBe("bad");
    expect(invoiceStatusLabel("cancelled")).toBe("Cancelled");
    expect(paymentMethodLabel("bank_transfer")).toBe("Bank transfer");
  });
});

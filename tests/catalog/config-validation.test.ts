import { describe, expect, it, vi } from "vitest";
import {
  parseCreateDiscount, parseCreatePlan, parseCreateProduct, parseCreateTaxRule, parseCreateVariant,
  parseUpdateDiscount, parseUpdatePlan, parseUpdateProduct, parseUpdateTaxRule, parseUpdateVariant,
  validateDiscountResult,
} from "../../src/modules/catalog/config-validation";

const id = "10000000-0000-4000-8000-000000000001";
const validDiscount = {
  code: "WELCOME", name: "Welcome", scope: "product", kind: "percentage", percent_bps: 1000,
  starts_at: "2026-01-01T00:00:00Z", product_ids: [id],
};
const errorCode = (run: () => unknown, code: string) => expect(run).toThrow(expect.objectContaining({ code }));

describe("catalog configuration input validation", () => {
  it("normalizes safe product and variant input while preserving empty optional notes", () => {
    expect(parseCreateProduct({ name: "  Service ", product_type: "service", sales_price_minor: "10", cost_price_minor: "5", currency: "USD", notes: "" })).toEqual({
      name: "Service", product_type: "service", sales_price_minor: "10", cost_price_minor: "5", currency: "USD", notes: "",
    });
    expect(parseCreateVariant({ product_id: id.toUpperCase(), name: "Plus", attributes: { seats: 5 }, price_adjustment_minor: "-1" })).toMatchObject({ product_id: id, price_adjustment_minor: "-1" });
    expect(parseUpdateVariant({ is_active: false })).toEqual({ is_active: false });
  });

  it("rejects unknown product fields, unsupported currencies, oversized money and invalid JSON attributes", () => {
    errorCode(() => parseCreateProduct({ name: "x", product_type: "service", sales_price_minor: "1", cost_price_minor: "0", currency: "usd", role: "admin" }), "VALIDATION_ERROR");
    errorCode(() => parseCreateProduct({ name: "x", product_type: "service", sales_price_minor: "1", cost_price_minor: "0", currency: "ZZZ" }), "VALIDATION_ERROR");
    errorCode(() => parseUpdateProduct({ sales_price_minor: "9000000000001" }), "VALIDATION_ERROR");
    errorCode(() => parseCreateVariant({ product_id: id, name: "x", attributes: [] }), "VALIDATION_ERROR");
    errorCode(() => parseUpdateProduct({}), "VALIDATION_ERROR");
  });

  it("validates plan choices, integer limits and inclusive availability ranges", () => {
    expect(parseCreatePlan({ product_id: id, name: "Monthly", price_minor: "500", currency: "USD", billing_interval: "monthly", min_quantity: 3 })).toMatchObject({ min_quantity: 3 });
    expect(parseUpdatePlan({ name: "Annual Plus" })).toEqual({ name: "Annual Plus" });
    errorCode(() => parseUpdatePlan({ product_id: id }), "VALIDATION_ERROR");
    errorCode(() => parseUpdatePlan({ currency: "EUR" }), "VALIDATION_ERROR");
    errorCode(() => parseUpdatePlan({ billing_interval: "yearly" }), "VALIDATION_ERROR");
    errorCode(() => parseCreatePlan({ product_id: id, name: "Bad", price_minor: "1", currency: "USD", billing_interval: "hourly" }), "VALIDATION_ERROR");
    errorCode(() => parseCreatePlan({ product_id: id, name: "Bad", price_minor: "1", currency: "USD", billing_interval: "daily", available_from: "2026-02-30", available_until: "2026-03-01" }), "VALIDATION_ERROR");
    errorCode(() => parseCreatePlan({ product_id: id, name: "Bad", price_minor: "1", currency: "USD", billing_interval: "daily", available_from: "2026-05-01", available_until: "2026-04-30" }), "VALIDATION_ERROR");
  });

  it("validates plan end dates against the default availability start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    try {
      const plan = { product_id: id, name: "Monthly", price_minor: "500", currency: "USD", billing_interval: "monthly" };
      errorCode(() => parseCreatePlan({ ...plan, available_until: "2026-10-30" }), "VALIDATION_ERROR");
      expect(parseCreatePlan({ ...plan, available_until: "2026-10-31" })).toMatchObject({ available_until: "2026-10-31" });
    } finally { vi.useRealTimers(); }
  });

  it("checks tax rate bounds, real calendar dates and inclusive date ordering", () => {
    expect(parseCreateTaxRule({ name: "VAT", rate_bps: 0, starts_on: "2026-01-01", ends_on: "2026-01-01" })).toMatchObject({ rate_bps: 0 });
    expect(parseUpdateTaxRule({ ends_on: null, is_active: false })).toEqual({ ends_on: null, is_active: false });
    errorCode(() => parseCreateTaxRule({ name: "VAT", rate_bps: 10001, starts_on: "2026-01-01" }), "VALIDATION_ERROR");
    errorCode(() => parseCreateTaxRule({ name: "VAT", rate_bps: 5, starts_on: "2026-01-02", ends_on: "2026-01-01" }), "VALIDATION_ERROR");
  });

  it("validates fixed and percentage discount shapes, mappings, dates and usage limits", () => {
    expect(parseCreateDiscount(validDiscount)).toMatchObject({ code: "WELCOME", percent_bps: 1000, product_ids: [id], min_quantity: 1, min_subtotal_minor: "0" });
    const fixed = parseCreateDiscount({ code: "fixed", name: "Fixed", scope: "subscription", kind: "fixed", amount_minor: "25", currency: "USD", starts_at: "2026-01-01T00:00:00Z" });
    expect(fixed).toMatchObject({ amount_minor: "25", currency: "USD", product_ids: [] });
    expect(parseUpdateDiscount({ ends_at: null, is_active: false })).toEqual({ ends_at: null, is_active: false });
    errorCode(() => parseUpdateDiscount({ product_ids: [id, id] }), "VALIDATION_ERROR");
    errorCode(() => parseCreateDiscount({ ...validDiscount, product_ids: [] }), "VALIDATION_ERROR");
    errorCode(() => parseCreateDiscount({ ...validDiscount, ends_at: "2025-12-31T23:59:59Z" }), "VALIDATION_ERROR");
    errorCode(() => parseCreateDiscount({ ...validDiscount, percent_bps: 0 }), "VALIDATION_ERROR");
    errorCode(() => parseCreateDiscount({ ...validDiscount, product_ids: [id, id] }), "VALIDATION_ERROR");
    errorCode(() => parseCreateDiscount({ ...validDiscount, max_uses: 0 }), "VALIDATION_ERROR");
    errorCode(() => validateDiscountResult({ id, code: "FIXED", name: "Fixed", version: "1", created_at: "", updated_at: "", scope: "subscription", kind: "percentage", amount_minor: "1", currency: "USD", percent_bps: 1000, min_quantity: 1, min_subtotal_minor: "0", starts_at: "2026-01-01T00:00:00.000Z", ends_at: null, max_uses: null, product_ids: [], is_active: true }), "VALIDATION_ERROR");
  });

  it("accepts a currency-scoped percentage discount with a minimum purchase", () => {
    expect(parseCreateDiscount({ ...validDiscount, currency: "USD", min_subtotal_minor: "1000" })).toMatchObject({ currency: "USD", min_subtotal_minor: "1000", percent_bps: 1000 });
    errorCode(() => parseCreateDiscount({ ...validDiscount, min_subtotal_minor: "1000" }), "VALIDATION_ERROR");
  });
});

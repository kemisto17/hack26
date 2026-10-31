import { CatalogError } from "./errors";
import { supportedCurrency } from "./validation";
import type {
  CreateDiscountInput, CreatePlanInput, CreateProductInput, CreateTaxRuleInput, CreateVariantInput,
  DiscountDTO, PlanDTO, ProductDTO, TaxRuleDTO, UpdateDiscountInput, UpdatePlanInput,
  UpdateProductInput, UpdateTaxRuleInput, UpdateVariantInput, VariantDTO,
} from "./contracts";

const MAX_UNIT = BigInt("9000000000000");
const MAX_TOTAL = BigInt("9000000000000000");
function invalid(field: string): never { throw new CatalogError("VALIDATION_ERROR", `Invalid ${field}.`); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid("fields");
  return value as Record<string, unknown>;
}
function requiredString(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) invalid(field);
  return value.trim();
}
function bool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") invalid(field);
  return value;
}
function integer(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) invalid(field);
  return value;
}
function money(value: unknown, field: string, max = MAX_UNIT, positive = false): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) invalid(field);
  const amount = BigInt(value);
  if (amount > max || (positive && amount === BigInt(0))) invalid(field);
  return value;
}
function signedMoney(value: unknown): string {
  if (typeof value !== "string" || !/^(0|-?[1-9]\d*)$/.test(value)) invalid("price_adjustment_minor");
  const amount = BigInt(value);
  if (amount < -MAX_UNIT || amount > MAX_UNIT) invalid("price_adjustment_minor");
  return value;
}
function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)) invalid(field);
  return value.toLowerCase();
}
function currency(value: unknown): string {
  return supportedCurrency(value);
}
function date(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(field);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid(field);
  return value;
}
function instant(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) invalid(field);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().replace(/\.\d{3}Z$/, "Z") !== value.replace(/\.\d{3}Z$/, "Z")) invalid(field);
  return parsed.toISOString();
}
function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid("attributes");
  try { JSON.stringify(value); } catch { invalid("attributes"); }
  return value as Record<string, unknown>;
}
function nonemptyUpdate(source: Record<string, unknown>): void { if (Object.keys(source).length === 0) invalid("empty update"); }

export function parseCreateProduct(value: unknown): CreateProductInput {
  const d = object(value, ["name", "product_type", "sales_price_minor", "cost_price_minor", "currency", "notes", "tax_rule_id", "is_active"]);
  if (!("name" in d) || !("product_type" in d) || !("sales_price_minor" in d) || !("cost_price_minor" in d) || !("currency" in d)) invalid("required product fields");
  if (!["software", "service", "addon"].includes(String(d.product_type))) invalid("product_type");
  return {
    name: requiredString(d.name, "name"), product_type: d.product_type as ProductDTO["product_type"],
    sales_price_minor: money(d.sales_price_minor, "sales_price_minor"), cost_price_minor: money(d.cost_price_minor, "cost_price_minor"),
    currency: currency(d.currency), ...(d.notes !== undefined ? { notes: typeof d.notes === "string" && d.notes.length <= 10000 ? d.notes : invalid("notes") } : {}),
    ...(d.tax_rule_id !== undefined ? { tax_rule_id: d.tax_rule_id === null ? null : uuid(d.tax_rule_id, "tax_rule_id") } : {}),
    ...(d.is_active !== undefined ? { is_active: bool(d.is_active, "is_active") } : {}),
  };
}
export function parseUpdateProduct(value: unknown): UpdateProductInput {
  const d = object(value, ["name", "product_type", "sales_price_minor", "cost_price_minor", "currency", "notes", "tax_rule_id", "is_active"]); nonemptyUpdate(d);
  if (d.product_type !== undefined && !["software", "service", "addon"].includes(String(d.product_type))) invalid("product_type");
  return {
    ...(d.name !== undefined ? { name: requiredString(d.name, "name") } : {}),
    ...(d.product_type !== undefined ? { product_type: d.product_type as ProductDTO["product_type"] } : {}),
    ...(d.sales_price_minor !== undefined ? { sales_price_minor: money(d.sales_price_minor, "sales_price_minor") } : {}),
    ...(d.cost_price_minor !== undefined ? { cost_price_minor: money(d.cost_price_minor, "cost_price_minor") } : {}),
    ...(d.currency !== undefined ? { currency: currency(d.currency) } : {}),
    ...(d.notes !== undefined ? { notes: typeof d.notes === "string" && d.notes.length <= 10000 ? d.notes : invalid("notes") } : {}),
    ...(d.tax_rule_id !== undefined ? { tax_rule_id: d.tax_rule_id === null ? null : uuid(d.tax_rule_id, "tax_rule_id") } : {}),
    ...(d.is_active !== undefined ? { is_active: bool(d.is_active, "is_active") } : {}),
  };
}

export function parseCreateVariant(value: unknown): CreateVariantInput {
  const d = object(value, ["product_id", "name", "attributes", "price_adjustment_minor", "is_active"]);
  if (!("product_id" in d) || !("name" in d)) invalid("required variant fields");
  return { product_id: uuid(d.product_id, "product_id"), name: requiredString(d.name, "name"),
    ...(d.attributes !== undefined ? { attributes: jsonObject(d.attributes) } : {}),
    ...(d.price_adjustment_minor !== undefined ? { price_adjustment_minor: signedMoney(d.price_adjustment_minor) } : {}),
    ...(d.is_active !== undefined ? { is_active: bool(d.is_active, "is_active") } : {}),
  };
}
export function parseUpdateVariant(value: unknown): UpdateVariantInput {
  const d = object(value, ["name", "attributes", "price_adjustment_minor", "is_active"]); nonemptyUpdate(d);
  return { ...(d.name !== undefined ? { name: requiredString(d.name, "name") } : {}),
    ...(d.attributes !== undefined ? { attributes: jsonObject(d.attributes) } : {}),
    ...(d.price_adjustment_minor !== undefined ? { price_adjustment_minor: signedMoney(d.price_adjustment_minor) } : {}),
    ...(d.is_active !== undefined ? { is_active: bool(d.is_active, "is_active") } : {}),
  };
}

export function parseCreatePlan(value: unknown): CreatePlanInput {
  const d = object(value, ["product_id", "name", "price_minor", "currency", "billing_interval", "min_quantity", "available_from", "available_until", "auto_close", "allow_close", "allow_pause", "allow_renew", "is_active"]);
  for (const field of ["product_id", "name", "price_minor", "currency", "billing_interval"]) if (!(field in d)) invalid(`required plan ${field}`);
  if (!["daily", "weekly", "monthly", "yearly"].includes(String(d.billing_interval))) invalid("billing_interval");
  const result: CreatePlanInput = { product_id: uuid(d.product_id, "product_id"), name: requiredString(d.name, "name"), price_minor: money(d.price_minor, "price_minor"), currency: currency(d.currency), billing_interval: d.billing_interval as PlanDTO["billing_interval"],
    ...(d.min_quantity !== undefined ? { min_quantity: integer(d.min_quantity, 1, 1_000_000, "min_quantity") } : {}),
    ...(d.available_from !== undefined ? { available_from: date(d.available_from, "available_from") } : {}),
    ...(d.available_until !== undefined ? { available_until: d.available_until === null ? null : date(d.available_until, "available_until") } : {}),
    ...(d.auto_close !== undefined ? { auto_close: bool(d.auto_close, "auto_close") } : {}), ...(d.allow_close !== undefined ? { allow_close: bool(d.allow_close, "allow_close") } : {}),
    ...(d.allow_pause !== undefined ? { allow_pause: bool(d.allow_pause, "allow_pause") } : {}), ...(d.allow_renew !== undefined ? { allow_renew: bool(d.allow_renew, "allow_renew") } : {}),
    ...(d.is_active !== undefined ? { is_active: bool(d.is_active, "is_active") } : {}),
  };
  if (result.available_from && result.available_until && result.available_until < result.available_from) invalid("available_until");
  return result;
}
export function parseUpdatePlan(value: unknown): UpdatePlanInput {
  const d = object(value, ["product_id", "name", "price_minor", "currency", "billing_interval", "min_quantity", "available_from", "available_until", "auto_close", "allow_close", "allow_pause", "allow_renew", "is_active"]); nonemptyUpdate(d);
  if (d.billing_interval !== undefined && !["daily", "weekly", "monthly", "yearly"].includes(String(d.billing_interval))) invalid("billing_interval");
  const result: UpdatePlanInput = {
    ...(d.product_id !== undefined ? { product_id: uuid(d.product_id, "product_id") } : {}),
    ...(d.name !== undefined ? { name: requiredString(d.name, "name") } : {}),
    ...(d.price_minor !== undefined ? { price_minor: money(d.price_minor, "price_minor") } : {}),
    ...(d.currency !== undefined ? { currency: currency(d.currency) } : {}),
    ...(d.billing_interval !== undefined ? { billing_interval: d.billing_interval as PlanDTO["billing_interval"] } : {}),
    ...(d.min_quantity !== undefined ? { min_quantity: integer(d.min_quantity, 1, 1_000_000, "min_quantity") } : {}),
    ...(d.available_from !== undefined ? { available_from: date(d.available_from, "available_from") } : {}),
    ...(d.available_until !== undefined ? { available_until: d.available_until === null ? null : date(d.available_until, "available_until") } : {}),
    ...(d.auto_close !== undefined ? { auto_close: bool(d.auto_close, "auto_close") } : {}),
    ...(d.allow_close !== undefined ? { allow_close: bool(d.allow_close, "allow_close") } : {}),
    ...(d.allow_pause !== undefined ? { allow_pause: bool(d.allow_pause, "allow_pause") } : {}),
    ...(d.allow_renew !== undefined ? { allow_renew: bool(d.allow_renew, "allow_renew") } : {}),
    ...(d.is_active !== undefined ? { is_active: bool(d.is_active, "is_active") } : {}),
  };
  if (result.available_from && result.available_until && result.available_until < result.available_from) invalid("available_until");
  return result;
}
export function validatePlanResult(plan: Pick<PlanDTO, "available_from" | "available_until">): void {
  date(plan.available_from, "available_from");
  if (plan.available_until !== null && date(plan.available_until, "available_until") < plan.available_from) invalid("available_until");
}

export function parseCreateTaxRule(value: unknown): CreateTaxRuleInput {
  const d = object(value, ["name", "rate_bps", "starts_on", "ends_on", "is_active"]);
  if (!("name" in d) || !("rate_bps" in d) || !("starts_on" in d)) invalid("required tax rule fields");
  const result: CreateTaxRuleInput = { name: requiredString(d.name, "name"), rate_bps: integer(d.rate_bps, 0, 10000, "rate_bps"), starts_on: date(d.starts_on, "starts_on"),
    ...(d.ends_on !== undefined ? { ends_on: d.ends_on === null ? null : date(d.ends_on, "ends_on") } : {}), ...(d.is_active !== undefined ? { is_active: bool(d.is_active, "is_active") } : {}) };
  if (result.ends_on && result.ends_on < result.starts_on) invalid("ends_on");
  return result;
}
export function parseUpdateTaxRule(value: unknown): UpdateTaxRuleInput {
  const d = object(value, ["name", "rate_bps", "starts_on", "ends_on", "is_active"]); nonemptyUpdate(d);
  return { ...(d.name !== undefined ? { name: requiredString(d.name, "name") } : {}), ...(d.rate_bps !== undefined ? { rate_bps: integer(d.rate_bps, 0, 10000, "rate_bps") } : {}),
    ...(d.starts_on !== undefined ? { starts_on: date(d.starts_on, "starts_on") } : {}), ...(d.ends_on !== undefined ? { ends_on: d.ends_on === null ? null : date(d.ends_on, "ends_on") } : {}), ...(d.is_active !== undefined ? { is_active: bool(d.is_active, "is_active") } : {}) };
}

function validateDiscountRule(rule: Pick<DiscountDTO, "scope" | "kind" | "amount_minor" | "currency" | "percent_bps" | "min_quantity" | "min_subtotal_minor" | "starts_at" | "ends_at" | "max_uses" | "product_ids">): void {
  if (!["product", "subscription"].includes(rule.scope) || !["fixed", "percentage"].includes(rule.kind)) invalid("discount scope/kind");
  integer(rule.min_quantity, 1, 1_000_000, "min_quantity"); money(rule.min_subtotal_minor, "min_subtotal_minor", MAX_TOTAL);
  const starts = Date.parse(instant(rule.starts_at, "starts_at"));
  const ends = rule.ends_at === null ? null : Date.parse(instant(rule.ends_at, "ends_at"));
  if (ends !== null && ends <= starts) invalid("ends_at");
  if (rule.max_uses !== null) integer(rule.max_uses, 1, 2147483647, "max_uses");
  if (rule.scope === "product") {
    if (!Array.isArray(rule.product_ids) || !rule.product_ids.length || new Set(rule.product_ids).size !== rule.product_ids.length) invalid("product_ids");
    rule.product_ids.forEach(id => uuid(id, "product_ids"));
  } else if (rule.product_ids.length) invalid("product_ids");
  if (rule.kind === "fixed") {
    money(rule.amount_minor, "amount_minor", MAX_UNIT, true); currency(rule.currency);
    if (rule.percent_bps !== null) invalid("percent_bps");
  } else {
    integer(rule.percent_bps, 1, 10000, "percent_bps");
    if (rule.amount_minor !== null || rule.currency !== null) invalid("amount_minor/currency");
    if (BigInt(rule.min_subtotal_minor) > BigInt(0) && rule.currency === null) invalid("currency");
  }
}
export function parseCreateDiscount(value: unknown): CreateDiscountInput {
  const d = object(value, ["code", "name", "scope", "kind", "amount_minor", "currency", "percent_bps", "min_quantity", "min_subtotal_minor", "starts_at", "ends_at", "max_uses", "product_ids", "is_active"]);
  for (const field of ["code", "name", "scope", "kind", "starts_at"]) if (!(field in d)) invalid(`required discount ${field}`);
  const rule = { code: requiredString(d.code, "code", 50).toUpperCase(), name: requiredString(d.name, "name"), scope: d.scope as DiscountDTO["scope"], kind: d.kind as DiscountDTO["kind"],
    amount_minor: d.amount_minor === undefined ? null : d.amount_minor === null ? null : money(d.amount_minor, "amount_minor", MAX_UNIT, true), currency: d.currency === undefined || d.currency === null ? null : currency(d.currency),
    percent_bps: d.percent_bps === undefined || d.percent_bps === null ? null : integer(d.percent_bps, 1, 10000, "percent_bps"), min_quantity: d.min_quantity === undefined ? 1 : integer(d.min_quantity, 1, 1_000_000, "min_quantity"),
    min_subtotal_minor: d.min_subtotal_minor === undefined ? "0" : money(d.min_subtotal_minor, "min_subtotal_minor", MAX_TOTAL), starts_at: instant(d.starts_at, "starts_at"), ends_at: d.ends_at === undefined || d.ends_at === null ? null : instant(d.ends_at, "ends_at"),
    max_uses: d.max_uses === undefined || d.max_uses === null ? null : integer(d.max_uses, 1, 2147483647, "max_uses"), product_ids: d.product_ids === undefined ? [] : Array.isArray(d.product_ids) ? d.product_ids.map(id => uuid(id, "product_ids")) : invalid("product_ids"), is_active: d.is_active === undefined ? true : bool(d.is_active, "is_active") };
  validateDiscountRule(rule);
  if (!/^[A-Z0-9_-]{1,50}$/.test(rule.code)) invalid("code");
  if (rule.kind === "fixed" && rule.min_subtotal_minor !== "0" && rule.currency !== currency(d.currency)) invalid("currency");
  return rule;
}
export function parseUpdateDiscount(value: unknown): UpdateDiscountInput {
  const d = object(value, ["code", "name", "scope", "kind", "amount_minor", "currency", "percent_bps", "min_quantity", "min_subtotal_minor", "starts_at", "ends_at", "max_uses", "product_ids", "is_active"]); nonemptyUpdate(d);
  // The complete fixed/percentage and product/subscription combinations are
  // checked by validateDiscountRule after the service merges this patch with the
  // existing discount row and product mapping.
  return parseDiscountPatch(d);
}
function parseDiscountPatch(d: Record<string, unknown>): UpdateDiscountInput {
  if (d.scope !== undefined && !["product", "subscription"].includes(String(d.scope))) invalid("scope");
  const kind = d.kind !== undefined && !["fixed", "percentage"].includes(String(d.kind)) ? invalid("kind") : d.kind as DiscountDTO["kind"] | undefined;
  const productIds = d.product_ids === undefined ? undefined : Array.isArray(d.product_ids) ? d.product_ids.map(id => uuid(id, "product_ids")) : invalid("product_ids");
  return { ...(d.code !== undefined ? { code: requiredString(d.code, "code", 50).toUpperCase() } : {}), ...(d.name !== undefined ? { name: requiredString(d.name, "name") } : {}),
    ...(d.scope !== undefined ? { scope: d.scope as DiscountDTO["scope"] } : {}), ...(kind !== undefined ? { kind } : {}),
    ...(d.amount_minor !== undefined ? { amount_minor: d.amount_minor === null ? null : money(d.amount_minor, "amount_minor", MAX_UNIT, true) } : {}), ...(d.currency !== undefined ? { currency: d.currency === null ? null : currency(d.currency) } : {}),
    ...(d.percent_bps !== undefined ? { percent_bps: d.percent_bps === null ? null : integer(d.percent_bps, 1, 10000, "percent_bps") } : {}),
    ...(d.min_quantity !== undefined ? { min_quantity: integer(d.min_quantity, 1, 1_000_000, "min_quantity") } : {}), ...(d.min_subtotal_minor !== undefined ? { min_subtotal_minor: money(d.min_subtotal_minor, "min_subtotal_minor", MAX_TOTAL) } : {}),
    ...(d.starts_at !== undefined ? { starts_at: instant(d.starts_at, "starts_at") } : {}), ...(d.ends_at !== undefined ? { ends_at: d.ends_at === null ? null : instant(d.ends_at, "ends_at") } : {}),
    ...(d.max_uses !== undefined ? { max_uses: d.max_uses === null ? null : integer(d.max_uses, 1, 2147483647, "max_uses") } : {}), ...(productIds !== undefined ? { product_ids: productIds } : {}), ...(d.is_active !== undefined ? { is_active: bool(d.is_active, "is_active") } : {}),
  };
}

export function validateDiscountResult(value: DiscountDTO): void { validateDiscountRule(value); }
export type ConfigDTOs = ProductDTO | VariantDTO | PlanDTO | TaxRuleDTO | DiscountDTO;

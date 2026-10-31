import type { CreateSubscriptionInput, CreateTemplateInput, LineSelection, RenewSubscriptionInput, UpdateDraftInput, UpdateTemplateInput } from "./contracts";
import { SubscriptionError } from "./errors";

function invalid(field: string): never { throw new SubscriptionError("VALIDATION_ERROR", `Invalid ${field}.`); }
export function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key))) invalid("fields");
  return input as Record<string, unknown>;
}
export function uuid(input: unknown): string {
  if (typeof input !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) invalid("UUID");
  return input.toLowerCase();
}
export function version(input: unknown): string {
  if (typeof input !== "string" || !/^[1-9][0-9]*$/.test(input) || BigInt(input) > BigInt("9223372036854775807")) invalid("version");
  return input;
}
function integer(input: unknown, min: number, max: number, field: string): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < min || input > max) invalid(field);
  return input;
}
export function instant(input: unknown): string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(input)) invalid("UTC timestamp");
  const date = new Date(input);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== input.slice(0, 19)) invalid("UTC timestamp");
  return date.toISOString();
}
export function dateRange(start: string, end: string) {
  if (Date.parse(end) <= Date.parse(start)) invalid("expiry (must follow start)");
}
export function lines(input: unknown): LineSelection[] {
  if (!Array.isArray(input) || input.length === 0) invalid("lines");
  const result = input.map(value => {
    const line = object(value, ["product_id", "variant_id", "quantity", "is_primary"]);
    if (typeof line.is_primary !== "boolean") invalid("is_primary");
    return { product_id: uuid(line.product_id), ...(line.variant_id !== undefined ? { variant_id: uuid(line.variant_id) } : {}), quantity: integer(line.quantity, 1, 1_000_000, "quantity"), is_primary: line.is_primary };
  });
  if (result.filter(line => line.is_primary).length !== 1) invalid("primary line (exactly one required)");
  return result;
}
export function parseCreateSubscription(input: unknown): CreateSubscriptionInput {
  const data = object(input, ["customer_id", "plan_id", "template_id", "lines", "discount_id", "start_at", "expires_at", "payment_terms_days"]);
  if ((data.template_id !== undefined) === (data.lines !== undefined)) invalid("template_id or lines (choose one)");
  const terms = { customer_id: uuid(data.customer_id), plan_id: uuid(data.plan_id), start_at: instant(data.start_at), expires_at: instant(data.expires_at), ...optionalTerms(data) };
  dateRange(terms.start_at, terms.expires_at);
  return data.template_id !== undefined ? { ...terms, template_id: uuid(data.template_id) } : { ...terms, lines: lines(data.lines) };
}
function optionalTerms(data: Record<string, unknown>) {
  return {
    ...(data.discount_id !== undefined ? { discount_id: data.discount_id === null ? null : uuid(data.discount_id) } : {}),
    ...(data.payment_terms_days !== undefined ? { payment_terms_days: integer(data.payment_terms_days, 0, 365, "payment_terms_days") } : {}),
  };
}
export function parseUpdateDraft(input: unknown): UpdateDraftInput {
  const data = object(input, ["lines", "discount_id", "start_at", "expires_at", "payment_terms_days"]);
  if (Object.keys(data).length === 0) invalid("empty update");
  const result = { ...optionalTerms(data), ...(data.lines !== undefined ? { lines: lines(data.lines) } : {}), ...(data.start_at !== undefined ? { start_at: instant(data.start_at) } : {}), ...(data.expires_at !== undefined ? { expires_at: instant(data.expires_at) } : {}) };
  if (result.start_at && result.expires_at) dateRange(result.start_at, result.expires_at);
  return result;
}
export function parseRenew(input: unknown): RenewSubscriptionInput {
  const data = object(input, ["start_at", "expires_at"]);
  const result = { start_at: instant(data.start_at), expires_at: instant(data.expires_at) };
  dateRange(result.start_at, result.expires_at);
  return result;
}
function templateFields(data: Record<string, unknown>): UpdateTemplateInput {
  const result: UpdateTemplateInput = {};
  if (data.name !== undefined) {
    if (typeof data.name !== "string" || !data.name.trim()) invalid("name");
    result.name = data.name.trim();
  }
  if (data.plan_id !== undefined) result.plan_id = uuid(data.plan_id);
  if (data.lines !== undefined) result.lines = lines(data.lines);
  if (data.valid_days !== undefined) result.valid_days = integer(data.valid_days, 1, 3650, "valid_days");
  if (data.payment_terms_days !== undefined) result.payment_terms_days = integer(data.payment_terms_days, 0, 365, "payment_terms_days");
  if (data.is_active !== undefined) {
    if (typeof data.is_active !== "boolean") invalid("is_active");
    result.is_active = data.is_active;
  }
  return result;
}
export function parseCreateTemplate(input: unknown): CreateTemplateInput {
  const data = object(input, ["name", "plan_id", "valid_days", "payment_terms_days", "lines"]);
  const result = templateFields(data);
  if (!result.name || !result.plan_id || !result.lines) invalid("required template fields");
  return { ...result, name: result.name, plan_id: result.plan_id, lines: result.lines };
}
export function parseUpdateTemplate(input: unknown): UpdateTemplateInput {
  const data = object(input, ["name", "plan_id", "valid_days", "payment_terms_days", "lines", "is_active"]);
  if (!Object.keys(data).length) invalid("empty update");
  return templateFields(data);
}

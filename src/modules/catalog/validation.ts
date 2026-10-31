class CatalogError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(code: string, message: string) { super(`${message} ${code}`); }
}
import type { InvoicePricingInput, LineSelection, PriceQuoteInput, PricedLine } from "./contracts";

function invalid(field: string): never { throw new CatalogError("VALIDATION_ERROR", `Invalid ${field}.`); }
function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !keys.includes(k))) invalid("fields");
  return input as Record<string, unknown>;
}
export function uuid(input: unknown): string {
  if (typeof input !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) invalid("UUID");
  return input.toLowerCase();
}
export function minor(input: unknown, allowZero = true): string {
  if (typeof input !== "string" || !/^(0|[1-9][0-9]*)$/.test(input)) invalid("minor amount");
  const parsed = BigInt(input);
  if ((!allowZero && parsed === BigInt(0)) || parsed > BigInt("9000000000000000")) invalid("minor amount");
  return input;
}
function timestamp(input: unknown): string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(input) || !Number.isFinite(Date.parse(input))) invalid("UTC timestamp");
  return new Date(input).toISOString();
}
export function parseLines(input: unknown): LineSelection[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 1000) invalid("lines");
  const lines = input.map(raw => {
    const line = object(raw, ["product_id", "variant_id", "quantity", "is_primary"]);
    if (typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 1_000_000 || typeof line.is_primary !== "boolean") invalid("line");
    return { product_id: uuid(line.product_id), ...(line.variant_id !== undefined ? { variant_id: uuid(line.variant_id) } : {}), quantity: line.quantity, is_primary: line.is_primary };
  });
  if (lines.filter(l => l.is_primary).length !== 1) invalid("primary line");
  return lines;
}
export function parsePriceQuote(input: unknown): PriceQuoteInput {
  const data = object(input, ["plan_id", "lines", "at"]);
  return { plan_id: uuid(data.plan_id), lines: parseLines(data.lines), at: timestamp(data.at) };
}
function parsePricedLines(input: unknown): PricedLine[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 1000) invalid("lines");
  return input.map(raw => {
    const line = object(raw, ["id", "product_id", "variant_id", "quantity", "is_primary", "description", "variant_label", "unit_price_minor"]);
    if (typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 1_000_000 || typeof line.is_primary !== "boolean" || typeof line.description !== "string" || !line.description.trim() || line.description.length > 1000 || (line.variant_label !== null && typeof line.variant_label !== "string")) invalid("priced line");
    return { id: uuid(line.id), product_id: uuid(line.product_id), ...(line.variant_id !== undefined ? { variant_id: uuid(line.variant_id) } : {}), quantity: line.quantity, is_primary: line.is_primary, description: line.description, variant_label: line.variant_label as string | null, unit_price_minor: minor(line.unit_price_minor) };
  });
}
export function parseInvoicePricing(input: unknown): InvoicePricingInput {
  const data = object(input, ["currency", "lines", "discount_id", "at"]);
  if (typeof data.currency !== "string" || !/^[A-Z]{3}$/.test(data.currency) || (data.discount_id !== null && data.discount_id !== undefined && typeof data.discount_id !== "string")) invalid("invoice pricing");
  return { currency: data.currency, lines: parsePricedLines(data.lines), discount_id: data.discount_id == null ? null : uuid(data.discount_id), at: timestamp(data.at) };
}

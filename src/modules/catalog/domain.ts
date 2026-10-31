import type { InvoiceContext, InvoicePricedLine, InvoicePricingDTO, InvoicePricingInput, PricingDiscount, PriceQuoteDTO, PriceQuoteInput, QuoteContext, TaxRule } from "./contracts";
import { CatalogError } from "./errors";

const MAX_UNIT = BigInt("9000000000000");
const MAX_TOTAL = BigInt("9000000000000000");
function fail(message: string): never { throw new CatalogError("VALIDATION_ERROR", message); }
function checkTotal(value: bigint): bigint { if (value < BigInt(0) || value > MAX_TOTAL) return fail("Price total exceeds the supported range."); return value; }
function day(at: string): string { return new Date(at).toISOString().slice(0, 10); }
function dateActive(rule: TaxRule, at: string): boolean { const d = day(at); return rule.is_active && rule.starts_on <= d && (rule.ends_on === null || rule.ends_on >= d); }

/** Integer half-up (positive values; equivalently half away from zero). */
export function roundBps(minor: bigint, bps: number): bigint {
  if (minor < BigInt(0) || !Number.isInteger(bps) || bps < 0 || bps > 10_000) return fail("Invalid basis-point calculation.");
  return (minor * BigInt(bps) + BigInt(5000)) / BigInt(10000);
}

export function priceQuote(input: PriceQuoteInput, context: QuoteContext): PriceQuoteDTO {
  const plan = context.plan;
  if (!plan || !plan.is_active) throw new CatalogError("NOT_FOUND", "Plan not found.");
  if (day(input.at) < plan.available_from || (plan.available_until && day(input.at) > plan.available_until)) fail("Plan is outside its availability window.");
  if (input.lines.length === 0 || input.lines.filter(line => line.is_primary).length !== 1 || input.lines.filter(line => line.is_primary)[0]?.product_id !== plan.product_id) fail("Exactly one primary line matching the plan product is required.");
  const products = new Map(context.products.map(p => [p.id, p]));
  const variants = new Map(context.variants.map(v => [v.id, v]));
  let subtotal = BigInt(0);
  const lines = input.lines.map(selection => {
    const product = products.get(selection.product_id);
    if (!product || !product.is_active) throw new CatalogError("NOT_FOUND", "Product not found.");
    if (product.currency !== plan.currency) fail("Product and plan currencies must match.");
    if (selection.is_primary && selection.quantity < plan.min_quantity) fail("Primary quantity is below the plan minimum.");
    const variant = selection.variant_id ? variants.get(selection.variant_id) : undefined;
    if (selection.variant_id && (!variant || !variant.is_active || variant.product_id !== product.id)) fail("Variant must be active and belong to its product.");
    const base = selection.is_primary ? BigInt(plan.price_minor) : BigInt(product.sales_price_minor);
    const unit = base + (variant ? BigInt(variant.price_adjustment_minor) : BigInt(0));
    if (unit < BigInt(0) || unit > MAX_UNIT) fail("Adjusted unit price is outside the supported range.");
    subtotal = checkTotal(subtotal + unit * BigInt(selection.quantity));
    return { ...selection, description: product.name, variant_label: variant?.name ?? null, unit_price_minor: unit.toString() };
  });
  return { currency: plan.currency, lines, subtotal_minor: subtotal.toString() };
}

function eligible(discount: PricingDiscount, input: InvoicePricingInput, currency: string, subtotal: bigint, quantity: number) {
  const instant = Date.parse(input.at);
  return discount.is_active && (!discount.currency || discount.currency === currency) && subtotal >= BigInt(discount.min_subtotal_minor) && quantity >= discount.min_quantity && instant >= Date.parse(discount.starts_at) && (!discount.ends_at || instant < Date.parse(discount.ends_at));
}

function calculateDiscount(discount: PricingDiscount | null, input: InvoicePricingInput, subtotal: bigint, lines: InvoicePricingInput["lines"]): { total: bigint; allocations: bigint[] } {
  const zero = lines.map(() => BigInt(0));
  if (!discount) return { total: BigInt(0), allocations: zero };
  const scope = lines.map((line, index) => discount.scope === "subscription" || discount.product_ids.includes(line.product_id) ? index : -1).filter(index => index >= 0);
  if (scope.length === 0) return { total: BigInt(0), allocations: zero };
  const eligibleSubtotal = scope.reduce((sum, i) => sum + BigInt(lines[i]!.unit_price_minor) * BigInt(lines[i]!.quantity), BigInt(0));
  const eligibleQuantity = scope.reduce((sum, i) => sum + lines[i]!.quantity, 0);
  if (!eligible(discount, input, input.currency, eligibleSubtotal, eligibleQuantity)) return { total: BigInt(0), allocations: zero };
  if (discount.max_uses !== null && discount.used_count >= discount.max_uses) return { total: BigInt(0), allocations: zero };
  if (eligibleSubtotal === BigInt(0)) return { total: BigInt(0), allocations: zero };
  const total = discount.kind === "fixed"
    ? (discount.currency === input.currency ? BigInt(discount.amount_minor ?? "0") : BigInt(0))
    : (discount.percent_bps === null ? BigInt(0) : roundBps(eligibleSubtotal, discount.percent_bps));
  const capped = total > eligibleSubtotal ? eligibleSubtotal : total;
  if (capped === BigInt(0)) return { total: BigInt(0), allocations: zero };
  let assigned = BigInt(0);
  const allocations = zero;
  for (const i of scope) {
    const lineSubtotal = BigInt(lines[i]!.unit_price_minor) * BigInt(lines[i]!.quantity);
    allocations[i] = capped * lineSubtotal / eligibleSubtotal;
    assigned += allocations[i]!;
  }
  let remainder = capped - assigned;
  for (const i of scope.slice().sort((a, b) => lines[a]!.id < lines[b]!.id ? -1 : lines[a]!.id > lines[b]!.id ? 1 : 0)) {
    if (remainder === BigInt(0)) break;
    const capacity = BigInt(lines[i]!.unit_price_minor) * BigInt(lines[i]!.quantity) - allocations[i]!;
    const cents = capacity < remainder ? capacity : remainder;
    allocations[i] = allocations[i]! + cents;
    remainder -= cents;
  }
  if (remainder !== BigInt(0)) throw new CatalogError("INTERNAL_ERROR", "Discount allocation failed to conserve minor units.");
  return { total: capped, allocations };
}

export function priceInvoice(input: InvoicePricingInput, context: InvoiceContext): InvoicePricingDTO {
  const subtotal = input.lines.reduce((sum, line) => checkTotal(sum + BigInt(line.unit_price_minor) * BigInt(line.quantity)), BigInt(0));
  const discount = calculateDiscount(context.discount, input, subtotal, input.lines);
  const products = new Map(context.products.map(p => [p.id, p]));
  const taxMap = new Map(context.taxes.map(t => [t.id, t]));
  let taxTotal = BigInt(0);
  const lines: InvoicePricedLine[] = input.lines.map((line, index) => {
    const product = products.get(line.product_id);
    const candidate = product?.tax_rule_id ? taxMap.get(product.tax_rule_id) : undefined;
    const tax = candidate && dateActive(candidate, input.at) ? candidate : undefined;
    if (!product) throw new CatalogError("NOT_FOUND", "Invoice product not found.");
    const rate = tax?.rate_bps ?? 0;
    const taxable = BigInt(line.unit_price_minor) * BigInt(line.quantity) - discount.allocations[index]!;
    const taxMinor = roundBps(taxable, rate);
    taxTotal = checkTotal(taxTotal + taxMinor);
    return { ...line, discount_minor: discount.allocations[index]!.toString(), tax_rule_id: tax?.id ?? null, tax_rate_bps: rate, tax_minor: taxMinor.toString(), amount_minor: checkTotal(taxable + taxMinor).toString() };
  });
  const total = checkTotal(subtotal - discount.total + taxTotal);
  if (lines.reduce((sum, line) => sum + BigInt(line.discount_minor), BigInt(0)) !== discount.total || lines.reduce((sum, line) => sum + BigInt(line.tax_minor), BigInt(0)) !== taxTotal) throw new CatalogError("INTERNAL_ERROR", "Invoice totals do not match their line sums.");
  return { lines, subtotal_minor: subtotal.toString(), discount_minor: discount.total.toString(), tax_minor: taxTotal.toString(), total_minor: total.toString() };
}

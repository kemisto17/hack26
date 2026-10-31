import type {
  InvoicePricedLine, InvoicePricingDTO, LineSelection, PriceQuoteDTO,
  PricingDiscount, PricingPlan, PricingProduct, PricingVariant, TaxRule as PricingTaxRule,
} from "./contracts";
import { supportedCurrency } from "./validation";

const MAX_UNIT = BigInt("9000000000000");
const MAX_TOTAL = BigInt("9000000000000000");
const MAX_QUANTITY = 1_000_000;

export class PricingError extends Error {
  constructor(readonly code: "VALIDATION_ERROR" | "NOT_FOUND" | "UNAVAILABLE", message: string) {
    super(message);
    this.name = "PricingError";
  }
}

function fail(message: string, code: PricingError["code"] = "VALIDATION_ERROR"): never {
  throw new PricingError(code, message);
}

function minor(value: string, field: string, max = MAX_UNIT): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) fail(`${field} must be a nonnegative decimal integer.`);
  const parsed = BigInt(value);
  if (parsed > max) fail(`${field} exceeds the supported amount.`);
  return parsed;
}

function signedMinor(value: string, field: string): bigint {
  if (typeof value !== "string" || !/^(0|-?[1-9]\d*)$/.test(value)) fail(`${field} must be a decimal integer.`);
  const parsed = BigInt(value);
  if (parsed < -MAX_UNIT || parsed > MAX_UNIT) fail(`${field} exceeds the supported amount.`);
  return parsed;
}

function utcDate(value: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) fail("at must be a UTC timestamp.");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().replace(/\.\d{3}Z$/, "Z") !== value.replace(/\.\d{3}Z$/, "Z")) fail("at must be a valid UTC timestamp.");
  return date.toISOString().slice(0, 10);
}

function validateCurrency(currency: string): void {
  try { supportedCurrency(currency); } catch { fail("Currency must be a supported ISO currency code."); }
}

function validateLines(lines: LineSelection[]): void {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) fail("At least one and at most 100 lines are required.");
  let primaryCount = 0;
  for (const line of lines) {
    if (!line || typeof line.product_id !== "string" || !line.product_id ||
        (line.variant_id !== undefined && (typeof line.variant_id !== "string" || !line.variant_id)) ||
        !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY ||
        typeof line.is_primary !== "boolean") fail("Invalid line selection.");
    if (line.is_primary) primaryCount++;
  }
  if (primaryCount !== 1) fail("Exactly one primary line is required.");
}

function subtotal(lines: Array<{ quantity: number; unit_price_minor: string }>): bigint {
  const total = lines.reduce((sum, line) => sum + BigInt(line.quantity) * minor(line.unit_price_minor, "unit_price_minor"), BigInt(0));
  if (total > MAX_TOTAL) fail("Subtotal exceeds the supported amount.");
  return total;
}

/** Price a draft against server-loaded catalog rows. The plan supplies the
 * primary product's base price; the product base is charged only for add-ons. */
export function calculateQuote(args: {
  plan: PricingPlan;
  products: PricingProduct[];
  variants: PricingVariant[];
  lines: LineSelection[];
  at: string;
}): PriceQuoteDTO {
  const day = utcDate(args.at);
  const { plan } = args;
  validateCurrency(plan.currency);
  minor(plan.price_minor, "plan.price_minor");
  if (!plan.is_active || day < plan.available_from || (plan.available_until !== null && day > plan.available_until)) fail("Plan is unavailable on the selected date.", "UNAVAILABLE");
  validateLines(args.lines);
  const products = new Map(args.products.map(item => [item.id, item]));
  const variants = new Map(args.variants.map(item => [item.id, item]));
  const primary = args.lines.find(line => line.is_primary)!;
  if (primary.product_id !== plan.product_id || primary.quantity < plan.min_quantity) fail("Primary line must match the plan and meet its minimum quantity.");
  const priced = args.lines.map((line, index) => {
    const product = products.get(line.product_id);
    if (!product || !product.is_active) fail("Product is unavailable.", "UNAVAILABLE");
    if (product.currency !== plan.currency) fail("All plan and product currencies must match.");
    const variant = line.variant_id === undefined ? undefined : variants.get(line.variant_id);
    if (line.variant_id !== undefined && (!variant || !variant.is_active || variant.product_id !== product.id)) fail("Variant does not belong to the selected active product.");
    const base = line.is_primary ? minor(plan.price_minor, "plan.price_minor") : minor(product.sales_price_minor, "product.sales_price_minor");
    const unit = base + (variant ? signedMinor(variant.price_adjustment_minor, "variant.price_adjustment_minor") : BigInt(0));
    if (unit < BigInt(0) || unit > MAX_UNIT) fail("Adjusted unit price is outside the supported range.");
    return {
      // Stable preview-only UUID; never persisted as a catalog or invoice row.
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      product_id: line.product_id,
      ...(line.variant_id ? { variant_id: line.variant_id } : {}),
      quantity: line.quantity,
      is_primary: line.is_primary,
      description: product.name,
      variant_label: variant?.name ?? null,
      unit_price_minor: unit.toString(),
    };
  });
  return { currency: plan.currency, lines: priced, subtotal_minor: subtotal(priced).toString() };
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / BigInt(2)) / denominator;
}

/** Discount/tax preview. Usage is advisory; D4 rechecks and redeems under lock.
 * Tax uses the invoice period date; discount windows use the preview instant. */
export function calculateInvoicePricing(args: {
  currency: string;
  lines: Array<{ id: string; product_id: string; quantity: number; unit_price_minor: string; description: string; variant_label: string | null; variant_id?: string; is_primary: boolean }>;
  taxes: Map<string, PricingTaxRule | undefined>;
  productTaxRuleIds: Map<string, string | null>;
  discount: PricingDiscount | null;
  period_start: string;
  at: string;
}): InvoicePricingDTO {
  validateCurrency(args.currency);
  const day = utcDate(args.period_start);
  utcDate(args.at);
  validateLines(args.lines);
  if (new Set(args.lines.map(line => line.id)).size !== args.lines.length) fail("Invoice line IDs must be unique.");
  const rawSubtotal = subtotal(args.lines);
  const discount = args.discount;
  const allocations = new Map<string, bigint>();
  let discountTotal = BigInt(0);
  if (discount) {
    if (!discount.id || !["product", "subscription"].includes(discount.scope) || !["fixed", "percentage"].includes(discount.kind)) fail("Invalid discount rule.");
    if (!Number.isSafeInteger(discount.min_quantity) || discount.min_quantity < 1 || discount.min_quantity > MAX_QUANTITY) fail("Invalid discount minimum quantity.");
    minor(discount.min_subtotal_minor, "discount.min_subtotal_minor", MAX_TOTAL);
    if (!Number.isFinite(Date.parse(discount.starts_at)) || (discount.ends_at !== null && !Number.isFinite(Date.parse(discount.ends_at)))) fail("Invalid discount dates.");
    if (!Number.isSafeInteger(discount.used_count) || discount.used_count < 0 || (discount.max_uses !== null && (!Number.isSafeInteger(discount.max_uses) || discount.max_uses < 1))) fail("Invalid discount usage count.");
    if (discount.scope === "product" && (!discount.product_ids.length || new Set(discount.product_ids).size !== discount.product_ids.length)) fail("Product discounts require unique eligible products.");
    if (discount.scope === "subscription" && discount.product_ids.length) fail("Subscription discounts cannot include product mappings.");
    if (discount.kind === "fixed") {
      if (discount.amount_minor === null || discount.currency === null || discount.percent_bps !== null) fail("Invalid fixed discount rule.");
      validateCurrency(discount.currency);
      minor(discount.amount_minor, "discount.amount_minor", MAX_TOTAL);
    } else if (discount.amount_minor !== null || discount.currency !== null || !Number.isInteger(discount.percent_bps) || discount.percent_bps! < 1 || discount.percent_bps! > 10000) {
      fail("Invalid percentage discount rule.");
    }
  }
  const discountAt = Date.parse(args.at);
  if (discount && discount.is_active && Date.parse(discount.starts_at) <= discountAt && (discount.ends_at === null || discountAt < Date.parse(discount.ends_at)) && (discount.max_uses === null || discount.used_count < discount.max_uses)) {
    if (discount.kind === "fixed" && discount.currency !== args.currency) fail("Discount currency must match invoice currency.");
    const eligible = args.lines.filter(line => discount.scope === "subscription" || discount.product_ids.includes(line.product_id));
    const eligibleQuantity = eligible.reduce((sum, line) => sum + line.quantity, 0);
    const eligibleSubtotal = subtotal(eligible);
    if (eligible.length && eligibleQuantity >= discount.min_quantity && eligibleSubtotal >= minor(discount.min_subtotal_minor, "discount.min_subtotal_minor", MAX_TOTAL)) {
      let requested = discount.kind === "fixed"
        ? minor(discount.amount_minor!, "discount.amount_minor", MAX_TOTAL)
        : roundHalfUp(eligibleSubtotal * BigInt(discount.percent_bps!), BigInt(10000));
      requested = requested < eligibleSubtotal ? requested : eligibleSubtotal;
      const eligibleIds = [...eligible].sort((a, b) => a.id.localeCompare(b.id));
      let allocated = BigInt(0);
      for (const line of eligibleIds) {
        const share = eligibleSubtotal === BigInt(0) ? BigInt(0) : requested * BigInt(line.quantity) * BigInt(line.unit_price_minor) / eligibleSubtotal;
        allocations.set(line.id, share);
        allocated += share;
      }
      let remainder = requested - allocated;
      for (const line of eligibleIds) {
        if (remainder === BigInt(0)) break;
        const capacity = BigInt(line.quantity) * BigInt(line.unit_price_minor) - (allocations.get(line.id) ?? BigInt(0));
        if (capacity > BigInt(0)) { allocations.set(line.id, (allocations.get(line.id) ?? BigInt(0)) + BigInt(1)); remainder--; }
      }
      discountTotal = requested;
    }
  }
  const result: InvoicePricedLine[] = args.lines.map(line => {
    const lineBase = BigInt(line.quantity) * minor(line.unit_price_minor, "unit_price_minor");
    const lineDiscount = allocations.get(line.id) ?? BigInt(0);
    const ruleId = args.productTaxRuleIds.get(line.product_id) ?? null;
    const rule = ruleId ? args.taxes.get(ruleId) : undefined;
    if (ruleId && !rule) fail("Tax rule could not be loaded.", "NOT_FOUND");
    const rate = rule && rule.is_active && day >= rule.starts_on && (rule.ends_on === null || day <= rule.ends_on) ? rule.rate_bps : 0;
    if (!Number.isInteger(rate) || rate < 0 || rate > 10000) fail("Invalid tax rate.");
    const tax = roundHalfUp((lineBase - lineDiscount) * BigInt(rate), BigInt(10000));
    return { ...line, discount_minor: lineDiscount.toString(), tax_rule_id: rule && rate > 0 ? rule.id : null, tax_rate_bps: rate, tax_minor: tax.toString(), amount_minor: (lineBase - lineDiscount + tax).toString() };
  });
  const taxTotal = result.reduce((sum, line) => sum + BigInt(line.tax_minor), BigInt(0));
  const total = rawSubtotal - discountTotal + taxTotal;
  if (taxTotal > MAX_TOTAL || total > MAX_TOTAL) fail("Invoice total exceeds the supported amount.");
  return { lines: result, subtotal_minor: rawSubtotal.toString(), discount_minor: discountTotal.toString(), tax_minor: taxTotal.toString(), total_minor: total.toString() };
}

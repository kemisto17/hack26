import "server-only";
import type { Actor, CatalogDTO, CatalogPlanDTO, CatalogProductDTO, CreatePlanInput, CreateProductInput, CreateTaxRuleInput, CreateVariantInput, DiscountDTO, InvoiceContext, InvoicePricingDTO, InvoicePricingInput, Page, PageQuery, PlanDTO, PriceQuoteDTO, PriceQuoteInput, PricingDiscount, ProductDTO, QuoteContext, TaxRuleDTO, UpdatePlanInput, UpdateProductInput, UpdateTaxRuleInput, UpdateVariantInput, VariantDTO } from "./contracts";
import { AppError } from "../../lib/api/errors";
import { strictObject, uuid as parseUuid, version as parseVersion } from "../../lib/api/validation";
import { createAdminClient } from "../../lib/supabase/admin";
import type { Database } from "../../lib/supabase/database.types";
import { createSessionClient } from "../../lib/supabase/server";
import { requireActor } from "../identity/service";
import { CatalogError } from "./errors";
import { parseCreatePlan, parseCreateProduct, parseCreateTaxRule, parseCreateVariant, parseUpdatePlan, parseUpdateProduct, parseUpdateTaxRule, parseUpdateVariant, validatePlanResult } from "./config-validation";
import { priceInvoice as priceInvoiceDomain, priceQuote as priceQuoteDomain } from "./domain";
import { parseInvoicePricing, parsePriceQuote, uuid } from "./validation";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type VariantRow = Database["public"]["Tables"]["variants"]["Row"];
type PlanRow = Database["public"]["Tables"]["plans"]["Row"];
type TaxRow = Database["public"]["Tables"]["tax_rules"]["Row"];
type DiscountRow = Database["public"]["Tables"]["discounts"]["Row"];
const productFields = "id,name,product_type,sales_price_minor,cost_price_minor,currency,notes,tax_rule_id,is_active,version,created_at,updated_at";
const variantFields = "id,product_id,name,attributes,price_adjustment_minor,is_active,version,created_at,updated_at";
const planFields = "id,product_id,name,price_minor,currency,billing_interval,min_quantity,available_from,available_until,auto_close,allow_close,allow_pause,allow_renew,is_active,version,created_at,updated_at";
const taxFields = "id,name,rate_bps,starts_on,ends_on,is_active,version,created_at,updated_at";

/** Request-scoped data/auth bindings. No client, credential or actor is global. */
export type CatalogBindings = {
  requireActor(): Promise<Actor>;
  readQuoteContext(actor: Actor, planId: string, lines: PriceQuoteInput["lines"], at: string): Promise<QuoteContext>;
  readInvoiceContext(actor: Actor, input: InvoicePricingInput): Promise<InvoiceContext>;
  /** Authoritative invoice header and frozen lines; discount usage comes from the current redemption count. */
  readInvoiceLines?(actor: Actor, invoiceId: string): Promise<{ currency: string; period_start: string; lines: InvoicePricingInput["lines"]; discount_id: string | null }>;
  currentInstant(): string;
};
function verifyActor(current: Actor, supplied: Actor): void {
  if (current.id !== supplied.id) throw new CatalogError("FORBIDDEN", "Session actor mismatch.");
}
function invoiceDTO(value: InvoicePricingDTO): InvoicePricingDTO {
  return { lines: value.lines.map(line => ({ id: line.id, product_id: line.product_id, ...(line.variant_id ? { variant_id: line.variant_id } : {}), quantity: line.quantity, is_primary: line.is_primary, description: line.description, variant_label: line.variant_label, unit_price_minor: line.unit_price_minor, discount_minor: line.discount_minor, tax_rule_id: line.tax_rule_id, tax_rate_bps: line.tax_rate_bps, tax_minor: line.tax_minor, amount_minor: line.amount_minor })), subtotal_minor: value.subtotal_minor, discount_minor: value.discount_minor, tax_minor: value.tax_minor, total_minor: value.total_minor };
}
export function bindCatalogServices(bindings: CatalogBindings) {
  return {
    async priceQuote(actor: Actor, input: PriceQuoteInput): Promise<PriceQuoteDTO> {
      const verified = await bindings.requireActor(); verifyActor(verified, actor);
      if (verified.role === "customer") throw new CatalogError("FORBIDDEN", "Pricing quotes require staff access.");
      const parsed = parsePriceQuote(input);
      const context = await bindings.readQuoteContext(verified, parsed.plan_id, parsed.lines, parsed.at);
      return priceQuoteDomain(parsed, context);
    },
    async priceInvoice(actor: Actor, input: InvoicePricingInput): Promise<InvoicePricingDTO> {
      const verified = await bindings.requireActor(); verifyActor(verified, actor);
      if (verified.role === "customer") throw new CatalogError("FORBIDDEN", "Invoice pricing preview requires staff access.");
      const parsed = parseInvoicePricing(input);
      const context = await bindings.readInvoiceContext(verified, parsed);
      return invoiceDTO(priceInvoiceDomain(parsed, context));
    },
    async priceInvoiceDraft(actor: Actor, invoiceId: string): Promise<InvoicePricingDTO> {
      const verified = await bindings.requireActor(); verifyActor(verified, actor);
      if (verified.role === "customer") throw new CatalogError("FORBIDDEN", "Invoice pricing preview requires staff access.");
      if (!bindings.readInvoiceLines) throw new CatalogError("INTERNAL_ERROR", "Invoice pricing binding is unavailable.");
      const data = await bindings.readInvoiceLines(verified, uuid(invoiceId));
      const contextInput: InvoicePricingInput = { ...data, at: bindings.currentInstant() };
      const parsed = parseInvoicePricing(contextInput);
      const context = await bindings.readInvoiceContext(verified, parsed);
      return invoiceDTO(priceInvoiceDomain(parsed, context));
    },
  };
}
export type CatalogServices = ReturnType<typeof bindCatalogServices>;

type Cursor = { scope: string; created_at: string; id: string; day?: string };
type ParsedPage = { limit: number; cursor: Cursor | null };
const MAX_CURSOR_LENGTH = 2048;

function databaseError(error: { code?: string; message: string }): never {
  if (error.code === "23505") throw new AppError("VALIDATION_ERROR", "A catalog item with those details already exists.");
  if (error.code === "23503") throw new AppError("NOT_FOUND", "A referenced catalog item was not found.");
  if (["FORBIDDEN", "NOT_FOUND", "VERSION_CONFLICT", "INVALID_TRANSITION", "VALIDATION_ERROR"].includes(error.message)) {
    const code = error.message as "FORBIDDEN" | "NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_TRANSITION" | "VALIDATION_ERROR";
    throw new AppError(code, code === "VERSION_CONFLICT" ? "This catalog item changed. Refresh and try again." : "The catalog operation could not be completed.");
  }
  throw new AppError("INTERNAL_ERROR", "Catalog operation failed.");
}
async function currentActor(actor: Actor): Promise<Actor> {
  const current = await requireActor();
  if (current.id !== actor.id) throw new AppError("FORBIDDEN", "Actor does not match this session.");
  return current;
}
async function staffActor(actor: Actor): Promise<Actor> {
  const current = await currentActor(actor);
  if (current.role === "customer") throw new AppError("FORBIDDEN", "Staff access is required.");
  return current;
}
async function adminActor(actor: Actor): Promise<Actor> {
  const current = await currentActor(actor);
  if (current.role !== "admin") throw new AppError("FORBIDDEN", "Admin access is required.");
  return current;
}
function versionText(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1) throw new AppError("INTERNAL_ERROR", "Catalog version is outside the supported range.");
  return String(value);
}
function minorText(value: number, signed = false): string {
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) throw new AppError("INTERNAL_ERROR", "Catalog amount is outside the supported range.");
  return String(value);
}
function productDTO(row: ProductRow): ProductDTO {
  return { id: row.id, name: row.name, product_type: row.product_type as ProductDTO["product_type"], sales_price_minor: minorText(row.sales_price_minor), cost_price_minor: minorText(row.cost_price_minor), currency: row.currency, notes: row.notes, tax_rule_id: row.tax_rule_id, is_active: row.is_active, version: versionText(row.version), created_at: row.created_at, updated_at: row.updated_at };
}
function variantDTO(row: VariantRow): VariantDTO {
  return { id: row.id, product_id: row.product_id, name: row.name, attributes: row.attributes as Record<string, unknown>, price_adjustment_minor: minorText(row.price_adjustment_minor, true), is_active: row.is_active, version: versionText(row.version), created_at: row.created_at, updated_at: row.updated_at };
}
function planDTO(row: PlanRow): PlanDTO {
  return { id: row.id, product_id: row.product_id, name: row.name, price_minor: minorText(row.price_minor), currency: row.currency, billing_interval: row.billing_interval as PlanDTO["billing_interval"], min_quantity: row.min_quantity, available_from: row.available_from, available_until: row.available_until, auto_close: row.auto_close, allow_close: row.allow_close, allow_pause: row.allow_pause, allow_renew: row.allow_renew, is_active: row.is_active, version: versionText(row.version), created_at: row.created_at, updated_at: row.updated_at };
}
function taxDTO(row: TaxRow): TaxRuleDTO {
  return { id: row.id, name: row.name, rate_bps: row.rate_bps, starts_on: row.starts_on, ends_on: row.ends_on, is_active: row.is_active, version: versionText(row.version), created_at: row.created_at, updated_at: row.updated_at };
}
function catalogPlan(row: PlanRow): CatalogPlanDTO {
  return { id: row.id, product_id: row.product_id, name: row.name, price_minor: minorText(row.price_minor), currency: row.currency, billing_interval: row.billing_interval as CatalogPlanDTO["billing_interval"], min_quantity: row.min_quantity, available_from: row.available_from, available_until: row.available_until, auto_close: row.auto_close, allow_close: row.allow_close, allow_pause: row.allow_pause, allow_renew: row.allow_renew };
}
function pageInput(query: PageQuery, scope: string, day?: string): ParsedPage {
  strictObject(query, ["limit", "cursor"]);
  const limit = query.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError("VALIDATION_ERROR", "Invalid page limit.");
  let cursor: Cursor | null = null;
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== "string" || !query.cursor || query.cursor.length > MAX_CURSOR_LENGTH) throw new AppError("VALIDATION_ERROR", "Invalid page cursor.");
    try {
      const value = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")) as Record<string, unknown>;
      if (value.scope !== scope || typeof value.created_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value.created_at) || !Number.isFinite(Date.parse(value.created_at)) || new Date(value.created_at).toISOString().replace(/\.\d{3}Z$/, "Z") !== value.created_at.replace(/\.\d{3}Z$/, "Z") || typeof value.id !== "string" || (day !== undefined && value.day !== day)) throw new Error();
      cursor = { scope, created_at: value.created_at, id: parseUuid(value.id), ...(day === undefined ? {} : { day }) };
    } catch { throw new AppError("VALIDATION_ERROR", "Invalid page cursor."); }
  }
  return { limit, cursor };
}
function nextCursor(scope: string, created_at: string, id: string, day?: string): string {
  return Buffer.from(JSON.stringify({ scope, created_at, id, ...(day === undefined ? {} : { day }) }), "utf8").toString("base64url");
}
function cursorFilter(cursor: Cursor): string {
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}
function pageResult<T extends { id: string; created_at: string }>(rows: T[], limit: number, scope: string, day?: string): { rows: T[]; next_cursor: string | null } {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  return { rows: page, next_cursor: hasMore && last ? nextCursor(scope, last.created_at, last.id, day) : null };
}
function requireRow<T>(data: T | null, message = "Catalog item not found."): T {
  if (!data) throw new AppError("NOT_FOUND", message);
  return data;
}
function parseExpected(input: Record<string, unknown>): string {
  return parseVersion(input.expected_version);
}

/** Request-bound Supabase and verified actor bindings; safe for Server Components and route handlers. */
function requestPricingBindings(): CatalogBindings {
  return {
    requireActor,
    currentInstant: () => new Date().toISOString(),
    async readQuoteContext(actor, planId, lines) {
      await staffActor(actor);
      const client = await createSessionClient();
      const planResult = await client.from("plans").select(planFields).eq("id", planId).maybeSingle();
      if (planResult.error) databaseError(planResult.error);
      const productIds = [...new Set(lines.map(line => line.product_id))];
      const [productResult, variantResult] = await Promise.all([
        client.from("products").select(productFields).in("id", productIds),
        client.from("variants").select(variantFields).in("product_id", productIds),
      ]);
      if (productResult.error) databaseError(productResult.error);
      if (variantResult.error) databaseError(variantResult.error);
      const plan = planResult.data ? planDTO(planResult.data) : null;
      return { plan: plan ? { ...plan, is_active: plan.is_active } : null, products: (productResult.data ?? []).map(productDTO), variants: (variantResult.data ?? []).map(variantDTO) };
    },
    async readInvoiceContext(actor, input) {
      await staffActor(actor);
      const client = await createSessionClient();
      const productIds = [...new Set(input.lines.map(line => line.product_id))];
      const productResult = await client.from("products").select(productFields).in("id", productIds);
      if (productResult.error) databaseError(productResult.error);
      const productRows = productResult.data ?? [];
      const taxIds = [...new Set(productRows.map(product => product.tax_rule_id).filter((id): id is string => id !== null))];
      const taxResult = taxIds.length ? await client.from("tax_rules").select(taxFields).in("id", taxIds) : { data: [], error: null };
      if (taxResult.error) databaseError(taxResult.error);
      let discount: PricingDiscount | null = null;
      if (input.discount_id) {
        const discountResult = await client.from("discounts").select("*").eq("id", input.discount_id).maybeSingle();
        if (discountResult.error) databaseError(discountResult.error);
        if (discountResult.data) {
          const [mapped, usage] = await Promise.all([
            client.from("discount_products").select("product_id").eq("discount_id", input.discount_id),
            client.from("discount_redemptions").select("id", { count: "exact", head: true }).eq("discount_id", input.discount_id),
          ]);
          if (mapped.error) databaseError(mapped.error);
          if (usage.error) databaseError(usage.error);
          const row = discountResult.data;
          discount = { id: row.id, scope: row.scope as PricingDiscount["scope"], kind: row.kind as PricingDiscount["kind"], amount_minor: row.amount_minor === null ? null : minorText(row.amount_minor), currency: row.currency, percent_bps: row.percent_bps, min_quantity: row.min_quantity, min_subtotal_minor: minorText(row.min_subtotal_minor), starts_at: row.starts_at, ends_at: row.ends_at, max_uses: row.max_uses, used_count: usage.count ?? 0, is_active: row.is_active, product_ids: (mapped.data ?? []).map(item => item.product_id) };
        }
      }
      return { products: productRows.map(productDTO), taxes: (taxResult.data ?? []).map(row => ({ id: row.id, name: row.name, rate_bps: row.rate_bps, starts_on: row.starts_on, ends_on: row.ends_on, is_active: row.is_active })), discount };
    },
    async readInvoiceLines(actor, invoiceId) {
      await staffActor(actor);
      const client = await createSessionClient();
      const invoice = await client.from("invoices").select("id,currency,period_start,status,subscription_id").eq("id", invoiceId).maybeSingle();
      if (invoice.error) databaseError(invoice.error);
      if (!invoice.data) throw new AppError("NOT_FOUND", "Invoice not found.");
      if (invoice.data.status !== "draft") throw new AppError("INVALID_TRANSITION", "Only draft invoices can be repriced.");
      const subscription = await client.from("subscriptions").select("discount_id").eq("id", invoice.data.subscription_id).maybeSingle();
      if (subscription.error) databaseError(subscription.error);
      const lineResult = await client.from("invoice_lines").select("id,subscription_line_id,description,variant_label,quantity,unit_price_minor").eq("invoice_id", invoiceId).order("id", { ascending: true });
      if (lineResult.error) databaseError(lineResult.error);
      const sourceIds = [...new Set((lineResult.data ?? []).map(line => line.subscription_line_id))];
      const sourceResult = sourceIds.length ? await client.from("subscription_lines").select("id,product_id,variant_id,is_primary").in("id", sourceIds) : { data: [], error: null };
      if (sourceResult.error) databaseError(sourceResult.error);
      const sources = new Map((sourceResult.data ?? []).map(line => [line.id, line]));
      const lines = (lineResult.data ?? []).map(line => {
        const source = sources.get(line.subscription_line_id);
        if (!source) throw new AppError("INTERNAL_ERROR", "Invoice source line is unavailable.");
        return { id: line.id, product_id: source.product_id, ...(source.variant_id ? { variant_id: source.variant_id } : {}), quantity: line.quantity, is_primary: source.is_primary, description: line.description, variant_label: line.variant_label, unit_price_minor: minorText(line.unit_price_minor) };
      });
      return { currency: invoice.data.currency, period_start: invoice.data.period_start, lines, discount_id: subscription.data?.discount_id ?? null };
    },
  };
}

export async function priceQuote(actor: Actor, input: PriceQuoteInput): Promise<PriceQuoteDTO> {
  return bindCatalogServices(requestPricingBindings()).priceQuote(actor, input);
}
export async function priceInvoice(actor: Actor, input: InvoicePricingInput): Promise<InvoicePricingDTO> {
  return bindCatalogServices(requestPricingBindings()).priceInvoice(actor, input);
}
export async function priceInvoiceDraft(actor: Actor, invoiceId: string): Promise<InvoicePricingDTO> {
  return bindCatalogServices(requestPricingBindings()).priceInvoiceDraft(actor, invoiceId);
}

export async function getCatalog(actor: Actor, query: PageQuery = {}): Promise<{ catalog: CatalogDTO; next_cursor: string | null }> {
  await currentActor(actor);
  const today = new Date().toISOString().slice(0, 10);
  const page = pageInput(query, "catalog", today);
  const client = createAdminClient(); // Safe projection only, after current actor verification.
  let plansQuery = client.from("plans").select(planFields).eq("is_active", true).lte("available_from", today).or(`available_until.is.null,available_until.gte.${today}`).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (page.cursor) plansQuery = plansQuery.or(cursorFilter(page.cursor));
  const plansResult = await plansQuery.limit(page.limit + 1);
  if (plansResult.error) databaseError(plansResult.error);
  const planPage = pageResult(plansResult.data ?? [], page.limit, "catalog", today);
  const productIds = [...new Set(planPage.rows.map(plan => plan.product_id))];
  const productsResult = productIds.length ? await client.from("products").select("id,name,product_type,sales_price_minor,currency,is_active").in("id", productIds).eq("is_active", true) : { data: [], error: null };
  if (productsResult.error) databaseError(productsResult.error);
  const products = productsResult.data ?? [];
  const eligibleProductIds = new Set(products.map(product => product.id));
  const variantsResult = eligibleProductIds.size ? await client.from("variants").select("id,product_id,name,attributes,price_adjustment_minor,is_active").in("product_id", [...eligibleProductIds]).eq("is_active", true).order("name") : { data: [], error: null };
  if (variantsResult.error) databaseError(variantsResult.error);
  const variantsByProduct = new Map<string, CatalogProductDTO["variants"]>();
  for (const row of variantsResult.data ?? []) {
    const bucket = variantsByProduct.get(row.product_id) ?? [];
    bucket.push({ id: row.id, name: row.name, attributes: row.attributes as Record<string, unknown>, price_adjustment_minor: minorText(row.price_adjustment_minor, true) });
    variantsByProduct.set(row.product_id, bucket);
  }
  const catalogProducts = products.map(row => ({ id: row.id, name: row.name, product_type: row.product_type as CatalogProductDTO["product_type"], sales_price_minor: minorText(row.sales_price_minor), currency: row.currency, variants: variantsByProduct.get(row.id) ?? [] }));
  const catalogPlans = planPage.rows.filter(row => eligibleProductIds.has(row.product_id)).map(catalogPlan);
  return { catalog: { products: catalogProducts, plans: catalogPlans }, next_cursor: planPage.next_cursor };
}

async function listRows<T extends ProductRow | VariantRow | PlanRow | TaxRow>(actor: Actor, query: PageQuery, scope: "products" | "variants" | "plans" | "tax-rules", fields: string): Promise<Page<T>> {
  await staffActor(actor);
  const page = pageInput(query, scope);
  const client = await createSessionClient();
  if (scope === "products") {
    let q = client.from("products").select(fields).order("created_at", { ascending: false }).order("id", { ascending: false });
    if (page.cursor) q = q.or(cursorFilter(page.cursor));
    const result = await q.limit(page.limit + 1); if (result.error) databaseError(result.error);
    const resultPage = pageResult((result.data ?? []) as unknown as T[], page.limit, scope); return { items: resultPage.rows, next_cursor: resultPage.next_cursor };
  }
  if (scope === "variants") {
    let q = client.from("variants").select(fields).order("created_at", { ascending: false }).order("id", { ascending: false });
    if (page.cursor) q = q.or(cursorFilter(page.cursor));
    const result = await q.limit(page.limit + 1); if (result.error) databaseError(result.error);
    const resultPage = pageResult((result.data ?? []) as unknown as T[], page.limit, scope); return { items: resultPage.rows, next_cursor: resultPage.next_cursor };
  }
  if (scope === "plans") {
    let q = client.from("plans").select(fields).order("created_at", { ascending: false }).order("id", { ascending: false });
    if (page.cursor) q = q.or(cursorFilter(page.cursor));
    const result = await q.limit(page.limit + 1); if (result.error) databaseError(result.error);
    const resultPage = pageResult((result.data ?? []) as unknown as T[], page.limit, scope); return { items: resultPage.rows, next_cursor: resultPage.next_cursor };
  }
  let q = client.from("tax_rules").select(fields).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (page.cursor) q = q.or(cursorFilter(page.cursor));
  const result = await q.limit(page.limit + 1); if (result.error) databaseError(result.error);
  const resultPage = pageResult((result.data ?? []) as unknown as T[], page.limit, scope); return { items: resultPage.rows, next_cursor: resultPage.next_cursor };
}

export async function listProducts(actor: Actor, query: PageQuery = {}): Promise<Page<ProductDTO>> {
  const result = await listRows<ProductRow>(actor, query, "products", productFields); return { ...result, items: result.items.map(productDTO) };
}
export async function listVariants(actor: Actor, query: PageQuery = {}): Promise<Page<VariantDTO>> {
  const result = await listRows<VariantRow>(actor, query, "variants", variantFields); return { ...result, items: result.items.map(variantDTO) };
}
export async function listPlans(actor: Actor, query: PageQuery = {}): Promise<Page<PlanDTO>> {
  const result = await listRows<PlanRow>(actor, query, "plans", planFields); return { ...result, items: result.items.map(planDTO) };
}
export async function listTaxRules(actor: Actor, query: PageQuery = {}): Promise<Page<TaxRuleDTO>> {
  const result = await listRows<TaxRow>(actor, query, "tax-rules", taxFields); return { ...result, items: result.items.map(taxDTO) };
}
function discountDTO(row: DiscountRow, productIds: string[]): DiscountDTO {
  return { id: row.id, code: row.code, name: row.name, scope: row.scope as DiscountDTO["scope"], kind: row.kind as DiscountDTO["kind"], amount_minor: row.amount_minor === null ? null : minorText(row.amount_minor), currency: row.currency, percent_bps: row.percent_bps, min_quantity: row.min_quantity, min_subtotal_minor: minorText(row.min_subtotal_minor), starts_at: row.starts_at, ends_at: row.ends_at, max_uses: row.max_uses, product_ids: productIds, is_active: row.is_active, version: versionText(row.version), created_at: row.created_at, updated_at: row.updated_at };
}
export async function listDiscounts(actor: Actor, query: PageQuery = {}): Promise<Page<DiscountDTO>> {
  await staffActor(actor);
  const page = pageInput(query, "discounts"); const client = await createSessionClient();
  let q = client.from("discounts").select("*").order("created_at", { ascending: false }).order("id", { ascending: false });
  if (page.cursor) q = q.or(cursorFilter(page.cursor));
  const result = await q.limit(page.limit + 1); if (result.error) databaseError(result.error);
  const resultPage = pageResult(result.data ?? [], page.limit, "discounts");
  const ids = resultPage.rows.map(row => row.id);
  const mappings = ids.length ? await client.from("discount_products").select("discount_id,product_id").in("discount_id", ids) : { data: [], error: null };
  if (mappings.error) databaseError(mappings.error);
  const productsByDiscount = new Map<string, string[]>();
  for (const mapping of mappings.data ?? []) productsByDiscount.set(mapping.discount_id, [...(productsByDiscount.get(mapping.discount_id) ?? []), mapping.product_id]);
  return { items: resultPage.rows.map(row => discountDTO(row, productsByDiscount.get(row.id) ?? [])), next_cursor: resultPage.next_cursor };
}
export async function getDiscount(actor: Actor, id: string): Promise<DiscountDTO> {
  await staffActor(actor); const client = await createSessionClient(); const target = parseUuid(id);
  const result = await client.from("discounts").select("*").eq("id", target).maybeSingle(); if (result.error) databaseError(result.error); const row = requireRow(result.data, "Discount not found.");
  const mappings = await client.from("discount_products").select("product_id").eq("discount_id", target); if (mappings.error) databaseError(mappings.error);
  return discountDTO(row, (mappings.data ?? []).map(mapping => mapping.product_id));
}

async function getRow<T>(actor: Actor, table: "products" | "variants" | "plans" | "tax_rules", id: string, fields: string): Promise<T> {
  await staffActor(actor);
  const client = await createSessionClient();
  const result = await client.from(table).select(fields).eq("id", parseUuid(id)).maybeSingle();
  if (result.error) databaseError(result.error);
  return requireRow(result.data as T | null);
}
export async function getProduct(actor: Actor, id: string): Promise<ProductDTO> { return productDTO(await getRow<ProductRow>(actor, "products", id, productFields)); }
export async function getVariant(actor: Actor, id: string): Promise<VariantDTO> { return variantDTO(await getRow<VariantRow>(actor, "variants", id, variantFields)); }
export async function getPlan(actor: Actor, id: string): Promise<PlanDTO> { return planDTO(await getRow<PlanRow>(actor, "plans", id, planFields)); }
export async function getTaxRule(actor: Actor, id: string): Promise<TaxRuleDTO> { return taxDTO(await getRow<TaxRow>(actor, "tax_rules", id, taxFields)); }

export async function createProduct(actor: Actor, input: CreateProductInput): Promise<ProductDTO> {
  await adminActor(actor); const values = parseCreateProduct(input); const client = createAdminClient();
  const write = { ...values, sales_price_minor: Number(values.sales_price_minor), cost_price_minor: Number(values.cost_price_minor) } as Database["public"]["Tables"]["products"]["Insert"];
  const result = await client.from("products").insert(write).select(productFields).single(); if (result.error) databaseError(result.error); return productDTO(result.data);
}
export async function updateProduct(actor: Actor, id: string, input: UpdateProductInput & { expected_version: string }): Promise<ProductDTO> {
  await adminActor(actor); const data = strictObject(input, ["name", "product_type", "sales_price_minor", "cost_price_minor", "currency", "notes", "tax_rule_id", "is_active", "expected_version"]); const expected = parseExpected(data); const values = parseUpdateProduct(Object.fromEntries(Object.entries(data).filter(([key]) => key !== "expected_version"))); const target = parseUuid(id); const client = createAdminClient();
  const exists = await client.from("products").select("id").eq("id", target).maybeSingle(); if (exists.error) databaseError(exists.error); if (!exists.data) throw new AppError("NOT_FOUND", "Product not found.");
  const write = { ...values, ...(values.sales_price_minor !== undefined ? { sales_price_minor: Number(values.sales_price_minor) } : {}), ...(values.cost_price_minor !== undefined ? { cost_price_minor: Number(values.cost_price_minor) } : {}) } as Database["public"]["Tables"]["products"]["Update"];
  const result = await client.from("products").update(write).eq("id", target).eq("version", expected as unknown as number).select(productFields).maybeSingle(); if (result.error) databaseError(result.error); if (!result.data) throw new AppError("VERSION_CONFLICT", "This product changed. Refresh and try again."); return productDTO(result.data);
}
export async function createVariant(actor: Actor, input: CreateVariantInput): Promise<VariantDTO> {
  await adminActor(actor); const values = parseCreateVariant(input); const client = createAdminClient();
  const write = { ...values, ...(values.price_adjustment_minor !== undefined ? { price_adjustment_minor: Number(values.price_adjustment_minor) } : {}) } as Database["public"]["Tables"]["variants"]["Insert"];
  const result = await client.from("variants").insert(write).select(variantFields).single(); if (result.error) databaseError(result.error); return variantDTO(result.data);
}
export async function updateVariant(actor: Actor, id: string, input: UpdateVariantInput & { expected_version: string }): Promise<VariantDTO> {
  await adminActor(actor); const data = strictObject(input, ["name", "attributes", "price_adjustment_minor", "is_active", "expected_version"]); const expected = parseExpected(data); const values = parseUpdateVariant(Object.fromEntries(Object.entries(data).filter(([key]) => key !== "expected_version"))); const target = parseUuid(id); const client = createAdminClient();
  const exists = await client.from("variants").select("id").eq("id", target).maybeSingle(); if (exists.error) databaseError(exists.error); if (!exists.data) throw new AppError("NOT_FOUND", "Variant not found.");
  const write = { ...values, ...(values.price_adjustment_minor !== undefined ? { price_adjustment_minor: Number(values.price_adjustment_minor) } : {}) } as Database["public"]["Tables"]["variants"]["Update"];
  const result = await client.from("variants").update(write).eq("id", target).eq("version", expected as unknown as number).select(variantFields).maybeSingle(); if (result.error) databaseError(result.error); if (!result.data) throw new AppError("VERSION_CONFLICT", "This variant changed. Refresh and try again."); return variantDTO(result.data);
}
export async function createPlan(actor: Actor, input: CreatePlanInput): Promise<PlanDTO> {
  await adminActor(actor); const values = parseCreatePlan(input); const client = createAdminClient();
  const product = await client.from("products").select("id,currency,is_active").eq("id", values.product_id).maybeSingle(); if (product.error) databaseError(product.error); if (!product.data?.is_active) throw new AppError("NOT_FOUND", "Active product not found."); if (product.data.currency !== values.currency) throw new AppError("VALIDATION_ERROR", "Plan currency must match its product.");
  const write = { ...values, price_minor: Number(values.price_minor) } as Database["public"]["Tables"]["plans"]["Insert"];
  const result = await client.from("plans").insert(write).select(planFields).single(); if (result.error) databaseError(result.error); return planDTO(result.data);
}
export async function updatePlan(actor: Actor, id: string, input: UpdatePlanInput & { expected_version: string }): Promise<PlanDTO> {
  await adminActor(actor); const data = strictObject(input, ["name", "price_minor", "min_quantity", "available_from", "available_until", "auto_close", "allow_close", "allow_pause", "allow_renew", "is_active", "expected_version"]); const expected = parseExpected(data); const values = parseUpdatePlan(Object.fromEntries(Object.entries(data).filter(([key]) => key !== "expected_version"))); const target = parseUuid(id); const client = createAdminClient();
  const existing = await client.from("plans").select(planFields).eq("id", target).maybeSingle(); if (existing.error) databaseError(existing.error); const old = requireRow(existing.data, "Plan not found.");
  const merged = { ...planDTO(old), ...values };
  validatePlanResult(merged);
  const write = { ...values, ...(values.price_minor !== undefined ? { price_minor: Number(values.price_minor) } : {}) } as Database["public"]["Tables"]["plans"]["Update"];
  const result = await client.from("plans").update(write).eq("id", target).eq("version", expected as unknown as number).select(planFields).maybeSingle(); if (result.error) databaseError(result.error); if (!result.data) throw new AppError("VERSION_CONFLICT", "This plan changed. Refresh and try again."); return planDTO(result.data);
}
export async function createTaxRule(actor: Actor, input: CreateTaxRuleInput): Promise<TaxRuleDTO> {
  await adminActor(actor); const values = parseCreateTaxRule(input); const client = createAdminClient();
  const result = await client.from("tax_rules").insert(values).select(taxFields).single(); if (result.error) databaseError(result.error); return taxDTO(result.data);
}
export async function updateTaxRule(actor: Actor, id: string, input: UpdateTaxRuleInput & { expected_version: string }): Promise<TaxRuleDTO> {
  await adminActor(actor); const data = strictObject(input, ["name", "rate_bps", "starts_on", "ends_on", "is_active", "expected_version"]); const expected = parseExpected(data); const values = parseUpdateTaxRule(Object.fromEntries(Object.entries(data).filter(([key]) => key !== "expected_version"))); const target = parseUuid(id); const client = createAdminClient();
  const existing = await client.from("tax_rules").select(taxFields).eq("id", target).maybeSingle(); if (existing.error) databaseError(existing.error); const old = requireRow(existing.data, "Tax rule not found.");
  const merged = { ...taxDTO(old), ...values }; if (merged.ends_on !== null && merged.ends_on < merged.starts_on) throw new AppError("VALIDATION_ERROR", "Tax rule end date must not precede its start date.");
  const result = await client.from("tax_rules").update(values).eq("id", target).eq("version", expected as unknown as number).select(taxFields).maybeSingle(); if (result.error) databaseError(result.error); if (!result.data) throw new AppError("VERSION_CONFLICT", "This tax rule changed. Refresh and try again."); return taxDTO(result.data);
}

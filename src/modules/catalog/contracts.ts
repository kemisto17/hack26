/** Safe public catalog and pricing shapes. Database bigint values are strings. */
import type { Actor as SharedActor, Mutation as SharedMutation, Page as SharedPage, PageQuery as SharedPageQuery, Version as SharedVersion } from "../../lib/api/contracts";

export type UUID = string;
export type Minor = string;
export type Actor = SharedActor;
export type Version = SharedVersion;
export type Mutation = SharedMutation;
export type Page<T> = SharedPage<T>;
export type PageQuery = SharedPageQuery;
export type ProductType = "software" | "service" | "addon";
export type BillingInterval = "daily" | "weekly" | "monthly" | "yearly";

export type ProductDTO = { id: UUID; name: string; product_type: ProductType; sales_price_minor: Minor; cost_price_minor: Minor; currency: string; notes: string; tax_rule_id: UUID | null; is_active: boolean; version: Version; created_at: string; updated_at: string };
export type VariantDTO = { id: UUID; product_id: UUID; name: string; attributes: Record<string, unknown>; price_adjustment_minor: Minor; is_active: boolean; version: Version; created_at: string; updated_at: string };
export type PlanDTO = CatalogPlanDTO & { is_active: boolean; version: Version; created_at: string; updated_at: string };
export type TaxRuleDTO = { id: UUID; name: string; rate_bps: number; starts_on: string; ends_on: string | null; is_active: boolean; version: Version; created_at: string; updated_at: string };
export type DiscountDTO = { id: UUID; code: string; name: string; scope: "product" | "subscription"; kind: "fixed" | "percentage"; amount_minor: Minor | null; currency: string | null; percent_bps: number | null; min_quantity: number; min_subtotal_minor: Minor; starts_at: string; ends_at: string | null; max_uses: number | null; product_ids: UUID[]; is_active: boolean; version: Version; created_at: string; updated_at: string };
export type CreateProductInput = Pick<ProductDTO, "name" | "product_type" | "sales_price_minor" | "cost_price_minor" | "currency"> & Partial<Pick<ProductDTO, "notes" | "tax_rule_id" | "is_active">>;
export type UpdateProductInput = Partial<CreateProductInput>;
export type CreateVariantInput = Pick<VariantDTO, "product_id" | "name"> & Partial<Pick<VariantDTO, "attributes" | "price_adjustment_minor" | "is_active">>;
export type UpdateVariantInput = Partial<Omit<CreateVariantInput, "product_id">>;
export type CreatePlanInput = Pick<PlanDTO, "product_id" | "name" | "price_minor" | "currency" | "billing_interval"> & Partial<Pick<PlanDTO, "min_quantity" | "available_from" | "available_until" | "auto_close" | "allow_close" | "allow_pause" | "allow_renew" | "is_active">>;
export type UpdatePlanInput = Partial<Omit<CreatePlanInput, "product_id" | "currency" | "billing_interval">>;
export type CreateTaxRuleInput = Pick<TaxRuleDTO, "name" | "rate_bps" | "starts_on"> & Partial<Pick<TaxRuleDTO, "ends_on" | "is_active">>;
export type UpdateTaxRuleInput = Partial<CreateTaxRuleInput>;
export type CreateDiscountInput = Omit<Pick<DiscountDTO, "code" | "name" | "scope" | "kind" | "starts_at">, "id"> & Partial<Pick<DiscountDTO, "amount_minor" | "currency" | "percent_bps" | "min_quantity" | "min_subtotal_minor" | "ends_at" | "max_uses" | "is_active" | "product_ids">>;
/** PATCH semantics: omitted keys preserve stored values; explicit null clears nullable fields. */
export type UpdateDiscountInput = Partial<CreateDiscountInput>;
export type LineSelection = { product_id: UUID; variant_id?: UUID; quantity: number; is_primary: boolean };
export type PricedLine = LineSelection & { id: UUID; description: string; variant_label: string | null; unit_price_minor: Minor };
export type QuotePricedLine = LineSelection & { description: string; variant_label: string | null; unit_price_minor: Minor };
export type PriceQuoteInput = { plan_id: UUID; lines: LineSelection[]; at: string };
export type PriceQuoteDTO = { currency: string; lines: QuotePricedLine[]; subtotal_minor: Minor };
/** Non-authoritative preview: period_start selects the tax date; at evaluates discount windows. */
export type InvoicePricingInput = { currency: string; lines: PricedLine[]; discount_id: UUID | null; period_start: string; at: string };
export type InvoicePricedLine = PricedLine & { discount_minor: Minor; tax_rule_id: UUID | null; tax_rate_bps: number; tax_minor: Minor; amount_minor: Minor };
export type InvoicePricingDTO = { lines: InvoicePricedLine[]; subtotal_minor: Minor; discount_minor: Minor; tax_minor: Minor; total_minor: Minor };

export type CatalogProductDTO = { id: UUID; name: string; product_type: ProductType; sales_price_minor: Minor; currency: string; variants: Array<{ id: UUID; name: string; attributes: Record<string, unknown>; price_adjustment_minor: Minor }> };
export type CatalogPlanDTO = { id: UUID; product_id: UUID; name: string; price_minor: Minor; currency: string; billing_interval: BillingInterval; min_quantity: number; available_from: string; available_until: string | null; auto_close: boolean; allow_close: boolean; allow_pause: boolean; allow_renew: boolean };
export type CatalogDTO = { products: CatalogProductDTO[]; plans: CatalogPlanDTO[] };

/** Trusted server-loaded rows. Private fields are accepted only on the server. */
export type PricingProduct = { id: UUID; name: string; product_type: ProductType; sales_price_minor: Minor; currency: string; tax_rule_id: UUID | null; cost_price_minor?: Minor; notes?: string; is_active: boolean };
export type PricingVariant = { id: UUID; product_id: UUID; name: string; attributes: Record<string, unknown>; price_adjustment_minor: Minor; is_active: boolean };
export type PricingPlan = CatalogPlanDTO & { is_active: boolean };
export type TaxRule = { id: UUID; name: string; rate_bps: number; starts_on: string; ends_on: string | null; is_active: boolean };
export type PricingDiscount = { id: UUID; scope: "product" | "subscription"; kind: "fixed" | "percentage"; amount_minor: Minor | null; currency: string | null; percent_bps: number | null; min_quantity: number; min_subtotal_minor: Minor; starts_at: string; ends_at: string | null; max_uses: number | null; used_count: number; is_active: boolean; product_ids: UUID[] };
export type QuoteContext = { plan: PricingPlan | null; products: PricingProduct[]; variants: PricingVariant[] };
export type InvoiceContext = { products: PricingProduct[]; taxes: TaxRule[]; discount: PricingDiscount | null };

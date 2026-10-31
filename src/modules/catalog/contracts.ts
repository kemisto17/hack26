/** Safe public catalog and pricing shapes. Database bigint values are strings. */
export type UUID = string;
export type Minor = string;
export type Actor = { id: UUID; role: "admin" | "internal" | "customer" };
export type LineSelection = { product_id: UUID; variant_id?: UUID; quantity: number; is_primary: boolean };
export type PricedLine = LineSelection & { id: UUID; description: string; variant_label: string | null; unit_price_minor: Minor };
export type QuotePricedLine = LineSelection & { description: string; variant_label: string | null; unit_price_minor: Minor };
export type PriceQuoteInput = { plan_id: UUID; lines: LineSelection[]; at: string };
export type PriceQuoteDTO = { currency: string; lines: QuotePricedLine[]; subtotal_minor: Minor };
export type InvoicePricingInput = { currency: string; lines: PricedLine[]; discount_id: UUID | null; at: string };
export type InvoicePricedLine = PricedLine & { discount_minor: Minor; tax_rule_id: UUID | null; tax_rate_bps: number; tax_minor: Minor; amount_minor: Minor };
export type InvoicePricingDTO = { lines: InvoicePricedLine[]; subtotal_minor: Minor; discount_minor: Minor; tax_minor: Minor; total_minor: Minor };

export type CatalogProductDTO = { id: UUID; name: string; product_type: "software" | "service" | "addon"; sales_price_minor: Minor; currency: string; variants: Array<{ id: UUID; name: string; attributes: Record<string, unknown>; price_adjustment_minor: Minor }> };
export type CatalogPlanDTO = { id: UUID; product_id: UUID; name: string; price_minor: Minor; currency: string; billing_interval: "daily" | "weekly" | "monthly" | "yearly"; min_quantity: number; available_from: string; available_until: string | null; auto_close: boolean; allow_close: boolean; allow_pause: boolean; allow_renew: boolean };
export type CatalogDTO = { products: CatalogProductDTO[]; plans: CatalogPlanDTO[] };

export type PricingProduct = { id: UUID; name: string; product_type: CatalogProductDTO["product_type"]; sales_price_minor: Minor; currency: string; tax_rule_id: UUID | null; cost_price_minor?: Minor; notes?: string; is_active: boolean };
export type PricingVariant = { id: UUID; product_id: UUID; name: string; attributes: Record<string, unknown>; price_adjustment_minor: Minor; is_active: boolean };
export type PricingPlan = CatalogPlanDTO & { is_active: boolean };
export type TaxRule = { id: UUID; name: string; rate_bps: number; starts_on: string; ends_on: string | null; is_active: boolean };
export type PricingDiscount = { id: UUID; scope: "product" | "subscription"; kind: "fixed" | "percentage"; amount_minor: Minor | null; currency: string | null; percent_bps: number | null; min_quantity: number; min_subtotal_minor: Minor; starts_at: string; ends_at: string | null; max_uses: number | null; used_count: number; is_active: boolean; product_ids: UUID[] };
export type QuoteContext = { plan: PricingPlan | null; products: PricingProduct[]; variants: PricingVariant[] };
export type InvoiceContext = { products: PricingProduct[]; taxes: TaxRule[]; discount: PricingDiscount | null };

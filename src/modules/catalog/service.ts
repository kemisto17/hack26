import "server-only";
import type { Actor, InvoiceContext, InvoicePricingDTO, InvoicePricingInput, PriceQuoteDTO, PriceQuoteInput, QuoteContext } from "./contracts";
import { CatalogError } from "./errors";
import { priceInvoice as priceInvoiceDomain, priceQuote as priceQuoteDomain } from "./domain";
import { parseInvoicePricing, parsePriceQuote, uuid } from "./validation";

/** Request-scoped data/auth bindings. No client, credential or actor is global. */
export type CatalogBindings = {
  requireActor(): Promise<Actor>;
  readQuoteContext(actor: Actor, planId: string, lines: PriceQuoteInput["lines"], at: string): Promise<QuoteContext>;
  readInvoiceContext(actor: Actor, input: InvoicePricingInput): Promise<InvoiceContext>;
  readInvoiceLines?(actor: Actor, invoiceId: string): Promise<{ currency: string; lines: InvoicePricingInput["lines"]; discount_id: string | null }>;
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
    async priceInvoiceDraft(actor: Actor, invoiceId: string, at: string): Promise<InvoicePricingDTO> {
      const verified = await bindings.requireActor(); verifyActor(verified, actor);
      if (verified.role === "customer") throw new CatalogError("FORBIDDEN", "Invoice pricing preview requires staff access.");
      if (!bindings.readInvoiceLines) throw new CatalogError("INTERNAL_ERROR", "Invoice pricing binding is unavailable.");
      const data = await bindings.readInvoiceLines(verified, uuid(invoiceId));
      const contextInput: InvoicePricingInput = { ...data, at };
      const parsed = parseInvoicePricing(contextInput);
      const context = await bindings.readInvoiceContext(verified, parsed);
      return invoiceDTO(priceInvoiceDomain(parsed, context));
    },
  };
}
export type CatalogServices = ReturnType<typeof bindCatalogServices>;

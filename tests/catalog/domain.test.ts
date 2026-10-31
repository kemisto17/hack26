import { describe, expect, it } from "vitest";
import { priceInvoice, priceQuote, roundBps } from "../../src/modules/catalog/domain";
import { CatalogError } from "../../src/modules/catalog/errors";
import { parseInvoicePricing, parsePriceQuote } from "../../src/modules/catalog/validation";
import type { InvoicePricingInput, PricingDiscount, QuoteContext } from "../../src/modules/catalog/contracts";

const ids = { plan:"00000000-0000-4000-8000-000000000001", p1:"00000000-0000-4000-8000-000000000002", p2:"00000000-0000-4000-8000-000000000003", variant:"00000000-0000-4000-8000-000000000004", discount:"00000000-0000-4000-8000-000000000005", tax:"00000000-0000-4000-8000-000000000006", line1:"00000000-0000-4000-8000-000000000011", line2:"00000000-0000-4000-8000-000000000012" };
const quoteContext = (overrides: Partial<QuoteContext> = {}): QuoteContext => ({ plan:{ id:ids.plan,product_id:ids.p1,name:"Basic",price_minor:"1001",currency:"USD",billing_interval:"monthly",min_quantity:2,available_from:"2026-01-01",available_until:null,auto_close:true,allow_close:true,allow_pause:false,allow_renew:true,is_active:true }, products:[{id:ids.p1,name:"Primary",product_type:"software",sales_price_minor:"9999",currency:"USD",tax_rule_id:ids.tax,is_active:true,cost_price_minor:"777",notes:"private"},{id:ids.p2,name:"Add-on",product_type:"addon",sales_price_minor:"500",currency:"USD",tax_rule_id:null,is_active:true}], variants:[{id:ids.variant,product_id:ids.p1,name:"Plus",attributes:{tier:"plus"},price_adjustment_minor:"99",is_active:true}], ...overrides });
const selections = [{product_id:ids.p1,variant_id:ids.variant,quantity:2,is_primary:true},{product_id:ids.p2,quantity:1,is_primary:false}];
const quote = () => priceQuote({plan_id:ids.plan,lines:selections,at:"2026-10-31T00:00:00Z"},quoteContext());
const invoiceLines = () => quote().lines.map((line,index)=>({...line,id:index===0?ids.line1:ids.line2}));
const disc = (overrides: Partial<PricingDiscount> = {}): PricingDiscount => ({id:ids.discount,scope:"subscription",kind:"percentage",amount_minor:null,currency:null,percent_bps:3333,min_quantity:1,min_subtotal_minor:"0",starts_at:"2026-01-01T00:00:00Z",ends_at:null,max_uses:null,used_count:0,is_active:true,product_ids:[],...overrides});
const invoiceContext = (discount: PricingDiscount | null = disc()) => ({products:quoteContext().products,taxes:[{id:ids.tax,name:"VAT",rate_bps:500,starts_on:"2026-01-01",ends_on:"2026-10-30",is_active:true}],discount});
const invoiceInput = (overrides: Partial<InvoicePricingInput> = {}): InvoicePricingInput => ({currency:"USD",lines:invoiceLines(),discount_id:ids.discount,at:"2026-10-31T00:00:00Z",...overrides});

describe("catalog pricing domain",()=>{
 it("prices primary from plan, verifies variants/minimum and omits private catalog fields and fake ids",()=>{
  const result=quote(); expect(result.subtotal_minor).toBe("2700"); expect(result.lines[0]?.unit_price_minor).toBe("1100");
  expect(result.lines[0]).not.toHaveProperty("id"); expect(result.lines[0]).not.toHaveProperty("cost_price_minor"); expect(result.lines[0]).not.toHaveProperty("notes");
  expect(()=>priceQuote({plan_id:ids.plan,lines:[{...selections[0]!,quantity:1}],at:"2026-10-31T00:00:00Z"},quoteContext())).toThrow(/minimum/);
 });
 it("rejects absent/inactive rows, availability, currency mismatch, wrong variant and negative adjusted price",()=>{
  expect(()=>priceQuote({plan_id:ids.plan,lines:selections,at:"2026-10-31T00:00:00Z"},quoteContext({plan:null}))).toThrow(CatalogError);
  expect(()=>priceQuote({plan_id:ids.plan,lines:selections,at:"2026-10-31T00:00:00Z"},quoteContext({plan:{...quoteContext().plan!,available_until:"2026-10-30"}}))).toThrow(/availability/);
  expect(()=>priceQuote({plan_id:ids.plan,lines:selections,at:"2026-10-31T00:00:00Z"},quoteContext({products:quoteContext().products.map(p=>p.id===ids.p2?{...p,currency:"EUR"}:p)}))).toThrow(/currencies/);
  expect(()=>priceQuote({plan_id:ids.plan,lines:[{...selections[0]!},{...selections[1]!,variant_id:ids.variant}],at:"2026-10-31T00:00:00Z"},quoteContext())).toThrow(/belong/);
  expect(()=>priceQuote({plan_id:ids.plan,lines:[{...selections[0]!,variant_id:"00000000-0000-4000-8000-000000000099"}],at:"2026-10-31T00:00:00Z"},quoteContext({variants:[{...quoteContext().variants[0]!,id:"00000000-0000-4000-8000-000000000099",price_adjustment_minor:"-2000"}]}))).toThrow(/Adjusted unit price/);
 });
 it("uses integer half-up tax rounding and omits expired tax rules",()=>{
  expect(roundBps(BigInt(1),5000)).toBe(BigInt(1)); expect(roundBps(BigInt(3),5000)).toBe(BigInt(2));
  const result=priceInvoice(invoiceInput({discount_id:null}),invoiceContext(null)); expect(result.lines[0]?.tax_minor).toBe("0"); expect(result.lines[0]?.tax_rule_id).toBeNull();
 });
 it("caps fixed discounts and allocates remainder in canonical UUID byte order",()=>{
  const lines=invoiceLines().reverse();
  const result=priceInvoice(invoiceInput({lines}),invoiceContext(disc({kind:"fixed",amount_minor:"99999",currency:"USD",percent_bps:null})));
  expect(result.discount_minor).toBe(result.subtotal_minor);
  expect(result.lines.reduce((n,l)=>n+BigInt(l.discount_minor),BigInt(0))).toBe(BigInt(result.discount_minor));
  const one=priceInvoice(invoiceInput({lines}),invoiceContext(disc({kind:"fixed",amount_minor:"1",currency:"USD",percent_bps:null})));
  expect(one.lines.find(l=>l.id===ids.line1)?.discount_minor).toBe("1");
  expect(one.total_minor).toBe((BigInt(one.subtotal_minor)-BigInt(one.discount_minor)+BigInt(one.tax_minor)).toString());
 });
 it("matches SQL scoped subtotal and quantity thresholds, empty mappings, and exhausted preview behavior",()=>{
  const productScoped=disc({scope:"product",product_ids:[ids.p2],min_subtotal_minor:"400",min_quantity:1,kind:"fixed",amount_minor:"100",currency:"USD",percent_bps:null});
  expect(priceInvoice(invoiceInput(),invoiceContext(productScoped)).discount_minor).toBe("100");
  expect(priceInvoice(invoiceInput(),invoiceContext({...productScoped,min_subtotal_minor:"600"})).discount_minor).toBe("0");
  expect(priceInvoice(invoiceInput(),invoiceContext({...productScoped,product_ids:[]})).discount_minor).toBe("0");
  expect(priceInvoice(invoiceInput(),invoiceContext({...productScoped,used_count:1,max_uses:1})).discount_minor).toBe("0");
 });
 it("returns zero for inactive/date/currency/minimum ineligibility and product scope excludes other lines",()=>{
  for(const d of [disc({min_subtotal_minor:"999999"}),disc({currency:"EUR"}),disc({starts_at:"2027-01-01T00:00:00Z"}),disc({ends_at:"2026-10-31T00:00:00Z"}),disc({is_active:false})]) expect(priceInvoice(invoiceInput(),invoiceContext(d)).discount_minor).toBe("0");
  const result=priceInvoice(invoiceInput(),invoiceContext(disc({scope:"product",product_ids:[ids.p2],kind:"fixed",amount_minor:"99999",currency:"USD",percent_bps:null})));
  expect(result.lines[0]?.discount_minor).toBe("0"); expect(result.lines[1]?.discount_minor).toBe("500");
 });
 it("strict input parsing rejects unknown keys, invalid quantities/minor strings and timestamps",()=>{
  expect(()=>parsePriceQuote({plan_id:ids.plan,lines:selections,at:"2026-10-31T00:00:00Z",price_minor:"1"})).toThrow("Invalid fields.");
  expect(()=>parsePriceQuote({plan_id:ids.plan,lines:[{...selections[0]!,quantity:0}],at:"2026-10-31T00:00:00Z"})).toThrow("Invalid line.");
  expect(()=>parsePriceQuote({plan_id:ids.plan,lines:selections,at:"not-a-date"})).toThrow("Invalid UTC timestamp.");
  expect(()=>parseInvoicePricing({...invoiceInput(),total_minor:"1"})).toThrow("Invalid fields.");
  expect(()=>parseInvoicePricing({...invoiceInput(),lines:[{...invoiceLines()[0]!,unit_price_minor:"01"}]})).toThrow("Invalid minor amount.");
 });
});

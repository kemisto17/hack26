import test from "node:test";
import assert from "node:assert/strict";
import { priceInvoice, priceQuote, roundBps } from "../../src/modules/catalog/domain.ts";
import { parseInvoicePricing, parsePriceQuote } from "../../src/modules/catalog/validation.ts";

const ids = { plan:"00000000-0000-4000-8000-000000000001", p1:"00000000-0000-4000-8000-000000000002", p2:"00000000-0000-4000-8000-000000000003", variant:"00000000-0000-4000-8000-000000000004", discount:"00000000-0000-4000-8000-000000000005", tax:"00000000-0000-4000-8000-000000000006" };
const quoteContext = (overrides={}) => ({ plan:{ id:ids.plan,product_id:ids.p1,name:"Basic",price_minor:"1001",currency:"USD",billing_interval:"monthly",min_quantity:2,available_from:"2026-01-01",available_until:null,auto_close:true,allow_close:true,allow_pause:false,allow_renew:true,is_active:true }, products:[{id:ids.p1,name:"Primary",product_type:"software",sales_price_minor:"9999",currency:"USD",tax_rule_id:ids.tax,is_active:true},{id:ids.p2,name:"Add-on",product_type:"addon",sales_price_minor:"500",currency:"USD",tax_rule_id:null,is_active:true}], variants:[{id:ids.variant,product_id:ids.p1,name:"Plus",attributes:{tier:"plus"},price_adjustment_minor:"99",is_active:true}], ...overrides });
const selections = [{product_id:ids.p1,variant_id:ids.variant,quantity:2,is_primary:true},{product_id:ids.p2,quantity:1,is_primary:false}];
const priced = () => priceQuote({plan_id:ids.plan,lines:selections,at:"2026-10-31T00:00:00Z"},quoteContext()).lines;
const disc = (overrides={}) => ({id:ids.discount,kind:"percentage",amount_minor:null,currency:null,percent_bps:3333,min_quantity:1,min_subtotal_minor:"0",starts_at:"2026-01-01T00:00:00Z",ends_at:null,max_uses:null,is_active:true,product_ids:[],...overrides});
const invoiceContext = (discount=disc()) => ({products:quoteContext().products,taxes:[{id:ids.tax,name:"VAT",rate_bps:500,starts_on:"2026-01-01",ends_on:"2026-10-30",is_active:true}],discount});

test("quote uses plan primary price, matching variant, minimum quantity, and excludes cost/notes", () => {
 const result=priceQuote({plan_id:ids.plan,lines:selections,at:"2026-10-31T00:00:00Z"},quoteContext());
 assert.equal(result.subtotal_minor,"2700"); assert.equal(result.lines[0].unit_price_minor,"1100");
 assert.equal("cost_price_minor" in result.lines[0],false); assert.equal("notes" in result.lines[0],false);
 assert.throws(()=>priceQuote({plan_id:ids.plan,lines:[{...selections[0],quantity:1}],at:"2026-10-31T00:00:00Z"},quoteContext()),/minimum/);
});
test("rejects inactive/missing rows, unavailable plan, currency mismatch, wrong variant product and negative adjustment",()=>{
 assert.throws(()=>priceQuote({plan_id:ids.plan,lines:selections,at:"2026-10-31T00:00:00Z"},quoteContext({plan:null})),/Plan not found/);
 assert.throws(()=>priceQuote({plan_id:ids.plan,lines:selections,at:"2027-01-01T00:00:00Z"},quoteContext({plan:{...quoteContext().plan,available_until:"2026-10-30"}})),/availability/);
 assert.throws(()=>priceQuote({plan_id:ids.plan,lines:selections,at:"2026-10-31T00:00:00Z"},quoteContext({products:quoteContext().products.map(p=>p.id===ids.p2?{...p,currency:"EUR"}:p)})),/currencies/);
 assert.throws(()=>priceQuote({plan_id:ids.plan,lines:[{...selections[0],variant_id:ids.variant},{...selections[1],product_id:ids.p2,variant_id:ids.variant}],at:"2026-10-31T00:00:00Z"},quoteContext()),/belong/);
 assert.throws(()=>priceQuote({plan_id:ids.plan,lines:[{...selections[0],variant_id:"00000000-0000-4000-8000-000000000099"}],at:"2026-10-31T00:00:00Z"},quoteContext({variants:[{...quoteContext().variants[0],id:"00000000-0000-4000-8000-000000000099",price_adjustment_minor:"-2000"}]})),/Adjusted unit price/);
});
test("integer tax rounding is half away from zero and expired tax is omitted",()=>{
 assert.equal(roundBps(1n,5000),1n); assert.equal(roundBps(3n,5000),2n);
 const result=priceInvoice({currency:"USD",lines:priced(),discount_id:null,at:"2026-10-31T00:00:00Z"},invoiceContext(null));
 assert.equal(result.lines[0].tax_minor,"0"); assert.equal(result.lines[0].tax_rule_id,null);
});
test("discount cap and deterministic remainder allocation conserve every minor unit",()=>{
 const lines=priced();
 const result=priceInvoice({currency:"USD",lines,discount_id:ids.discount,at:"2026-10-31T00:00:00Z"},invoiceContext(disc({kind:"fixed",amount_minor:"99999",currency:"USD",percent_bps:null})));
 assert.equal(result.discount_minor,result.subtotal_minor);
 assert.equal(result.lines.reduce((n,l)=>n+BigInt(l.discount_minor),0n),BigInt(result.discount_minor));
 const split=priceInvoice({currency:"USD",lines,discount_id:ids.discount,at:"2026-10-31T00:00:00Z"},invoiceContext(disc({kind:"fixed",amount_minor:"1",currency:"USD",percent_bps:null})));
 assert.equal(split.lines.reduce((n,l)=>n+BigInt(l.discount_minor),0n),1n);
 assert.equal(split.total_minor,(BigInt(split.subtotal_minor)-BigInt(split.discount_minor)+BigInt(split.tax_minor)).toString());
});
test("discount minimum, currency, date and product scope ineligibility produces zero",()=>{
 for(const d of [disc({min_subtotal_minor:"999999"}),disc({currency:"EUR"}),disc({starts_at:"2027-01-01T00:00:00Z"}),disc({ends_at:"2026-10-31T00:00:00Z"}),disc({product_ids:["00000000-0000-4000-8000-000000000099"]})]) {
  const result=priceInvoice({currency:"USD",lines:priced(),discount_id:ids.discount,at:"2026-10-31T00:00:00Z"},invoiceContext(d)); assert.equal(result.discount_minor,"0");
 }
});
test("strict input validators reject unknown keys",()=>{
 assert.throws(()=>parsePriceQuote({plan_id:ids.plan,lines:selections,at:"2026-10-31T00:00:00Z",price_minor:"1"}),/fields/);
 assert.throws(()=>parseInvoicePricing({currency:"USD",lines:priced(),discount_id:null,at:"2026-10-31T00:00:00Z",total_minor:"1"}),/fields/);
});

import { describe, expect, it, vi } from "vitest";
import { bindCatalogServices } from "../../src/modules/catalog/service";
import { CatalogError } from "../../src/modules/catalog/errors";
import type { Actor, InvoicePricingInput, QuoteContext } from "../../src/modules/catalog/contracts";

const admin: Actor = {id:"00000000-0000-4000-8000-000000000001",role:"admin"};
const customer: Actor = {id:"00000000-0000-4000-8000-000000000002",role:"customer"};
const product="00000000-0000-4000-8000-000000000010";
const lineId="00000000-0000-4000-8000-000000000011";
const invoiceId="00000000-0000-4000-8000-000000000099";
const qContext: QuoteContext={plan:{id:"00000000-0000-4000-8000-000000000020",product_id:product,name:"Plan",price_minor:"100",currency:"USD",billing_interval:"monthly",min_quantity:1,available_from:"2026-01-01",available_until:null,auto_close:true,allow_close:true,allow_pause:false,allow_renew:true,is_active:true},products:[{id:product,name:"Product",product_type:"software",sales_price_minor:"200",currency:"USD",tax_rule_id:null,is_active:true}],variants:[]};
const input: InvoicePricingInput={currency:"USD",lines:[{id:lineId,product_id:product,quantity:1,is_primary:true,description:"Product",variant_label:null,unit_price_minor:"100"}],discount_id:null,at:"2026-10-31T00:00:00Z"};
const baseBindings=(actor:Actor)=>({requireActor:vi.fn(async()=>actor),readQuoteContext:vi.fn(async()=>qContext),readInvoiceContext:vi.fn(async()=>({products:qContext.products,taxes:[],discount:null})),readInvoiceLines:vi.fn(async()=>({currency:"USD",lines:input.lines,discount_id:null}))});

describe("catalog service security and invoice preview",()=>{
 it("rejects customer pricing and mismatched supplied actor before reads",async()=>{
  const customerBindings=baseBindings(customer); const customerServices=bindCatalogServices(customerBindings);
  await expect(customerServices.priceQuote(customer,{plan_id:qContext.plan!.id,lines:[{product_id:product,quantity:1,is_primary:true}],at:input.at})).rejects.toMatchObject({code:"FORBIDDEN"});
  const adminBindings=baseBindings(admin); const adminServices=bindCatalogServices(adminBindings);
  await expect(adminServices.priceQuote(customer,{plan_id:qContext.plan!.id,lines:[{product_id:product,quantity:1,is_primary:true}],at:input.at})).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(customerBindings.readQuoteContext).not.toHaveBeenCalled(); expect(adminBindings.readQuoteContext).not.toHaveBeenCalled();
 });
 it("priceInvoiceDraft uses persisted frozen lines and current context without fabricating IDs",async()=>{
  const bindings=baseBindings(admin); const services=bindCatalogServices(bindings);
  const result=await services.priceInvoiceDraft(admin,invoiceId,input.at);
  expect(bindings.readInvoiceLines).toHaveBeenCalledWith(admin,invoiceId);
  expect(result.lines[0]?.id).toBe(lineId); expect(result.total_minor).toBe("100");
 });
 it("maps absent invoice line binding to INTERNAL_ERROR and keeps stable error code/message",async()=>{
  const bindings=baseBindings(admin); delete (bindings as Partial<typeof bindings>).readInvoiceLines;
  const services=bindCatalogServices(bindings);
  await expect(services.priceInvoiceDraft(admin,invoiceId,input.at)).rejects.toMatchObject({code:"INTERNAL_ERROR",message:"Invoice pricing binding is unavailable."});
  const e=new CatalogError("VALIDATION_ERROR","Invalid field."); expect(e.message).toBe("Invalid field."); expect(e.code).toBe("VALIDATION_ERROR");
 });
});

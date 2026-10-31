import { describe,it,expect } from "vitest";
import { amount,date,validResourceId } from "@/components/customer-web/format";
import { ownSubscriptions,ownQuotations,ownInvoices,ownPayments,invoiceLabel,quotationLabel } from "@/components/customer-web/collection-model";
import type { SubscriptionDTO } from "@/modules/subscriptions/contracts";
import type { InvoiceSummaryDTO,PaymentDTO } from "@/modules/billing/contracts";
const owner="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const now="2026-10-31T12:00:00.000Z";
const subscription:SubscriptionDTO={id:owner,customer_id:owner,number:"SUB-fixture",plan_id:owner,currency:"USD",status:"quotation",start_at:now,expires_at:"2027-10-31T12:00:00.000Z",next_billing_at:null,version:"1",created_at:now,updated_at:now,template_id:null,discount_id:null,renewed_from_id:null,quote_expires_at:now,payment_terms_days:7,billing_anchor_at:null,closed_at:null,lines:[]};
const invoice:InvoiceSummaryDTO={id:owner,number:"INV-fixture",subscription_id:owner,customer_id:owner,currency:"USD",status:"confirmed",period_start:now,period_end:"2026-11-30T12:00:00.000Z",issued_at:now,due_on:"2026-10-31",sent_at:null,subtotal_minor:"1000",discount_minor:"0",tax_minor:"0",total_minor:"1000",paid_minor:"0",outstanding_minor:"1000",version:"1",created_at:now,updated_at:now};
describe("customer read presentation boundaries",()=>{
 it("never shows another owner or an own draft subscription",()=>{expect(ownSubscriptions([subscription,{...subscription,customer_id:other},{...subscription,status:"draft"}],owner)).toEqual([subscription]);});
 it("quotations require an own visible subscription and a real quote expiry",()=>{expect(ownQuotations([subscription,{...subscription,quote_expires_at:null},{...subscription,status:"draft"},{...subscription,customer_id:other}],owner)).toEqual([subscription]);});
 it("hides another customer's invoice and cancelled never-issued drafts",()=>{expect(ownInvoices([invoice,{...invoice,customer_id:other},{...invoice,status:"draft"},{...invoice,status:"cancelled",issued_at:null}],owner)).toEqual([invoice]);expect(ownInvoices([{...invoice,status:"cancelled"}],owner)).toHaveLength(1);});
 it("payment visibility always scopes to the verified owner",()=>{const payment={id:owner,customer_id:owner} as PaymentDTO;expect(ownPayments([payment,{...payment,customer_id:other}],owner)).toEqual([payment]);});
 it("overdue is derived using UTC due dates; due today is not overdue",()=>{expect(invoiceLabel(invoice,now)).toBe("Issued");expect(invoiceLabel({...invoice,due_on:"2026-10-30"},now)).toBe("Overdue");expect(invoiceLabel({...invoice,status:"cancelled",due_on:"2026-10-30"},now)).toBe("Cancelled");});
 it("partial/full states use exact integer strings",()=>{expect(invoiceLabel({...invoice,paid_minor:"1",outstanding_minor:"999"},now)).toBe("Partially paid");expect(invoiceLabel({...invoice,status:"paid",paid_minor:"1000",outstanding_minor:"0"},now)).toBe("Paid");});
 it("quotation expiry boundary is exclusive without inventing a database state",()=>{expect(quotationLabel(subscription,now)).toBe("Expired");expect(quotationLabel({...subscription,quote_expires_at:"2026-11-01T00:00:00Z"},now)).toBe("Awaiting confirmation");expect(quotationLabel({...subscription,status:"confirmed"},now)).toBe("Confirmed");expect(subscription.status).toBe("quotation");});
});
describe("exact display formats",()=>{
 it("keeps amounts above the safe integer limit exact",()=>{expect(amount("9000000000000001","USD")).toBe("$90,000,000,000,000.01");expect(amount("123","JPY")).toBe("¥123");expect(amount("1234","KWD")).toContain("1.234");});
 it("dates stay UTC and missing schedules are not fabricated",()=>{expect(date(now)).toBe("31 Oct 2026");expect(date(null)).toBe("Not scheduled");});
 it("resource identifiers reject invalid route input",()=>{expect(validResourceId(owner)).toBe(true);expect(validResourceId("another-customer")).toBe(false);expect(validResourceId("<script>" )).toBe(false);});
});

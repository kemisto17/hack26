import React,{createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,it,expect,vi} from "vitest";
// Next compiles JSX automatically. Supply React for Vitest's node JSX transform.
vi.stubGlobal("React",React);
vi.mock("next/navigation",()=>({usePathname:()=>"/portal/subscriptions"}));
import {RecordCollection} from "@/components/customer-web/collections";
import {RecordDetail} from "@/components/customer-web/record-detail";
import {ContactForm} from "@/components/customer-web/contact-form";
import {AuthFrame} from "@/components/customer-web/auth-frame";
import type {SubscriptionSummaryDTO} from "@/modules/subscriptions/contracts";
const id="11111111-1111-4111-8111-111111111111";const other="22222222-2222-4222-8222-222222222222";const now="2026-10-31T00:00:00.000Z";
const row:SubscriptionSummaryDTO={id,customer_id:id,number:"VISIBLE-RECORD",plan_id:id,currency:"USD",status:"active",start_at:now,expires_at:"2027-10-31T00:00:00.000Z",next_billing_at:now,version:"1",created_at:now,updated_at:now};
describe("customer page markup",()=>{
 it("distinguishes an unavailable connection from an empty account",()=>{const unavailable=renderToStaticMarkup(createElement(RecordCollection,{kind:"subscriptions",ownerId:id,now,result:{state:"unavailable"}}));expect(unavailable).toContain("aren’t available right now");expect(unavailable).not.toContain("0 matching subscriptions");const empty=renderToStaticMarkup(createElement(RecordCollection,{kind:"subscriptions",ownerId:id,now,result:{state:"ready",data:[]}}));expect(empty).toContain("Nothing here yet");expect(empty).toContain("0 matching subscriptions");});
 it("renders labelled search, keyboard buttons and only visible ownership-safe rows",()=>{const html=renderToStaticMarkup(createElement(RecordCollection,{kind:"subscriptions",ownerId:id,now,result:{state:"ready",data:[row,{...row,id:other,customer_id:other,number:"PRIVATE-OTHER"},{...row,id:other,status:"draft",number:"PRIVATE-DRAFT"}]}}));expect(html).toContain("VISIBLE-RECORD");expect(html).not.toContain("PRIVATE-OTHER");expect(html).not.toContain("PRIVATE-DRAFT");expect(html).toContain("Search subscriptions");expect(html).toContain('aria-pressed="true"');expect(html).toContain('scope="col"');expect(html).toContain("/portal/subscriptions/");});
 it("does not expose unsupported quotation acceptance or fabricated financial totals",()=>{const html=renderToStaticMarkup(createElement(RecordDetail,{kind:"quotations",ownerId:id,result:{state:"unavailable"}}));expect(html).toContain("Document unavailable");expect(html).not.toContain("Accept quotation");expect(html).not.toContain("Reject quotation");expect(html).not.toContain("$0.00");});
 it("contact form declares delivery unavailable and validates real fields",()=>{const html=renderToStaticMarkup(createElement(ContactForm));for(const name of ["name","email","subject","message"])expect(html).toContain(`name="${name}"`);expect(html).toContain('type="email"');expect(html).toContain("required");expect(html).toContain("Message delivery is not connected");expect(html).toContain("Prepare message");expect(html).not.toContain("Message sent");});
 it("auth frame adds a password visibility control without replacing D1 forms",()=>{const html=renderToStaticMarkup(createElement(AuthFrame,null,createElement("form",null,createElement("input",{name:"password",type:"password"}))));expect(html).toContain("Show password");expect(html).toContain('aria-pressed="false"');expect(html).toContain('name="password"');expect(html).toContain("Supabase Auth");});
});

"use client";

import { useRef, useState, type FormEvent } from "react";
import type { CreateSubscriptionInput, Creation, LineSelection, SubscriptionDTO, TemplateDTO } from "../contracts";
import { prepareDraftAttempt } from "../creation-attempt";
import { SubscriptionError } from "../errors";
import { parseCreateSubscription } from "../validation";
import { LineEditor, type PlanOption, type ProductOption } from "./line-editor";

export function DraftSubscriptionForm({ customers, plans, products, templates, onCreate }: {
  customers: { id: string; display_name: string }[]; plans: PlanOption[]; products: ProductOption[]; templates: TemplateDTO[];
  onCreate: (input: CreateSubscriptionInput & Creation) => Promise<SubscriptionDTO>;
}) {
  const [plan, setPlan] = useState("");
  const [source, setSource] = useState("template");
  const [lines, setLines] = useState<LineSelection[]>([{ product_id: "", quantity: 1, is_primary: true }]);
  const attempt = useRef<(CreateSubscriptionInput & Creation) | null>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<SubscriptionDTO | null>(null);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || created) return;
    inFlight.current = true; setPending(true); setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const terms = form.get("payment_terms_days");
      const discount = form.get("discount_id");
      const body = parseCreateSubscription({ customer_id: form.get("customer_id"), plan_id: plan, start_at: form.get("start_at"), expires_at: form.get("expires_at"), ...(terms !== "" ? { payment_terms_days: Number(terms) } : {}), ...(discount ? { discount_id: discount } : {}), ...(source === "template" ? { template_id: form.get("template_id") } : { lines }) });
      attempt.current = prepareDraftAttempt(attempt.current, body, () => crypto.randomUUID());
      const result = await onCreate(attempt.current);
      setCreated(result); setMessage("Draft subscription created.");
    } catch (error) { setMessage(error instanceof SubscriptionError ? error.message : "The draft result is uncertain. Retry with the same fields, or check the subscription list."); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <h1 className="text-2xl font-semibold">Create draft subscription</h1>
    <fieldset disabled={pending || created !== null} className="space-y-4">
      <label className="grid gap-1">Customer<select name="customer_id" required defaultValue=""><option value="">Choose a customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.display_name}</option>)}</select></label>
      <label className="grid gap-1">Plan<select name="plan_id" required value={plan} onChange={event => setPlan(event.target.value)}><option value="">Choose a plan</option>{plans.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <fieldset className="flex gap-4"><legend>Draft source</legend>
        <label><input type="radio" name="source" value="template" checked={source === "template"} onChange={() => setSource("template")} /> Quotation template</label>
        <label><input type="radio" name="source" value="lines" checked={source === "lines"} onChange={() => setSource("lines")} /> Explicit product lines</label>
      </fieldset>
      {source === "template" ? <label className="grid gap-1">Quotation template<select key={plan} name="template_id" required defaultValue=""><option value="">Choose a template for this plan</option>{templates.filter(template => template.is_active && template.plan_id === plan).map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label> : <LineEditor value={lines} onChange={setLines} products={products} />}
      <label className="grid gap-1">Start at (UTC)<input name="start_at" required placeholder="2026-10-31T00:00:00Z" /></label>
      <label className="grid gap-1">Expires at (UTC)<input name="expires_at" required placeholder="2027-10-31T00:00:00Z" /></label>
      <label className="grid gap-1">Payment terms override (days, optional)<input name="payment_terms_days" type="number" min={0} max={365} step={1} /></label>
      <label className="grid gap-1">Discount ID (optional)<input name="discount_id" /></label>
      <button type="submit">{pending ? "Creating…" : "Create draft"}</button>
    </fieldset>
    <p role="status" aria-live="polite">{message}</p>
    {created && <a href={`/subscriptions/${encodeURIComponent(created.id)}`}>Open {created.number}</a>}
  </form>;
}

"use client";

import { useRef, useState, type FormEvent } from "react";
import type { CreateTemplateInput, LineSelection, Mutation, TemplateDTO, UpdateTemplateInput } from "../contracts";
import { SubscriptionError } from "../errors";
import { parseCreateTemplate, parseUpdateTemplate } from "../validation";
import { LineEditor, type PlanOption, type ProductOption } from "./line-editor";

type Props = { plans: PlanOption[]; products: ProductOption[] } & (
  { template?: never; onSave: (input: CreateTemplateInput) => Promise<TemplateDTO> } |
  { template: TemplateDTO; onSave: (input: UpdateTemplateInput & Mutation) => Promise<TemplateDTO> }
);

/** Mount only behind D1's admin authorization. onSave must use protected HTTP
 * or a verified server action; hiding this form is not authorization. */
export function TemplateForm(props: Props) {
  const template = props.template;
  const [lines, setLines] = useState<LineSelection[]>(() => template?.lines.map(({ product_id, variant_id, quantity, is_primary }) => ({ product_id, ...(variant_id ? { variant_id } : {}), quantity, is_primary })) ?? [{ product_id: "", quantity: 1, is_primary: true }]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || saved) return;
    inFlight.current = true; setPending(true); setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const body = { name: form.get("name"), plan_id: form.get("plan_id"), valid_days: Number(form.get("valid_days")), payment_terms_days: Number(form.get("payment_terms_days")), lines };
      if (props.template) await props.onSave({ ...parseUpdateTemplate({ ...body, is_active: form.get("is_active") === "on" }), expected_version: props.template.version });
      else await props.onSave(parseCreateTemplate(body));
      setSaved(true); setMessage("Template saved.");
    } catch (error) { setMessage(error instanceof SubscriptionError ? error.message : "Template could not be saved. Refresh before retrying if the result is uncertain."); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <h1 className="text-2xl font-semibold">{template ? "Edit quotation template" : "New quotation template"}</h1>
    <fieldset disabled={pending || saved} className="space-y-4">
      <label className="grid gap-1">Template name<input name="name" required defaultValue={template?.name} /></label>
      <label className="grid gap-1">Plan<select name="plan_id" required defaultValue={template?.plan_id ?? ""}>
        <option value="">Choose a plan</option>{props.plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
      </select></label>
      <label className="grid gap-1">Quote valid for (days)<input name="valid_days" type="number" required min={1} max={3650} step={1} defaultValue={template?.valid_days ?? 30} /></label>
      <label className="grid gap-1">Payment terms (days)<input name="payment_terms_days" type="number" required min={0} max={365} step={1} defaultValue={template?.payment_terms_days ?? 0} /></label>
      {template && <label><input name="is_active" type="checkbox" defaultChecked={template.is_active} /> Active template</label>}
      <LineEditor value={lines} onChange={setLines} products={props.products} />
      <button type="submit">{pending ? "Saving…" : "Save template"}</button>
    </fieldset>
    <p role="status" aria-live="polite">{message}</p>
    {saved && <p>Refresh the template list before making another change.</p>}
  </form>;
}

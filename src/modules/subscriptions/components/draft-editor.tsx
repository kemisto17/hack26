"use client";

import { useRef, useState, type FormEvent } from "react";
import type { LineSelection, Mutation, SubscriptionDTO, UpdateDraftInput } from "../contracts";
import { SubscriptionError } from "../errors";
import { parseUpdateDraft } from "../validation";
import { LineEditor, type ProductOption } from "./line-editor";

/** Parent must key this form by subscription.id/version after a refresh. */
export function DraftEditor({ subscription, products, onSave }: { subscription: SubscriptionDTO; products: ProductOption[]; onSave: (input: UpdateDraftInput & Mutation) => Promise<SubscriptionDTO> }) {
  const [lines, setLines] = useState<LineSelection[]>(() => subscription.lines.map(line => ({ product_id: line.product_id, ...(line.variant_id ? { variant_id: line.variant_id } : {}), quantity: line.quantity, is_primary: line.is_primary })));
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  if (subscription.status !== "draft") return <p>Only draft subscriptions can be edited. Revise a quotation before changing its terms.</p>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || saved) return;
    inFlight.current = true; setPending(true); setMessage("");
    try {
      const data = new FormData(event.currentTarget);
      const input = parseUpdateDraft({ lines, start_at: data.get("start_at"), expires_at: data.get("expires_at"), discount_id: data.get("discount_id") || null, payment_terms_days: Number(data.get("payment_terms_days")) });
      await onSave({ ...input, expected_version: subscription.version });
      setSaved(true); setMessage("Draft updated. Refresh before quoting or editing again.");
    } catch (error) { setMessage(error instanceof SubscriptionError ? error.message : "Draft could not be saved. Refresh to check its current version."); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <h2 className="text-xl font-semibold">Edit draft terms</h2>
    <fieldset disabled={pending || saved} className="space-y-4">
      <LineEditor value={lines} onChange={setLines} products={products} />
      <label className="grid gap-1">Start at (UTC)<input name="start_at" required defaultValue={subscription.start_at} /></label>
      <label className="grid gap-1">Expires at (UTC)<input name="expires_at" required defaultValue={subscription.expires_at} /></label>
      <label className="grid gap-1">Payment terms (days)<input name="payment_terms_days" required type="number" min={0} max={365} step={1} defaultValue={subscription.payment_terms_days} /></label>
      <label className="grid gap-1">Discount ID (optional)<input name="discount_id" defaultValue={subscription.discount_id ?? ""} /></label>
      <button type="submit">{pending ? "Saving…" : "Save draft"}</button>
    </fieldset>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}

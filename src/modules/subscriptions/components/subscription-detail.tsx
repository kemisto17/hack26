"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Creation, Mutation, RenewSubscriptionInput, SubscriptionAction, SubscriptionDTO } from "../contracts";
import { SubscriptionError } from "../errors";
import { formatMoney } from "../presentation";
import { parseRenew } from "../validation";

type SimpleAction = Exclude<SubscriptionAction, "renew" | "draft_update">;
export type SubscriptionActionCommand = { action: SimpleAction; input: Mutation } | { action: "renew"; input: RenewSubscriptionInput & Creation & Mutation };
const labels: Record<SimpleAction, string> = { quotation: "Create quotation", revise: "Revise quotation", confirm: "Confirm quotation", activate: "Activate subscription", pause: "Pause subscription", resume: "Resume subscription", close: "Close subscription" };

/** actions are server-derived display hints; the service/RPC reauthorizes every
 * command. Parent must refresh/remount by id/version after any successful action. */
export function SubscriptionDetail({ subscription, actions, onAction }: { subscription: SubscriptionDTO; actions: Exclude<SubscriptionAction, "draft_update">[]; onAction: (command: SubscriptionActionCommand) => Promise<SubscriptionDTO> }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const renewal = useRef<(RenewSubscriptionInput & Creation & Mutation) | null>(null);
  async function execute(command: SubscriptionActionCommand) {
    if (inFlight.current || done) return;
    inFlight.current = true; setPending(true); setMessage("");
    try {
      const result = await onAction(command);
      setDone(true);
      setMessage(command.action === "renew" ? `New draft ${result.number} created for staff review. Refresh to see the current list.` : "Subscription updated. Refresh to see its current state.");
    } catch (error) { setMessage(error instanceof SubscriptionError ? error.message : "Action could not be confirmed. Refresh to check the current state before trying again."); }
    finally { inFlight.current = false; setPending(false); }
  }
  function renew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || done) return;
    try {
      const form = new FormData(event.currentTarget);
      const body = parseRenew({ start_at: form.get("start_at"), expires_at: form.get("expires_at") });
      if (renewal.current && (renewal.current.start_at !== body.start_at || renewal.current.expires_at !== body.expires_at)) throw new SubscriptionError("IDEMPOTENCY_CONFLICT", "Retry the original renewal dates or ask staff to check its result before changing them.");
      renewal.current ??= { ...body, expected_version: subscription.version, request_key: crypto.randomUUID() };
      void execute({ action: "renew", input: renewal.current });
    } catch (error) { setMessage(error instanceof SubscriptionError ? error.message : "Check the renewal dates."); }
  }
  return <article className="space-y-5">
    <h1 className="text-2xl font-semibold">{subscription.number}</h1>
    <dl className="space-y-1">
      <div><dt className="inline font-semibold">Status: </dt><dd className="inline">{subscription.status}</dd></div>
      <div><dt className="inline font-semibold">Start: </dt><dd className="inline"><time dateTime={subscription.start_at}>{subscription.start_at}</time></dd></div>
      <div><dt className="inline font-semibold">Expiry: </dt><dd className="inline"><time dateTime={subscription.expires_at}>{subscription.expires_at}</time></dd></div>
      {subscription.quote_expires_at && <div><dt className="inline font-semibold">Quotation expires: </dt><dd className="inline"><time dateTime={subscription.quote_expires_at}>{subscription.quote_expires_at}</time></dd></div>}
      <div><dt className="inline font-semibold">Next billing: </dt><dd className="inline">{subscription.next_billing_at ?? "Not scheduled"}</dd></div>
      <div><dt className="inline font-semibold">Payment terms: </dt><dd className="inline">{subscription.payment_terms_days} days</dd></div>
    </dl>
    <section aria-label="Subscription lines"><h2 className="text-xl font-semibold">Subscription lines</h2>
      <ul className="space-y-2">{subscription.lines.map(line => <li key={line.id} className="rounded border p-3">
        <p>{line.description}{line.variant_label ? ` · ${line.variant_label}` : ""}{line.is_primary ? " (primary plan)" : ""}</p>
        <p>{line.quantity} × {formatMoney(line.unit_price_minor, subscription.currency)} per billing period</p>
      </li>)}</ul>
    </section>
    <fieldset disabled={pending || done} className="flex flex-wrap gap-3"><legend>Available actions</legend>
      {actions.filter((action): action is SimpleAction => action !== "renew").map(action => <button key={action} type="button" onClick={() => { void execute({ action, input: { expected_version: subscription.version } }); }}>{labels[action]}</button>)}
      {actions.length === 0 && <p>No actions are available for this subscription.</p>}
    </fieldset>
    {actions.includes("renew") && <form onSubmit={renew} className="space-y-3">
      <fieldset disabled={pending || done} className="space-y-3"><legend>Renew as a new draft</legend>
        <label className="grid gap-1">Renewal start at (UTC)<input name="start_at" required placeholder="2027-10-31T00:00:00Z" /></label>
        <label className="grid gap-1">Renewal expires at (UTC)<input name="expires_at" required placeholder="2028-10-31T00:00:00Z" /></label>
        <p>Renewal uses current plan prices. This subscription and its accepted terms are retained.</p>
        <button type="submit">Create renewal draft</button>
      </fieldset>
    </form>}
    <p role="status" aria-live="polite">{pending ? "Updating subscription…" : message}</p>
  </article>;
}

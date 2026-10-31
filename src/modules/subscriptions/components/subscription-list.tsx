import type { SubscriptionSummaryDTO, TemplateDTO } from "../contracts";

export function SubscriptionList({ items, portal = false }: { items: SubscriptionSummaryDTO[]; portal?: boolean }) {
  const prefix = portal ? "/portal/subscriptions" : "/subscriptions";
  return <section className="space-y-4" aria-label="Subscriptions">
    <h1 className="text-2xl font-semibold">Subscriptions</h1>
    {items.length === 0 ? <p>No subscriptions found.</p> : <ul className="space-y-3">{items.map(item => <li key={item.id} className="rounded border p-4">
      <a className="underline" href={`${prefix}/${encodeURIComponent(item.id)}`}>{item.number}</a>
      <dl className="mt-2 grid gap-1"><div><dt className="inline font-semibold">Status: </dt><dd className="inline">{item.status}</dd></div>
        <div><dt className="inline font-semibold">Start: </dt><dd className="inline"><time dateTime={item.start_at}>{item.start_at}</time></dd></div>
        <div><dt className="inline font-semibold">Expiry: </dt><dd className="inline"><time dateTime={item.expires_at}>{item.expires_at}</time></dd></div>
      </dl>
    </li>)}</ul>}
  </section>;
}

export function TemplateList({ items }: { items: TemplateDTO[] }) {
  return <section className="space-y-4" aria-label="Quotation templates">
    <h1 className="text-2xl font-semibold">Quotation templates</h1>
    {items.length === 0 ? <p>No quotation templates found.</p> : <ul className="space-y-3">{items.map(item => <li key={item.id} className="rounded border p-4">
      <a className="underline" href={`/quotation-templates/${encodeURIComponent(item.id)}`}>{item.name}</a>
      <p>{item.is_active ? "Active" : "Retired"} · Quote valid for {item.valid_days} days · Payment terms {item.payment_terms_days} days</p>
    </li>)}</ul>}
  </section>;
}

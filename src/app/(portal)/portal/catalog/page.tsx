import Link from "next/link";
import type { CatalogPlanDTO } from "@/modules/catalog/contracts";
import { getCatalog } from "@/modules/catalog/service";
import { requireActor } from "@/modules/identity/service";

function money(value: string, currency: string) {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10 ** digits;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value) / scale);
}
function interval(plan: CatalogPlanDTO) { return plan.billing_interval === "daily" ? "day" : plan.billing_interval === "weekly" ? "week" : plan.billing_interval === "monthly" ? "month" : "year"; }

export default async function PortalCatalog({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const { catalog, next_cursor } = await getCatalog(actor, { limit: 25, ...(cursor ? { cursor } : {}) });
  const products = new Map(catalog.products.map(product => [product.id, product]));
  return <main id="main-content" className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8">
    <header className="mb-10 max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.18em]">Brightloop plans</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Choose a subscription</h1>
      <p className="mt-3 text-base opacity-75">Browse the currently available plans and their billing terms.</p>
    </header>
    {catalog.plans.length === 0 ? <p role="status" className="rounded-xl border border-current/20 p-6">No plans are available right now.</p> : <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {catalog.plans.map(plan => {
        const product = products.get(plan.product_id);
        return <li key={plan.id} className="flex flex-col rounded-2xl border border-current/20 p-6">
          <p className="text-sm font-semibold uppercase tracking-wider">{plan.billing_interval} plan</p>
          <h2 className="mt-2 text-2xl font-semibold">{plan.name}</h2>
          <p className="mt-2 opacity-75">{product?.name ?? "Subscription"}</p>
          <p className="mt-6 text-3xl font-semibold">{money(plan.price_minor, plan.currency)}<span className="ml-2 text-base font-normal opacity-70">/ {interval(plan)}</span></p>
          <dl className="mt-6 grid gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt>Minimum quantity</dt><dd>{plan.min_quantity}</dd></div>
            <div className="flex justify-between gap-4"><dt>Available from</dt><dd>{plan.available_from}</dd></div>
            {plan.available_until && <div className="flex justify-between gap-4"><dt>Available through</dt><dd>{plan.available_until}</dd></div>}
          </dl>
          {product?.variants.length ? <div className="mt-6 border-t border-current/15 pt-4"><h3 className="text-sm font-semibold">Available options</h3><ul className="mt-2 space-y-1 text-sm opacity-80">{product.variants.map(variant => <li key={variant.id}>{variant.name} · {variant.price_adjustment_minor.startsWith("-") ? "−" : "+"}{money(variant.price_adjustment_minor.replace(/^-/, ""), plan.currency)}</li>)}</ul></div> : null}
        </li>;
      })}
    </ul>}
    {next_cursor && <nav aria-label="Catalog pages" className="mt-8"><Link className="underline underline-offset-4" href={`/portal/catalog?cursor=${encodeURIComponent(next_cursor)}`}>Next plans</Link></nav>}
  </main>;
}

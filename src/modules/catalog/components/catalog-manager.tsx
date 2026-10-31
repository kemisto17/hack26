"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import type { DiscountDTO, PlanDTO, ProductDTO, TaxRuleDTO, VariantDTO } from "../contracts";

type Props = { canConfigure: boolean; products: ProductDTO[]; variants: VariantDTO[]; plans: PlanDTO[]; taxRules: TaxRuleDTO[]; discounts: DiscountDTO[] };
type Resource = "products" | "variants" | "plans" | "tax-rules";
function read(form: HTMLFormElement, key: string) { return new FormData(form).get(key)?.toString() ?? ""; }
function Field({ label, name, type = "text", required = false, defaultValue, min, max, step, pattern, children }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string; min?: string; max?: string; step?: string; pattern?: string; children?: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium">{label}{children ?? <input className="form-input" name={name} type={type} required={required} defaultValue={defaultValue} min={min} max={max} step={step} pattern={pattern} />}</label>;
}
function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-current/20 p-5 sm:p-6"><h2 className="text-xl font-semibold">{title}</h2>{children}</section>;
}
function money(value: string, currency: string) {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value) / 10 ** digits);
}

export function CatalogManager({ canConfigure, products, variants, plans, taxRules, discounts }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const productNames = new Map(products.map(product => [product.id, product.name]));
  async function send(resource: Resource, body: Record<string, unknown>, id?: string, version?: string): Promise<boolean> {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/v1/${resource}${id ? `/${encodeURIComponent(id)}` : ""}`, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...(version ? { "If-Match": `"${version}"` } : {}) },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { data?: unknown; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "The catalog change could not be saved.");
      setMessage(id ? "Catalog item retired." : "Catalog item created.");
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The catalog change could not be saved.");
      return false;
    } finally { setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>, resource: Resource, values: (form: HTMLFormElement) => Record<string, unknown>) {
    event.preventDefault();
    try { const form = event.currentTarget; if (await send(resource, values(form))) form.reset(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Check the form values."); }
  }
  async function retire(resource: Resource, id: string, version: string) { await send(resource, { is_active: false }, id, version); }
  const productsForm = (event: FormEvent<HTMLFormElement>) => create(event, "products", form => ({
    name: read(form, "name"), product_type: read(form, "product_type"), sales_price_minor: read(form, "sales_price_minor"),
    cost_price_minor: read(form, "cost_price_minor"), currency: read(form, "currency"), notes: read(form, "notes"),
    tax_rule_id: read(form, "tax_rule_id") || null,
  }));
  const variantsForm = (event: FormEvent<HTMLFormElement>) => create(event, "variants", form => {
    let attributes: unknown;
    try { attributes = JSON.parse(read(form, "attributes")); } catch { throw new Error("Attributes must be valid JSON."); }
    return { product_id: read(form, "product_id"), name: read(form, "name"), price_adjustment_minor: read(form, "price_adjustment_minor"), attributes };
  });
  const plansForm = (event: FormEvent<HTMLFormElement>) => create(event, "plans", form => ({
    product_id: read(form, "product_id"), name: read(form, "name"), price_minor: read(form, "price_minor"), currency: read(form, "currency"),
    billing_interval: read(form, "billing_interval"), min_quantity: Number(read(form, "min_quantity")),
    ...(read(form, "available_from") ? { available_from: read(form, "available_from") } : {}),
    ...(read(form, "available_until") ? { available_until: read(form, "available_until") } : {}),
    auto_close: read(form, "auto_close") === "on", allow_close: read(form, "allow_close") === "on",
    allow_pause: read(form, "allow_pause") === "on", allow_renew: read(form, "allow_renew") === "on",
  }));
  const taxesForm = (event: FormEvent<HTMLFormElement>) => create(event, "tax-rules", form => ({
    name: read(form, "name"), rate_bps: Number(read(form, "rate_bps")), starts_on: read(form, "starts_on"),
    ...(read(form, "ends_on") ? { ends_on: read(form, "ends_on") } : {}),
  }));

  return <div className="grid gap-8">
    <div aria-live="polite" className="grid gap-2">{message && <p role="status" className="rounded-lg border border-current/20 p-3 text-sm">{message}</p>}{error && <p role="alert" className="rounded-lg border border-red-700/50 p-3 text-sm">{error}</p>}</div>
    {!canConfigure && <p role="status" className="rounded-xl border border-current/20 p-4">You have read access to catalog configuration. An administrator can make changes.</p>}
    {canConfigure && <div className="grid gap-6 xl:grid-cols-2">
      <FormSection title="Add a product"><form onSubmit={productsForm} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Product name" name="name" required />
        <Field label="Product type" name="product_type" required><select className="form-input" name="product_type" defaultValue="service" required><option value="software">Software</option><option value="service">Service</option><option value="addon">Add-on</option></select></Field>
        <Field label="Sales price (minor units)" name="sales_price_minor" type="number" min="0" step="1" required />
        <Field label="Cost price (minor units)" name="cost_price_minor" type="number" min="0" step="1" required />
        <Field label="Currency" name="currency" defaultValue="USD" pattern="[A-Z]{3}" required />
        <Field label="Tax rule" name="tax_rule_id"><select className="form-input" name="tax_rule_id" defaultValue=""><option value="">No tax rule</option>{taxRules.filter(rule => rule.is_active).map(rule => <option key={rule.id} value={rule.id}>{rule.name} ({rule.rate_bps} bps)</option>)}</select></Field>
        <Field label="Internal notes" name="notes"><textarea className="form-input min-h-20" name="notes" maxLength={10000} /></Field>
        <button className="form-button self-end" disabled={busy}>Create product</button>
      </form></FormSection>
      <FormSection title="Add a variant"><form onSubmit={variantsForm} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Product" name="product_id" required><select className="form-input" name="product_id" required defaultValue=""><option value="" disabled>Choose a product</option>{products.filter(product => product.is_active).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
        <Field label="Variant name" name="name" required />
        <Field label="Price adjustment (minor units)" name="price_adjustment_minor" type="number" defaultValue="0" step="1" required />
        <Field label="Attributes (JSON object)" name="attributes"><textarea className="form-input min-h-20 font-mono text-xs" name="attributes" defaultValue="{}" /></Field>
        <button className="form-button self-end" disabled={busy}>Create variant</button>
      </form></FormSection>
      <FormSection title="Add a plan"><form onSubmit={plansForm} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Primary product" name="product_id" required><select className="form-input" name="product_id" required defaultValue=""><option value="" disabled>Choose a product</option>{products.filter(product => product.is_active).map(product => <option key={product.id} value={product.id}>{product.name} · {product.currency}</option>)}</select></Field>
        <Field label="Plan name" name="name" required />
        <Field label="Price (minor units)" name="price_minor" type="number" min="0" step="1" required />
        <Field label="Currency" name="currency" defaultValue="USD" pattern="[A-Z]{3}" required />
        <Field label="Billing interval" name="billing_interval" required><select className="form-input" name="billing_interval" defaultValue="monthly" required><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></Field>
        <Field label="Minimum quantity" name="min_quantity" type="number" min="1" max="1000000" defaultValue="1" step="1" required />
        <Field label="Available from" name="available_from" type="date" />
        <Field label="Available until" name="available_until" type="date" />
        <fieldset className="grid gap-2 text-sm"><legend className="mb-1 font-medium">Plan options</legend><label className="flex items-center gap-2"><input type="checkbox" name="auto_close" defaultChecked />Auto-close at expiry</label><label className="flex items-center gap-2"><input type="checkbox" name="allow_close" defaultChecked />Allow early close</label><label className="flex items-center gap-2"><input type="checkbox" name="allow_pause" />Allow pause</label><label className="flex items-center gap-2"><input type="checkbox" name="allow_renew" defaultChecked />Allow renewal</label></fieldset>
        <button className="form-button self-end" disabled={busy}>Create plan</button>
      </form></FormSection>
      <FormSection title="Add a tax rule"><form onSubmit={taxesForm} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Rule name" name="name" required />
        <Field label="Rate (basis points)" name="rate_bps" type="number" min="0" max="10000" step="1" required />
        <Field label="Starts on" name="starts_on" type="date" required />
        <Field label="Ends on" name="ends_on" type="date" />
        <button className="form-button self-end" disabled={busy}>Create tax rule</button>
      </form></FormSection>
    </div>}

    <FormSection title={`Products (${products.length})`}><ul className="mt-4 divide-y divide-current/15">{products.map(product => <li key={product.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{product.name} <span className="font-normal opacity-70">· {product.product_type}</span></p><p className="text-sm opacity-75">Sales {money(product.sales_price_minor, product.currency)} · Cost {money(product.cost_price_minor, product.currency)} · {product.is_active ? "Active" : "Retired"}</p>{product.notes && <p className="mt-1 text-xs opacity-70">Internal: {product.notes}</p>}</div>{canConfigure && product.is_active && <button className="rounded-md border border-current/25 px-3 py-2 text-sm" disabled={busy} onClick={() => void retire("products", product.id, product.version)}>Retire product</button>}</li>)}</ul></FormSection>
    <FormSection title={`Variants (${variants.length})`}><ul className="mt-4 divide-y divide-current/15">{variants.map(variant => <li key={variant.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{variant.name} <span className="font-normal opacity-70">· {productNames.get(variant.product_id) ?? "Product"}</span></p><p className="text-sm opacity-75">Adjustment {variant.price_adjustment_minor} minor units · {variant.is_active ? "Active" : "Retired"}</p></div>{canConfigure && variant.is_active && <button className="rounded-md border border-current/25 px-3 py-2 text-sm" disabled={busy} onClick={() => void retire("variants", variant.id, variant.version)}>Retire variant</button>}</li>)}</ul></FormSection>
    <FormSection title={`Plans (${plans.length})`}><ul className="mt-4 divide-y divide-current/15">{plans.map(plan => <li key={plan.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{plan.name} <span className="font-normal opacity-70">· {plan.billing_interval}</span></p><p className="text-sm opacity-75">{productNames.get(plan.product_id) ?? "Product"} · {money(plan.price_minor, plan.currency)} · {plan.is_active ? "Active" : "Retired"}</p></div>{canConfigure && plan.is_active && <button className="rounded-md border border-current/25 px-3 py-2 text-sm" disabled={busy} onClick={() => void retire("plans", plan.id, plan.version)}>Retire plan</button>}</li>)}</ul></FormSection>
    <FormSection title={`Tax rules (${taxRules.length})`}><ul className="mt-4 divide-y divide-current/15">{taxRules.map(rule => <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{rule.name}</p><p className="text-sm opacity-75">{rule.rate_bps} bps · {rule.starts_on}{rule.ends_on ? ` through ${rule.ends_on}` : " · no end date"} · {rule.is_active ? "Active" : "Retired"}</p></div>{canConfigure && rule.is_active && <button className="rounded-md border border-current/25 px-3 py-2 text-sm" disabled={busy} onClick={() => void retire("tax-rules", rule.id, rule.version)}>Retire tax rule</button>}</li>)}</ul></FormSection>
    <FormSection title={`Discounts (${discounts.length})`}><ul className="mt-4 divide-y divide-current/15">{discounts.map(discount => <li key={discount.id} className="py-3"><p className="font-semibold">{discount.name} <span className="font-normal opacity-70">· {discount.code}</span></p><p className="text-sm opacity-75">{discount.scope} · {discount.kind} · {discount.is_active ? "Active" : "Retired"}</p></li>)}</ul></FormSection>
  </div>;
}

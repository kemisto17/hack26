import { CatalogManager } from '@/modules/catalog/components/catalog-manager';
import { listProducts, listVariants, listPlans, listTaxRules, listDiscounts } from '@/modules/catalog/service';
import { requireAdmin } from './session';
import { AdminHeading, ButtonLink, Notice } from './ui';

/** Reuse D2's public service and configuration UI; no parallel catalog implementation. */
export async function AdminCatalog() {
  const user = await requireAdmin();
  const actor = { id: user.id, role: user.role };
  const [products, variants, plans, taxes, discounts] = await Promise.all([
    listProducts(actor, { limit: 100 }), listVariants(actor, { limit: 100 }),
    listPlans(actor, { limit: 100 }), listTaxRules(actor, { limit: 100 }), listDiscounts(actor, { limit: 100 }),
  ]);
  return <><AdminHeading title="Products & plans" description="Manage products, variants, recurring plans and tax rules through the catalog module." />
    <Notice>Showing the first 100 records per category. Retired items retain their historical references. Discount editing and individual detail screens are not connected here.</Notice>
    <CatalogManager canConfigure products={products.items} variants={variants.items} plans={plans.items} taxRules={taxes.items} discounts={discounts.items} />
  </>;
}

export function ProductEditor({ existing = false }: { existing?: boolean }) {
  if (!existing) return <AdminCatalog />;
  return <><AdminHeading title="Product details" description="Individual product detail lookup is not connected in this console."><ButtonLink href="/admin/catalog">Open catalog management</ButtonLink></AdminHeading><Notice>No product has been loaded for this address. Use the catalog to create products, variants and plans or retire existing records.</Notice></>;
}

export function PricingPage({ detail = false }: { detail?: boolean }) {
  if (!detail) return <AdminCatalog />;
  return <><AdminHeading title="Pricing configuration" description="Pricing is maintained by the catalog module."><ButtonLink href="/admin/catalog">Manage plans and tax rules</ButtonLink></AdminHeading><Notice>This individual pricing record has not been loaded. Accepted subscription prices remain frozen; changes to plans must not rewrite history.</Notice></>;
}

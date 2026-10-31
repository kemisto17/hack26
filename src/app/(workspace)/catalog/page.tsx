import { redirect } from "next/navigation";
import { requireActor } from "@/modules/identity/service";
import { listDiscounts, listPlans, listProducts, listTaxRules, listVariants } from "@/modules/catalog/service";
import { CatalogManager } from "@/modules/catalog/components/catalog-manager";

export default async function CatalogPage() {
  const actor = await requireActor();
  if (actor.role === "customer") redirect("/portal/catalog");
  const [products, variants, plans, taxRules, discounts] = await Promise.all([
    listProducts(actor, { limit: 100 }), listVariants(actor, { limit: 100 }), listPlans(actor, { limit: 100 }),
    listTaxRules(actor, { limit: 100 }), listDiscounts(actor, { limit: 100 }),
  ]);
  return <main id="main-content" className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8">
    <header className="mb-10 max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.18em]">Workspace configuration</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Catalog</h1><p className="mt-3 opacity-75">Manage products, variants, plans and tax rules. Retired items remain available to historical records.</p></header>
    <CatalogManager canConfigure={actor.role === "admin"} products={products.items} variants={variants.items} plans={plans.items} taxRules={taxRules.items} discounts={discounts.items} />
  </main>;
}

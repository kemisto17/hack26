import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProductDTO } from "../../src/modules/catalog/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { CatalogManager } from "../../src/modules/catalog/components/catalog-manager";

const product: ProductDTO = { id: "10000000-0000-4000-8000-000000000001", name: "Plan product", product_type: "service", sales_price_minor: "1200", cost_price_minor: "300", currency: "USD", notes: "internal note", tax_rule_id: null, is_active: true, version: "2", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z" };
const data = { products: [product], variants: [], plans: [], taxRules: [], discounts: [] };

describe("catalog configuration interface", () => {
  it("renders labelled admin forms and reversible retirement controls", () => {
    const html = renderToStaticMarkup(createElement(CatalogManager, { ...data, canConfigure: true }));
    expect(html).toContain("Product name");
    expect(html).toContain("Sales price (minor units)");
    expect(html).toContain("Create product");
    expect(html).toContain("Retire product");
    expect(html).toContain("Internal: internal note");
  });

  it("keeps configuration controls out of the internal staff view", () => {
    const html = renderToStaticMarkup(createElement(CatalogManager, { ...data, canConfigure: false }));
    expect(html).toContain("You have read access to catalog configuration.");
    expect(html).not.toContain("Create product");
    expect(html).not.toContain("Retire product");
    expect(html).toContain("Plan product");
  });
});

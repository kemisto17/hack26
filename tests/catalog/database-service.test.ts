import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ adminClient: vi.fn(), sessionClient: vi.fn(), requireActor: vi.fn() }));
vi.mock("../../src/lib/supabase/admin", () => ({ createAdminClient: mocks.adminClient }));
vi.mock("../../src/lib/supabase/server", () => ({ createSessionClient: mocks.sessionClient }));
vi.mock("../../src/modules/identity/service", () => ({ requireActor: mocks.requireActor }));

import { createProduct, getCatalog, listProducts, updateProduct } from "../../src/modules/catalog/service";
import type { Actor, CreateProductInput, ProductDTO } from "../../src/modules/catalog/contracts";

const admin: Actor = { id: "10000000-0000-4000-8000-000000000001", role: "admin" };
const internal: Actor = { id: "10000000-0000-4000-8000-000000000002", role: "internal" };
const customer: Actor = { id: "10000000-0000-4000-8000-000000000003", role: "customer" };
const product: ProductDTO = { id: "20000000-0000-4000-8000-000000000001", name: "Service", product_type: "service", sales_price_minor: "1200", cost_price_minor: "300", currency: "USD", notes: "internal note", tax_rule_id: null, is_active: true, version: "4", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z" };

function chain(response: { data: unknown; error: null | { code: string; message: string } }) {
  const calls: unknown[][] = [];
  const query: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "eq", "in", "or", "order", "limit", "lte", "gte"]) {
    query[method] = vi.fn((...args: unknown[]) => { calls.push([method, ...args]); return query; });
  }
  query.single = vi.fn(async () => response);
  query.maybeSingle = vi.fn(async () => response);
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(response).then(resolve, reject);
  return { query, calls };
}

describe("catalog database service authorization and DTO boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("blocks customers and internal staff from configuration writes before opening the privileged client", async () => {
    mocks.requireActor.mockResolvedValueOnce(customer).mockResolvedValueOnce(internal);
    const input: CreateProductInput = { name: "New", product_type: "service", sales_price_minor: "100", cost_price_minor: "20", currency: "USD" };
    await expect(createProduct(customer, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createProduct(internal, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it("requires the current verified session to match the supplied actor", async () => {
    mocks.requireActor.mockResolvedValueOnce({ ...admin, id: internal.id });
    await expect(createProduct(admin, { name: "x", product_type: "service", sales_price_minor: "1", cost_price_minor: "0", currency: "USD" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it("reads configuration through the session client and maps only the staff DTO fields", async () => {
    const resultRow = { ...product, sales_price_minor: 1200, cost_price_minor: 300, version: 4 };
    const q = chain({ data: [resultRow], error: null });
    const session = { from: vi.fn(() => q.query) };
    mocks.requireActor.mockResolvedValue(admin);
    mocks.sessionClient.mockResolvedValue(session);
    const page = await listProducts(admin, { limit: 10 });
    expect(session.from).toHaveBeenCalledWith("products");
    expect(mocks.adminClient).not.toHaveBeenCalled();
    expect(page.items[0]).toEqual(product);
    expect(page.next_cursor).toBeNull();
  });

  it.each(["2026-01-01T00:00:00.123456+00:00", "2026-01-01T00:00:00.1Z"])("round trips database pagination timestamps without losing precision: %s", async created_at => {
    const row = { ...product, sales_price_minor: 1200, cost_price_minor: 300, version: 4, created_at };
    const first = chain({ data: [row, { ...row, id: "20000000-0000-4000-8000-000000000002" }], error: null });
    const second = chain({ data: [], error: null });
    mocks.requireActor.mockResolvedValue(admin);
    mocks.sessionClient.mockResolvedValue({ from: vi.fn().mockReturnValueOnce(first.query).mockReturnValueOnce(second.query) });
    const page = await listProducts(admin, { limit: 1 });
    expect(page.next_cursor).toBeTypeOf("string");
    await expect(listProducts(admin, { limit: 1, cursor: page.next_cursor! })).resolves.toEqual({ items: [], next_cursor: null });
    expect(second.calls).toContainEqual(["or", `created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${product.id})`]);
  });

  it.each(["2026-02-30T00:00:00Z", "2026-01-01T00:00:00Z),id.neq.null", "2026-01-01T00:00:00+01:00"])("rejects invalid or unsafe cursor timestamps before database reads: %s", async created_at => {
    mocks.requireActor.mockResolvedValue(admin);
    const cursor = Buffer.from(JSON.stringify({ scope: "products", created_at, id: product.id })).toString("base64url");
    await expect(listProducts(admin, { cursor })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.sessionClient).not.toHaveBeenCalled();
  });

  it("returns only active safe catalog projections to customers", async () => {
    const planRow = { id: "30000000-0000-4000-8000-000000000001", product_id: product.id, name: "Monthly", price_minor: 500, currency: "USD", billing_interval: "monthly", min_quantity: 1, available_from: "2020-01-01", available_until: null, auto_close: true, allow_close: true, allow_pause: false, allow_renew: true, is_active: true, version: 2, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" };
    const planQuery = chain({ data: [planRow], error: null });
    const productQuery = chain({ data: [{ id: product.id, name: product.name, product_type: product.product_type, sales_price_minor: 1200, currency: "USD", is_active: true, cost_price_minor: 99999, notes: "must not leave server" }], error: null });
    const variantQuery = chain({ data: [{ id: "40000000-0000-4000-8000-000000000001", product_id: product.id, name: "Plus", attributes: { seats: 4 }, price_adjustment_minor: -100, is_active: true }], error: null });
    const adminDb = { from: vi.fn().mockReturnValueOnce(planQuery.query).mockReturnValueOnce(productQuery.query).mockReturnValueOnce(variantQuery.query) };
    mocks.requireActor.mockResolvedValue(customer);
    mocks.adminClient.mockReturnValue(adminDb);
    const result = await getCatalog(customer);
    expect(result.catalog.plans).toHaveLength(1);
    expect(result.catalog.products[0]?.variants[0]?.price_adjustment_minor).toBe("-100");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("cost_price_minor");
    expect(serialized).not.toContain("must not leave server");
    expect(productQuery.calls.find(call => call[0] === "select")).toEqual(["select", "id,name,product_type,sales_price_minor,currency,is_active"]);
  });

  it("creates products with integer minor units and returns an explicit DTO", async () => {
    const q = chain({ data: { ...product, sales_price_minor: 1200, cost_price_minor: 300, version: 4 }, error: null });
    const adminDb = { from: vi.fn(() => q.query) };
    mocks.requireActor.mockResolvedValue(admin);
    mocks.adminClient.mockReturnValue(adminDb);
    await expect(createProduct(admin, { name: " Service ", product_type: "service", sales_price_minor: "1200", cost_price_minor: "300", currency: "USD" })).resolves.toEqual(product);
    expect(adminDb.from).toHaveBeenCalledWith("products");
    expect(q.calls).toContainEqual(["insert", { name: "Service", product_type: "service", sales_price_minor: 1200, cost_price_minor: 300, currency: "USD" }]);
  });

  it("uses If-Match as a conditional update and reports stale versions without changing data", async () => {
    const exists = chain({ data: { id: product.id }, error: null });
    const stale = chain({ data: null, error: null });
    const adminDb = { from: vi.fn().mockReturnValueOnce(exists.query).mockReturnValueOnce(stale.query) };
    mocks.requireActor.mockResolvedValue(admin);
    mocks.adminClient.mockReturnValue(adminDb);
    await expect(updateProduct(admin, product.id, { name: "Changed", expected_version: "3" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(stale.calls).toContainEqual(["eq", "version", "3"]);
  });
});

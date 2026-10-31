import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const load = name => require(path.join(process.env.D2_TEST_OUTPUT, name));
const { calculateQuote, calculateInvoicePricing, PricingError } = load('pricing');
const ids = {
  plan: '10000000-0000-4000-8000-000000000001',
  primary: '20000000-0000-4000-8000-000000000001',
  addon: '20000000-0000-4000-8000-000000000002',
  variant: '30000000-0000-4000-8000-000000000001',
  tax: '40000000-0000-4000-8000-000000000001',
  discount: '50000000-0000-4000-8000-000000000001',
};
const at = '2026-10-31T12:00:00.000Z';
const plan = { id: ids.plan, product_id: ids.primary, name: 'Standard', price_minor: '1000', currency: 'USD', min_quantity: 1, available_from: '2026-01-01', available_until: null, is_active: true };
const products = [
  { id: ids.primary, name: 'Service', product_type: 'service', sales_price_minor: '9999', currency: 'USD', is_active: true, tax_rule_id: ids.tax },
  { id: ids.addon, name: 'Extra', product_type: 'addon', sales_price_minor: '500', currency: 'USD', is_active: true, tax_rule_id: ids.tax },
];
const lines = [
  { product_id: ids.primary, variant_id: ids.variant, quantity: 2, is_primary: true },
  { product_id: ids.addon, quantity: 1, is_primary: false },
];
const variant = { id: ids.variant, product_id: ids.primary, name: 'Plus', price_adjustment_minor: '100', is_active: true };
const error = (fn, code) => assert.throws(fn, e => e instanceof PricingError && e.code === code);

test('quote uses plan price for primary and catalog price for add-ons, with variant adjustment', () => {
  const quote = calculateQuote({ plan, products, variants: [variant], lines, at });
  assert.equal(quote.currency, 'USD');
  assert.match(quote.lines[0].id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(quote.lines.map(line => line.unit_price_minor), ['1100', '500']);
  assert.equal(quote.subtotal_minor, '2700');
  assert.equal(quote.lines[0].description, 'Service');
});

test('quote rejects missing primary, invalid quantity, inactive catalog and mismatched variants', () => {
  error(() => calculateQuote({ plan, products, variants: [variant], lines: [], at }), 'VALIDATION_ERROR');
  error(() => calculateQuote({ plan, products, variants: [variant], lines: [{ ...lines[0], quantity: 0 }], at }), 'VALIDATION_ERROR');
  error(() => calculateQuote({ plan: { ...plan, available_until: '2026-10-30' }, products, variants: [variant], lines, at }), 'UNAVAILABLE');
  error(() => calculateQuote({ plan, products, variants: [{ ...variant, product_id: ids.addon }], lines, at }), 'VALIDATION_ERROR');
  error(() => calculateQuote({ plan, products: products.map(p => ({ ...p, is_active: false })), variants: [variant], lines, at }), 'UNAVAILABLE');
});

test('quote rejects currency mismatch, below-zero adjusted price and primary quantity below plan minimum', () => {
  error(() => calculateQuote({ plan, products: products.map((p, i) => i ? { ...p, currency: 'EUR' } : p), variants: [variant], lines, at }), 'VALIDATION_ERROR');
  error(() => calculateQuote({ plan, products, variants: [{ ...variant, price_adjustment_minor: '-1001' }], lines, at }), 'VALIDATION_ERROR');
  error(() => calculateQuote({ plan: { ...plan, min_quantity: 3 }, products, variants: [variant], lines, at }), 'VALIDATION_ERROR');
});

test('invoice pricing applies capped fixed discount and half-up tax on discounted value', () => {
  const quote = calculateQuote({ plan, products, variants: [variant], lines, at });
  const discounted = { id: ids.discount, scope: 'subscription', kind: 'fixed', amount_minor: '500', currency: 'USD', percent_bps: null, min_quantity: 1, min_subtotal_minor: '0', starts_at: '2026-01-01T00:00:00.000Z', ends_at: null, is_active: true, product_ids: [], max_uses: 1, used_count: 0 };
  const result = calculateInvoicePricing({ currency: 'USD', lines: quote.lines, taxes: new Map([[ids.tax, { id: ids.tax, rate_bps: 1000, starts_on: '2026-01-01', ends_on: null, is_active: true }]]), productTaxRuleIds: new Map([[ids.primary, ids.tax], [ids.addon, ids.tax]]), discount: discounted, period_start: at, at });
  assert.equal(result.subtotal_minor, '2700');
  assert.equal(result.discount_minor, '500');
  assert.equal(result.lines.reduce((sum, line) => sum + Number(line.discount_minor), 0), 500);
  assert.deepEqual(result.lines.map(line => line.tax_minor), ['179', '41']);
  assert.equal(result.total_minor, '2420');
});

test('percentage discount rounds half up, allocates remainder by ascending line UUID, and tax rounds half up', () => {
  const invoiceLines = [
    { id: 'bbbb', product_id: ids.primary, quantity: 1, unit_price_minor: '1', description: 'A', variant_label: null, is_primary: true },
    { id: 'aaaa', product_id: ids.addon, quantity: 1, unit_price_minor: '1', description: 'B', variant_label: null, is_primary: false },
  ];
  const discount = { id: ids.discount, scope: 'subscription', kind: 'percentage', amount_minor: null, currency: null, percent_bps: 5000, min_quantity: 1, min_subtotal_minor: '0', starts_at: '2026-01-01T00:00:00.000Z', ends_at: null, is_active: true, product_ids: [], max_uses: null, used_count: 0 };
  const result = calculateInvoicePricing({ currency: 'USD', lines: invoiceLines, taxes: new Map([[ids.tax, { id: ids.tax, rate_bps: 5000, starts_on: '2026-01-01', ends_on: null, is_active: true }]]), productTaxRuleIds: new Map([[ids.primary, ids.tax], [ids.addon, ids.tax]]), discount, period_start: at, at });
  assert.equal(result.discount_minor, '1'); // 50% of 2, rounded half up
  assert.equal(result.lines.find(line => line.id === 'aaaa').discount_minor, '1');
  assert.equal(result.lines.find(line => line.id === 'bbbb').discount_minor, '0');
  assert.deepEqual(result.lines.map(line => line.tax_minor), ['1', '0']);
  assert.equal(result.total_minor, '2');
});

test('expired, inactive, exhausted and below-minimum discounts yield no discount; inactive tax is zero', () => {
  const quote = calculateQuote({ plan, products, variants: [variant], lines, at });
  const discount = { id: ids.discount, scope: 'product', kind: 'fixed', amount_minor: '9000', currency: 'USD', percent_bps: null, min_quantity: 1, min_subtotal_minor: '0', starts_at: '2027-01-01T00:00:00.000Z', ends_at: null, is_active: true, product_ids: [ids.primary], max_uses: 1, used_count: 0 };
  const base = { currency: 'USD', lines: quote.lines, taxes: new Map([[ids.tax, { id: ids.tax, rate_bps: 1200, starts_on: '2026-01-01', ends_on: null, is_active: false }]]), productTaxRuleIds: new Map([[ids.primary, ids.tax], [ids.addon, null]]), period_start: at, at };
  for (const candidate of [discount, { ...discount, is_active: false, starts_at: '2026-01-01T00:00:00.000Z' }, { ...discount, used_count: 1, starts_at: '2026-01-01T00:00:00.000Z' }, { ...discount, min_subtotal_minor: '999999', starts_at: '2026-01-01T00:00:00.000Z' }]) {
    const result = calculateInvoicePricing({ ...base, discount: candidate });
    assert.equal(result.discount_minor, '0');
    assert.equal(result.tax_minor, '0');
  }
});

test('invoice rejects malformed currency, invalid timestamp, overlong amount and a mismatched fixed discount currency', () => {
  const quote = calculateQuote({ plan, products, variants: [variant], lines, at });
  const base = { currency: 'USD', lines: quote.lines, taxes: new Map(), productTaxRuleIds: new Map(), discount: null, at };
  error(() => calculateInvoicePricing({ ...base, currency: 'US' }), 'VALIDATION_ERROR');
  error(() => calculateInvoicePricing({ ...base, at: '2026-02-30T00:00:00Z' }), 'VALIDATION_ERROR');
  error(() => calculateInvoicePricing({ ...base, lines: [{ ...quote.lines[0], unit_price_minor: '9000000000001' }, quote.lines[1]] }), 'VALIDATION_ERROR');
  error(() => calculateInvoicePricing({ ...base, discount: { id: ids.discount, scope: 'subscription', kind: 'fixed', amount_minor: '1', currency: 'EUR', percent_bps: null, min_quantity: 1, min_subtotal_minor: '0', starts_at: '2026-01-01T00:00:00.000Z', ends_at: null, is_active: true, product_ids: [], max_uses: 1, used_count: 0 } }), 'VALIDATION_ERROR');
});

test('invoice rejects duplicate source lines and malformed discount mappings or percentages', () => {
  const quote = calculateQuote({ plan, products, variants: [variant], lines, at });
  const base = { currency: 'USD', lines: quote.lines, taxes: new Map(), productTaxRuleIds: new Map(), discount: null, at };
  error(() => calculateInvoicePricing({ ...base, lines: [quote.lines[0], { ...quote.lines[0] }] }), 'VALIDATION_ERROR');
  const productRule = { id: ids.discount, scope: 'product', kind: 'percentage', amount_minor: null, currency: null, percent_bps: 10001, min_quantity: 1, min_subtotal_minor: '0', starts_at: '2026-01-01T00:00:00.000Z', ends_at: null, is_active: true, product_ids: [ids.primary], max_uses: null, used_count: 0 };
  error(() => calculateInvoicePricing({ ...base, discount: productRule }), 'VALIDATION_ERROR');
  error(() => calculateInvoicePricing({ ...base, discount: { ...productRule, percent_bps: 1000, product_ids: [] } }), 'VALIDATION_ERROR');
});

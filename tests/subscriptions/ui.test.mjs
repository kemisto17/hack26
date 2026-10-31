import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const loadCompiled = createRequire(import.meta.url);
const load = name => loadCompiled(path.join(process.env.D3_TEST_OUTPUT, name));
const { prepareDraftAttempt } = load('creation-attempt.js');
const { formatMoney } = load('presentation.js');
const { TemplateForm } = load('components/template-form.js');
const { DraftSubscriptionForm } = load('components/draft-form.js');
const { DraftEditor } = load('components/draft-editor.js');
const { SubscriptionList } = load('components/subscription-list.js');
const { SubscriptionDetail } = load('components/subscription-detail.js');
const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const now = '2026-10-31T00:00:00.000Z';
const lines = [{ product_id: id, quantity: 1, is_primary: true }];
const create = { customer_id: id, plan_id: id, start_at: now, expires_at: '2027-01-01T00:00:00.000Z', lines };
const row = { id, number: 'SUB-test', customer_id: other, plan_id: id, currency: 'USD', status: 'active', start_at: now, expires_at: create.expires_at, quote_expires_at: null, payment_terms_days: 7, next_billing_at: now, version: '1', lines: [{ ...lines[0], id, description: '<script>alert(1)</script>', variant_label: '<b>Variant</b>', unit_price_minor: '123', cost_price_minor: 'PRIVATE_COST', notes: 'PRIVATE_NOTES' }] };
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const never = async () => { throw new Error('No mutation during render'); };
test('uncertain create retry preserves its UUID across normalized equivalent inputs', () => {
  let generated = 0;
  const key = () => { generated++; return id; };
  const first = prepareDraftAttempt(null, create, key);
  const again = prepareDraftAttempt(first, { lines, expires_at: create.expires_at, start_at: '2026-10-31T00:00:00Z', plan_id: id.toUpperCase(), customer_id: id }, key);
  assert.deepEqual(first, again);
  assert.equal(generated, 1);
});
test('edited or reordered selections cannot silently reuse an uncertain create key', () => {
  const first = prepareDraftAttempt(null, create, () => id);
  for (const input of [{ ...create, payment_terms_days: 7 }, { ...create, lines: [{ ...lines[0], quantity: 2 }] }, { ...create, customer_id: other }]) assert.throws(() => prepareDraftAttempt(first, input, () => other), error => error.code === 'IDEMPOTENCY_CONFLICT');
});
test('template source retry keeps original input independent of template defaults', () => {
  const input = { ...create, template_id: other }; delete input.lines;
  const first = prepareDraftAttempt(null, input, () => id);
  assert.equal('payment_terms_days' in first, false);
  assert.deepEqual(prepareDraftAttempt(first, input, () => { throw new Error('Do not allocate retry key'); }), first);
});
test('currency rendering preserves exact minor amounts and currency exponents', () => {
  assert.equal(formatMoney('123', 'USD'), '$1.23');
  assert.equal(formatMoney('9000000000000000', 'USD'), '$90,000,000,000,000.00');
  assert.equal(formatMoney('123', 'JPY'), '¥123');
  assert.match(formatMoney('1234', 'KWD'), /1\.234/);
});
test('template editor renders labelled fields, primary choice and boundary constraints', () => {
  const html = render(TemplateForm, { products: [], plans: [], onSave: never });
  for (const name of ['name', 'plan_id', 'valid_days', 'payment_terms_days']) assert.match(html, new RegExp(`<label[^>]*>[\\s\\S]*?name="${name}"`));
  assert.match(html, /min="1" max="3650"/);
  assert.match(html, /min="0" max="365"/);
  assert.match(html, /min="1" max="1000000" step="1"/);
  assert.match(html, /type="radio"[^>]*checked=""/);
  assert.match(html, /role="status" aria-live="polite"/);
});
test('draft creation exposes one source chooser and no customer-controlled prices/state', () => {
  const html = render(DraftSubscriptionForm, { customers: [], plans: [], products: [], templates: [], onCreate: never });
  assert.match(html, /Quotation template/);
  assert.match(html, /Explicit product lines/);
  for (const name of ['customer_id', 'plan_id', 'start_at', 'expires_at', 'payment_terms_days']) assert.match(html, new RegExp(`name="${name}"`));
  for (const name of ['unit_price_minor', 'role', 'status', 'next_billing_at']) assert.doesNotMatch(html, new RegExp(`name="${name}"`));
});
test('accepted subscription cannot render draft editing controls', () => {
  const html = render(DraftEditor, { subscription: row, products: [], onSave: never });
  assert.doesNotMatch(html, /<form/);
  assert.match(html, /Only draft subscriptions can be edited/);
});
test('portal list routes stay under portal and empty state is explicit', () => {
  const html = render(SubscriptionList, { items: [row], portal: true });
  assert.match(html, /href="\/portal\/subscriptions\//);
  assert.doesNotMatch(html, /href="\/subscriptions\//);
  assert.match(render(SubscriptionList, { items: [] }), /No subscriptions found/);
});
test('details render escaped frozen lines, exact prices and only supplied action hints', () => {
  const html = render(SubscriptionDetail, { subscription: row, actions: ['pause'], onAction: never });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /PRIVATE_COST|PRIVATE_NOTES/);
  assert.match(html, /\$1\.23/);
  assert.match(html, /Pause subscription/);
  assert.doesNotMatch(html, /Resume subscription|Close subscription|Create renewal draft/);
  assert.match(html, /role="status" aria-live="polite"/);
});
test('renewal form describes a new draft and read-only state has no mutation buttons', () => {
  assert.match(render(SubscriptionDetail, { subscription: { ...row, status: 'closed' }, actions: ['renew'], onAction: never }), /Renew as a new draft/);
  const html = render(SubscriptionDetail, { subscription: row, actions: [], onAction: never });
  assert.match(html, /No actions are available/);
  assert.doesNotMatch(html, /<button/);
});

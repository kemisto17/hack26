// Binding tests prove orchestration and safe DTOs, not database atomicity/RLS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const loadCompiled = createRequire(import.meta.url);
const { bindSubscriptionServices } = loadCompiled(path.join(process.env.D3_TEST_OUTPUT, 'service.js'));
const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const now = '2026-10-31T00:00:00.000Z';
const staff = { id: other, role: 'internal' };
const owner = { id, role: 'customer' };
const line = { id, product_id: id, quantity: 1, is_primary: true, description: 'Frozen name', unit_price_minor: '1234567890123', variant_label: null, cost_price_minor: 'secret', notes: 'secret' };
const row = { id: other, number: 'SUB-test', customer_id: id, plan_id: id, currency: 'USD', status: 'active', start_at: now, expires_at: '2027-01-01T00:00:00.000Z', next_billing_at: now, version: '2', created_at: now, updated_at: now, template_id: null, discount_id: null, renewed_from_id: null, quote_expires_at: null, payment_terms_days: 0, billing_anchor_at: now, closed_at: null, lines: [line], request_key: id, request_fingerprint: 'secret', created_by: other };
const input = { customer_id: id, plan_id: id, start_at: now, expires_at: row.expires_at, lines: [{ product_id: id, quantity: 1, is_primary: true }], request_key: id };
function fixture(actor = staff, overrides = {}) {
  const calls = [];
  const bindings = {
    requireActor: async () => actor,
    readSubscription: async () => row,
    readSubscriptions: async (_actor, query) => { calls.push(['list', query]); return { items: [row, { ...row, customer_id: other }, { ...row, status: 'draft' }], next_cursor: null }; },
    readTemplate: async () => null,
    readTemplates: async () => ({ items: [], next_cursor: null }),
    readPlanPolicy: async () => ({ allow_pause: true, allow_close: true, allow_renew: true }),
    priceQuote: async (_actor, query) => { calls.push(['pricing', query]); return { currency: 'USD', lines: [line], subtotal_minor: line.unit_price_minor }; },
    createSubscriptionTransaction: async args => { calls.push(['create', args]); return row; },
    mutateSubscriptionTransaction: async args => { calls.push(['mutate', args]); return row; },
    createTemplateTransaction: async () => { throw new Error('Unexpected template write'); },
    updateTemplateTransaction: async () => { throw new Error('Unexpected template write'); },
    ...overrides,
  };
  return { service: bindSubscriptionServices(bindings), calls };
}
const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);
test('verified current role overrides a supplied admin role; staff templates stay read-only', async () => {
  const { service, calls } = fixture(owner);
  await rejects(() => service.createSubscription({ ...owner, role: 'admin' }, input), 'FORBIDDEN');
  await rejects(() => service.listTemplates(owner), 'FORBIDDEN');
  await rejects(() => service.createTemplate(owner, {}), 'FORBIDDEN');
  await rejects(() => fixture().service.createTemplate(staff, {}), 'FORBIDDEN');
  assert.equal(calls.length, 0);
});
test('session mismatch/inactive-session rejection dispatch no writes', async () => {
  const { service, calls } = fixture(owner);
  await rejects(() => service.createSubscription(staff, input), 'FORBIDDEN');
  const disabled = fixture(staff, { requireActor: async () => { throw Object.assign(new Error('Disabled'), { code: 'FORBIDDEN' }); } });
  await rejects(() => disabled.service.createSubscription(staff, input), 'FORBIDDEN');
  assert.equal(calls.length + disabled.calls.length, 0);
});
test('customer reads expose only safe allowlisted fields and preserve accepted prices', async () => {
  const { service } = fixture(owner);
  const result = await service.getSubscription(owner, other);
  for (const key of ['request_key', 'request_fingerprint', 'created_by']) assert.equal(key in result, false);
  assert.equal('cost_price_minor' in result.lines[0], false);
  assert.equal('notes' in result.lines[0], false);
  assert.equal(result.lines[0].unit_price_minor, line.unit_price_minor);
  assert.equal(result.lines[0].description, 'Frozen name');
  await rejects(() => service.previewDraft(owner, other, now), 'FORBIDDEN');
});
test('another customer and own draft are hidden before reads or action writes', async () => {
  for (const record of [{ ...row, customer_id: other }, { ...row, status: 'draft' }]) {
    const { service, calls } = fixture(owner, { readSubscription: async () => record });
    await rejects(() => service.getSubscription(owner, other), 'NOT_FOUND');
    await rejects(() => service.pauseSubscription(owner, other, { expected_version: '2' }), 'NOT_FOUND');
    assert.equal(calls.length, 0);
  }
});
test('customer filters are forced to current owner and invisible rows stay hidden', async () => {
  const { service, calls } = fixture(owner);
  const page = await service.listSubscriptions(owner, { customer_id: other });
  assert.equal(calls[0][1].customer_id, id);
  assert.equal(page.items.length, 1);
  assert.equal('request_key' in page.items[0], false);
  assert.deepEqual(await service.listSubscriptions(owner, { status: 'draft' }), { items: [], next_cursor: null });
});
test('invalid inputs fail before transactional bindings', async () => {
  const { service, calls } = fixture();
  await rejects(() => service.createSubscription(staff, { ...input, unit_price_minor: '1' }), 'VALIDATION_ERROR');
  await rejects(() => service.updateDraft(staff, other, { expected_version: '2', status: 'active' }), 'VALIDATION_ERROR');
  await rejects(() => service.activateSubscription(staff, other, { expected_version: '0' }), 'VALIDATION_ERROR');
  for (const query of [{ limit: 101 }, { limit: 0 }, { status: 'bad' }, { cursor: '' }]) await rejects(() => service.listSubscriptions(staff, query), 'VALIDATION_ERROR');
  assert.equal(calls.length, 0);
});
test('create retry forwards stable original input without resolving mutable template or pricing defaults', async () => {
  const { service, calls } = fixture(staff, { readTemplate: async () => { throw new Error('Must not resolve defaults before idempotency lookup'); } });
  const request = { ...input, template_id: other }; delete request.lines;
  await service.createSubscription(staff, request);
  await service.createSubscription(staff, request);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0][1].p_input.payment_terms_days, undefined);
  assert.equal(calls[0][1].p_request_key, id);
  assert.equal(calls[0][1].p_actor_id, other);
});
test('renewal sends request key inside mutate payload without stale preflight or repricing', async () => {
  const { service, calls } = fixture(owner);
  const request = { start_at: now, expires_at: row.expires_at, expected_version: '1', request_key: id };
  await service.renewSubscription(owner, other, request);
  assert.deepEqual(calls, [['mutate', { p_actor_id: id, p_subscription_id: other, p_expected_version: '1', p_action: 'renew', p_input: { start_at: now, expires_at: row.expires_at, request_key: id } }]]);
  assert.equal(row.status, 'active');
});
test('all named actions dispatch once to the shared transaction and never reprice accepted subscriptions', async () => {
  const { service, calls } = fixture();
  const methods = { quoteSubscription: 'quotation', reviseQuotation: 'revise', confirmSubscription: 'confirm', activateSubscription: 'activate', pauseSubscription: 'pause', resumeSubscription: 'resume', closeSubscription: 'close' };
  for (const [method, action] of Object.entries(methods)) {
    await service[method](staff, other, { expected_version: '2' });
    assert.equal(calls.at(-1)[1].p_action, action);
    assert.deepEqual(calls.at(-1)[1].p_input, {});
  }
  assert.equal(calls.length, Object.keys(methods).length);
});
test('transaction conflict propagates without any retry or non-atomic fallback', async () => {
  let count = 0;
  const { service } = fixture(staff, { mutateSubscriptionTransaction: async () => { count++; throw Object.assign(new Error('Conflict'), { code: 'VERSION_CONFLICT' }); } });
  await rejects(() => service.pauseSubscription(staff, other, { expected_version: '1' }), 'VERSION_CONFLICT');
  assert.equal(count, 1);
});
test('only draft preview consumes D2 pricing; snapshot never changes', async () => {
  const draft = { ...row, status: 'draft' };
  const { service, calls } = fixture(staff, { readSubscription: async () => draft });
  const before = structuredClone(draft);
  await service.previewDraft(staff, other, now);
  assert.equal(calls[0][0], 'pricing');
  assert.equal('unit_price_minor' in calls[0][1].lines[0], false);
  assert.deepEqual(draft, before);
  await rejects(() => fixture().service.previewDraft(staff, other, now), 'INVALID_TRANSITION');
});

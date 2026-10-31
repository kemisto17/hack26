import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const loadCompiled = createRequire(import.meta.url);
const load = name => loadCompiled(path.join(process.env.D3_TEST_OUTPUT, name));
const { assertTransition, assertVisible, permittedOwnerActions } = load('lifecycle');
const v = load('validation');
const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const staff = { id: other, role: 'internal' };
const owner = { id, role: 'customer' };
const plan = { allow_close: true, allow_pause: true, allow_renew: true };
const now = '2026-10-31T00:00:00.000Z';
const subscription = (status = 'draft') => ({ id: other, number: 'SUB-test', customer_id: id, plan_id: id, currency: 'USD', status, start_at: now, expires_at: '2027-10-31T00:00:00.000Z', next_billing_at: null, version: '2', created_at: now, updated_at: now, template_id: null, discount_id: null, renewed_from_id: null, quote_expires_at: '2026-11-01T00:00:00.000Z', payment_terms_days: 0, billing_anchor_at: null, closed_at: null, lines: [{ id, product_id: id, quantity: 1, is_primary: true, description: 'Accepted item', variant_label: null, unit_price_minor: '9000000000000' }] });
const fails = (fn, code) => assert.throws(fn, error => error.code === code);
const actions = ['draft_update', 'quotation', 'revise', 'confirm', 'activate', 'pause', 'resume', 'close', 'renew'];
const edges = { draft: ['draft_update', 'quotation', 'close'], quotation: ['revise', 'confirm', 'close', 'renew'], confirmed: ['activate', 'close', 'renew'], active: ['pause', 'close', 'renew'], paused: ['resume', 'close', 'renew'], closed: ['renew'] };
for (const [state, allowed] of Object.entries(edges)) {
  for (const action of actions) test(`${state} -> ${action}: ${allowed.includes(action) ? 'allowed' : 'denied'}`, () => {
    const call = () => assertTransition(staff, subscription(state), plan, action, '2', now);
    if (allowed.includes(action)) assert.doesNotThrow(call); else fails(call, 'INVALID_TRANSITION');
  });
}
test('quote expiry is exclusive; activation and resume reject exact expiry', () => {
  const quote = subscription('quotation'); quote.quote_expires_at = now;
  fails(() => assertTransition(staff, quote, plan, 'confirm', '2', now), 'INVALID_TRANSITION');
  for (const [state, action] of [['confirmed', 'activate'], ['paused', 'resume']]) {
    const item = subscription(state); item.expires_at = now;
    fails(() => assertTransition(owner, item, plan, action, '2', now), action === 'activate' ? 'FORBIDDEN' : 'INVALID_TRANSITION');
    fails(() => assertTransition(staff, item, plan, action, '2', now), 'INVALID_TRANSITION');
  }
});
test('activation before start fails, exact start succeeds', () => {
  const item = subscription('confirmed'); item.start_at = '2026-11-01T00:00:00.000Z';
  fails(() => assertTransition(staff, item, plan, 'activate', '2', now), 'INVALID_TRANSITION');
  assert.doesNotThrow(() => assertTransition(staff, item, plan, 'activate', '2', item.start_at));
});
test('every action rejects stale versions', () => {
  for (const action of actions) fails(() => assertTransition(staff, subscription('active'), plan, action, '1', now), 'VERSION_CONFLICT');
});
test('another customer cannot read or act on any state', () => {
  for (const state of Object.keys(edges)) {
    const item = subscription(state); const stranger = { id: other, role: 'customer' };
    fails(() => assertVisible(stranger, item), 'NOT_FOUND');
    for (const action of actions) fails(() => assertTransition(stranger, item, plan, action, '2', now), 'NOT_FOUND');
  }
  fails(() => assertVisible(owner, subscription()), 'NOT_FOUND');
});
test('customers cannot quote, revise, confirm, activate or edit', () => {
  for (const action of ['quotation', 'revise', 'confirm', 'activate', 'draft_update']) fails(() => assertTransition(owner, subscription('quotation'), plan, action, '2', now), 'FORBIDDEN');
});
test('plan gates pause/resume/renew for staff and owner; early close is owner gated', () => {
  for (const actor of [owner, staff]) for (const [state, action] of [['active', 'pause'], ['paused', 'resume'], ['closed', 'renew']]) fails(() => assertTransition(actor, subscription(state), { allow_pause: false, allow_renew: false, allow_close: false }, action, '2', now), 'INVALID_TRANSITION');
  fails(() => assertTransition(owner, subscription('active'), { ...plan, allow_close: false }, 'close', '2', now), 'INVALID_TRANSITION');
  assert.doesNotThrow(() => assertTransition(staff, subscription('active'), { ...plan, allow_close: false }, 'close', '2', now));
  assert.deepEqual(permittedOwnerActions(owner, subscription('active'), plan, now), ['pause', 'close', 'renew']);
});
test('lifecycle preflight never edits frozen prices or the old renewal record', () => {
  const item = subscription('closed'); const before = structuredClone(item);
  assertTransition(owner, item, plan, 'renew', '2', now);
  assert.deepEqual(item, before);
});
const line = { product_id: id, variant_id: other, quantity: 1, is_primary: true };
const create = () => ({ customer_id: id, plan_id: id, start_at: now, expires_at: '2027-01-01T00:00:00Z', lines: [line] });
test('draft creation accepts exactly one source and normalizes timestamps', () => {
  assert.equal(v.parseCreateSubscription(create()).expires_at, '2027-01-01T00:00:00.000Z');
  const template = create(); delete template.lines; template.template_id = other;
  assert.equal(v.parseCreateSubscription(template).template_id, other);
  fails(() => v.parseCreateSubscription({ ...create(), template_id: other }), 'VALIDATION_ERROR');
  const missing = create(); delete missing.lines;
  fails(() => v.parseCreateSubscription(missing), 'VALIDATION_ERROR');
});
test('copied selections are independent from subsequent template edits', () => {
  const source = [structuredClone(line)]; const copied = v.lines(source);
  source[0].quantity = 99;
  assert.equal(copied[0].quantity, 1);
});
test('reject injected price, state, owner, unknown keys and out-of-range quantities', () => {
  for (const key of ['unit_price_minor', 'role', 'status', 'owner', 'expected_version']) fails(() => v.parseCreateSubscription({ ...create(), [key]: 'injected' }), 'VALIDATION_ERROR');
  for (const quantity of [0, -1, 1.5, 1_000_001, Infinity]) fails(() => v.lines([{ ...line, quantity }]), 'VALIDATION_ERROR');
  assert.equal(v.lines([{ ...line, quantity: 1_000_000 }])[0].quantity, 1_000_000);
  fails(() => v.lines([{ ...line, unit_price_minor: '1' }]), 'VALIDATION_ERROR');
});
test('require exactly one primary and valid UUID/UTC dates', () => {
  for (const input of [[], [{ ...line, is_primary: false }], [line, line]]) fails(() => v.lines(input), 'VALIDATION_ERROR');
  for (const input of ['2026-02-30T00:00:00Z', '2026-10-31', '2026-10-31T00:00:00+05:30']) fails(() => v.instant(input), 'VALIDATION_ERROR');
  fails(() => v.uuid('bad'), 'VALIDATION_ERROR');
  fails(() => v.parseCreateSubscription({ ...create(), expires_at: now }), 'VALIDATION_ERROR');
});
test('draft and template updates are strict and nonempty', () => {
  fails(() => v.parseUpdateDraft({}), 'VALIDATION_ERROR');
  fails(() => v.parseUpdateDraft({ status: 'active' }), 'VALIDATION_ERROR');
  fails(() => v.parseUpdateTemplate({}), 'VALIDATION_ERROR');
  assert.deepEqual(v.parseUpdateDraft({ discount_id: null }), { discount_id: null });
  assert.deepEqual(v.parseUpdateTemplate({ is_active: false }), { is_active: false });
  assert.equal(v.parseCreateTemplate({ name: ' Sample ', plan_id: id, lines: [line], valid_days: 3650, payment_terms_days: 365 }).name, 'Sample');
  for (const valid_days of [0, 3651]) fails(() => v.parseCreateTemplate({ name: 'Sample', plan_id: id, lines: [line], valid_days }), 'VALIDATION_ERROR');
  fails(() => v.parseRenew({ start_at: now, expires_at: now }), 'VALIDATION_ERROR');
  fails(() => v.version('0'), 'VALIDATION_ERROR');
  fails(() => v.version('9223372036854775808'), 'VALIDATION_ERROR');
});

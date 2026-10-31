import assert from 'node:assert/strict';

// Read-only smoke test; no credentials, cookies, mutations or business fixtures.
const base = new URL(process.argv[2] ?? 'http://localhost:3104');
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'Use a local preview only');
const id = '11111111-1111-4111-8111-111111111111';
const paths = [
  '', '/dashboard', '/customers', '/customers/new', `/customers/${id}`,
  '/catalog', `/catalog/${id}`, '/quotations', '/quotations/new', `/quotations/${id}`,
  '/subscriptions', `/subscriptions/${id}`, '/invoices', `/invoices/${id}`,
  '/payments', '/payments/new', '/reports', '/support', `/support/${id}`,
  '/notifications', '/profile', '/settings',
];
for (const suffix of paths) {
  const path = `/staff${suffix}`;
  const response = await fetch(new URL(path, base), { redirect: 'follow', signal: AbortSignal.timeout(20000) });
  const html = await response.text();
  assert.ok(response.status < 400, `${path}: HTTP ${response.status}`);
  assert.ok(response.url.includes('/login') || /NEXT_REDIRECT.*login|url=\/login/.test(html), `${path}: expected sign-in redirect`);
  assert.ok(!html.includes('Business workspace'), `${path}: unauthenticated staff shell leaked`);
  assert.ok(!html.includes('Customer-visible receipt note'), `${path}: protected payment form leaked`);
  console.log(`PASS ${path}: sign-in required`);
}
console.log(`${paths.length} protected staff routes passed.`);

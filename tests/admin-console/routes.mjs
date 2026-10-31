import assert from 'node:assert/strict';

const base = new URL(process.argv[2] ?? 'http://localhost:3104');
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'Use a local server only');
const id = '11111111-1111-4111-8111-111111111111';
const paths = [
  '', '/dashboard', '/reports', '/customers', '/customers/new', `/customers/${id}`,
  '/staff', '/staff/invite', `/staff/${id}`, '/roles', '/catalog', '/catalog/new',
  `/catalog/${id}`, '/pricing', `/pricing/${id}`, '/quotations', `/quotations/${id}`,
  '/subscriptions', `/subscriptions/${id}`, '/invoices', `/invoices/${id}`, '/payments',
  '/support', `/support/${id}`, '/audit-logs', '/notifications', '/system',
  '/settings', '/settings/business', '/settings/billing', '/settings/tax', '/settings/security', '/profile',
];
for (const suffix of paths) {
  const path = `/admin${suffix}`;
  const response = await fetch(new URL(path, base), { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  const html = await response.text();
  assert.ok(response.status < 400, `${path}: HTTP ${response.status}`);
  assert.ok(response.url.includes('/login') || /NEXT_REDIRECT.*login|url=\/login/.test(html), `${path}: sign-in required`);
  assert.ok(!html.includes('Business control centre'), `${path}: administrator shell leaked`);
  assert.ok(!html.includes('name="display_name"'), `${path}: protected form leaked`);
  console.log(`PASS ${path}: administrator sign-in required`);
}
console.log(`${paths.length} protected administrator routes passed.`);

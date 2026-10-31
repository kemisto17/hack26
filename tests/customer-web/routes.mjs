// Read-only smoke test against a running local server, without account cookies.
import assert from 'node:assert/strict';
const base=new URL(process.env.FRONTEND_TEST_BASE_URL??'http://localhost:3000');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname),'Use a local server only');
const publicRoutes=['/','/features','/how-it-works','/pricing','/about','/contact','/privacy','/terms','/login','/signup','/forgot-password','/reset-password','/update-password','/accept-invitation'];
const id='11111111-1111-4111-8111-111111111111';
const protectedRoutes=['/portal/dashboard','/portal/subscriptions',`/portal/subscriptions/${id}`,'/portal/quotations',`/portal/quotations/${id}`,'/portal/invoices',`/portal/invoices/${id}`,'/portal/payments','/portal/support','/portal/profile','/portal/settings'];
async function check(route,protectedRoute){const response=await fetch(new URL(route,base),{redirect:'manual',signal:AbortSignal.timeout(45000)});const body=await response.text();if(protectedRoute){const redirect=response.headers.get('location')??body;assert.match(redirect,/\/login\?reason=account/,`${route} must require verified sign-in`);assert.ok(response.status===200||response.status===307||response.status===303,`${route}: ${response.status}`);}else{assert.equal(response.status,200,`${route}: expected 200`);assert.match(body,/<h1[\s>]/,`${route} should render a page heading`);}assert.doesNotMatch(body,/PRIVATE-OTHER|PRIVATE-DRAFT|VISIBLE-RECORD/,`${route}: isolated test records must never ship`);console.log(`PASS ${route}: ${protectedRoute?'sign-in required':'page rendered'}`);}
for(const routes of [publicRoutes,protectedRoutes])for(let i=0;i<routes.length;i+=3)await Promise.all(routes.slice(i,i+3).map(route=>check(route,routes===protectedRoutes)));
const missing=await fetch(new URL('/this-page-does-not-exist',base),{redirect:'manual',signal:AbortSignal.timeout(45000)});assert.equal(missing.status,404);
console.log(`Passed ${publicRoutes.length} public pages, ${protectedRoutes.length} protected pages and the 404 route.`);

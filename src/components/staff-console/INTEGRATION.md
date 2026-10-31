# Staff operations console

## Scope and ownership

The user explicitly authorized the attached staff frontend brief and a final GitHub
push, continuing the prior direct-to-main publication instruction. This slice adds
only `src/app/staff/**`, `src/components/staff-console/**` and
`tests/staff-console/**`. No D1–D4 backend, migration, RPC, authorization, package,
customer portal, shared component or existing route is edited.

The pre-existing package.json/package-lock.json Supabase SSR version-range changes
are excluded from this commit. The unavailable codebase-memory tool was replaced
with direct source inspection of AGENTS.md, all four architecture documents,
Next's installed layout guide, service exports, DTOs and validation code.

## Pages

- `/staff` redirects to `/staff/dashboard`.
- `/staff/dashboard`: operational overview, unavailable KPI cards, action queues,
  due/overdue invoice sections, recent customer/payment activity, notifications.
- `/staff/customers`: real D1 directory, search/status filter/column sorting/local
  pagination on the loaded 50-record batch; next server cursor follows older rows.
- `/staff/customers/new`: explains verified signup; staff creation unavailable.
- `/staff/customers/[id]`: real D1 contact, six keyboard-accessible related-record
  tabs, explicit missing status/phone/assignment/history.
- `/staff/catalog`, `/staff/catalog/[id]`: read-only product/variant/plan boundary.
- `/staff/quotations`, `/staff/quotations/new`, `/staff/quotations/[id]`: current
  lifecycle labels, local unsaved preparation using real active directory entries,
  validated quantities/dates/payment terms, summary, unavailable pricing/save/send.
- `/staff/subscriptions`, `/staff/subscriptions/[id]`: typed read boundary and
  accepted-line detail presentation. Lifecycle mutations remain unavailable.
- `/staff/invoices`, `/staff/invoices/[id]`: typed invoice table, snapshot preview,
  exact money, tax/discount/balance fields, print available only for a loaded record.
- `/staff/payments`, `/staff/payments/new`: typed receipt table and disabled recording
  form. No input is submitted while invoice selection/transactions are missing.
- `/staff/reports`: date-range review, unavailable summaries/charts/currency table.
- `/staff/support`, `/staff/support/[id]`: request/conversation/notes boundaries;
  no delivery or persistence claims.
- `/staff/notifications`: unavailable event feed; no invented read/unread state.
- `/staff/profile`: existing D1 version-aware ProfileForm.
- `/staff/settings`: existing reset-password route and SignOut; disabled notification
  preferences because persistence does not exist.

All pages have the dedicated responsive staff shell, loading/error boundaries and
server authorization. No admin configuration or role-editing controls are included.

## Actual service connections

`session.ts` delegates verified Auth and current active profile checks to D1's
`requireActor` and `getMe`. Customers redirect to their portal. Unauthenticated or
disabled accounts redirect to sign-in; infrastructure failures propagate to the
error boundary. Every page/data entry checks access, independently of the layout.
There is no shared cache of identities or customer data.

`customerDirectory` invokes D1 `listCustomers` with the verified actor and opaque
cursor. The backend/RLS currently authorizes internal/admin users to read all
customers; there is no invented assignment filter. Customer detail calls public
`getBillingContact`, which re-verifies the staff role and target customer. It returns
only the supported name/email fields. Invalid IDs and missing contacts use 404.

Profile updates reuse D1's existing UI and PATCH `/api/v1/me` with `If-Match`.
Sign-out reuses D1's existing local-session action. No new HTTP or RPC route is
invented. No frontend component creates a Supabase secret client.

## Missing integration dependencies

| Owner | Needed before the corresponding workflow is live |
| --- | --- |
| D1 | Staff customer creation/edit contract; full contact/profile read; email/phone exposure decision; assignment model if desired. Auth already works through existing exports. |
| D2 | Catalog service/DTOs, product/variant/plan reads, authoritative quotation preview. D2 is absent on current main; no replacement prices or catalog model were created. |
| D3 | Request-scoped composition of `createSubscriptionService` with verified reads and atomic create/mutate bindings; public transport for the editor and lifecycle actions; full quote detail/pricing preview. Existing service factories are not callable without these bindings. |
| D4 | Request-scoped billing factory bindings, invoice/payment reads, summary reads and atomic invoice/payment routes. No direct REST writes, fabricated RPCs or local balance mutations were added. |
| Shared future work | Support tickets, messages, internal notes, notification feed/preferences, staff attribution, quote-delivery/acceptance audit and reporting timeseries. These contracts do not exist. |

`data.ts` declares typed `StaffData<T>` and `OperationsData` using existing D3/D4
public contracts. Missing reads return `{ state: 'unavailable', reason }`, never
an empty array or zero balance. Ready renderers are future integration boundaries;
they are not proof that missing reads work. The detail boundary still needs real
ID/query arguments when the owner provides its composition, plus pagination for
operational lists. Do not connect a factory to placeholder bindings.

When enabling mutations, wire real confirmed responses, validate Origin/session,
preserve expected versions and idempotency keys across uncertain retries, show
confirmation dialogs and response feedback, and refresh from authoritative reads.
Accepted quotes cannot be silently edited; renewal must create a new record.
Payment customer/currency/balance must come from the selected verified invoice.
Do not enable disabled controls before these conditions have been verified.

## Intentional limits

- Customer directory has no email, phone, subscription count or balance; no values
  are invented. Detail email uses the existing staff-only billing-contact service.
- Quotation totals/expiry are absent from the summary DTO. Accepted/rejected audit
  states do not exist. The UI uses draft/quotation/confirmed and documented lifecycle
  language instead of introducing incompatible statuses.
- Quotation preparation is page-local and unsaved. No sensitive records or drafts
  are persisted in browser storage. Pricing is never computed in the browser.
- Invoice display conditions reuse existing customer presentation helpers, with a
  separate Draft label. Money comes directly from DTO decimal strings.
- Reports do not add currencies together or draw sample charts.
- Issuer legal/business details are not in the invoice contract. The preview says
  they are unconfigured, rather than inventing business identity information.
- Customer portal and Auth implementation are unchanged. A follow-up landing fix
  redirects verified internal staff from `/` to `/staff/dashboard`; administrators
  retain their existing root account/access management page. This shared frontend
  change is authorized by the user report that staff login did not open the console.
  Verified with the real development staff login, root redirect and dashboard response.

## Verification

Results and exact file inventory are appended before publication. Unit tests verify
frontend authorization delegation, not real Supabase Auth/RLS. The route smoke is
read-only and unauthenticated, not an authenticated end-to-end business test.

### Executed checks

- `npm run typecheck`: passed.
- `npm run lint`: passed (a test createElement children-prop lint issue was fixed).
- `npm run build`: passed; 55 generated pages, including all staff routes.
- `npm test`: 140 Vitest tests across 16 files plus 91 D3 tests = 231 passed.
- `node tests/staff-console/routes.mjs http://localhost:3104`: 22 protected routes
  passed against the production build without cookies.
- Existing customer-web route smoke with `FRONTEND_TEST_BASE_URL` set to port 3104:
  14 public pages, 11 protected pages and 404 = 26 passed. An initial invocation
  mistakenly targeted the unrelated dev server's default port; it was corrected.
- Browser verified the real `/staff/dashboard` sign-in redirect. Static test-only
  dashboard fixture inspected at the narrow default viewport and 1440x1000; the
  desktop document width was 1425px with a 1440px viewport (no horizontal overflow).
  This fixture verifies layout, not hydrated interactions or live authenticated data.
- `npm ci --no-audit --no-fund` was attempted but failed with Windows EPERM on a
  Lightning CSS native binary held by the pre-existing developer server. It is NOT
  reported as passing. `npm install --ignore-scripts --no-save --package-lock=false
  --no-audit --no-fund` restored dependencies without changing manifest/lock diffs.
- No database changes or live mutation tests were performed. Real staff sessions,
  customer contact/profile flows and full financial workflows need authenticated
  integration QA. Missing services must be connected by their owning workstreams.

### Components

The shell/navigation, reusable headings/cards/status notices, typed data boundary,
loaded-result data table, customer workspace/tabs, quotation preparation editor,
subscription/invoice details, payment form, operational reports, catalog, support,
notifications, profile and settings are isolated in the directory below. The public
customer icon, formatting and print components are reused without edits. D1 Auth,
ProfileForm and SignOut are reused unchanged.

### Exact added files

- `src/app/staff/catalog/[id]/page.tsx`
- `src/app/staff/catalog/page.tsx`
- `src/app/staff/customers/[id]/page.tsx`
- `src/app/staff/customers/new/page.tsx`
- `src/app/staff/customers/page.tsx`
- `src/app/staff/dashboard/page.tsx`
- `src/app/staff/error.tsx`
- `src/app/staff/invoices/[id]/page.tsx`
- `src/app/staff/invoices/page.tsx`
- `src/app/staff/layout.tsx`
- `src/app/staff/loading.tsx`
- `src/app/staff/not-found.tsx`
- `src/app/staff/notifications/page.tsx`
- `src/app/staff/page.tsx`
- `src/app/staff/payments/new/page.tsx`
- `src/app/staff/payments/page.tsx`
- `src/app/staff/profile/page.tsx`
- `src/app/staff/quotations/[id]/page.tsx`
- `src/app/staff/quotations/new/page.tsx`
- `src/app/staff/quotations/page.tsx`
- `src/app/staff/reports/page.tsx`
- `src/app/staff/settings/page.tsx`
- `src/app/staff/staff.css`
- `src/app/staff/subscriptions/[id]/page.tsx`
- `src/app/staff/subscriptions/page.tsx`
- `src/app/staff/support/[id]/page.tsx`
- `src/app/staff/support/page.tsx`
- `src/components/staff-console/INTEGRATION.md`
- `src/components/staff-console/account.tsx`
- `src/components/staff-console/catalog.tsx`
- `src/components/staff-console/customer-tabs.tsx`
- `src/components/staff-console/customers.tsx`
- `src/components/staff-console/dashboard.tsx`
- `src/components/staff-console/data.ts`
- `src/components/staff-console/details.tsx`
- `src/components/staff-console/navigation.ts`
- `src/components/staff-console/operations.tsx`
- `src/components/staff-console/payment-form.tsx`
- `src/components/staff-console/quotation-editor.tsx`
- `src/components/staff-console/record-rows.ts`
- `src/components/staff-console/reports.tsx`
- `src/components/staff-console/session.ts`
- `src/components/staff-console/shell.tsx`
- `src/components/staff-console/support.tsx`
- `src/components/staff-console/table.tsx`
- `src/components/staff-console/ui.tsx`
- `tests/staff-console/presentation.test.ts`
- `tests/staff-console/record-rows.test.ts`
- `tests/staff-console/routes.mjs`
- `tests/staff-console/session.test.ts`
- `tests/staff-console/shell.test.ts`

## Live catalog follow-up (2026-10-31)

The user authorized connecting the seeded database to the existing website. Staff catalog list/detail now consume D2's public service exports with current-role authorization. Customer navigation links to D2's existing `/portal/catalog`; admin already consumes the live catalog. No domain modules, migrations or API contracts changed.

Authenticated HTTP verification returned 200 and a real stored product name on `/admin/catalog`, `/staff/catalog`, and `/portal/catalog`. Database inspection found 8 users, 15 products and 13 plans, with zero subscriptions, invoices and payments. This does not claim operational adapters or mutations are connected. List/detail UI explicitly identifies the 100-record batch limit.

Local configuration uses the existing server key under the app's required `SUPABASE_SECRET_KEY` name and restores `APP_ORIGIN=http://localhost:3000`. Credentials remain only in ignored `.env.local` and are not committed.

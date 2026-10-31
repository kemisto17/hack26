# Customer website integration and delivery notes

This task is authorized by the supplied customer-facing website brief, including
public/auth/portal frontend presentation and the final commit/push to main. The
existing D1-D4 backend files and migrations remain unchanged. No dependency,
package or lockfile changes belong to this task. Pre-existing package.json and
package-lock.json changes are deliberately excluded from the commit.

## Pages and shared presentation

Public: /, /features, /how-it-works, /pricing, /about, /contact, /privacy, /terms.
The legal pages explicitly state that organization-specific legal policies have
not been configured; they are informational, not invented agreements.

Auth: the existing /login, /signup, /reset-password and /update-password retain
D1's AuthForm and behavior. New /forgot-password reuses its reset-email mode;
/accept-invitation reuses its verified update-password mode. The auth layout adds
presentation and a password visibility toggle without changing D1 Auth code.
Keep D1's callback allowlist and invitation/reset destinations intact:
/reset-password requests email; /update-password actually changes the password.

Portal: /portal redirects to /portal/dashboard. Includes dashboard, subscription
list/details, quotation list/details, invoice list/details, payments, support,
profile and settings. Loading, error and 404 boundaries are provided. PortalShell
includes responsive sidebar, mobile toggle, desktop collapse, active navigation,
account menu and a clearly unavailable notification feed. No fabricated alerts.

Shared frontend code is in src/components/customer-web; visual tokens and
responsive/print/reduced-motion styles are in src/app/customer-web.css, imported
by globals.css. Existing staff workspace content is retained at the root for
signed-in staff. Guests see the public homepage; verified customers go to their
portal. Public homepage fallback contains public content only.

## Existing live integrations

- D1 requireActor/getMe perform all real session/current-role verification.
  requireCustomer delegates to these services and redirects unauthorized users.
  Every future read access goes through this check as well as the owning service.
- D1 AuthForm handles login, signup, reset email, invitation/password sessions and
  validation. D1 SignOut handles logout. No alternate Auth APIs are introduced.
- D1 ProfileForm uses PATCH /api/v1/me and expected versions for display-name
  updates. Email and phone edits are unavailable because no such API exists.
- D3/D4 contracts supply the existing safe DTO types for read-ready views.

## Unavailable read models and actions

data.ts is an explicit frontend integration boundary, not a new backend service.
customerCollection/customerDetail verify the customer, then return unavailable.
Neither an unavailable response nor a read failure is converted into zero totals
or an empty customer account. No direct Supabase reads, secret clients, substitute
REST endpoints, mock records or backend mutations are used.

To connect the ready views, D1/D3/D4 must supply the reviewed request-scoped public
service composition. Replace only the unavailable result in this frontend boundary
with calls to those public exports. Keep existing authorization, ownership,
no-shared-cache and cursor rules. Supply lists using the exact DTOs:

- subscriptions: SubscriptionSummaryDTO[], details: SubscriptionDTO.
- quotations: visible SubscriptionDTO[] with quote_expires_at; quotations are
  subscription states, not a separate invented table or rejected-state workflow.
- invoices: own issued InvoiceSummaryDTO[], details: own issued InvoiceDTO.
- payments: own PaymentDTO[] (verified receipt records, no payment gateway).

Actual list services return Page<T>. An integration must preserve their cursor
and render Next/Previous-page controls; do not treat one page as the complete
customer history or compute account totals from that page. Current search/filters
operate on the explicitly supplied page and are labelled accordingly.

Customer DTO views defensively exclude other owners and drafts; cancelled invoices
are visible only when actually issued. No draft filter is offered to customers.
Closed subscriptions are labelled Closed, not a fictional cancelled state.
Invoice partial/overdue badges are presentation derived from balance/due date,
not new persisted states. Money formatting uses BigInt and currency exponents.

Catalog/pricing: D2's public-safe catalog composition is unavailable on main.
No plan names, cadence, prices, contact details or testimonials are invented.
The public pricing page clearly shows an unavailable state. Subscription list
rows use available references/dates/currency; plan-name/cadence enrichment needs
the owning catalog read model. Dashboard totals require a complete customer
summary service and currency-separated balances; they are currently unavailable.

Actions: subscription pause/resume/close/renew need D3's live service composition
and server-derived plan permissions. Customer quotation confirmation/rejection are
not in the current contract: the UI directs customers to staff, without buttons
that simulate success. There is no online payment gateway. Print buttons call the
browser only for a visible own record; printing never mutates an invoice/quote.
Related invoice/receipt/history feeds require their approved read models.

Contact/support: no delivery endpoint or real contact address has been supplied.
Forms validate inputs, prepare a local draft and offer an explicit clipboard copy.
They state before and after interaction that nothing has been sent. No ticket,
notification preference or delivery success is fabricated. No draft localStorage.

## Verification

- npm run typecheck, npm run lint, npm run build.
- npm test runs the existing suites and customer-web tests.
- node tests/customer-web/routes.mjs: read-only localhost smoke test for public
  route rendering and unauthenticated portal redirects; requires a running server.
- Customer-web tests exercise display ownership, hidden drafts, expiry/overdue
  boundaries, exact amounts, auth delegation and ready/empty/unavailable markup.
  They do not prove backend RLS/transaction behavior or real Auth email delivery.

Initial npm ci failed on a Windows file lock held by the existing Next dev server.
Dependencies were recovered with npm install --ignore-scripts --no-save
--package-lock=false without changing manifests. No existing server was killed.
After stopping this task's own production preview, npm ci --no-audit --no-fund
passed with the existing lockfile (416 packages). No existing developer server was
stopped by this task. Production smoke checks passed for 14 public pages, 11
unauthenticated portal redirects and the 404 route. Mobile homepage/features were
inspected in the browser; the preview connection failed during desktop resizing.
Real authenticated and desktop browser flows remain unverified, requiring configured
accounts, stable browser access and working backend read composition.

# D3 integration handoff

Status: contracts, strict input validators, lifecycle preflight, request-scoped
service bindings, reusable form/list/detail components and unit tests. Not a working database workflow. No Auth,
catalog implementation, migration, API handler or replacement persistence is
provided. D1/D2/D4 review is still required; do not merge as a completed vertical
slice. D3 owns only the paths assigned in docs/team-workstreams.md.

Checkout assessment: the two baseline migrations contain the tables and access
policies, but do not define `create_subscription`, `mutate_subscription`, or
template transaction RPCs. There is no D1 identity/shared client or D2 catalog
module in this checkout. No D3 API routes or pages are mounted. Consequently the
components cannot yet call real protected services; do not bind them to fake data.
The separate D1 and D2 branches reported by teammates must be integrated and
verified before connecting this checkout; their existence elsewhere does not make
these dependencies available here.

## D1 and D2 bindings

`service.ts` imports `server-only` and exports `bindSubscriptionServices` and
`SubscriptionBindings`. Each bound method uses the documented actor/id/input
signature. Bind per request, never in a global variable. `requireActor` is D1's
verified Auth user plus current active public.users role. Reads use D1's
cookie/JWT client with RLS and bounded keyset queries. Bind `priceQuote` directly
to D2's public service. `previewDraft` uses it only for a staff preview; committed
prices must be calculated and validated in the transaction using D2-reviewed SQL.
No consumer may pass browser prices into these transactions.

Replace the temporary, structurally compatible scalar/Actor/line aliases in
contracts.ts with type imports from D1/D2 when their public files land. Map
SubscriptionError to D1 AppError without exposing raw DB details. This is an
integration seam, not an alternate Auth/pricing/client implementation. Export
the bound methods from D1's request integration once those dependencies exist.

`readSubscriptions` must validate cursor contents against normalized filters and
order `(created_at DESC, id DESC)`, limit 25 by default and at most 100. Customer
scope is always the current actor; drafts are invisible. Use allowlisted DTO
projections, not raw row exports. Template reads are staff-only. Plan policy
reads return only allow_pause/allow_close/allow_renew.

## Transaction requirements for D1

Do not edit applied migrations. Add one reviewed migration and SQL integration
tests in D1-owned paths. All functions are SECURITY INVOKER, qualified names,
explicit grants to service_role only, no PUBLIC/anon/authenticated EXECUTE.
Each transaction rechecks active actor/role; service-key possession is insufficient.
Use transaction time for gates. Bigint DTO fields are strings. Map expected
domain failures to agreed AppError codes, otherwise return a generic error.

### create_subscription

Signature from docs/api-contracts.md:
`(p_actor_id uuid, p_request_key uuid, p_input jsonb) returns jsonb`.

Input is exactly CreateSubscriptionInput, validated by validation.ts: customer_id,
plan_id, start_at/expires_at, exactly one of template_id or explicit lines,
optional discount_id and payment_terms_days. No role/prices/state/unknown fields.
Lines contain product_id, optional variant_id, quantity 1..1000000, is_primary;
exactly one primary matching plan product, and variant belongs to product.

1. Verify active staff/admin actor. Serialize `(actor,request_key)` using a
   transaction advisory lock or equivalent, covering both creation and renewal.
2. Compare operation/resource/input fingerprint with the immutable original
   persisted fingerprint **before** resolving template, defaults, catalog or
   availability. Match replays the safe original resource; different input gives
   IDEMPOTENCY_CONFLICT. The shared fingerprint helper must match D1's normalized,
   recursively sorted-key SHA-256 contract; arrays keep order and omitted defaults
   remain omitted. Never recompute identity from editable rows.
3. Verify active customer role, eligible plan and active matching template if used.
   Copy template selections to independent subscription lines. Lock template/header
   and children against concurrent edits while copying. Resolve payment terms once
   (explicit override, template terms, otherwise schema default).
4. Use D2-reviewed pricing SQL: matching currency, primary plan price plus variant
   adjustment (no double charging), add-on sales price plus adjustment, availability,
   nonnegative adjusted unit prices and primary minimum. Insert header with
   status=draft, `SUB-<uuid>`, actor/key/fingerprint and copied lines atomically.
5. Never consume a discount use here. Return a safe SubscriptionDTO, no retry data.

### mutate_subscription

Signature: `(p_actor_id uuid,p_subscription_id uuid,p_expected_version bigint,
p_action text,p_input jsonb) returns jsonb`.

Actions and payloads: draft_update uses UpdateDraftInput; renew uses
`{start_at,expires_at,request_key}`; quotation/revise/confirm/activate/pause/resume/
close require an empty object. Reject unknown action/keys. Validate complete
resulting date range for partial updates, not just provided dates.

1. Recheck actor and authorize staff or owner (customers cannot access drafts).
   Lock subscription row FOR UPDATE, the same lock D4 billing takes. For renew,
   serialize retry key first, replay matching result before expected-version,
   current defaults and repricing. Include operation and original subscription ID
   in fingerprint. Check expected version under lock for every fresh mutation.
2. Allowed edges are enumerated in lifecycle.ts and tested in domain.test.mjs.
   Staff-only: edit draft, draft->quotation, quotation->draft, quotation->confirmed,
   confirmed->active. Customers: only own pause/resume/close/renew, per plan.
3. draft_update replaces lines atomically if present and revalidates D2 pricing;
   no accepted line edits. Bump parent once including child-only changes.
4. quotation reprices copied subscription selections (never reload template
   lines), copies descriptions/labels/prices and sets quote_expires_at to
   transaction time + template valid_days (otherwise 30 days). Validate plan,
   quantities, products, variants, currency and subscription expiry.
5. revise returns quotation to draft and clears quote_expires_at. confirm requires
   now < quote_expires_at and now < expires_at, rechecks eligibility without
   changing offered unit prices, labels or descriptions. All confirmed/active/
   paused/closed prices remain frozen across catalog edits/retirement.
6. activate requires start_at <= now < expires_at. Initialize billing_anchor_at
   and next_billing_at to actual activation time, not a browser schedule.
7. pause requires active, allow_pause, now < expiry. Materialize earlier due
   periods under the same lock before clearing next_billing_at and setting paused;
   failure rolls back all invoices and state. No period starts while paused.
8. resume requires paused, allow_pause, now < expiry. New period starts at resume
   time, without paused catch-up or proration. D4 agreed to restart billing_anchor_at
   and next_billing_at at resume time, preserving
   that segment's day-of-month anchor thereafter. Never rewrite old invoice periods.
9. close allows staff from all nonclosed states; owner early close requires
   allow_close (at/after expiry owner may close). Materialize earlier due periods
   before min(now,expiry) under the same lock, then closed_at=now, status=closed,
   next_billing_at=null. Billing failure rolls back close. Draft/nonactive records
   have no invented billable periods. See D4 coordination below.
10. renew requires allow_renew and nondraft source. Creates a **new** draft with
    renewed_from_id, current D2 prices on the old copied selections and requested
    valid date range. Do not reload changed template lines. Original header,
    version, state and accepted prices stay unchanged. The unique renewed_from_id
    prevents a second direct renewal with a different key. Never reopen old rows.

### Template transactions: proposals requiring D1 contract approval

The current shared document has no named template RPCs. Propose
`create_quotation_template(p_actor_id uuid,p_input jsonb) returns jsonb` and
`update_quotation_template(p_actor_id uuid,p_template_id uuid,
p_expected_version bigint,p_input jsonb) returns jsonb`.
D1 must update docs/api-contracts.md with producer/consumer review before binding
these targets or exposing routes. The service intentionally uses named typed
transaction bindings instead of assuming unapproved SQL names.

Admin only; create fields match CreateTemplateInput; updates accept only the
documented optional fields, at least one. Validate complete merged template,
valid_days 1..3650, payment terms 0..365, exactly one plan-matching primary and
variant/product consistency. Lock parent for updates, check version, atomically
replace lines and increment parent once. Never cascade edits into subscriptions.

## D4 shared schedule boundary

Only `generate_next_invoice(p_subscription_id uuid)` advances a due schedule.
D3 mutations and D4 generation take the same subscription lock before invoice
and discount locks. Period starts before expiry/cutoff may catch up even after
expiry; final end is capped, period starting at/after cutoff never bills.
Cancelled invoices retain period uniqueness. Auto-close waits for catch-up.
Pause and close need D4's generation logic inside their existing transaction,
not REST calls or separately committed RPCs. D3 and D4 agreed to the proposed
`private.generate_next_invoice_locked(p_subscription_id uuid, p_cutoff timestamptz)`:
capture one cutoff under the subscription lock and drain while active before the
state update; failure rolls back the transaction. D1 reports a billing migration
on newer main; its implementation and database tests are not verified in this
checkout. No D4 table writes from D3 TypeScript. Confirmation
may lock invoice then discount only if its pricing path takes no later conflicting
subscription lock; D1/D2/D4 must audit and test concurrent transactions.

## Required real database tests (D1 integrates, not currently passing)

- Run RLS reads and EXECUTE-denial checks as actual anon/authenticated roles:
  customer A cannot see B header/lines; own drafts hidden; disabled users rejected;
  internal reads templates but cannot configure; no client mutations.
- Every allowed/forbidden lifecycle edge, exact expiry/start boundaries, plan
  gates for staff/owner, missing resources and stale expected versions.
- Template edit after draft creation does not change copied selections. Catalog
  repricing before quote applies; repricing after quote/confirmation does not
  change offered/accepted lines. Revision explicitly permits a new quote price.
- Concurrent identical create requests return one header/line set. Same key with
  changed original input conflicts; identical retry after template retirement,
  catalog/default/draft edits still replays. Operation/source-ID changes conflict.
- Concurrent renewals: identical key replays despite stale If-Match; different
  keys yield one direct renewal; old row and prices remain byte-for-byte unchanged.
- Two mutations with one expected version permit one success. A forced exception
  after header/child insert/update rolls back every row and version increment.
- Race pause/close with billing: no duplicate period, cutoff respected, pending
  earlier due periods retained. Inject billing failure: no schedule/state advance.
  Resume skips paused time. Test Jan 31, leap day, outage after expiry, auto-close.
- FK/currency/primary/minimum/variant checks, money overflow and D2 rounding cases;
  two customers and internal/admin fixtures; use only fake data in disposable DB.

Local unit runner: `node tests/subscriptions/run.mjs`. Binding spies exercise
orchestration and projection only; they do not prove SQL locks, RLS, retries or
rollback. Real Supabase/Auth, database tests and integrated UI remain release gates.

## UI components ready for integration

- TemplateForm: create/edit template, product/variant selections and retirement.
- DraftSubscriptionForm: customer/plan, template or explicit lines, dates and
  optional terms/discount. Retains creation UUID/input on an uncertain result;
  changed inputs cannot silently reuse that UUID. No localStorage persistence.
- DraftEditor: draft-only edits using expected_version; accepted terms render no
  editing form. Parent must refresh/remount by id/version after a successful edit.
- SubscriptionList and SubscriptionDetail: safe summary/accepted lines, workspace
  or portal links, server-derived action hints, renewal to a new draft, accessible
  native controls and live feedback. Monetary display uses BigInt and the currency
  exponent; no floating-point conversion of money.

These components are not mounted at URLs yet. Callback props must be wired to
protected endpoints or verified server actions after dependency integration.
Static rendering tests check labels, escaping, boundaries and action visibility;
interactive browser/accessibility testing remains required with the mounted flow.
Admin/internal/customer authorization stays in services/RPCs, never in the UI.

## HTTP and UI release boundary

No route is published while Auth/RPC dependencies are missing. Before publishing,
use D1 Origin/session/header/error helpers; require UUID Idempotency-Key and quoted
If-Match where documented, reject unknown bodies, return private,no-store and
ETag on individual DTOs. Single-request service bindings must not be stored in a
shared Next.js cache. Server Components call services directly beneath Suspense
for request data; client components receive only safe DTOs.

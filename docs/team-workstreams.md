# Four-developer workstreams

## Assignment and edit boundaries

D1-D4 identify seats until teammates add their names. Each developer owns UI,
service/contracts, routes and tests for their domain. Permission to work on one
module is not permission to edit a consumer or shared file. Ask its owner for the
change, or obtain explicit authorization and record it in the PR. D1 integrates
shared changes, not unilateral rewrites of D2-D4 modules.

| Developer | Exact owned paths | Responsibility |
|---|---|---|
| D1: platform / identity / integrator | `AGENTS.md`, `GEMINI.md`, `opencode.json`, `.agent/**`, `docs/**`, `supabase/**`, root package/lock/config/ignore files, `.github/**`, `scripts/**`, `src/lib/**`, `src/components/ui/**`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/favicon.ico`, `src/proxy.ts`, `src/app/(auth)/**`, `src/app/auth/**`, `src/app/(workspace)/layout.tsx`, `src/app/(workspace)/page.tsx`, `src/app/(portal)/layout.tsx`, `src/app/(portal)/portal/layout.tsx`, `src/app/(portal)/portal/page.tsx`, `src/modules/identity/**`, `src/app/api/v1/{me,customers,staff,users}/**`, `tests/identity/**`, `tests/integration/**` | Auth/session, roles/staff invites, shell/shared UI, env clients, common errors/DTOs, all migrations/types, CI and integration |
| D2: catalog / pricing | `src/modules/catalog/**`, `src/app/(workspace)/catalog/**`, `src/app/(portal)/portal/catalog/**`, `src/app/api/v1/{catalog,products,variants,plans,tax-rules,discounts}/**`, `tests/catalog/**` | Admin products/variants/plans/tax/discounts, safe customer catalog, integer pricing and discount/tax specification |
| D3: quotations / subscriptions | `src/modules/subscriptions/**`, `src/app/(workspace)/quotation-templates/**`, `src/app/(workspace)/subscriptions/**`, `src/app/(portal)/portal/subscriptions/**`, `src/app/api/v1/{quotation-templates,subscriptions}/**`, `tests/subscriptions/**` | Templates and copied lines, quote lifecycle, plan-gated customer actions and subscription schedule ownership |
| D4: billing / payments / reports | `src/modules/billing/**`, `src/app/(workspace)/{invoices,payments,reports}/**`, `src/app/(portal)/portal/{invoices,payments}/**`, `src/app/api/v1/{invoices,payments,reports,billing}/**`, `tests/billing/**` | Atomic recurring invoice generation, issue/cancel/print/send, verified partial receipts, reports and billing runner |

Braces above expand to the listed directories, not literal names. Any path not
assigned here requires D1 assignment before work. `public/**` assets require D1
coordination and attribution/security review; do not overwrite starter assets.
Root layout/config remains D1 even though everyone uses it. Colocated tests inside
an owned module belong to its module owner. SQL tests and generated DB types are
D1-owned; domain owners submit test cases/SQL changes for D1 to integrate.

Next.js route groups do not alter URLs: workspace catalog is `/catalog`; portal
catalog is `/portal/catalog`, and likewise `/portal/subscriptions`,
`/portal/invoices`, `/portal/payments`. Keep the explicit `portal/` segment in
the table to avoid colliding workspace routes. Do not add a group page that
collides with existing root `src/app/page.tsx`; D1 changes that landing page
explicitly when integrating the shell. All API routes remain under `/api/v1`.

## Dependency and integration boundaries

```text
D1 identity / shared types / schema
             |
             +--> D2 catalog and pricing
             |            |
             +------------+--> D3 quotes and subscriptions
             |            |               |
             +------------+---------------+--> D4 billing and reports
```

- Every module exposes only `contracts.ts` for shared safe types and `service.ts`
  for server-only operations. Import a peer's public exports; never its private
  helpers, queries, components, secret client, or internals. UI-only shared widgets
  go through D1 rather than copying a component four ways.
- D3 consumes D2 `priceQuote`; D4 consumes D2 `priceInvoice` previews. Discount
  redemption commits belong to D4's confirmation transaction, with D2 arithmetic
  reviewed and D1 migration ownership. No module maintains a second discount
  counter. D3 owns the meaning of subscription schedule fields; D4's generator
  may advance them only inside the shared RPC specified in api-contracts.md.
- D1 owns authenticated `Actor`, shared `Minor`/`Version`, errors/envelopes,
  cookie/Origin checks, job authentication and generated database types. Modules
  cannot trust an Actor decoded from a client body. Staff role is current DB data.
- D1 configures customer-safe navigation; hiding links never replaces service
  authorization. D4 must not put payment records in client localStorage or treat
  a customer success message as money received.
- No feature owner independently edits `supabase/migrations`, package manifests,
  shared instructions or another module. Send D1 a concrete proposed SQL/API
  change and tests. D1 generates one fresh timestamped migration per approved
  change after checking main's migration history. Consumers review shared payloads.

## Implementation plan and acceptance gates

This is the integration plan requested for the team, not authorization to implement
all workflows in the architecture baseline. Each workstream adds its own functional
tests as it implements the following slices. D1 records completed gates in PRs.

1. **Foundation (D1):** install pinned Supabase clients; add env validation and
   server/client separation, generated DB types and common errors/contracts.
   Build signup/login/reset/callback, current-role authorization, invitations,
   profile settings, stable request fingerprinting and shared layouts. Prove password/email rules, reset return
   URL allowlist, metadata escalation denial, inactive user rejection, staff
   invitation retry handling and last-admin protection. Run the SQL self-check on
   real local Supabase and advisors. Every feature branch starts from this gate.
2. **Catalog (D2, after shared types):** admin configuration and safe reads;
   exported priceQuote/priceInvoice with integer math. Prove variant belonging, referenced-plan cadence immutability,
   primary plan price without double charging, nonnegative adjusted prices,
   min quantities, availability, currency match, half-cent rounding, fixed
   discount caps and allocation remainders, rule expiration/product scope. Staff
   writes and customer cost/notes access must fail. D1 lands needed catalog RPCs.
3. **Subscription vertical slice (D3, after catalog contracts):** template ->
   copied draft -> quotation -> confirmation -> activation, plus customer
   pause/resume/close/renew. D1 lands transactional create/mutate RPCs. Prove every
   allowed/forbidden edge, expiry and plan gates, copy independence, accepted
   prices survive repricing, owner isolation, stale version conflicts, idempotent
   creation and unique renewal. Pause/close must serialize with billing.
4. **Billing vertical slice (D4, after D2/D3 contracts):** generate next due period,
   invoice confirmation/cancellation, printable historical snapshot, verified
   partial payments and report summary. D1 lands billing/payment RPCs. Prove
   concurrent jobs produce one period invoice; failure advances no schedule;
   missed periods catch up; Jan 31/leap-day renewals preserve anchor; paused time
   and periods starting at/after expiry do not bill; overdue pre-expiry periods
   are recovered; cancellation retains period uniqueness;
   one remaining discount use cannot be spent twice; partial payment remains
   confirmed; exact balance marks paid; concurrent receipts cannot overpay;
   changed idempotent input conflicts after template/draft edits; tax/discount
   totals match line sums;
   mixed currencies never aggregate together. Customer cannot forge a receipt.
5. **Integration (D1 coordinates, owners fix their modules):** a real local
   Supabase flow with two customers and internal/admin accounts: create catalog
   -> template -> quote -> activate -> bill -> partial/full payment -> portal and
   filtered report. Confirm customer A cannot fetch B's IDs through routes or
   direct Data API. Verify keyboard navigation/labels, printing, auth no-store
   behavior and 10,000-subscription performance (p95 <2 seconds on target setup).
   Delivery needs a real mail integration or a clearly labelled unimplemented
   send action; never set sent_at without delivery confirmation.

Within a slice: write the meaningful failing test, implement the smallest complete
behavior in its owner module, run the focused test, then typecheck/lint/build.
Avoid empty route/service scaffolds, speculative gateways and generic frameworks.
Do not merge a mutation route that bypasses its transactional invariant.

## Git and review protocol

After the user-authorized baseline commit to main, use `feat/d1-identity`,
`feat/d2-catalog`, `feat/d3-subscriptions`, `feat/d4-billing` (or shorter slice
branches). Fetch/rebase your unpublished feature work against current main before
opening a PR; do not force push a shared or already published branch. Integrator
merges reviewed PRs sequentially. Never overwrite a dirty working tree or stage
unrelated files. A rejected push means fetch and reconcile, never force.

PR includes owned paths, contract/migration impact, actual verification output
and known limits. Cross-module changes name the approving owner. D1 reviews every
migration/secret/auth boundary, D2 reviews pricing consumers, D3 reviews billing
schedule changes, D4 reviews receipt/revenue semantics. Update the docs and producer
types together before consumers switch. No database dashboard schema edits outside
an emergency recorded and reconciled by a new migration.

Baseline verification commands are in root AGENTS.md. Future code uses meaningful
unit tests for pure pricing and real PostgreSQL integration tests for locks,
transactions and RLS. Install a test framework only as part of the first workflow
that needs it. Until then, the committed SQL self-check is the database test suite;
passing it does not claim unfinished product workflows are covered.

## Baseline delivery checklist

- [x] Read the four-page problem statement and preserve starter work.
- [x] Define roles, ownership, shared contracts, state edges and money conventions.
- [x] Supply additive initial migrations with fail-closed privileges and SQL tests.
- [x] Verify PostgreSQL self-check and rollout safety; clean isolated checkout
  passes typecheck, lint and production build with the existing lockfile.
- [x] Complete independent architecture review and resolve its findings.
- Delivery: commit only task files, fetch main again, push without force and
  verify remote SHA (reported with delivery, not preclaimed in this checklist).
- [ ] D1 release gate: real Supabase Auth/Data API, advisors and full workflows.

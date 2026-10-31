# D4 billing integration notes

**Current state: reusable contracts, domain rules, server service, runner factory,
UI components and tests are implemented. No live page or API route is mounted.**
This is deliberate: D1 identity/auth, D1 transactional RPC migrations, the D1 job
verifier and D2's reviewed pricing SQL are not available on this branch. Mounting
routes now would either bypass authorization or call missing RPCs, which the
project rules forbid. Nothing here claims a documented endpoint is live.

The SQL required to make this module functional is proposed in
[`SQL-PROPOSALS.md`](./SQL-PROPOSALS.md).

## 1. Files and public surface

| File | Purpose |
|---|---|
| `contracts.ts` | Public DTOs, queries, constants, labels, status/error guidance. Safe to import from UI and other modules. |
| `service.ts` | Server-only (`server-only`) bound service. All authorization and mutation orchestration. |
| `runner.ts` | `createBillingRunHandler({ verifyJob, services })` factory for `POST /api/v1/billing/run`. |
| `domain.ts` | Pure UTC period/anchor math, invoice arithmetic, payment decisions, discount eligibility, customer visibility, report validation. |
| `validation.ts` | Strict transport parsing with unknown-key rejection, canonical money and future-`paid_at` checks. |
| `presentation.ts` | Exact `BigInt` minor-unit formatting/parsing and UTC presentation. |
| `invoice-html.ts` | Fully escaped, self-contained printable invoice plus CSP. |
| `components/invoice-list.tsx` | Staff/portal invoice list. |
| `components/invoice-detail.tsx` | Staff/portal invoice detail, confirm/cancel actions and idempotent partial-payment form. |
| `components/payment-list.tsx` | Staff/portal receipt history. |
| `components/report-summary.tsx` | Staff-only filtered currency-bucket report. |
| `SQL-PROPOSALS.md` | Concrete RPC/transaction proposal for D1, D2 and D3 review. |
| `tests/billing/**` | Unit/service/runner/HTML tests with fake bindings. |

### `service.ts` exports

```ts
bindBillingServices(bindings: BillingBindings): BillingServices
type BillingServices
type BillingBindings
type BillingContactInput
type BillingPageQuery
billingReadOnlyHelpers // assertCurrency, invoiceVisibleToCustomer (preflight only)
```

The bound service exposes exactly the documented operations:

```ts
listInvoices(actor, query)
getInvoice(actor, id)
generateNextInvoice(actor, { subscription_id })
confirmInvoice(actor, id, { expected_version })
cancelInvoice(actor, id, { expected_version })
sendInvoice(actor, id, { expected_version }) // always SEND_UNAVAILABLE_MESSAGE
renderInvoice(actor, id)
listPayments(actor, query)
recordPayment(actor, invoice_id, input & Mutation & Creation)
getReport(actor, query)
runBilling(jobActor, { limit })
```

`runner.ts` exports `createBillingRunHandler` and `BillingJobVerifier`.

### Contract clarification: draft `customer_snapshot` is null

`InvoiceDTO.customer_snapshot` is `BillingContact | null`:

- A draft has not been confirmed, so it has no frozen billing contact. Drafts are
  staff-only; the UI and print view say the contact is frozen at confirmation.
- Confirmation copies D1's `getBillingContact` result into the invoice and the
  service **rejects an issued invoice that has no snapshot** as
  `INTERNAL_ERROR`.
- Customers can only read issued, non-draft invoices, so they never observe the
  null state.

`docs/api-contracts.md` should record this nullability in the next D1 docs pass.

## 2. Required bindings and ownership

`bindBillingServices` takes request-scoped bindings. Nothing imports a global
client or reads cookies/env inside D4.

| Binding | Owner | Required behavior |
|---|---|---|
| `requireActor()` | D1 identity | Verify the Auth session and return the current `public.users` id/role; inactive users fail. Never trust a client-decoded actor. |
| `getBillingContact(actor, customerId)` | D1 identity | Staff/admin only; current profile display name + Auth email. D4's sole source for `customer_snapshot`. Must not be callable by a customer. |
| `readInvoice(actor, id)` | D1 read layer | RLS-scoped or service-role projection. Must return customer-safe fields only; no costs, internal notes or Auth objects. |
| `readInvoices(actor, query)` | D1 read layer | Scoped, deterministic keyset page; customers only own issued non-draft rows. |
| `readPayments(actor, query)` | D1 read layer | Customer own rows only; staff filters. |
| `readReport(actor, query)` | D1 read layer | Staff/admin; separate currency buckets per contract. |
| `generateNextInvoiceTransaction({ p_subscription_id })` | D1 RPC | Calls service-role-only `public.generate_next_invoice`. Returns invoice id or `null` when not due. |
| `confirmInvoiceTransaction({ p_actor_id, p_invoice_id, p_expected_version, p_customer_snapshot })` | D1 RPC | Calls `public.confirm_invoice`; returns full InvoiceDTO. `p_customer_snapshot` is additive. |
| `cancelInvoiceTransaction({ p_actor_id, p_invoice_id, p_expected_version })` | D1 RPC | Calls `public.cancel_invoice`; returns cancelled InvoiceDTO. |
| `recordPaymentTransaction({ p_actor_id, p_invoice_id, p_expected_version, p_request_key, p_input, p_request_fingerprint })` | D1 RPC | Calls `public.record_payment`; returns `{payment, invoice}`. `p_request_fingerprint` is additive. |
| `listDueSubscriptionIds(limit)` | D1 read layer | Active due batch ordered by `(next_billing_at, id)`, `next_billing_at < expires_at`; may repeat across concurrent jobs. |
| `hasMoreDueSubscriptions?()` | D1 read layer | Optional exact `has_more`; otherwise the runner reports `ids.length === limit`. |
| `logBillingFailure?(subscriptionId, code)` | D1 observability | Safe code + subscription id only; no raw error, PII or payment values. |

### Additive RPC arguments needing D1 approval

1. `confirm_invoice(..., p_customer_snapshot jsonb)` so the confirmation
   transaction can freeze D1's billing contact without re-reading Auth/profile
   data or trusting the browser.
2. `record_payment(..., p_request_fingerprint text)` so D1's
   `fingerprintRequest` is the canonical retry check and SQL stores exactly what
   the server verified.

D1 must update `docs/api-contracts.md` and generated database types together with
the migration, with producer/consumer review. The TypeScript binding names already
match the proposed SQL parameters.

## 3. Integration order

1. **D1 identity:** merge `feat/d1-foundation` identity exports (`requireActor`,
   `getBillingContact`, `fingerprintRequest`, error/response helpers).
2. **D2 pricing:** review and land `private.price_invoice_draft` plus the shared
   invoice pricing DTO/types. D4 does not duplicate pricing arithmetic.
3. **D3 schedule contract:** review `private.generate_next_invoice_locked` and use
   it in close/pause under the same subscription row lock. D3 remains the owner of
   schedule meaning.
4. **D1 migration:** add the sequence, private helpers, four public RPCs, grants,
   `private` schema usage for `service_role`, and the real SQL tests. Do not put
   financial mutation routes live before this migration is applied.
5. **D1 job verifier:** add `verifyBillingJob(request)` using a distinct
   `BILLING_JOB_SECRET`, constant-time comparison, no cookie fallback and redacted
   logs.
6. **Compose bindings:** create the request-scoped adapter from D1 clients. Server
   reads/actions use the verified user; the runner uses service role only after
   `verifyBillingJob`.
7. **Mount routes/pages** and run the real local Supabase flow.

## 4. Planned route/page map (not mounted yet)

All API routes live under `/api/v1`. Every mutation must validate Origin, session,
`If-Match`, input and ownership server-side through D1 helpers and the service.
Never put authenticated DTOs in shared Next.js caches; responses are `no-store`
where D1's conventions require it.

| Route | Method | Service |
|---|---|---|
| `src/app/api/v1/invoices/route.ts` | GET | `listInvoices` |
| `src/app/api/v1/invoices/[id]/route.ts` | GET | `getInvoice` |
| `src/app/api/v1/invoices/generate/route.ts` | POST | `generateNextInvoice` |
| `src/app/api/v1/invoices/[id]/confirm/route.ts` | POST | `confirmInvoice` |
| `src/app/api/v1/invoices/[id]/cancel/route.ts` | POST | `cancelInvoice` |
| `src/app/api/v1/invoices/[id]/payments/route.ts` | POST | `recordPayment` |
| `src/app/api/v1/invoices/[id]/print/route.ts` | GET | `renderInvoice`; `text/html`, CSP, no-store |
| `src/app/api/v1/payments/route.ts` | GET | `listPayments` |
| `src/app/api/v1/reports/summary/route.ts` | GET | `getReport` |
| `src/app/api/v1/billing/run/route.ts` | POST | `createBillingRunHandler` |

Do **not** create `src/app/api/v1/invoices/[id]/send/route.ts` until a real
delivery integration exists. `sendInvoice` intentionally throws
`INVALID_TRANSITION` with:

> Invoice delivery is not available because no delivery integration is configured.

No code path sets `sent_at`; printing never issues a draft.

| Page | Content |
|---|---|
| `src/app/(workspace)/invoices/page.tsx` | Staff invoice list/filters |
| `src/app/(workspace)/invoices/[id]/page.tsx` | `InvoiceDetail` with staff actions |
| `src/app/(workspace)/payments/page.tsx` | `PaymentList` |
| `src/app/(workspace)/reports/page.tsx` | `ReportSummary` |
| `src/app/(portal)/portal/invoices/page.tsx` | Customer own issued invoices |
| `src/app/(portal)/portal/invoices/[id]/page.tsx` | Customer read-only `InvoiceDetail` |
| `src/app/(portal)/portal/payments/page.tsx` | Customer own receipts |

`InvoiceDetail` ignores staff callbacks when `role === "customer"`; the service and
SQL remain authoritative. Hiding a link is not authorization.

Runner wiring after D1 lands:

```ts
// src/app/api/v1/billing/run/route.ts
import { createBillingRunHandler } from "@/modules/billing/runner";
import { verifyBillingJob } from "@/lib/..."; // D1-owned
import { services } from "@/modules/billing/..."; // request-scoped composition

export const POST = createBillingRunHandler({ verifyJob: verifyBillingJob, services });
```

No page should call a service directly from a client component. Services are
server-only; UI receives safe DTOs and calls API routes.

## 5. Security and correctness invariants

- Financial mutations only go through the atomic service-role-only RPCs. The
  service never inserts/updates invoice, payment, redemption or subscription
  rows and never advances a schedule itself.
- Invoice generation, confirmation, cancellation, discount redemption and payment
  are each one transaction. No sequence of independent REST writes is used.
- Money is integer minor units end to end; BigInt arithmetic; no floating point.
- Invoice lines and `customer_snapshot` are historical snapshots and survive
  later catalog/profile edits.
- Cancelled invoices retain their `(subscription_id, period_start)` uniqueness.
- Customers never see draft or cancelled-unissued invoices; the service filters
  after the read layer as defense in depth.
- Payment success is never inferred from the browser. Only an inserted payment
  row and derived balance mark money as received.
- A retry with the same request key and input replays even with a stale version;
  changed input conflicts. Invoice locks prevent concurrent overpayment.
- Discount usage is counted/reserved under lock; one remaining use yields one
  redemption.
- No card data: payment notes are screened for card-like numbers; no gateway or
  card storage exists.
- `runBilling` accepts only a job actor supplied by D1's verifier and logs safe
  codes only.

## 6. Verification evidence and limits

Run from the repository root (`hack26`):

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

At the time of this branch the results are reported in the PR/delivery message.
The unit suite covers the pure period/anchor, payment, discount, report and
validation rules plus service authorization, isolation, retry ordering, runner
authentication/redaction and escaped HTML.

**What the current tests do not prove, and cannot prove without D1's migration:**

- row locks, transaction rollback and concurrent generation/payment/redeem
  behavior in PostgreSQL;
- RLS as real `anon`/`authenticated` roles and service-role grant boundaries;
- the D2 pricing arithmetic and discount allocation;
- D3 close/pause serialization with the shared generator;
- a real Supabase Auth/session/billing end-to-end journey, printing headers, and
  portal isolation through the Data API;
- report query correctness against real data.

Those require D1's real local Supabase migration plus `supabase/tests/billing.sql`
(the cases in `SQL-PROPOSALS.md` §10). They must not be marked passing until run.

## 7. Open decisions for reviewers

1. **Discount at confirmation:** the proposal recomputes the discount under lock;
   date/active/minimum ineligibility yields zero, while losing a concurrent last
   use raises `DISCOUNT_EXHAUSTED`. D2/D3 should confirm this business rule.
2. **Cancelled issued invoice redemption:** the proposal keeps the redemption row
   (the use was spent on an issued document). If cancellation should release a
   use, D2 must own and test that rule.
3. **Invoice numbering:** a `public.invoice_number_seq` is proposed. D1 may prefer
   a shared document-number helper; only uniqueness and the 100-character check
   are contractual.
4. **D1 read pagination/report SQL:** D1 owns the exact keyset cursor encoding and
   report query; D4's service validates the returned DTO and enforces role scope.
5. **Draft customer snapshot nullability:** confirm the `BillingContact | null`
   clarification in `docs/api-contracts.md`.

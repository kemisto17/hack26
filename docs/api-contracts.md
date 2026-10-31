# API and service contracts (v1)

These are implementation targets. No HTTP handler/service in this document is
implemented by the architecture baseline. Owners must deliver routes, validation,
transactions and tests together. Schema names/status strings are authoritative;
changes require producer/consumer review and an update here in the same PR.

## Transport and shared types (D1)

Base path `/api/v1`. JSON uses snake_case. IDs and idempotency keys are UUIDs;
timestamps are ISO-8601 UTC; dates are `YYYY-MM-DD`; money and bigint `version`
values are decimal strings, quantities/rate bps are integers. Reject unknown
mutation keys, invalid UUIDs/dates, unsupported currency and excess bounds before
database calls. No client-supplied role, owner, totals or unit prices except
explicit admin catalog configuration. Never spread request bodies into DB writes.

Success: `{ "data": <DTO>, "request_id": "uuid" }`. Lists also return
`"page": { "next_cursor": "opaque-or-null" }`. Errors:

```json
{ "error": { "code": "INVALID_TRANSITION", "message": "Subscription cannot be paused.", "fields": {} }, "request_id": "uuid" }
```

HTTP: 200 read/action/update, 201 create, 202 accepted staff invitation or delivery
request; 400 `VALIDATION_ERROR`; 401 `UNAUTHENTICATED`; 403 `FORBIDDEN`; 404
`NOT_FOUND` (also another customer's resource); 409 `VERSION_CONFLICT`,
`INVALID_TRANSITION`, `IDEMPOTENCY_CONFLICT`, `DISCOUNT_EXHAUSTED` or
`PAYMENT_EXCEEDS_BALANCE`, `NOT_DUE`; 429 `RATE_LIMITED`; 500 `INTERNAL_ERROR` (no SQL/stack
details). Missing `If-Match` is 428 `PRECONDITION_REQUIRED` for mutations listed
with that header below; malformed header is 400. A valid-state duplicate operation may replay
as described below; otherwise return 409, never silently mutate another state.

Use cookie-bound Supabase sessions. Require a verified session and current active
DB profile on every protected request. Cookie mutations check exact allowed
Origin and reject missing/mismatched origins; no permissive CORS. Auth callback
uses allowlisted return paths. Reports and every customer response are private,
no-store. Job endpoint is the explicit server-secret exception, never cookie auth.

`Idempotency-Key: <uuid>` is mandatory for subscription creation/renewal and
payment recording. Persist in `request_key`, scoped by `created_by`/`recorded_by`.
Before returning a prior resource, verify its owner/actor and compare the persisted
`request_fingerprint`; same key and different input is 409. D1 provides a SHA-256
fingerprint of operation/resource ID and normalized caller input: recursively
sorted object keys, ordered arrays, canonical money strings and UTC dates. Exclude
If-Match, request key, generated values and mutable catalog/default resolution.
Persist it at initial creation, never recompute it from editable resource rows.
Template edits, changed defaults or later draft edits must not change a retry's
identity. Keep this digest and request key out of customer DTOs.
Invoice generation uses the unique subscription/period key, not a random caller
period. External payment reference additionally deduplicates across staff actors.

`If-Match: "<version>"` is mandatory for the listed updates/actions on aggregates,
including line edits, invoice actions and recording a payment. Row lock or
conditional UPDATE checks it atomically; version increments on success. Child
changes advance parent version in the same transaction. Return current version
in the DTO and `ETag: "<version>"` for single-aggregate responses. A replay with a
matching idempotency key is checked before stale-version rejection, so a lost
response does not create another payment/subscription.

Lists: `limit` default 25, maximum 100; opaque `cursor` binds the validated filter
set and last `(created_at,id)`. Order newest first; payment history orders by
`paid_at,id`. Reject malformed cursors. Customer queries always scope to actor,
even if a `customer_id` is supplied. Cross-module DTOs are allowlists, not raw rows.

Shared TypeScript targets in D1-owned `src/lib/api/contracts.ts`:

```ts
type UUID = string;
type Minor = string;
type Version = string;
type Role = 'admin' | 'internal' | 'customer';
type Actor = { id: UUID; role: Role }; // server-derived, never request input
type PageQuery = { limit?: number; cursor?: string };
type Page<T> = { items: T[]; next_cursor: string | null };
type Mutation = { expected_version: Version };
type Creation = { request_key: UUID };
```

These types alone are not runtime validation. `identity.requireActor()` verifies
the current request and active DB role; services receive that trusted Actor and
recheck current role at privileged transaction boundaries. Public module types
live in each owner's `contracts.ts`; server exports live in `service.ts`.
Services return DTOs or throw D1's `AppError(code, message, fields?)`; only HTTP
adapters add envelopes, request IDs and status codes. No HTTP calls between modules.

D1-owned `src/lib/api/idempotency.ts` exports
`fingerprintRequest(operation:string,resource_id:UUID|null,input:unknown):string`
using the canonicalization rules above. Unchanged normalized input must yield the
same digest before/after domain edits; altered input must yield a conflict.

## Identity (D1)

Signup/login/logout/reset use supported Supabase Auth SDK calls, not custom
password tables or password-proxy endpoints. Enforce length >=9, upper/lowercase
and special character. The selected Supabase built-in policy also requires a
digit; UI/help text must say so. Configure Auth email confirmation/reset URLs and
provider rate limits before exposing signup. Only an admin invitation service uses
the secret Auth admin client. Never return invitation links/tokens to clients.

| Method / route | Input | Result / permission |
|---|---|---|
| GET `/me` | none | `UserDTO`; active authenticated user |
| GET `/customers` | pagination | Customer UserDTOs; staff/admin only |
| PATCH `/me` | `{display_name}` + If-Match | Updated own UserDTO; no role/active changes |
| POST `/staff/invitations` | `{email, display_name}` | `{accepted:true}`; admin only; create/invite through Auth, then assign internal role; retry by normalized email safely |
| PATCH `/users/:id/access` | `{role?,is_active?}` + If-Match | UserDTO; admin only; protect last active admin under a serialized DB lock |

`UserDTO = {id,display_name,role,is_active,version,created_at,updated_at}`. Do not
return Auth user objects to other modules. Server exports:
`requireActor(): Promise<Actor>`, `getMe(actor): Promise<UserDTO>`,
`updateMe(actor, {display_name,...Mutation}): Promise<UserDTO>`,
`inviteStaff(actor,{email,display_name}): Promise<{accepted:true}>`,
`setAccess(actor,id,{role?,is_active?,...Mutation}): Promise<UserDTO>`.
Also export `listCustomers(actor,query): Promise<Page<UserDTO>>` and
`getBillingContact(actor,customer_id): Promise<{display_name:string,email:string}>`.
The latter is staff/admin only, reads the current profile plus Auth email through
D1's server Auth admin client, and is D4's sole source for customer_snapshot.
Last-admin protection and invitation compensation/retry are D1 implementation
gates; baseline SQL does not implement role-management workflows.

## Catalog and pricing (D2)

Admin writes all configuration. Internal staff reads it. Customers use only GET
`/catalog`, which returns active eligible plans/products with sales prices,
variant adjustments and names; omit costs, internal notes, discount codes and
inactive records. Staff GET `/customers` is D1-owned identity directory, returning
paginated UserDTOs where role=customer; no raw Auth email directory.

For each resource below, GET `/<resource>` and GET `/<resource>/:id` return safe
paginated DTOs/single DTO; POST `/<resource>` creates; PATCH `/<resource>/:id`
updates with If-Match (same fields optional, at least one). Retire via is_active;
no DELETE route. Dates/currency and complete resulting object are revalidated.

| Resource | Create fields (optional `?`, defaults from schema) |
|---|---|
| `products` | `name,product_type,sales_price_minor,cost_price_minor,currency,notes?,tax_rule_id?,is_active?` |
| `variants` | `product_id,name,attributes?,price_adjustment_minor?,is_active?`; product_id immutable |
| `plans` | `product_id,name,price_minor,currency,billing_interval,min_quantity?,available_from?,available_until?,auto_close?,allow_close?,allow_pause?,allow_renew?,is_active?`; product_id/currency/billing_interval immutable once referenced; use a new plan for a new cadence |
| `tax-rules` | `name,rate_bps,starts_on,ends_on?,is_active?` |
| `discounts` | `code,name,scope,kind,amount_minor?,currency?,percent_bps?,min_quantity?,min_subtotal_minor?,starts_at,ends_at?,max_uses?,product_ids?,is_active?` |

Staff configuration DTOs expose those fields plus id/version/timestamps. Customer
CatalogDTO includes only `{products:[{id,name,product_type,sales_price_minor,
currency,variants:[{id,name,attributes,price_adjustment_minor}]}],plans:[{id,
product_id,name,price_minor,currency,billing_interval,min_quantity,available_from,
available_until,auto_close,allow_close,allow_pause,allow_renew}]}`. GET `/catalog`
uses pagination on plans; include only products/variants needed for that page.

Types exported by `src/modules/catalog/contracts.ts`:

- `LineSelection = {product_id:UUID, variant_id?:UUID, quantity:number, is_primary:boolean}`.
- `PricedLine = LineSelection & {id:UUID, description:string, variant_label:string|null, unit_price_minor:Minor}`.
- `PriceQuoteInput = {plan_id:UUID,lines:LineSelection[],at:string}`.
- `PriceQuoteDTO = {currency:string,lines:PricedLine[],subtotal_minor:Minor}`.
- `InvoicePricingInput = {currency:string,lines:PricedLine[],discount_id:UUID|null,at:string}`.
- `InvoicePricingDTO = {lines:Array<PricedLine & {discount_minor:Minor,tax_rule_id:UUID|null,tax_rate_bps:number,tax_minor:Minor,amount_minor:Minor}>,subtotal_minor:Minor,discount_minor:Minor,tax_minor:Minor,total_minor:Minor}`.

Server exports `getCatalog(actor,query): Promise<{catalog:CatalogDTO,next_cursor:string|null}>`,
`priceQuote(actor,input:PriceQuoteInput): Promise<PriceQuoteDTO>`, and
`priceInvoice(actor,input:InvoicePricingInput): Promise<InvoicePricingDTO>` plus
resource-specific `list/get/create/update` functions named after the resource
(e.g. `createProduct`, `updatePlan`). D2 owns their validation/DTOs. Pricing is a
preview, not a discount reservation; D4's confirmation transaction must recheck
eligibility and usage under lock. D2 supplies the reviewed SQL arithmetic for that
transaction through D1, so TypeScript preview is not the final financial authority.

## Quotations and subscriptions (D3)

| Method / route | Input | Result / permission |
|---|---|---|
| GET `/quotation-templates[/:id]` | pagination for list | TemplateDTO(s); staff/admin |
| POST `/quotation-templates` | `{name,plan_id,valid_days?,payment_terms_days?,lines:LineSelection[]}` | TemplateDTO; admin |
| PATCH `/quotation-templates/:id` | same fields optional, including `is_active`; If-Match | TemplateDTO; admin, replace lines atomically |
| GET `/subscriptions` | pagination, optional status/customer_id | SubscriptionSummaryDTO(s); staff all, customer own visible states |
| GET `/subscriptions/:id` | none | SubscriptionDTO with lines; same ownership |
| POST `/subscriptions` | `{customer_id,plan_id,template_id?,lines?,discount_id?,start_at,expires_at,payment_terms_days?}` + Idempotency-Key | Draft SubscriptionDTO; staff/admin; exactly one of template_id or explicit lines; template must match plan |
| PATCH `/subscriptions/:id` | `{lines?,discount_id?,start_at?,expires_at?,payment_terms_days?}` + If-Match | Draft SubscriptionDTO; staff/admin; no direct prices or state |
| POST `/subscriptions/:id/quotation` | `{}` + If-Match | Quotation DTO; staff/admin; copies prices and sets quote expiry from template, otherwise 30 days |
| POST `/subscriptions/:id/revise` | `{}` + If-Match | Draft DTO; staff/admin; quotation only |
| POST `/subscriptions/:id/confirm` | `{}` + If-Match | Confirmed DTO; staff/admin; expired quotations rejected |
| POST `/subscriptions/:id/activate` | `{}` + If-Match | Active DTO; staff/admin, start reached |
| POST `/subscriptions/:id/pause` | `{}` + If-Match | Paused DTO; staff or owner; allow_pause required |
| POST `/subscriptions/:id/resume` | `{}` + If-Match | Active DTO; staff or owner; still eligible, expiry not reached |
| POST `/subscriptions/:id/close` | `{}` + If-Match | Closed DTO; staff or owner; customer early close requires allow_close |
| POST `/subscriptions/:id/renew` | `{start_at,expires_at}` + If-Match + Idempotency-Key | New draft SubscriptionDTO; staff or owner, allow_renew required; reprice via current plan, original stays unchanged |

SubscriptionSummaryDTO: `{id,number,customer_id,plan_id,currency,status,start_at,
expires_at,next_billing_at,version,created_at,updated_at}`. SubscriptionDTO adds
`template_id,discount_id,renewed_from_id,quote_expires_at,payment_terms_days,
billing_anchor_at,closed_at,lines:PricedLine[]`. Omit internal creation/retry data
in customer responses. TemplateDTO: `{id,name,plan_id,valid_days,
payment_terms_days,is_active,version,created_at,updated_at,lines:LineSelection[]}`
(line items also include persisted id on reads).

`subscriptions/service.ts` exports `listSubscriptions(actor,query)`,
`getSubscription(actor,id)`, `createSubscription(actor,input & Creation)`,
`updateDraft(actor,id,input & Mutation)`, `quoteSubscription`, `reviseQuotation`,
`confirmSubscription`, `activateSubscription`, `pauseSubscription`,
`resumeSubscription`, `closeSubscription` (each `(actor,id,Mutation)`),
`renewSubscription(actor,id,{start_at,expires_at,...Mutation,...Creation})`.
All return Promise of the DTO named above. Template exports are
`listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate` with the
corresponding route inputs and Mutation on update. Pricing calls D2 exports only.

D4 must not update D3 tables directly in TypeScript. The billing transaction may
lock a subscription and advance its schedule through the explicitly shared SQL
boundary below, approved by D3 and migrated by D1. D3 state changes take the same
row lock, so close/pause cannot race an invoice into existence.

## Invoices, payments and reporting (D4)

| Method / route | Input | Result / permission |
|---|---|---|
| GET `/invoices[/:id]` | pagination/status/customer_id/overdue filters for list | InvoiceSummaryDTO(s) / InvoiceDTO; staff all, customers own issued |
| POST `/invoices/generate` | `{subscription_id}` | InvoiceDTO; staff/admin; process next due period, server determines dates and prices |
| POST `/invoices/:id/confirm` | `{}` + If-Match | InvoiceDTO; staff/admin; atomic totals/discount finalization |
| POST `/invoices/:id/cancel` | `{}` + If-Match | Cancelled InvoiceDTO; staff/admin; reject any recorded payment |
| POST `/invoices/:id/send` | `{}` + If-Match | `{invoice_id,accepted:true}`; staff/admin, issued only; delivery integration required before route exists |
| GET `/invoices/:id/print` | none | `text/html`, escaped printable invoice; staff all; owning customer issued only |
| GET `/payments` | pagination/customer_id/invoice_id/date filters | PaymentDTO(s); staff or own customer |
| POST `/invoices/:id/payments` | `{amount_minor,currency,method,paid_at,note?,external_reference?}` + If-Match + Idempotency-Key | `{payment:PaymentDTO,invoice:InvoiceSummaryDTO}`; staff/admin, verified receipt only |
| GET `/reports/summary` | `from,to` UTC instants, optional `customer_id,status,currency` | Currency bucket summaries; staff/admin |
| POST `/billing/run` | `{limit?:number}` default 100, max 500 | `{processed,failed,has_more}`; server job secret only, no user/cookie auth |

InvoiceSummaryDTO: `{id,number,subscription_id,customer_id,currency,status,
period_start,period_end,issued_at,due_on,sent_at,subtotal_minor,discount_minor,
tax_minor,total_minor,paid_minor,outstanding_minor,version,created_at,updated_at}`.
InvoiceDTO adds `customer_snapshot` (customer-visible billing contact only) and
`lines:[{id,subscription_line_id,description,variant_label,quantity,unit_price_minor,
discount_minor,tax_rule_id,tax_rate_bps,tax_minor,amount_minor}]`. PaymentDTO:
`{id,invoice_id,customer_id,currency,amount_minor,method,paid_at,note,
external_reference,created_at}`. Receipt notes/references must be safe for customers.

`customer_snapshot = {display_name:string,email:string}` copied from D1's
getBillingContact at invoice confirmation; later Auth/profile edits cannot alter
it. Address/tax-registration fields need an additive profile/contract extension.
Generation before the next period is due returns 409 `NOT_DUE`. The generator
does not take If-Match: its subscription lock and unique period key serialize
manual and scheduled commands; repeated calls may recover successive missed
periods, but never create a second invoice for the same period.

Customer invoice reads/printing require `issued_at != null` as well as non-draft
status. A cancelled draft remains staff-only; a cancelled previously issued
invoice remains visible to its owner. Staff may inspect/print drafts internally;
never mark one as issued merely for printing.

ReportDTO: `{as_of,active_subscriptions,currencies:[{currency,billed_minor,
collected_minor,outstanding_minor,overdue_minor,overdue_invoice_count}]}`.
`from` inclusive / `to` exclusive filters billed by issued_at and collected by
paid_at. Outstanding/overdue and active count are current as_of snapshots within
the same customer/currency filters, not range-limited totals. Exclude draft and
cancelled invoices. Count active status only; never sum currencies. Status filter
applies to invoice measures; active count remains explicitly status=active.

Server exports: `listInvoices(actor,query)`, `getInvoice(actor,id)`,
`generateNextInvoice(actor,{subscription_id})`, `confirmInvoice(actor,id,Mutation)`,
`cancelInvoice(actor,id,Mutation)`, `sendInvoice(actor,id,Mutation)`,
`renderInvoice(actor,id)`, `listPayments(actor,query)`,
`recordPayment(actor,invoice_id,input & Mutation & Creation)`,
`getReport(actor,query)`, `runBilling(jobActor,{limit})`. Return Promise of the
respective DTO; render returns escaped HTML string. D1 owns verification of
`jobActor` using a distinct `BILLING_JOB_SECRET`, constant-time comparison, and
redacted logs. No browser may invoke a server service as a job actor.

## Transactional integration contracts (future additive migrations)

D1 owns SQL files; producer owns the following behavior and tests. These names
are reserved service-role-only RPC targets in `public`; no PUBLIC/anon/authenticated
EXECUTE. Use invoker security, qualified names and explicit grants. UUID actor IDs
are injected by verified server code, then checked against current DB role in each
privileged transaction. They are not an exposed untrusted authorization mechanism.

| RPC target / domain owner | Inputs / outputs and atomic responsibility |
|---|---|
| `create_subscription` / D3 | `p_actor_id uuid,p_request_key uuid,p_input jsonb -> jsonb` SubscriptionDTO; verify actor/customer/template/plan, create header/lines or replay original |
| `mutate_subscription` / D3 | `p_actor_id uuid,p_subscription_id uuid,p_expected_version bigint,p_action text,p_input jsonb -> jsonb`; action enum = draft_update/quotation/revise/confirm/activate/pause/resume/close/renew, input matches HTTP; renew includes request_key; lock row, authorize ownership/plan gates, enforce edge, snapshot and schedule |
| `generate_next_invoice` / D4 + D3 | `p_subscription_id uuid -> uuid` invoice ID or null when not due; service-job-only callable; lock active due subscription, create unique next period + line snapshots, advance next_billing_at; never authorize from caller period values |
| `confirm_invoice` / D4 + D2 | `p_actor_id uuid,p_invoice_id uuid,p_expected_version bigint -> jsonb` InvoiceDTO; lock invoice then discount row, reprice tax/discount, validate sums and usage, append redemption and freeze issued snapshot |
| `cancel_invoice` / D4 | `p_actor_id uuid,p_invoice_id uuid,p_expected_version bigint -> jsonb`; lock invoice, reject payments, preserve period uniqueness |
| `record_payment` / D4 | `p_actor_id uuid,p_invoice_id uuid,p_expected_version bigint,p_request_key uuid,p_input jsonb -> jsonb`; lock invoice, check duplicate receipt before version, validate currency/balance, append, update paid state |

Billing runner selects due IDs in bounded batches and calls the transactional
generator. Each transaction rechecks eligibility; concurrent jobs may discover the
same ID safely. Retry errors are logged by subscription ID without advancing its
schedule; return processed/failed counts and keep failures observable. Lock order
is subscription before invoice before discount; payment locks invoice only.
For expiry catch-up, eligibility is the next period start before expiry, even if
the job executes after expiry. Cap the final end at expiry; never create a period
starting at/after it. Auto-close after materializing pending periods. Manual close
must materialize earlier due periods up to closed_at in its transaction before
closing; D3/D4 supply that shared SQL behavior through D1, without cross-module
TypeScript writes. Paused time is excluded from billing.
RPCs return DTO JSON with bigint values serialized as strings. Initial migrations
do not create these RPCs: producers must supply exact payload validators and
transaction tests before implementation can be integrated.

Integration checklist: contract/type names match; customer A cannot access B;
inactive users fail immediately; staff cannot configure rules or invite staff;
same request with same key replays; altered input conflicts; concurrent billing
creates one invoice; concurrent last discount use permits one redemption;
concurrent receipts cannot overpay; partial failures roll back all related rows;
printed historic invoice survives catalog edits; monthly/leap-day anchors work.

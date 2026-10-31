# D4 SQL proposals — invoices, payments, billing runner

**Status: proposal only. Nothing in this file is applied. D1 owns every migration,
migration ordering, generated database types and SQL tests.** D4 supplies the
behavior, payload validation and test cases. D2 must review
`private.price_invoice_draft` arithmetic; D3 must review subscription schedule
advancement and close/pause cutoff behavior; D1 must approve every additive
signature before updating `docs/api-contracts.md` and the generated types.

This proposal deliberately uses the existing tables and triggers from
`20261031050702_initial_schema.sql` and `20261031050705_initial_access_control.sql`.
The `private.stamp_update` trigger already stamps `updated_at` and increments
`version` on every update of `subscriptions` and `invoices`; the functions below
must **not** assign those columns manually.

## 1. Security model and grant changes

- All four public RPCs are `security invoker`, `set search_path = ''`, and use
  qualified names only.
- Only `service_role` may execute them. Revoke from `public`, `anon` and
  `authenticated`.
- The service-role key is server-only. It bypasses RLS but is not authorization:
  every staff RPC re-checks `p_actor_id` against the current, active
  `public.users.role` inside the transaction.
- `public.generate_next_invoice` has no actor argument by design. D1's distinct
  `BILLING_JOB_SECRET` verifier must be the only code allowed to call it. A
  browser session cannot reach it.
- Existing D1 grants already allow `service_role` to select all billing tables
  and insert/update the needed rows. D1 still needs to add:

```sql
-- D1-owned migration; sequence gaps are acceptable.
create sequence public.invoice_number_seq as bigint start 1;

grant usage on schema private to service_role;
grant usage, select on sequence public.invoice_number_seq to service_role;

revoke all on function public.generate_next_invoice(uuid)
  from public, anon, authenticated;
revoke all on function public.confirm_invoice(uuid, uuid, bigint, jsonb)
  from public, anon, authenticated;
revoke all on function public.cancel_invoice(uuid, uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.record_payment(uuid, uuid, bigint, uuid, jsonb, text)
  from public, anon, authenticated;

grant execute on function public.generate_next_invoice(uuid) to service_role;
grant execute on function public.confirm_invoice(uuid, uuid, bigint, jsonb) to service_role;
grant execute on function public.cancel_invoice(uuid, uuid, bigint) to service_role;
grant execute on function public.record_payment(uuid, uuid, bigint, uuid, jsonb, text) to service_role;
```

Every `private.*` helper created below must be revoked from
`public, anon, authenticated` and granted to `service_role` only. Do not add
`private` to the exposed schemas.

### Additive arguments requiring contract review

| RPC | Base contract | D4 additive argument | Why |
|---|---|---|---|
| `confirm_invoice` | `p_actor_id, p_invoice_id, p_expected_version` | `p_customer_snapshot jsonb` | D4 binds D1's staff-only `getBillingContact`; SQL must not read Auth/profile again or trust browser data |
| `record_payment` | `p_actor_id, p_invoice_id, p_expected_version, p_request_key, p_input` | `p_request_fingerprint text` | D1's `fingerprintRequest` is the canonical replay check; SQL stores and compares it |

`docs/api-contracts.md` must be updated by D1 with producer/consumer review before
these signatures are implemented. The service types in
`src/modules/billing/service.ts` already use names `p_customer_snapshot` and
`p_request_fingerprint`.

## 2. Shared private helpers (D1-owned)

```sql
-- Staff/admin check against current database state, never Auth metadata.
create or replace function private.assert_staff(p_actor_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_actor_id is null or not exists (
    select 1
    from public.users u
    where u.id = p_actor_id
      and u.is_active
      and u.role in ('admin', 'internal')
  ) then
    raise exception 'FORBIDDEN: staff access required' using errcode = 'P0001';
  end if;
end;
$$;
```

```sql
-- Strict UTC instant accepted from JSON. D4 validates the same shape in
-- validation.ts; SQL repeats it because the service key is not authorization.
create or replace function private.utc_instant(p_value jsonb, p_field text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_text text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'string' then
    raise exception 'VALIDATION_ERROR: % must be a UTC timestamp', p_field using errcode = 'P0001';
  end if;
  v_text := p_value #>> '{}';
  if v_text !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$' then
    raise exception 'VALIDATION_ERROR: % must be an ISO-8601 UTC timestamp', p_field using errcode = 'P0001';
  end if;
  begin
    return v_text::timestamptz;
  exception when others then
    raise exception 'VALIDATION_ERROR: % is not a valid instant', p_field using errcode = 'P0001';
  end;
end;
$$;
```

```sql
-- Mirrors domain.ts advancePeriod: UTC, anchor day/time, month-end clamp.
create or replace function private.advance_billing_period(
  p_start timestamptz,
  p_interval text,
  p_anchor timestamptz
) returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_year integer;
  v_month integer;
  v_day integer;
  v_last_day integer;
  v_time time;
  v_result timestamptz;
begin
  if p_start is null or p_anchor is null then
    raise exception 'INTERNAL_ERROR: billing period inputs are missing' using errcode = 'P0001';
  end if;

  if p_interval = 'daily' then
    v_result := p_start + interval '1 day';
  elsif p_interval = 'weekly' then
    v_result := p_start + interval '7 days';
  elsif p_interval = 'monthly' then
    v_year := extract(year from (p_start at time zone 'UTC') + interval '1 month')::integer;
    v_month := extract(month from (p_start at time zone 'UTC') + interval '1 month')::integer;
    v_time := (p_anchor at time zone 'UTC')::time;
    v_last_day := extract(
      day from (make_date(v_year, v_month, 1) + interval '1 month - 1 day')
    )::integer;
    v_day := least(
      extract(day from (p_anchor at time zone 'UTC'))::integer,
      v_last_day
    );
    v_result := (make_date(v_year, v_month, v_day) + v_time) at time zone 'UTC';
  elsif p_interval = 'yearly' then
    v_year := extract(year from (p_start at time zone 'UTC'))::integer + 1;
    v_month := extract(month from (p_anchor at time zone 'UTC'))::integer;
    v_time := (p_anchor at time zone 'UTC')::time;
    v_last_day := extract(
      day from (make_date(v_year, v_month, 1) + interval '1 month - 1 day')
    )::integer;
    v_day := least(
      extract(day from (p_anchor at time zone 'UTC'))::integer,
      v_last_day
    );
    v_result := (make_date(v_year, v_month, v_day) + v_time) at time zone 'UTC';
  else
    raise exception 'INTERNAL_ERROR: unsupported billing interval' using errcode = 'P0001';
  end if;

  if v_result <= p_start then
    raise exception 'INTERNAL_ERROR: billing period did not advance' using errcode = 'P0001';
  end if;
  return v_result;
end;
$$;
```

```sql
-- Bigint values and versions are strings at the DTO boundary. Timestamps are
-- always canonical UTC with milliseconds and Z, because D4 parseInstant rejects
-- Postgres' default "+00:00" JSON representation.
create or replace function private.iso_utc(p_value timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

create or replace function private.invoice_dto(p_invoice_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id,
    'number', i.number,
    'subscription_id', i.subscription_id,
    'customer_id', i.customer_id,
    'currency', i.currency,
    'status', i.status,
    'period_start', private.iso_utc(i.period_start),
    'period_end', private.iso_utc(i.period_end),
    'issued_at', case when i.issued_at is null then null else private.iso_utc(i.issued_at) end,
    'due_on', to_char(i.due_on, 'YYYY-MM-DD'),
    'sent_at', case when i.sent_at is null then null else private.iso_utc(i.sent_at) end,
    'subtotal_minor', i.subtotal_minor::text,
    'discount_minor', i.discount_minor::text,
    'tax_minor', i.tax_minor::text,
    'total_minor', i.total_minor::text,
    'paid_minor', coalesce(p.paid_minor, 0)::text,
    'outstanding_minor', (i.total_minor - coalesce(p.paid_minor, 0))::text,
    'version', i.version::text,
    'created_at', private.iso_utc(i.created_at),
    'updated_at', private.iso_utc(i.updated_at),
    -- An unconfirmed draft has no frozen contact yet; D4 expects null, not {}.
    'customer_snapshot',
      case when i.customer_snapshot = '{}'::jsonb then 'null'::jsonb else i.customer_snapshot end,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', il.id,
        'subscription_line_id', il.subscription_line_id,
        'description', il.description,
        'variant_label', il.variant_label,
        'quantity', il.quantity,
        'unit_price_minor', il.unit_price_minor::text,
        'discount_minor', il.discount_minor::text,
        'tax_rule_id', il.tax_rule_id,
        'tax_rate_bps', il.tax_rate_bps,
        'tax_minor', il.tax_minor::text,
        'amount_minor', il.amount_minor::text
      ) order by il.created_at, il.id)
      from public.invoice_lines il
      where il.invoice_id = i.id
    ), '[]'::jsonb)
  )
  from public.invoices i
  left join lateral (
    select coalesce(sum(pay.amount_minor), 0) as paid_minor
    from public.payments pay
    where pay.invoice_id = i.id
  ) p on true
  where i.id = p_invoice_id;
$$;

create or replace function private.payment_dto(p_payment_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'invoice_id', p.invoice_id,
    'customer_id', p.customer_id,
    'currency', p.currency,
    'amount_minor', p.amount_minor::text,
    'method', p.method,
    'paid_at', private.iso_utc(p.paid_at),
    'note', p.note,
    'external_reference', p.external_reference,
    'created_at', private.iso_utc(p.created_at)
  )
  from public.payments p
  where p.id = p_payment_id;
$$;
```

## 3. D2-owned pricing helper (D2 reviews, D1 lands)

D4 must not calculate discount/tax arithmetic in SQL or TypeScript.
`private.price_invoice_draft` is the single D2-reviewed implementation used by
both generation (preview) and confirmation (reservation). It reads the frozen
line snapshots already inserted on the draft and never reprices from the current
plan.

```sql
-- Contract only; D2 supplies the reviewed body and allocation arithmetic.
create or replace function private.price_invoice_draft(
  p_invoice_id uuid,
  p_mode text  -- 'preview' or 'reserve'
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Required behavior:
  -- 1. Caller already holds FOR UPDATE on the invoice (and therefore on its
  --    subscription identity); lock the subscription discount row before
  --    counting redemptions in 'reserve' mode.
  -- 2. Compute effective tax per line from the product's tax rule effective on
  --    the invoice period_start, using integer bps rounding. Leave historical
  --    unit prices/descriptions untouched.
  -- 3. In 'preview' mode compute the discount only if currently eligible but
  --    never lock a use and never insert a redemption.
  -- 4. In 'reserve' mode, after locking the discount row, count existing
  --    redemptions. If the discount is otherwise eligible but max_uses has been
  --    reached by a concurrent confirmation, raise DISCOUNT_EXHAUSTED. Date,
  --    active/currency/minimum ineligibility yields zero discount.
  -- 5. Allocate the discount across eligible lines with exact integer
  --    remainders so sum(line.discount_minor) equals the header discount.
  -- 6. Update invoice_lines discount/tax and invoice header
  --    subtotal/discount/tax. total_minor is generated.
  -- 7. Insert at most one discount_redemptions row for this invoice when the
  --    reserved discount is > 0.
  -- 8. Validate subtotal = sum(quantity * unit_price),
  --    discount = sum(line discount) <= subtotal,
  --    tax = sum(line tax), and total = subtotal - discount + tax.
  raise exception 'INTERNAL_ERROR: D2 pricing helper is not implemented' using errcode = 'P0001';
end;
$$;
```

Open D2/D3 decisions to record in the migration PR:

- Cancelling a confirmed invoice keeps its `discount_redemptions` row (the use
  was spent on an issued document). If the business wants cancellation to
  release a use, D2 must define and test that separate rule.
- A discount that expires between draft preview and confirmation is not a
  reservation. The confirmation transaction recalculates it; only a concurrent
  last-use loss raises `DISCOUNT_EXHAUSTED`.

## 4. `public.generate_next_invoice(p_subscription_id uuid) -> uuid`

One due period per call. The caller may invoke it repeatedly to catch up missed
periods. The subscription row lock serializes manual and scheduler calls; the
unique `(subscription_id, period_start)` constraint is the final guard.

The locked body lives in a private helper so D3's close/pause transaction can
materialize periods up to its cutoff under the same row lock without duplicating
billing logic or writing D4 tables directly.

```sql
-- Callable only by service_role. D3 close/pause calls this inside its own
-- subscription lock while the row is still active, before the final state
-- update. p_cutoff is the pause instant or the already-captured closed_at.
-- Closed schedules never advance: there is deliberately no "allow closed" flag.
create or replace function private.generate_next_invoice_locked(
  p_subscription_id uuid,
  p_cutoff timestamptz
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_interval text;
  v_start timestamptz;
  v_end timestamptz;
  v_cutoff timestamptz;
  v_invoice_id uuid;
  v_number text;
  v_now timestamptz := clock_timestamp();
begin
  if p_subscription_id is null then
    raise exception 'VALIDATION_ERROR: subscription_id is required' using errcode = 'P0001';
  end if;

  select * into v_sub
  from public.subscriptions s
  where s.id = p_subscription_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: subscription not found' using errcode = 'P0001';
  end if;
  if v_sub.status <> 'active' then
    return null;  -- draft/quotation/confirmed/paused/closed create no periods
  end if;
  if v_sub.next_billing_at is null or v_sub.billing_anchor_at is null then
    raise exception 'INTERNAL_ERROR: subscription schedule is missing' using errcode = 'P0001';
  end if;

  v_start := v_sub.next_billing_at;
  if v_start > v_now then
    return null;
  end if;
  -- A period starting at/after expiry is never billed, even for catch-up.
  if v_start < v_sub.start_at or v_start >= v_sub.expires_at then
    return null;
  end if;

  select p.billing_interval into v_interval
  from public.plans p
  where p.id = v_sub.plan_id;
  if v_interval is null then
    raise exception 'INTERNAL_ERROR: subscription plan is missing' using errcode = 'P0001';
  end if;

  v_cutoff := v_sub.expires_at;
  if v_sub.closed_at is not null and v_sub.closed_at < v_cutoff then
    v_cutoff := v_sub.closed_at;
  end if;
  if p_cutoff is not null and p_cutoff < v_cutoff then
    v_cutoff := p_cutoff;
  end if;
  if v_start >= v_cutoff then
    return null;
  end if;

  v_end := private.advance_billing_period(v_start, v_interval, v_sub.billing_anchor_at);
  if v_end > v_cutoff then
    v_end := v_cutoff;  -- final partial period never crosses expiry/close
  end if;
  if v_end <= v_start then
    return null;
  end if;

  if not exists (
    select 1 from public.subscription_lines sl where sl.subscription_id = v_sub.id
  ) then
    raise exception 'INTERNAL_ERROR: subscription has no lines' using errcode = 'P0001';
  end if;

  v_number := 'INV-' || lpad(nextval('public.invoice_number_seq')::text, 10, '0');

  insert into public.invoices (
    number, subscription_id, customer_id, currency, status,
    period_start, period_end, due_on, customer_snapshot
  ) values (
    v_number, v_sub.id, v_sub.customer_id, v_sub.currency, 'draft',
    v_start, v_end,
    (v_start at time zone 'UTC')::date + v_sub.payment_terms_days,
    '{}'::jsonb
  )
  on conflict (subscription_id, period_start) do nothing
  returning id into v_invoice_id;

  -- The subscription row lock serializes callers, so an existing invoice for
  -- the current period means the stored schedule is already inconsistent.
  -- Raise instead of returning the same row: a drain loop must always either
  -- advance next_billing_at or stop, never spin on an unmoved schedule.
  if v_invoice_id is null then
    raise exception 'INTERNAL_ERROR: subscription schedule already has an invoice for this period'
      using errcode = 'P0001';
  end if;

  -- Historical line snapshot: description, variant, quantity and unit price are
  -- copied now; later catalog/subscription edits cannot change this invoice.
  insert into public.invoice_lines (
    invoice_id, subscription_line_id, description, variant_label, quantity,
    unit_price_minor, tax_rule_id, tax_rate_bps, tax_minor, discount_minor
  )
  select
    v_invoice_id, sl.id, sl.description, sl.variant_label, sl.quantity,
    sl.unit_price_minor, null, 0, 0, 0
  from public.subscription_lines sl
  where sl.subscription_id = v_sub.id
  order by sl.created_at, sl.id;

  -- D2 computes tax and preview discount and validates all line/header sums.
  perform private.price_invoice_draft(v_invoice_id, 'preview');

  -- stamp_update increments version/updated_at. One period per call means a
  -- later call naturally materializes the next missed period.
  update public.subscriptions
  set next_billing_at = v_end
  where id = v_sub.id;

  return v_invoice_id;
end;
$$;

create or replace function public.generate_next_invoice(p_subscription_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.generate_next_invoice_locked(p_subscription_id, null);
end;
$$;
```

D3 close/pause contract:

- D3 must hold the subscription `FOR UPDATE` lock and capture ONE cutoff
  (`clock_timestamp()`) after acquiring it. It passes that same instant as
  `p_cutoff` on every drain call.
- Drain while the subscription is still `active`, before the final state update:
  loop the helper until it returns `null`. Each successful call materializes one
  period and advances `next_billing_at`; a period starting at/after
  `min(cutoff, expires_at)` is never billed and its end is capped. Iteration is
  bounded (for example 10,000) so corrupt state raises `INTERNAL_ERROR` instead
  of looping forever.
- Close then performs one final update: `status='closed', closed_at=<cutoff>,
  next_billing_at=null`. Pause performs `status='paused', next_billing_at=null`;
  the baseline schema has no `paused_at` column, so do not persist one. Any
  billing failure rolls back every invoice, line, redemption and state change.
- Closing a draft, quotation, confirmed or paused subscription invents no
  billable periods: the helper only bills `active` rows.
- Resume restarts `billing_anchor_at` and `next_billing_at` at the resume instant
  (no paused catch-up or proration) and never rewrites old invoice periods.
- The helper never pauses, closes, resumes or renumbers a subscription.

Generation rules proven by the SQL tests:

- Paused, closed, draft, expired and not-yet-due subscriptions return `null`.
- A subscription with `next_billing_at < expires_at` is billed even when the job
  runs after `expires_at`; the final `period_end` is capped at `expires_at`.
- Manual and scheduled concurrent calls create one invoice for a period.
- Repeated calls walk one period at a time through missed periods.
- Month-end anchors clamp (`Jan 31 -> Feb 28/29 -> Mar 31`); a leap-day yearly
  anchor returns to Feb 29 in the next leap year.
- Failure in pricing/line insertion rolls back the invoice, lines and schedule
  advance together.
- Every successful call either advances `next_billing_at` past the current
  period or returns `null`; a conflicting stored period raises `INTERNAL_ERROR`
  so a D3 drain loop cannot spin.
- The schedule advance uses the same row lock D3 pause/close must take.

## 5. `public.confirm_invoice(...) -> jsonb`

Additive signature: `p_customer_snapshot jsonb`.

```sql
create or replace function public.confirm_invoice(
  p_actor_id uuid,
  p_invoice_id uuid,
  p_expected_version bigint,
  p_customer_snapshot jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_now timestamptz := clock_timestamp();
  v_email text;
  v_name text;
begin
  perform private.assert_staff(p_actor_id);

  select * into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: invoice not found' using errcode = 'P0001';
  end if;
  if p_expected_version is null or v_invoice.version <> p_expected_version then
    raise exception 'VERSION_CONFLICT: invoice changed' using errcode = 'P0001';
  end if;
  if v_invoice.status <> 'draft' then
    raise exception 'INVALID_TRANSITION: only draft invoices can be confirmed' using errcode = 'P0001';
  end if;

  if p_customer_snapshot is null
     or jsonb_typeof(p_customer_snapshot) <> 'object'
     or (p_customer_snapshot - 'display_name' - 'email') <> '{}'::jsonb
     or not (p_customer_snapshot ? 'display_name')
     or not (p_customer_snapshot ? 'email')
     or jsonb_typeof(p_customer_snapshot->'display_name') <> 'string'
     or jsonb_typeof(p_customer_snapshot->'email') <> 'string' then
    raise exception 'VALIDATION_ERROR: customer snapshot is invalid' using errcode = 'P0001';
  end if;
  v_name := p_customer_snapshot->>'display_name';
  v_email := btrim(p_customer_snapshot->>'email');
  if length(v_name) > 200
     or length(v_email) < 3
     or length(v_email) > 320
     or position('@' in v_email) <= 1 then
    raise exception 'VALIDATION_ERROR: customer snapshot is invalid' using errcode = 'P0001';
  end if;

  -- Locks the subscription discount and performs the D2-reviewed reprice.
  -- This can raise DISCOUNT_EXHAUSTED without changing invoice status.
  perform private.price_invoice_draft(p_invoice_id, 'reserve');

  select * into v_invoice
  from public.invoices i
  where i.id = p_invoice_id;
  if not exists (
    select 1 from public.invoice_lines il where il.invoice_id = p_invoice_id
  ) then
    raise exception 'INTERNAL_ERROR: invoice has no lines' using errcode = 'P0001';
  end if;

  update public.invoices
  set status = 'confirmed',
      issued_at = v_now,
      customer_snapshot = jsonb_build_object(
        'display_name', v_name,
        'email', v_email
      )
  where id = p_invoice_id;

  return private.invoice_dto(p_invoice_id);
end;
$$;
```

Notes:

- D4's service preflights status, but the RPC is authoritative and repeats every
  check under lock.
- The frozen snapshot is copied from D1 `getBillingContact` and validated again;
  later profile/Auth edits cannot alter it.
- Printing does not call this function and never sets `issued_at`.

## 6. `public.cancel_invoice(...) -> jsonb`

```sql
create or replace function public.cancel_invoice(
  p_actor_id uuid,
  p_invoice_id uuid,
  p_expected_version bigint
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  perform private.assert_staff(p_actor_id);

  select * into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: invoice not found' using errcode = 'P0001';
  end if;
  if p_expected_version is null or v_invoice.version <> p_expected_version then
    raise exception 'VERSION_CONFLICT: invoice changed' using errcode = 'P0001';
  end if;
  if v_invoice.status not in ('draft', 'confirmed') then
    raise exception 'INVALID_TRANSITION: invoice cannot be cancelled' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.payments p where p.invoice_id = p_invoice_id
  ) then
    raise exception 'INVALID_TRANSITION: invoice has recorded payments' using errcode = 'P0001';
  end if;

  -- The row and its (subscription_id, period_start) key are retained, so a
  -- cancellation can never free the period for a second invoice.
  update public.invoices
  set status = 'cancelled'
  where id = p_invoice_id;

  return private.invoice_dto(p_invoice_id);
end;
$$;
```

A cancelled draft keeps `issued_at = null` and stays staff-only. A cancelled
previously issued invoice keeps its `issued_at` and remains visible to its owner.

## 7. `public.record_payment(...) -> jsonb`

Additive signature: `p_request_fingerprint text`.

```sql
create or replace function public.record_payment(
  p_actor_id uuid,
  p_invoice_id uuid,
  p_expected_version bigint,
  p_request_key uuid,
  p_input jsonb,
  p_request_fingerprint text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_payment_id uuid;
  v_existing public.payments%rowtype;
  v_amount bigint;
  v_paid bigint;
  v_outstanding bigint;
  v_currency text;
  v_method text;
  v_paid_at timestamptz;
  v_note text;
  v_reference text;
  v_now timestamptz := clock_timestamp();
begin
  perform private.assert_staff(p_actor_id);

  if p_request_key is null
     or p_request_fingerprint is null
     or p_request_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'VALIDATION_ERROR: invalid idempotency input' using errcode = 'P0001';
  end if;

  -- Lock the invoice before any balance decision. The idempotency lookup below
  -- deliberately runs before expected-version and balance checks so a retry of
  -- an earlier partial receipt still replays successfully.
  select * into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: invoice not found' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.payments p
  where p.recorded_by = p_actor_id
    and p.request_key = p_request_key;

  if found then
    if v_existing.request_fingerprint <> p_request_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT: request key was reused with different input'
        using errcode = 'P0001';
    end if;
    if v_existing.invoice_id <> p_invoice_id then
      raise exception 'IDEMPOTENCY_CONFLICT: request key belongs to another invoice'
        using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'payment', private.payment_dto(v_existing.id),
      'invoice', private.invoice_dto(p_invoice_id)
    );
  end if;

  if p_expected_version is null or v_invoice.version <> p_expected_version then
    raise exception 'VERSION_CONFLICT: invoice changed' using errcode = 'P0001';
  end if;
  if v_invoice.status <> 'confirmed' then
    raise exception 'INVALID_TRANSITION: payments require a confirmed invoice'
      using errcode = 'P0001';
  end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'VALIDATION_ERROR: payment input is invalid' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_input) k
    where k not in ('amount_minor','currency','method','paid_at','note','external_reference')
  ) then
    raise exception 'VALIDATION_ERROR: unknown payment field' using errcode = 'P0001';
  end if;

  if (p_input->'amount_minor') is null
     or jsonb_typeof(p_input->'amount_minor') <> 'string'
     or (p_input->>'amount_minor') !~ '^[1-9][0-9]{0,15}$' then
    raise exception 'VALIDATION_ERROR: amount_minor is invalid' using errcode = 'P0001';
  end if;
  v_amount := (p_input->>'amount_minor')::bigint;
  if v_amount > 9000000000000000 then
    raise exception 'VALIDATION_ERROR: amount_minor is out of range' using errcode = 'P0001';
  end if;

  v_currency := p_input->>'currency';
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' or v_currency <> v_invoice.currency then
    raise exception 'VALIDATION_ERROR: payment currency must match the invoice'
      using errcode = 'P0001';
  end if;

  v_method := p_input->>'method';
  if v_method is null or v_method not in ('bank_transfer','cash','card','other') then
    raise exception 'VALIDATION_ERROR: invalid payment method' using errcode = 'P0001';
  end if;

  v_paid_at := private.utc_instant(p_input->'paid_at', 'paid_at');
  if v_paid_at > v_now + interval '5 minutes' then
    raise exception 'VALIDATION_ERROR: paid_at cannot be in the future' using errcode = 'P0001';
  end if;

  v_note := btrim(coalesce(p_input->>'note', ''));
  -- Stricter than D4's transport check: any control character is rejected.
  if (p_input ? 'note' and jsonb_typeof(p_input->'note') not in ('string', 'null'))
     or length(v_note) > 2000
     or v_note ~ '[[:cntrl:]]'
     or v_note ~ '[0-9]([ -]?[0-9]){12,18}' then
    raise exception 'VALIDATION_ERROR: payment note is invalid' using errcode = 'P0001';
  end if;

  if p_input ? 'external_reference' and p_input->'external_reference' <> 'null'::jsonb then
    if jsonb_typeof(p_input->'external_reference') <> 'string' then
      raise exception 'VALIDATION_ERROR: external_reference is invalid' using errcode = 'P0001';
    end if;
    v_reference := btrim(p_input->>'external_reference');
    if length(v_reference) < 1
       or length(v_reference) > 200
       or v_reference ~ '[[:cntrl:]]' then
      raise exception 'VALIDATION_ERROR: external_reference is invalid' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(sum(p.amount_minor), 0) into v_paid
  from public.payments p
  where p.invoice_id = p_invoice_id;

  v_outstanding := v_invoice.total_minor - v_paid;
  if v_amount > v_outstanding then
    raise exception 'PAYMENT_EXCEEDS_BALANCE: payment exceeds outstanding balance'
      using errcode = 'P0001';
  end if;

  begin
    insert into public.payments (
      invoice_id, customer_id, currency, amount_minor, method, paid_at, note,
      external_reference, recorded_by, request_key, request_fingerprint
    ) values (
      p_invoice_id, v_invoice.customer_id, v_invoice.currency, v_amount, v_method,
      v_paid_at, v_note, v_reference, p_actor_id, p_request_key, p_request_fingerprint
    )
    returning id into v_payment_id;
  exception when unique_violation then
    -- Concurrent identical retry, or an external reference already used by a
    -- different request. Re-read and replay only an exact same-key match.
    select * into v_existing
    from public.payments p
    where p.recorded_by = p_actor_id
      and p.request_key = p_request_key;

    if found
       and v_existing.request_fingerprint = p_request_fingerprint
       and v_existing.invoice_id = p_invoice_id then
      return jsonb_build_object(
        'payment', private.payment_dto(v_existing.id),
        'invoice', private.invoice_dto(p_invoice_id)
      );
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT: duplicate receipt reference'
      using errcode = 'P0001';
  end;

  -- stamp_update increments version/updated_at on every new receipt.
  update public.invoices
  set status = case
    when v_paid + v_amount = total_minor then 'paid'
    else 'confirmed'
  end
  where id = p_invoice_id;

  return jsonb_build_object(
    'payment', private.payment_dto(v_payment_id),
    'invoice', private.invoice_dto(p_invoice_id)
  );
end;
$$;
```

Important details:

- `paid_minor` and `outstanding_minor` are always derived from the append-only
  payment rows in `private.invoice_dto`; they are never trusted from the caller.
- A partial payment leaves the invoice `confirmed`; exact settlement moves it to
  `paid`. No payment is accepted on draft, cancelled or already-paid invoices.
- Duplicate `(recorded_by, request_key)` returns the original payment even with a
  stale `If-Match`; altered input conflicts. The unique `external_reference`
  additionally prevents cross-staff double entry.
- Invoice lock serialization prevents two different requests from overpaying.
- The payment note check rejects card-like digit runs as defense in depth; D4's
  strict transport validation is still required.

## 8. Bounded due-subscription selection (D1 read binding)

D4's runner only asks for a bounded batch. D1 may implement this as a
service-role query or a small read-only RPC. It must not expose customer data.

```sql
select s.id
from public.subscriptions s
where s.status = 'active'
  and s.next_billing_at is not null
  and s.next_billing_at <= clock_timestamp()
  and s.next_billing_at < s.expires_at
order by s.next_billing_at, s.id
limit least(greatest($1, 1), 500);
```

`has_more` may be computed with `limit + 1` and slicing, or by repeating the
query with the same ordering. Each ID is re-checked under lock by
`generate_next_invoice`, so duplicate discovery across concurrent jobs is safe.
Log failures by subscription ID and a safe code only; never log raw errors,
customer data or payment values.

## 9. Read-side requirements for D1 bindings

`readInvoices`, `readInvoice`, `readPayments` and `readReport` must:

- Scope a customer to `customer_id = actor.id`, require `issued_at is not null`
  and `status <> 'draft'`, and never return another customer's IDs.
- Keep `customer_snapshot` customer-visible only (`display_name`, `email`); no
  Auth objects, internal notes or cost fields.
- Return `paid_minor`/`outstanding_minor` derived from payment totals, and order
  invoice lists newest `(created_at, id)` first and payments by
  `(paid_at desc, id)`.
- Use keyset pagination matching D1's shared `Page` contract.
- For reports, keep each currency in its own bucket; `billed` filters
  `issued_at` in `[from,to)`, `collected` filters `paid_at` in `[from,to)`,
  while outstanding/overdue/active count are current `as_of` snapshots.
  Exclude draft and cancelled invoices from billed totals. Status filters apply
  to invoice measures only; active count stays `status = 'active'`.

## 10. Required real-database tests (D1-owned `supabase/tests/billing.sql`)

These cannot be replaced by the TypeScript unit tests. Use real roles and
connections; do not mock SQL.

1. **Privileges:** `anon` and `authenticated` receive permission denied for all
   four RPCs; `service_role` can execute; a customer UUID passed as
   `p_actor_id` receives `FORBIDDEN`; an inactive internal user is rejected.
2. **RLS isolation:** customer A cannot select customer B's invoice, invoice
   lines or payments as `authenticated`; customer A can read only own issued
   non-draft rows; a cancelled unissued draft stays hidden.
3. **Generation:** active due subscription creates exactly one draft with the
   correct period, due date, line snapshot and advanced `next_billing_at`;
   duplicate calls in the same period return `NOT_DUE`/`null`; two concurrent
   sessions produce one invoice.
4. **Catch-up and boundaries:** repeated calls recover successive missed
   periods; a period starting at/after expiry is not billed; the final period is
   capped at expiry; paused/closed/draft subscriptions do not bill; close
   serializes with generation; Jan 31, Feb 28/29 and yearly leap-day anchors are
   correct.
5. **Close/pause drain:** a single captured cutoff drains every due period
   (`period_start < min(cutoff, expires_at)`) with strictly increasing
   `next_billing_at`, no duplicate periods and a capped final end; closing a
   draft/quotation/confirmed/paused row invents nothing; concurrent pause/close
   versus billing serializes on the subscription row; a forced billing failure
   rolls back the close/pause and all invoices; the loop is bounded and a stored
   period/invoice inconsistency raises instead of repeating.
6. **Rollback:** force a line/pricing error and prove no invoice, line, redemption
   or schedule advance survives.
7. **Confirmation:** stale version conflicts; non-draft rejects; totals equal
   line sums; snapshot is frozen and survives a later profile edit; tax/discount
   changes are recalculated; cancellation retains `(subscription_id,
   period_start)` uniqueness.
8. **Discount:** one remaining use yields one redemption across concurrent
   confirmations; the loser gets `DISCOUNT_EXHAUSTED`; redemption amount equals
   header discount; a cancelled issued invoice retains its redemption.
9. **Payments:** partial payment stays confirmed; exact balance marks paid;
   overpayment rejects; concurrent receipts cannot overpay; same request key and
   input replays after a stale version; same key with altered input conflicts;
   duplicate external reference across staff conflicts; the whole operation
   rolls back on insert/update failure.
10. **Historical snapshot:** print/read an issued invoice after catalog price,
    tax and subscription description edits; all amounts and lines are unchanged.
11. **Reports:** mixed currencies never aggregate; `from` inclusive / `to`
    exclusive; overdue uses `due_on < current UTC date` and outstanding > 0;
    draft/cancelled invoices are excluded from billed totals.

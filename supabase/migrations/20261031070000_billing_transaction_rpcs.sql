-- D1-owned migration: transactional billing RPCs.
--
-- Source of proposal: src/modules/billing/SQL-PROPOSALS.md (producer D4), with
--   private.generate_next_invoice_locked(p_subscription_id uuid, p_cutoff timestamptz)
--   reconciled after D3 review (the p_allow_closed flag was removed; D3 drains
--   while the subscription is still active before the final state update).
--
-- Producer/consumer review: D1 approved the additive signatures landed here after
--   producer (D4) review; docs/api-contracts.md was updated in the same change.
-- D2 owns the private.price_invoice_draft body (reviewed arithmetic); D3 owns the
--   subscription schedule advancement / close-cutoff behavior. This migration adds
--   only the additive, service-role-only, security-invoker transaction boundary.

create sequence public.invoice_number_seq as bigint start 1;

grant usage on schema private to service_role;
grant usage, select on sequence public.invoice_number_seq to service_role;

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

-- Strict UTC instant accepted from JSON. D4 validates the same shape in
-- validation.ts; SQL repeats it because the service key is not authorization.
create or replace function private.utc_instant(p_value jsonb, p_field text)
returns timestamptz
language plpgsql
stable
security invoker
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

-- Mirrors domain.ts advancePeriod: UTC, anchor day/time, month-end clamp.
create or replace function private.advance_billing_period(
  p_start timestamptz,
  p_interval text,
  p_anchor timestamptz
) returns timestamptz
language plpgsql
stable
security invoker
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

-- Canonical UTC millisecond text for JSON DTO boundaries.
create or replace function private.iso_utc(p_value timestamptz)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select to_char(p_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

create or replace function private.invoice_dto(p_invoice_id uuid)
returns jsonb
language sql
stable
security invoker
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
security invoker
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

-- D2-owned pricing helper (D2 supplies the reviewed body and allocation
-- arithmetic; D1 lands the additive contract before D2 fills the body).
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

-- Shared billing generator. D3 close/pause calls this inside its own
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
  v_now timestamptz;
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
  v_now := clock_timestamp();
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

-- Private helpers are callable only by service_role after creation.
revoke all on function private.assert_staff(uuid) from public, anon, authenticated;
revoke all on function private.utc_instant(jsonb, text) from public, anon, authenticated;
revoke all on function private.advance_billing_period(timestamptz, text, timestamptz) from public, anon, authenticated;
revoke all on function private.iso_utc(timestamptz) from public, anon, authenticated;
revoke all on function private.invoice_dto(uuid) from public, anon, authenticated;
revoke all on function private.payment_dto(uuid) from public, anon, authenticated;
revoke all on function private.price_invoice_draft(uuid, text) from public, anon, authenticated;
revoke all on function private.generate_next_invoice_locked(uuid, timestamptz) from public, anon, authenticated;

grant execute on function private.assert_staff(uuid) to service_role;
grant execute on function private.utc_instant(jsonb, text) to service_role;
grant execute on function private.advance_billing_period(timestamptz, text, timestamptz) to service_role;
grant execute on function private.iso_utc(timestamptz) to service_role;
grant execute on function private.invoice_dto(uuid) to service_role;
grant execute on function private.payment_dto(uuid) to service_role;
grant execute on function private.price_invoice_draft(uuid, text) to service_role;
grant execute on function private.generate_next_invoice_locked(uuid, timestamptz) to service_role;

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

-- Billing confirmation: lock invoice, reprice via D2-reviewed helper,
-- validate sums, append redemption and freeze issued snapshot atomically.
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
  -- Lock order: in the D3 close/pause path the holding transaction already took
  -- the subscription FOR UPDATE before invoice materialization, so the effective
  -- subscription -> invoice -> discount ordering is preserved; confirmation takes
  -- the invoice lock here before the pricing helper locks the discount.
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
  set status = case when total_minor = 0 then 'paid' else 'confirmed' end,
      issued_at = v_now,
      customer_snapshot = jsonb_build_object(
        'display_name', v_name,
        'email', v_email
      )
  where id = p_invoice_id;

  return private.invoice_dto(p_invoice_id);
end;
$$;

-- Invoice cancellation: reject any recorded payment, retain period key.
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

-- Verified payment receipt: idempotency first, then version/balance checks,
-- atomic append and paid-state transition.
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

-- Service-role-only execution for the public billing RPCs (created above).
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

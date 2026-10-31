# D2 SQL proposal: invoice draft pricing

**Status: proposal only. D1 owns migration ordering, integration and SQL tests.**
This body fills the reserved signature
`private.price_invoice_draft(p_invoice_id uuid, p_mode text) returns void`.
It is designed for the tables in `20261031050702_initial_schema.sql` and the
call pattern in D4's billing proposal. The caller MUST already hold the invoice
row `FOR UPDATE`; generation holds subscription then invoice, while confirmation
holds invoice and then this function locks discount. Confirmation deliberately
does not lock subscription, so its lock order is invoice -> discount. Never add a
subscription lock here or reverse those orders.

Money uses bigint minor units and `numeric` only for overflow-safe integer
products/division, never floating point. Tax and percentage discount use
half-up/half-away-from-zero rounding for nonnegative amounts:
`floor((amount * bps + 5000) / 10000)`. Tax applies after each line discount.
Product tax is effective when `starts_on <= invoice.period_start UTC date` and
`ends_on IS NULL OR ends_on >= that date`; an inactive, not-yet-effective, or
expired rule yields no tax. Historical line unit prices/descriptions are never
rewritten.

The TypeScript preview contract carries two independent UTC instants:
`period_start` selects the tax effective date exactly as above; `at` is the
server pricing instant for discount windows. For draft preview, invoice id is the
only caller resource input; currency, period_start and frozen lines come from
the authoritative invoice read, and `at` comes from the server clock. Current
discount `used_count` comes from the current redemption ledger count. A preview
is advisory and is never persisted as a reservation; SQL confirmation rechecks
all values under the transaction locks.

Draft invoice lines preserve the prices, descriptions, labels and quantities
copied by generation. They are not a tax/discount reservation: preview and
confirmation resolve the current product tax assignment and current discount
mapping against the invoice period and current rule data. Confirmation therefore
rechecks tax, mapping and discount eligibility; it never reads current plan price
or rewrites the invoice line's historical commercial snapshots.

Discount minimum quantity and subtotal are checked against the eligible scope:
mapped products for product-scoped discounts, all invoice lines for
subscription-scoped discounts. A product-scoped discount with no mappings is
ineligible. Date windows use `starts_at <= transaction time < ends_at`.
Active/date/currency/minimum/scope ineligibility means zero discount. Percentage
discounts round once on eligible subtotal; fixed discount is capped at that
subtotal. Allocate proportional integer floors, then distribute remainder cents
by ascending invoice line UUID, respecting each line's remaining capacity.

In reserve mode an existing redemption for this invoice is treated idempotently
and its original amount is retained; its recorded `discount_id`, not a changed
subscription discount, controls allocation scope. Preview performs a non-locking
usage count and shows zero discount if `max_uses` is already reached. This count
is an estimate; if another confirmation consumes the last use after preview,
reserve is authoritative and raises `DISCOUNT_EXHAUSTED`. Preview never locks or
inserts a redemption. D4 cancellation retains an already-created redemption: the
use was consumed at confirmation. Duplicate insertion is unreachable in valid
flow because the caller holds invoice `FOR UPDATE` and the helper checks the
unique invoice redemption before insert.

```sql
create or replace function private.price_invoice_draft(
  p_invoice_id uuid,
  p_mode text
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_discount_id uuid;
  v_discount public.discounts%rowtype;
  v_existing public.discount_redemptions%rowtype;
  v_has_existing boolean := false;
  v_now timestamptz := clock_timestamp();
  v_period_date date;
  v_subtotal bigint := 0;
  v_candidate_discount bigint := 0;
  v_discount_total bigint := 0;
  v_tax_total bigint := 0;
  v_quantity bigint := 0;
  v_eligible_subtotal bigint := 0;
  v_eligible_quantity bigint := 0;
  v_max_uses bigint;
  v_used bigint;
  v_target numeric := 0;
  v_assigned numeric := 0;
  v_remainder numeric := 0;
  v_capacity numeric := 0;
  v_piece numeric := 0;
  v_rate integer;
  v_tax_id uuid;
  v_line record;
  v_total numeric;
begin
  if p_invoice_id is null or p_mode not in ('preview', 'reserve') then
    raise exception 'VALIDATION_ERROR: invalid pricing invoice or mode' using errcode = 'P0001';
  end if;
  select i.* into v_invoice from public.invoices i where i.id = p_invoice_id;
  if not found then
    raise exception 'NOT_FOUND: invoice not found' using errcode = 'P0001';
  end if;
  if v_invoice.status <> 'draft' then
    raise exception 'INVALID_TRANSITION: only draft invoices can be priced' using errcode = 'P0001';
  end if;
  v_period_date := (v_invoice.period_start at time zone 'UTC')::date;

  if exists (select 1 from public.discount_redemptions r where r.invoice_id = p_invoice_id) then
    select r.* into v_existing from public.discount_redemptions r where r.invoice_id = p_invoice_id;
    v_has_existing := true;
    v_discount_total := v_existing.amount_minor;
    v_discount_id := v_existing.discount_id;
  else
    select s.discount_id into v_discount_id from public.subscriptions s where s.id = v_invoice.subscription_id;
  end if;

  -- The only lock acquired by this helper is discount, and only in reserve
  -- mode. Caller already holds invoice. Do not lock subscription here.
  if v_discount_id is not null then
    if p_mode = 'reserve' and not v_has_existing then
      select d.* into v_discount from public.discounts d where d.id = v_discount_id for update;
    else
      select d.* into v_discount from public.discounts d where d.id = v_discount_id;
    end if;
  end if;

  if exists (select 1 from public.invoice_lines l where l.invoice_id = p_invoice_id) is false then
    raise exception 'INTERNAL_ERROR: invoice has no lines' using errcode = 'P0001';
  end if;

  select coalesce(sum(l.quantity::numeric * l.unit_price_minor), 0)::bigint,
         coalesce(sum(l.quantity), 0)::bigint
    into v_subtotal, v_quantity
  from public.invoice_lines l where l.invoice_id = p_invoice_id;
  if v_subtotal > 9000000000000000 then
    raise exception 'VALIDATION_ERROR: invoice subtotal exceeds supported range' using errcode = 'P0001';
  end if;

  if v_discount_id is not null and v_discount.id is not null and not v_has_existing then
    select coalesce(sum(l.quantity::numeric * l.unit_price_minor), 0)::bigint,
           coalesce(sum(l.quantity), 0)::bigint
      into v_eligible_subtotal, v_eligible_quantity
    from public.invoice_lines l
    join public.subscription_lines sl on sl.id = l.subscription_line_id
    where l.invoice_id = p_invoice_id
      and (v_discount.scope = 'subscription' or exists (
        select 1 from public.discount_products dp
        where dp.discount_id = v_discount.id and dp.product_id = sl.product_id
      ));

    if v_discount.is_active
       and v_now >= v_discount.starts_at
       and (v_discount.ends_at is null or v_now < v_discount.ends_at)
       and (v_discount.currency is null or v_discount.currency = v_invoice.currency)
       and v_eligible_subtotal >= v_discount.min_subtotal_minor
       and v_eligible_quantity >= v_discount.min_quantity
       and (v_discount.scope <> 'product' or exists (
         select 1 from public.discount_products dp where dp.discount_id = v_discount.id
       )) then
      if v_discount.kind = 'fixed' then
        if v_discount.currency = v_invoice.currency then
          v_target := least(v_discount.amount_minor::numeric, v_eligible_subtotal::numeric);
        end if;
      elsif v_discount.kind = 'percentage' then
        v_target := floor((v_eligible_subtotal::numeric * v_discount.percent_bps + 5000) / 10000);
      else
        raise exception 'INTERNAL_ERROR: invalid discount kind' using errcode = 'P0001';
      end if;

      if v_target > 0 and v_discount.max_uses is not null then
        select count(*) into v_used from public.discount_redemptions r where r.discount_id = v_discount.id;
        if p_mode = 'preview' and v_used >= v_discount.max_uses then
          v_target := 0;
        elsif p_mode = 'reserve' and v_used >= v_discount.max_uses then
          raise exception 'DISCOUNT_EXHAUSTED: no discount uses remain' using errcode = 'P0001';
        end if;
      end if;
      v_candidate_discount := v_target::bigint;
    end if;
  end if;

  -- Proportional floors followed by a deterministic UUID ordered remainder.
  -- Each eligible line can absorb no more than its own gross line amount.
  if v_has_existing then
    -- A previously reserved discount is immutable and must be allocated using
    -- its recorded amount even if current catalog rules have since changed.
    v_candidate_discount := v_discount_total;
    select d.* into v_discount from public.discounts d where d.id = v_discount_id;
    select coalesce(sum(l.quantity::numeric * l.unit_price_minor),0)::bigint
      into v_eligible_subtotal
    from public.invoice_lines l
    join public.subscription_lines sl on sl.id = l.subscription_line_id
    where l.invoice_id = p_invoice_id
      and (v_discount.scope = 'subscription' or exists (
        select 1 from public.discount_products dp
        where dp.discount_id = v_discount_id and dp.product_id = sl.product_id
      ));
  end if;

  if v_candidate_discount > 0 then
    for v_line in
      select l.id, l.quantity::numeric * l.unit_price_minor as gross,
             (v_discount.scope = 'subscription' or exists (
               select 1 from public.discount_products dp
               join public.subscription_lines sl on sl.product_id = dp.product_id
               where dp.discount_id = v_discount_id and sl.id = l.subscription_line_id
             )) as eligible
      from public.invoice_lines l where l.invoice_id = p_invoice_id
      order by l.id
    loop
      if v_line.eligible and v_eligible_subtotal > 0 then
        v_piece := floor(v_candidate_discount::numeric * v_line.gross / v_eligible_subtotal);
        update public.invoice_lines l set discount_minor = v_piece::bigint where l.id = v_line.id;
        v_assigned := v_assigned + v_piece;
      else
        update public.invoice_lines l set discount_minor = 0 where l.id = v_line.id;
      end if;
    end loop;
    v_remainder := v_candidate_discount::numeric - v_assigned;
    for v_line in
      select l.id, l.quantity::numeric * l.unit_price_minor as gross
      from public.invoice_lines l
      join public.subscription_lines sl on sl.id = l.subscription_line_id
      where l.invoice_id = p_invoice_id
        and (v_discount.scope = 'subscription' or exists (
          select 1 from public.discount_products dp
          where dp.discount_id = v_discount_id and dp.product_id = sl.product_id
        ))
      order by l.id
    loop
      exit when v_remainder = 0;
      select (l.quantity::numeric * l.unit_price_minor - l.discount_minor) into v_capacity
      from public.invoice_lines l where l.id = v_line.id;
      v_piece := least(v_capacity, v_remainder);
      update public.invoice_lines l set discount_minor = l.discount_minor + v_piece::bigint where l.id = v_line.id;
      v_remainder := v_remainder - v_piece;
    end loop;
    if v_remainder <> 0 then
      raise exception 'INTERNAL_ERROR: discount remainder could not be allocated' using errcode = 'P0001';
    end if;
  else
    update public.invoice_lines l set discount_minor = 0 where l.invoice_id = p_invoice_id;
  end if;

  -- Derive tax from current product assignment, then select its rule only if
  -- effective for this invoice's historical period start.
  for v_line in
    select l.id, l.quantity, l.unit_price_minor, l.discount_minor,
           p.tax_rule_id, tr.rate_bps, tr.starts_on, tr.ends_on,
           tr.is_active as tax_is_active
    from public.invoice_lines l
    join public.subscription_lines sl on sl.id = l.subscription_line_id
    join public.products p on p.id = sl.product_id
    left join public.tax_rules tr on tr.id = p.tax_rule_id
    where l.invoice_id = p_invoice_id
    order by l.id
  loop
    v_tax_id := null;
    v_rate := 0;
    if v_line.tax_rule_id is not null and v_line.tax_is_active is true
       and v_line.starts_on <= v_period_date
       and (v_line.ends_on is null or v_line.ends_on >= v_period_date) then
      v_tax_id := v_line.tax_rule_id;
      v_rate := v_line.rate_bps;
    end if;
    v_total := floor(((v_line.quantity::numeric * v_line.unit_price_minor - v_line.discount_minor) * v_rate + 5000) / 10000);
    if v_total > 9000000000000000 then
      raise exception 'VALIDATION_ERROR: invoice tax exceeds supported range' using errcode = 'P0001';
    end if;
    update public.invoice_lines l
    set tax_rule_id = v_tax_id, tax_rate_bps = v_rate, tax_minor = v_total::bigint
    where l.id = v_line.id;
    v_tax_total := v_tax_total + v_total::bigint;
  end loop;

  select coalesce(sum(l.discount_minor),0)::bigint, coalesce(sum(l.tax_minor),0)::bigint
    into v_discount_total, v_tax_total
  from public.invoice_lines l where l.invoice_id = p_invoice_id;
  if v_discount_total > v_subtotal or v_tax_total > 9000000000000000 then
    raise exception 'VALIDATION_ERROR: invoice discount or tax is out of range' using errcode = 'P0001';
  end if;
  update public.invoices i
  set subtotal_minor = v_subtotal, discount_minor = v_discount_total, tax_minor = v_tax_total
  where i.id = p_invoice_id;

  if (select coalesce(sum(l.quantity::numeric * l.unit_price_minor),0) from public.invoice_lines l where l.invoice_id=p_invoice_id) <> v_subtotal
     or (select coalesce(sum(l.discount_minor),0) from public.invoice_lines l where l.invoice_id=p_invoice_id) <> v_discount_total
     or (select coalesce(sum(l.tax_minor),0) from public.invoice_lines l where l.invoice_id=p_invoice_id) <> v_tax_total
     or (select i.total_minor from public.invoices i where i.id=p_invoice_id) <> v_subtotal - v_discount_total + v_tax_total then
    raise exception 'INTERNAL_ERROR: invoice totals do not equal line totals' using errcode = 'P0001';
  end if;

  if p_mode = 'reserve' and not v_has_existing and v_discount_total > 0 then
    insert into public.discount_redemptions(discount_id, invoice_id, amount_minor)
    values (v_discount_id, p_invoice_id, v_discount_total);
  end if;
exception
  when sqlstate 'P0001' then raise;
  when numeric_value_out_of_range then
    raise exception 'VALIDATION_ERROR: pricing aggregate exceeds supported range' using errcode = 'P0001';
  when others then
    raise exception 'INTERNAL_ERROR: invoice pricing failed' using errcode = 'P0001';
end;
$$;
```

## Required SQL test cases for D1

Run as real PostgreSQL/Supabase SQL in a disposable local database; these are
cases to implement in D1-owned `supabase/tests/billing.sql`, not tests executed by
this proposal author.

1. Preview computes line/header totals but inserts no redemption and does not
   lock the discount row; its read-only usage count yields zero when the cap is
   already spent. Reserve inserts one positive redemption; repeated reserve for
   the same invoice never duplicates. If another confirmation consumes the last
   use after preview, reserve raises DISCOUNT_EXHAUSTED.
2. Two concurrent confirmations race for the last use: the discount row lock
   serializes them, exactly one positive redemption commits, and the loser gets
   `P0001 DISCOUNT_EXHAUSTED`; a transaction failure rolls back line/header
   writes and redemption.
3. Tax and percentage half-cent rounding follows the documented +5000 integer
   rule; allocation remainder goes to ascending invoice line UUIDs and exact
   line discount sum equals the header, including fixed discount capped to
   eligible subtotal.
4. Tax effective date uses UTC invoice period_start and current product tax
   assignment; starts_on is inclusive,
   ends_on is inclusive, inactive/expired/not-yet-effective rules yield zero;
   unit prices and descriptions remain identical after repricing.
   Include a period_start immediately before UTC midnight with `at` after
   midnight and a tax starts_on boundary: tax follows the UTC period_start date
   while discount windows follow `at`.
5. Discount minimum subtotal/quantity, currency mismatch, inactive/date windows,
   product mapping and empty product mapping produce zero; product-scoped
   discounts affect mapped lines only; subscription scope affects all lines.
   After confirmation, changing subscription.discount_id does not change an
   existing redemption's discount id, amount, or allocation scope.
6. Validate empty invoice, invalid mode, missing invoice, wrong status, bad
   discount schema state, aggregate overflow and invariant mismatch map to the
   documented `P0001` code prefix; caller-held invoice lock plus reserve discount
   lock respects subscription -> invoice -> discount for generation and invoice
   -> discount for confirmation. Verify same-invoice concurrent reserve calls
   cannot create duplicate redemption rows under the invoice lock.

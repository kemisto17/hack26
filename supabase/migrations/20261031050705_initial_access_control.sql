begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- Definer avoids recursive users RLS; no caller-supplied ID or role is accepted.
create function private.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select u.role from public.users u
  where u.id = (select auth.uid()) and u.is_active;
$$;
revoke all on function private.current_app_role() from public, anon, authenticated;
grant execute on function private.current_app_role() to authenticated;

create function private.bootstrap_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users(id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name',''),200));
  return new;
end;
$$;
revoke all on function private.bootstrap_auth_user() from public, anon, authenticated, service_role;
create trigger hack26_auth_user_created after insert on auth.users
for each row execute function private.bootstrap_auth_user();

-- Supports installation after signup without trusting existing role metadata.
insert into public.users(id, display_name)
select id, left(coalesce(raw_user_meta_data ->> 'display_name',''),200) from auth.users
on conflict (id) do nothing;

create function private.stamp_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.created_at := old.created_at;
  new.updated_at := clock_timestamp();
  new.version := old.version + 1;
  return new;
end;
$$;
revoke all on function private.stamp_update() from public, anon, authenticated, service_role;

grant usage on schema public to authenticated, service_role;
do $$
declare t text;
begin
  foreach t in array array['users','tax_rules','products','variants','plans','discounts',
    'quotation_templates','subscriptions','invoices'] loop
    execute format('create trigger stamp_update before update on public.%I for each row execute function private.stamp_update()', t);
  end loop;
  foreach t in array array['users','tax_rules','products','variants','plans','discounts',
    'discount_products','quotation_templates','quotation_template_lines','subscriptions',
    'subscription_lines','invoices','invoice_lines','payments','discount_redemptions'] loop
    execute format('grant select on public.%I to authenticated, service_role', t);
    execute format('create policy staff_read on public.%I for select to authenticated using ((select private.current_app_role()) in (''admin'',''internal''))', t);
  end loop;
end;
$$;

create policy own_profile_read on public.users for select to authenticated
using (id = (select auth.uid()) and (select private.current_app_role()) is not null);
create policy own_subscription_read on public.subscriptions for select to authenticated
using (customer_id = (select auth.uid()) and status <> 'draft' and (select private.current_app_role()) = 'customer');
create policy own_subscription_lines_read on public.subscription_lines for select to authenticated
using ((select private.current_app_role()) = 'customer' and exists (
  select 1 from public.subscriptions s where s.id = subscription_id
  and s.customer_id = (select auth.uid()) and s.status <> 'draft'));
create policy own_invoice_read on public.invoices for select to authenticated
using (customer_id = (select auth.uid()) and issued_at is not null and status <> 'draft'
  and (select private.current_app_role()) = 'customer');
create policy own_invoice_lines_read on public.invoice_lines for select to authenticated
using ((select private.current_app_role()) = 'customer' and exists (
  select 1 from public.invoices i where i.id = invoice_id
  and i.customer_id = (select auth.uid()) and i.issued_at is not null and i.status <> 'draft'));
create policy own_payments_read on public.payments for select to authenticated
using (customer_id = (select auth.uid()) and (select private.current_app_role()) = 'customer');

-- Server authorization is mandatory: service_role bypasses RLS. No browser DML.
grant insert, update on public.users, public.tax_rules, public.products, public.variants,
  public.plans, public.discounts, public.quotation_templates, public.subscriptions,
  public.invoices to service_role;
grant insert, update, delete on public.discount_products, public.quotation_template_lines,
  public.subscription_lines, public.invoice_lines to service_role;
grant insert on public.payments, public.discount_redemptions to service_role;

comment on schema private is 'Internal helpers; never add this schema to Supabase exposed schemas.';
comment on table public.payments is 'Append-only verified receipts. Authorized billing transaction must lock invoice and reject overpayment.';
comment on table public.discount_redemptions is 'One use per confirmed invoice. Lock discount row and check max_uses in confirmation transaction.';
comment on table public.invoice_lines is 'Historical snapshot. Billing service must freeze after confirmation and validate header aggregates.';
commit;

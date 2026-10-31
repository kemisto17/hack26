-- Run after supabase db reset --local against a disposable Supabase database.
-- Uses fake Auth users and rolls fixtures back/deletes them before exit.
set statement_timeout = '60s';
begin;

create function pg_temp.assert_true(ok boolean, label text) returns text
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end;
$$;

create function pg_temp.assert_error(statement text, expected_state text, expected_prefix text, label text)
returns text language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state and sqlerrm like expected_prefix || '%' then
      return 'PASS: ' || label;
    end if;
    raise exception 'FAIL: %: expected %/% got %/%',
      label, expected_state, expected_prefix, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: %: expected error %/%', label, expected_state, expected_prefix;
end;
$$;

create temporary table pricing_had_dblink as
select exists (select 1 from pg_extension where extname = 'dblink') as installed;
create extension if not exists dblink with schema extensions;

select pg_temp.assert_true(
  not has_function_privilege('anon', 'private.price_invoice_draft(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'private.price_invoice_draft(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'private.price_invoice_draft(uuid,text)', 'execute'),
  'pricing helper is executable only by service_role');

select pg_temp.assert_true(
  not (select prosecdef from pg_proc where oid = 'private.price_invoice_draft(uuid,text)'::regprocedure),
  'pricing helper is SECURITY INVOKER');

set local role anon;
select pg_temp.assert_error(
  'select private.price_invoice_draft(null::uuid, null::text)', '42501', 'permission denied',
  'anon cannot call pricing helper');
reset role;
set local role authenticated;
select pg_temp.assert_error(
  'select private.price_invoice_draft(null::uuid, null::text)', '42501', 'permission denied',
  'authenticated cannot call pricing helper');
reset role;

insert into auth.users(id,email,raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001','pricing-customer@example.invalid','{}'),
  ('10000000-0000-4000-8000-000000000002','pricing-staff@example.invalid','{}');
update public.users set role = 'admin' where id = '10000000-0000-4000-8000-000000000002';

insert into public.tax_rules(id,name,rate_bps,starts_on,is_active) values
  ('20000000-0000-4000-8000-000000000001','Starts after invoice date',5000,'2026-01-02',true),
  ('20000000-0000-4000-8000-000000000002','Effective on invoice date',10000,'2026-01-01',true);
insert into public.products(id,name,product_type,sales_price_minor,cost_price_minor,currency,tax_rule_id) values
  ('30000000-0000-4000-8000-000000000001','Pricing product','service',100,10,'INR','20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002','Unmapped add-on','addon',100,10,'INR',null);
insert into public.plans(id,product_id,name,price_minor,currency,billing_interval) values
  ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Pricing plan',100,'INR','monthly');

insert into public.discounts(id,code,name,scope,kind,amount_minor,percent_bps,currency,min_quantity,min_subtotal_minor,starts_at,max_uses,is_active) values
  ('80000000-0000-4000-8000-000000000001','PRICE-PCT','Product percentage','product','percentage',null,5000,null,3,0,clock_timestamp() - interval '1 day',1,true),
  ('80000000-0000-4000-8000-000000000002','PRICE-FIXED','Subscription fixed','subscription','fixed',1000,null,'INR',1,0,clock_timestamp() - interval '1 day',null,true),
  ('80000000-0000-4000-8000-000000000003','PRICE-LAST','Last use','subscription','percentage',null,1000,null,1,0,clock_timestamp() - interval '1 day',1,true);
insert into public.discount_products(discount_id,product_id) values
  ('80000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');

insert into public.subscriptions(id,number,customer_id,plan_id,discount_id,currency,start_at,expires_at,created_by,request_key,request_fingerprint,status) values
  ('50000000-0000-4000-8000-000000000001','SUB-PRICE-1','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','INR','2026-01-01Z','2027-01-01Z','10000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001',repeat('a',64),'active'),
  ('50000000-0000-4000-8000-000000000002','SUB-PRICE-2','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','INR','2026-01-01Z','2027-01-01Z','10000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002',repeat('b',64),'active'),
  ('50000000-0000-4000-8000-000000000003','SUB-PRICE-3','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','INR','2026-01-01Z','2027-01-01Z','10000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003',repeat('c',64),'active'),
  ('50000000-0000-4000-8000-000000000004','SUB-PRICE-4','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',null,'INR','2026-01-01Z','2027-01-01Z','10000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000004',repeat('d',64),'active'),
  ('50000000-0000-4000-8000-000000000005','SUB-PRICE-5','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000003','INR','2026-01-01Z','2027-01-01Z','10000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000005',repeat('e',64),'active'),
  ('50000000-0000-4000-8000-000000000006','SUB-PRICE-6','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000003','INR','2026-01-01Z','2027-01-01Z','10000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000006',repeat('f',64),'active'),
  ('50000000-0000-4000-8000-000000000007','SUB-PRICE-7','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','INR','2026-01-01Z','2027-01-01Z','10000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000007',repeat('1',64),'active');

insert into public.subscription_lines(id,subscription_id,product_id,description,quantity,unit_price_minor,is_primary) values
  ('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','A one',1,1,true),
  ('60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','A two',2,1,false),
  ('60000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','Unmapped',20,1,false),
  ('60000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','Prior use',1,1,true),
  ('60000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','Fixed A',1,30,true),
  ('60000000-0000-4000-8000-000000000006','50000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','Fixed B',1,20,false),
  ('60000000-0000-4000-8000-000000000007','50000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001','Half-cent tax',1,1,true),
  ('60000000-0000-4000-8000-000000000008','50000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000001','Last use A',1,100,true),
  ('60000000-0000-4000-8000-000000000009','50000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000001','Last use B',1,100,true),
  ('60000000-0000-4000-8000-000000000010','50000000-0000-4000-8000-000000000007','30000000-0000-4000-8000-000000000001','Same invoice',1,10,true),
  ('60000000-0000-4000-8000-000000000011','50000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001','Overflow',1000000,9000000000000,false);

insert into public.invoices(id,number,subscription_id,customer_id,currency,period_start,period_end,due_on,status,issued_at,subtotal_minor,discount_minor) values
  ('70000000-0000-4000-8000-000000000001','INV-PRICE-1','50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','INR','2026-01-01 23:30Z','2026-02-01Z','2026-02-08','draft',null,0,0),
  ('70000000-0000-4000-8000-000000000002','INV-PRICE-2','50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','INR','2026-01-01 23:30Z','2026-02-01Z','2026-02-08','confirmed',clock_timestamp(),1,1),
  ('70000000-0000-4000-8000-000000000003','INV-PRICE-3','50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','INR','2026-01-02 00:30Z','2026-02-02Z','2026-02-09','draft',null,0,0),
  ('70000000-0000-4000-8000-000000000004','INV-PRICE-4','50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','INR','2026-01-02 00:30Z','2026-02-02Z','2026-02-09','draft',null,0,0),
  ('70000000-0000-4000-8000-000000000005','INV-PRICE-5','50000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','INR','2026-01-02 00:30Z','2026-02-02Z','2026-02-09','draft',null,0,0),
  ('70000000-0000-4000-8000-000000000006','INV-PRICE-6','50000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','INR','2026-01-02 00:30Z','2026-02-02Z','2026-02-09','draft',null,0,0),
  ('70000000-0000-4000-8000-000000000007','INV-PRICE-7','50000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','INR','2026-01-02 00:30Z','2026-02-02Z','2026-02-09','draft',null,0,0),
  ('70000000-0000-4000-8000-000000000008','INV-PRICE-8','50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','INR','2026-03-01Z','2026-04-01Z','2026-04-08','draft',null,0,0),
  ('70000000-0000-4000-8000-000000000009','INV-PRICE-9','50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','INR','2026-04-01Z','2026-05-01Z','2026-05-08','draft',null,0,0);
insert into public.invoice_lines(id,invoice_id,subscription_line_id,description,quantity,unit_price_minor,discount_minor) values
  ('90000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','A one',1,1,0),
  ('90000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','A two',2,1,0),
  ('90000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','Unmapped',20,1,0),
  ('90000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000004','Prior use',1,1,1),
  ('90000000-0000-4000-8000-000000000005','70000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000005','Fixed A',1,30,0),
  ('90000000-0000-4000-8000-000000000006','70000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000006','Fixed B',1,20,0),
  ('90000000-0000-4000-8000-000000000007','70000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000007','Half-cent tax',1,1,0),
  ('90000000-0000-4000-8000-000000000008','70000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000008','Last use A',1,100,0),
  ('90000000-0000-4000-8000-000000000009','70000000-0000-4000-8000-000000000006','60000000-0000-4000-8000-000000000009','Last use B',1,100,0),
  ('90000000-0000-4000-8000-000000000010','70000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000010','Same invoice',1,10,0),
  ('90000000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000009','60000000-0000-4000-8000-000000000011','Overflow',1000000,9000000000000,0);
insert into public.discount_redemptions(discount_id,invoice_id,amount_minor)
values ('80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',1);

select pg_temp.assert_error(
  'select private.price_invoice_draft(''70000000-0000-4000-8000-000000000004'', ''invalid'')',
  'P0001', 'VALIDATION_ERROR:', 'invalid pricing mode is rejected');
select pg_temp.assert_error(
  'select private.price_invoice_draft(''70000000-0000-4000-8000-000000000004'', null)',
  'P0001', 'VALIDATION_ERROR:', 'null pricing mode is rejected');
select pg_temp.assert_error(
  'select private.price_invoice_draft(''70000000-0000-4000-8000-000000000099'', ''preview'')',
  'P0001', 'NOT_FOUND:', 'missing invoice is rejected');
select pg_temp.assert_error(
  'select private.price_invoice_draft(''70000000-0000-4000-8000-000000000002'', ''preview'')',
  'P0001', 'INVALID_TRANSITION:', 'non-draft invoice is rejected');
select pg_temp.assert_error(
  'select private.price_invoice_draft(''70000000-0000-4000-8000-000000000008'', ''preview'')',
  'P0001', 'INTERNAL_ERROR:', 'empty invoice is rejected');
select pg_temp.assert_error(
  'select private.price_invoice_draft(''70000000-0000-4000-8000-000000000009'', ''preview'')',
  'P0001', 'VALIDATION_ERROR:', 'invoice aggregate overflow is rejected');

update public.discounts set min_quantity = 4 where id = '80000000-0000-4000-8000-000000000001';
set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000001','preview');
reset role;
select pg_temp.assert_true(
  (select discount_minor = 0 from public.invoices where id = '70000000-0000-4000-8000-000000000001'),
  'product-scoped minimum quantity excludes unrelated lines');

update public.discounts set min_quantity = 3, min_subtotal_minor = 4, currency = 'INR'
where id = '80000000-0000-4000-8000-000000000001';
set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000001','preview');
reset role;
select pg_temp.assert_true(
  (select discount_minor = 0 from public.invoices where id = '70000000-0000-4000-8000-000000000001'),
  'product-scoped minimum subtotal excludes unrelated lines');

update public.discounts set min_subtotal_minor = 0, currency = 'USD'
where id = '80000000-0000-4000-8000-000000000001';
set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000001','preview');
reset role;
select pg_temp.assert_true(
  (select discount_minor = 0 from public.invoices where id = '70000000-0000-4000-8000-000000000001'),
  'discount currency mismatch yields zero');

update public.discounts set currency = null, is_active = false
where id = '80000000-0000-4000-8000-000000000001';
set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000001','preview');
reset role;
select pg_temp.assert_true(
  (select discount_minor = 0 from public.invoices where id = '70000000-0000-4000-8000-000000000001'),
  'inactive discount yields zero');

update public.discounts set is_active = true, starts_at = clock_timestamp() + interval '1 day', ends_at = clock_timestamp() + interval '2 days'
where id = '80000000-0000-4000-8000-000000000001';
set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000001','preview');
reset role;
select pg_temp.assert_true(
  (select discount_minor = 0 from public.invoices where id = '70000000-0000-4000-8000-000000000001'),
  'future discount window yields zero');

delete from public.discount_products where discount_id = '80000000-0000-4000-8000-000000000001';
update public.discounts set starts_at = clock_timestamp() - interval '1 day', ends_at = null
where id = '80000000-0000-4000-8000-000000000001';
set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000001','preview');
reset role;
select pg_temp.assert_true(
  (select discount_minor = 0 from public.invoices where id = '70000000-0000-4000-8000-000000000001'),
  'empty product mapping yields zero');
insert into public.discount_products(discount_id,product_id)
values ('80000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');

update public.discounts set min_subtotal_minor = 0, max_uses = 1
where id = '80000000-0000-4000-8000-000000000001';
set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000001','preview');
reset role;
select pg_temp.assert_true(
  (select discount_minor = 0 from public.invoices where id = '70000000-0000-4000-8000-000000000001')
  and not exists(select 1 from public.discount_redemptions where invoice_id = '70000000-0000-4000-8000-000000000001'),
  'preview is advisory when the usage cap is spent and inserts no redemption');
create temporary table pricing_before_failed_reserve as
select i.id, to_jsonb(i) as invoice_state,
       (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb)
        from public.invoice_lines l where l.invoice_id = i.id) as lines_state,
       (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.discount_redemptions r where r.invoice_id = i.id) as redemptions_state,
       (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
        from public.payments p where p.invoice_id = i.id) as payments_state,
       (select s.next_billing_at from public.subscriptions s where s.id = i.subscription_id) as next_billing_at
from public.invoices i where i.id = '70000000-0000-4000-8000-000000000001';
select pg_temp.assert_error(
  'select private.price_invoice_draft(''70000000-0000-4000-8000-000000000001'', ''reserve'')',
  'P0001', 'DISCOUNT_EXHAUSTED:', 'reserve rejects an exhausted discount');
select pg_temp.assert_true(
  (select to_jsonb(i) = b.invoice_state
          and (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb)
               from public.invoice_lines l where l.invoice_id = i.id) = b.lines_state
          and (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
               from public.discount_redemptions r where r.invoice_id = i.id) = b.redemptions_state
          and (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
               from public.payments p where p.invoice_id = i.id) = b.payments_state
          and s.next_billing_at is not distinct from b.next_billing_at
   from public.invoices i
   join pricing_before_failed_reserve b on b.id = i.id
   join public.subscriptions s on s.id = i.subscription_id),
  'failed reserve rolls back line and header updates');
drop table pricing_before_failed_reserve;

update public.discounts set max_uses = 2 where id = '80000000-0000-4000-8000-000000000001';
set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000001','preview');
reset role;
select pg_temp.assert_true(
  (select discount_minor = 2 and subtotal_minor = 23 and tax_minor = 0 and total_minor = 21
   from public.invoices where id = '70000000-0000-4000-8000-000000000001')
  and (select discount_minor = 1 from public.invoice_lines where id = '90000000-0000-4000-8000-000000000001')
  and (select discount_minor = 1 from public.invoice_lines where id = '90000000-0000-4000-8000-000000000002')
  and (select discount_minor = 0 from public.invoice_lines where id = '90000000-0000-4000-8000-000000000003')
  and not exists(select 1 from public.discount_redemptions where invoice_id = '70000000-0000-4000-8000-000000000001'),
  'preview rounds percentage half up, allocates remainder by UUID, scopes lines, and reserves nothing');

set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000001','reserve');
select private.price_invoice_draft('70000000-0000-4000-8000-000000000001','reserve');
reset role;
select pg_temp.assert_true(
  (select count(*) = 1 and max(amount_minor) = 2 from public.discount_redemptions where invoice_id = '70000000-0000-4000-8000-000000000001'),
  'reserve is idempotent for the same invoice');

update public.subscriptions set discount_id = '80000000-0000-4000-8000-000000000002'
where id = '50000000-0000-4000-8000-000000000001';
update public.products set tax_rule_id = '20000000-0000-4000-8000-000000000002'
where id = '30000000-0000-4000-8000-000000000001';
set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000001','reserve');
reset role;
select pg_temp.assert_true(
  (select discount_id = '80000000-0000-4000-8000-000000000001' and amount_minor = 2
   from public.discount_redemptions where invoice_id = '70000000-0000-4000-8000-000000000001')
  and (select tax_minor = 1 and tax_rule_id = '20000000-0000-4000-8000-000000000002'
       from public.invoice_lines where id = '90000000-0000-4000-8000-000000000002')
  and (select unit_price_minor = 1 and description = 'A two'
       from public.invoice_lines where id = '90000000-0000-4000-8000-000000000002'),
  'existing redemption identity is stable while current tax rules are re-evaluated');

set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000003','reserve');
reset role;
select pg_temp.assert_true(
  (select discount_minor = 50 and subtotal_minor = 50 and total_minor = 0
   from public.invoices where id = '70000000-0000-4000-8000-000000000003')
  and (select discount_minor = 30 from public.invoice_lines where id = '90000000-0000-4000-8000-000000000005')
  and (select discount_minor = 20 from public.invoice_lines where id = '90000000-0000-4000-8000-000000000006'),
  'subscription fixed discount caps at subtotal and allocates across all products');

update public.products set tax_rule_id = '20000000-0000-4000-8000-000000000001'
where id = '30000000-0000-4000-8000-000000000001';
set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000004','preview');
reset role;
select pg_temp.assert_true(
  (select tax_minor = 1 and tax_rule_id = '20000000-0000-4000-8000-000000000001'
   from public.invoice_lines where id = '90000000-0000-4000-8000-000000000007')
  and (select total_minor = 2 from public.invoices where id = '70000000-0000-4000-8000-000000000004'),
  'tax uses UTC period start and half-up rounding on a half-cent');
update public.tax_rules set is_active = false where id = '20000000-0000-4000-8000-000000000001';
set local role service_role;
select private.price_invoice_draft('70000000-0000-4000-8000-000000000004','preview');
reset role;
select pg_temp.assert_true(
  (select tax_minor = 0 and tax_rule_id is null from public.invoice_lines where id = '90000000-0000-4000-8000-000000000007'),
  'inactive tax rule yields zero tax');
update public.tax_rules set is_active = true where id = '20000000-0000-4000-8000-000000000001';

commit;

-- Two independent service sessions wait behind a held row lock so the last-use
-- race is deterministic and exercises real PostgreSQL row-lock serialization.
select extensions.dblink_connect('pricing_same_a', format('dbname=%L user=%L options=%L', current_database(), session_user, '-c statement_timeout=15000'));
select extensions.dblink_connect('pricing_same_b', format('dbname=%L user=%L options=%L', current_database(), session_user, '-c statement_timeout=15000'));
create temporary table pricing_lock_waits(test_name text primary key, waiters integer not null);
begin;
select id from public.invoices where id = '70000000-0000-4000-8000-000000000007' for update;
select extensions.dblink_send_query('pricing_same_a', $remote$
  select public.confirm_invoice('10000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000007',1,'{"display_name":"Pricing Staff","email":"pricing-staff@example.invalid"}'::jsonb)::text
$remote$);
select extensions.dblink_send_query('pricing_same_b', $remote$
  select public.confirm_invoice('10000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000007',1,'{"display_name":"Pricing Staff","email":"pricing-staff@example.invalid"}'::jsonb)::text
$remote$);
do $$
declare v_waiters integer := 0; v_try integer;
begin
  for v_try in 1..200 loop
    select count(*) into v_waiters from pg_stat_activity
    where pid <> pg_backend_pid() and datname = current_database()
      and wait_event_type = 'Lock' and query ilike '%confirm_invoice%';
    exit when v_waiters = 2;
    perform pg_sleep(0.05);
  end loop;
  insert into pg_temp.pricing_lock_waits values ('same-invoice',v_waiters);
end;
$$;
commit;
create temporary table pricing_parallel_results(test_name text, connection_name text, result text, error text);
do $$
declare v_result text; v_last_result text; v_connection text;
begin
  foreach v_connection in array array['pricing_same_a','pricing_same_b'] loop
    v_last_result := null;
    loop
      select result into v_result from extensions.dblink_get_result(v_connection, false) as r(result text);
      exit when not found;
      v_last_result := v_result;
    end loop;
    insert into pg_temp.pricing_parallel_results
    values ('same-invoice',right(v_connection,1),v_last_result,extensions.dblink_error_message(v_connection));
  end loop;
end;
$$;
select extensions.dblink_disconnect('pricing_same_a');
select extensions.dblink_disconnect('pricing_same_b');
select pg_temp.assert_true(
  (select waiters = 2 from pg_temp.pricing_lock_waits where test_name = 'same-invoice')
  and (select count(*) = 1 from pg_temp.pricing_parallel_results where test_name = 'same-invoice' and error = 'OK')
  and (select count(*) = 1 from pg_temp.pricing_parallel_results where test_name = 'same-invoice' and error like '%VERSION_CONFLICT%')
  and (select count(*) = 1 from public.discount_redemptions where invoice_id = '70000000-0000-4000-8000-000000000007'),
  'concurrent same-invoice confirmation queues both sessions and creates one redemption');

select extensions.dblink_connect('pricing_last_a', format('dbname=%L user=%L options=%L', current_database(), session_user, '-c statement_timeout=15000'));
select extensions.dblink_connect('pricing_last_b', format('dbname=%L user=%L options=%L', current_database(), session_user, '-c statement_timeout=15000'));
begin;
select id from public.discounts where id = '80000000-0000-4000-8000-000000000003' for update;
select extensions.dblink_send_query('pricing_last_a', $remote$
  select public.confirm_invoice('10000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000005',1,'{"display_name":"Pricing Staff","email":"pricing-staff@example.invalid"}'::jsonb)::text
$remote$);
select extensions.dblink_send_query('pricing_last_b', $remote$
  select public.confirm_invoice('10000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000006',1,'{"display_name":"Pricing Staff","email":"pricing-staff@example.invalid"}'::jsonb)::text
$remote$);
do $$
declare v_waiters integer := 0; v_try integer;
begin
  for v_try in 1..200 loop
    select count(*) into v_waiters from pg_stat_activity
    where pid <> pg_backend_pid() and datname = current_database()
      and wait_event_type = 'Lock' and query ilike '%confirm_invoice%';
    exit when v_waiters = 2;
    perform pg_sleep(0.05);
  end loop;
  insert into pg_temp.pricing_lock_waits values ('last-use',v_waiters);
end;
$$;
commit;
do $$
declare v_result text; v_last_result text; v_connection text;
begin
  foreach v_connection in array array['pricing_last_a','pricing_last_b'] loop
    v_last_result := null;
    loop
      select result into v_result from extensions.dblink_get_result(v_connection, false) as r(result text);
      exit when not found;
      v_last_result := v_result;
    end loop;
    insert into pg_temp.pricing_parallel_results
    values ('last-use',right(v_connection,1),v_last_result,extensions.dblink_error_message(v_connection));
  end loop;
end;
$$;
select extensions.dblink_disconnect('pricing_last_a');
select extensions.dblink_disconnect('pricing_last_b');
select pg_temp.assert_true(
  (select waiters = 2 from pg_temp.pricing_lock_waits where test_name = 'last-use')
  and (select count(*) = 1 from pg_temp.pricing_parallel_results where test_name = 'last-use' and error = 'OK')
  and (select count(*) = 1 from pg_temp.pricing_parallel_results where test_name = 'last-use' and error like '%DISCOUNT_EXHAUSTED%')
  and (select count(*) = 1 from public.discount_redemptions where discount_id = '80000000-0000-4000-8000-000000000003')
  and (select count(*) = 1 from public.invoices where id in ('70000000-0000-4000-8000-000000000005','70000000-0000-4000-8000-000000000006') and status = 'confirmed'),
  'concurrent confirmations queue both sessions and serialize the final discount use');

begin;
delete from public.discount_redemptions where invoice_id between '70000000-0000-4000-8000-000000000001' and '70000000-0000-4000-8000-000000000009';
delete from public.invoice_lines where invoice_id between '70000000-0000-4000-8000-000000000001' and '70000000-0000-4000-8000-000000000009';
delete from public.invoices where id between '70000000-0000-4000-8000-000000000001' and '70000000-0000-4000-8000-000000000009';
delete from public.subscription_lines where subscription_id between '50000000-0000-4000-8000-000000000001' and '50000000-0000-4000-8000-000000000007';
delete from public.subscriptions where id between '50000000-0000-4000-8000-000000000001' and '50000000-0000-4000-8000-000000000007';
delete from public.discount_products where discount_id between '80000000-0000-4000-8000-000000000001' and '80000000-0000-4000-8000-000000000003';
delete from public.discounts where id between '80000000-0000-4000-8000-000000000001' and '80000000-0000-4000-8000-000000000003';
delete from public.plans where id = '40000000-0000-4000-8000-000000000001';
delete from public.products where id between '30000000-0000-4000-8000-000000000001' and '30000000-0000-4000-8000-000000000002';
delete from public.tax_rules where id between '20000000-0000-4000-8000-000000000001' and '20000000-0000-4000-8000-000000000002';
delete from auth.users where id between '10000000-0000-4000-8000-000000000001' and '10000000-0000-4000-8000-000000000002';
commit;
do $$
declare v_installed boolean;
begin
  select installed into v_installed from pg_temp.pricing_had_dblink;
  if not v_installed then execute 'drop extension dblink'; end if;
end;
$$;

-- Run as postgres against a disposable database after applying all migrations.
-- All fixtures and temporary helpers are rolled back; no pgTAP dependency.
begin;

create function pg_temp.assert_true(ok boolean, label text) returns text
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end;
$$;

create function pg_temp.assert_raises(statement text, expected_state text, label text)
returns text language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then return 'PASS: ' || label; end if;
    raise exception 'FAIL: %: expected %, got % (%)', label, expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: %: expected error %', label, expected_state;
end;
$$;

select pg_temp.assert_true(
  (select count(*) = 15 and bool_and(relrowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = any(array[
     'users','products','variants','plans','tax_rules','discounts','discount_products',
     'quotation_templates','quotation_template_lines','subscriptions',
     'subscription_lines','invoices','invoice_lines','payments','discount_redemptions'])),
  'all fifteen application tables exist with RLS');

insert into auth.users (id, email, raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','customer-a@example.invalid','{"role":"admin","display_name":"Customer A"}'),
 ('10000000-0000-4000-8000-000000000002','customer-b@example.invalid','{}'),
 ('10000000-0000-4000-8000-000000000003','staff@example.invalid','{}'),
 ('10000000-0000-4000-8000-000000000004','admin@example.invalid','{}');

select pg_temp.assert_true(
 (select role = 'customer' and display_name = 'Customer A' from public.users
  where id = '10000000-0000-4000-8000-000000000001'),
 'Auth bootstrap ignores user-controlled role metadata');
update public.users set role = 'internal' where id = '10000000-0000-4000-8000-000000000003';
update public.users set role = 'admin' where id = '10000000-0000-4000-8000-000000000004';
select pg_temp.assert_true(
 (select version = 2 from public.users where id = '10000000-0000-4000-8000-000000000003'),
 'updates advance optimistic concurrency version');

insert into public.products(id,name,product_type,sales_price_minor,cost_price_minor,currency)
 values ('20000000-0000-4000-8000-000000000001','Software','software',10000,5000,'INR'),
        ('20000000-0000-4000-8000-000000000002','Add-on','addon',1000,200,'INR');
insert into public.variants(id,product_id,name,price_adjustment_minor)
 values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Odoo',56000);
insert into public.plans(id,product_id,name,price_minor,currency,billing_interval)
 values ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Monthly',10000,'INR','monthly');

insert into public.subscriptions(id,number,customer_id,plan_id,currency,start_at,expires_at,created_by,request_key,request_fingerprint,status)
 values
 ('50000000-0000-4000-8000-000000000001','SUB-TEST-A','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','INR','2026-01-01Z','2027-01-01Z','10000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001',repeat('a',64),'active'),
 ('50000000-0000-4000-8000-000000000002','SUB-TEST-B','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','INR','2026-01-01Z','2027-01-01Z','10000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002',repeat('b',64),'active'),
 ('50000000-0000-4000-8000-000000000003','SUB-TEST-DRAFT','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','INR','2026-01-01Z','2027-01-01Z','10000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000003',repeat('c',64),'draft');

insert into public.subscription_lines(id,subscription_id,product_id,description,quantity,unit_price_minor,is_primary)
 values ('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Software snapshot',2,10000,true),
        ('60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Software snapshot',2,10000,true);

insert into public.invoices(id,number,subscription_id,customer_id,currency,period_start,period_end,due_on,status,issued_at,subtotal_minor,tax_minor,customer_snapshot)
 values
 ('70000000-0000-4000-8000-000000000001','INV-TEST-A','50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','INR','2026-01-01Z','2026-02-01Z','2026-02-08','confirmed','2026-02-01Z',20000,3600,'{"name":"Customer A"}'),
 ('70000000-0000-4000-8000-000000000002','INV-TEST-B','50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','INR','2026-01-01Z','2026-02-01Z','2026-02-08','confirmed','2026-02-01Z',20000,3600,'{}');
insert into public.invoice_lines(invoice_id,subscription_line_id,description,quantity,unit_price_minor,tax_rate_bps,tax_minor)
 values ('70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','Software snapshot',2,10000,1800,3600),
        ('70000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','Software snapshot',2,10000,1800,3600);
insert into public.payments(invoice_id,customer_id,currency,amount_minor,method,paid_at,recorded_by,request_key,request_fingerprint)
 values ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','INR',10000,'bank_transfer','2026-02-01Z','10000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001',repeat('d',64));

select pg_temp.assert_true((select total_minor = 23600 from public.invoices where number = 'INV-TEST-A'),
 'invoice total uses exact integer minor units');
select pg_temp.assert_true((select bool_and(amount_minor = 23600) from public.invoice_lines),
 'line amount is generated from quantity, price, discount and tax');
update public.products set sales_price_minor = 99000 where id = '20000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select bool_and(unit_price_minor = 10000) from public.invoice_lines),
 'catalog repricing preserves historical financial snapshots');

-- A cancelled draft is not an issued invoice; cancellation must not publish it.
insert into public.invoices(id,number,subscription_id,customer_id,currency,period_start,period_end,due_on,status,issued_at)
 values
 ('70000000-0000-4000-8000-000000000003','INV-CANCELLED-DRAFT','50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','INR','2026-02-01Z','2026-03-01Z','2026-03-08','cancelled',null),
 ('70000000-0000-4000-8000-000000000004','INV-CANCELLED-ISSUED','50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','INR','2026-03-01Z','2026-04-01Z','2026-04-08','cancelled','2026-04-01Z');
insert into public.invoice_lines(invoice_id,subscription_line_id,description,quantity,unit_price_minor)
 values ('70000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001','Never issued',1,10000),
        ('70000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000001','Issued then cancelled',1,10000);

select pg_temp.assert_raises($q$insert into public.products(name,product_type,sales_price_minor,cost_price_minor,currency) values ('Bad','software',-1,0,'INR')$q$,
 '23514','negative catalog price rejected');
select pg_temp.assert_raises($q$update public.plans set billing_interval = 'fortnightly'$q$,
 '23514','unsupported billing interval rejected');
select pg_temp.assert_raises($q$update public.subscriptions set status = 'unknown'$q$,
 '23514','invalid lifecycle status rejected');
select pg_temp.assert_raises($q$update public.subscriptions set expires_at = start_at$q$,
 '23514','empty subscription interval rejected');
select pg_temp.assert_raises($q$update public.subscription_lines set variant_id = '30000000-0000-4000-8000-000000000001', product_id = '20000000-0000-4000-8000-000000000002'$q$,
 '23503','variant must belong to the selected product');
select pg_temp.assert_raises($q$update public.invoices set customer_id = '10000000-0000-4000-8000-000000000002' where number = 'INV-TEST-A'$q$,
 '23503','invoice cannot name another subscriptions customer');
select pg_temp.assert_raises($q$update public.payments set currency = 'USD'$q$,
 '23503','payment must match invoice currency');
select pg_temp.assert_raises($q$insert into public.invoices(number,subscription_id,customer_id,currency,period_start,period_end,due_on) values ('INV-DUP','50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','INR','2026-01-01Z','2026-02-01Z','2026-02-08')$q$,
 '23505','same billing period cannot be invoiced twice');
select pg_temp.assert_raises($q$insert into public.payments(invoice_id,customer_id,currency,amount_minor,method,paid_at,recorded_by,request_key,request_fingerprint) select invoice_id,customer_id,currency,amount_minor,method,paid_at,recorded_by,request_key,request_fingerprint from public.payments$q$,
 '23505','payment retries cannot create another receipt');
select pg_temp.assert_raises($q$delete from auth.users where id = '10000000-0000-4000-8000-000000000001'$q$,
 '23001','Auth deletion cannot silently erase financial ownership');

set local role anon;
select pg_temp.assert_raises('select * from public.users','42501','anonymous profile access denied');
select pg_temp.assert_raises('select * from public.invoices','42501','anonymous invoice access denied');
select pg_temp.assert_raises('select private.current_app_role()','42501','anonymous role helper access denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select count(*) = 1 from public.users),'customer sees only own profile');
select pg_temp.assert_true((select count(*) = 1 from public.subscriptions),'customer sees own non-draft subscription only');
select pg_temp.assert_true((select count(*) = 1 from public.subscription_lines),'subscription line ownership follows parent');
select pg_temp.assert_true((select count(*) = 2 from public.invoices),'customer cannot read another invoice or cancelled draft');
select pg_temp.assert_true((select count(*) = 2 from public.invoice_lines),'invoice lines follow parent ownership and issuance');
select pg_temp.assert_true(not exists(select 1 from public.invoices where number = 'INV-CANCELLED-DRAFT'),
 'cancelling a draft does not publish it to its customer');
select pg_temp.assert_true(exists(select 1 from public.invoices where number = 'INV-CANCELLED-ISSUED'),
 'cancelled issued invoice remains visible to its customer');
select pg_temp.assert_true((select count(*) = 1 from public.payments),'customer sees own receipt');
select pg_temp.assert_true((select count(*) = 0 from public.products),'customer cannot read product costs');
select pg_temp.assert_true((select count(*) = 0 from public.discounts),'customer cannot enumerate private discount rules');
select pg_temp.assert_raises($q$update public.users set role = 'admin'$q$,'42501','customer cannot promote themselves');
select pg_temp.assert_raises($q$update public.subscriptions set status = 'closed'$q$,'42501','client cannot bypass subscription service');
select pg_temp.assert_raises($q$insert into public.payments(invoice_id,customer_id,currency,amount_minor,method,paid_at,recorded_by,request_key,request_fingerprint) values ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','INR',1,'cash',now(),'10000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('e',64))$q$,'42501','customer cannot forge payment');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*) = 0 from public.payments),'other customer cannot read receipt');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*) = 4 from public.users),'internal staff can read customer directory');
select pg_temp.assert_true((select count(*) = 4 from public.invoices),'internal staff can reconcile invoices including unissued cancellations');
select pg_temp.assert_true((select count(*) = 2 from public.products),'internal staff can read catalog');
select pg_temp.assert_raises($q$update public.products set is_active = false$q$,'42501','staff client cannot bypass admin-only catalog service');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select pg_temp.assert_true((select count(*) = 3 from public.subscriptions),'admin sees draft and customer subscriptions');
select pg_temp.assert_raises($q$update public.users set role = 'admin'$q$,'42501','even admin clients must use authorized server writes');
reset role;

update public.users set is_active = false where id = '10000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*) = 0 from public.invoices),'disabled staff loses access with existing token');
select pg_temp.assert_true(private.current_app_role() is null,'disabled user has no effective role');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_true((select count(*) = 0 from public.users),'missing JWT subject sees no profiles');
reset role;

set local role service_role;
select pg_temp.assert_true((select count(*) = 4 from public.invoices),'server role can read for authorized workflows');
select pg_temp.assert_raises('delete from public.payments','42501','server cannot delete payment ledger');
select pg_temp.assert_raises('update public.payments set amount_minor = 1','42501','server cannot rewrite payment ledger');
reset role;

rollback;

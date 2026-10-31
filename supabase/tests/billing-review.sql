-- Regression checks for billing migration compilation, allocation and receipts.
-- Run as postgres on a disposable database after all migrations; rolls back.
begin;
create function pg_temp.check_billing(ok boolean, label text) returns text
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end;
$$;
create function pg_temp.billing_error(statement text, prefix text) returns text
language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = 'P0001' and sqlerrm like prefix || '%' then return 'PASS: ' || prefix; end if;
    raise;
  end;
  raise exception 'FAIL: expected %', prefix;
end;
$$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('12000000-0000-4000-8000-000000000001','review-customer@example.invalid','{}'),
 ('12000000-0000-4000-8000-000000000002','review-admin@example.invalid','{}');
update public.users set role='admin' where id='12000000-0000-4000-8000-000000000002';
insert into public.products(id,name,product_type,sales_price_minor,cost_price_minor,currency)
 values ('22000000-0000-4000-8000-000000000001','Review product','service',10,0,'USD');
insert into public.plans(id,product_id,name,price_minor,currency,billing_interval)
 values ('32000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','Review plan',10,'USD','monthly');
insert into public.discounts(id,code,name,scope,kind,amount_minor,currency,starts_at)
 values ('42000000-0000-4000-8000-000000000001','REVIEW-FIXED','Two cents','subscription','fixed',2,'USD',clock_timestamp()-interval '1 day');
insert into public.subscriptions(id,number,customer_id,plan_id,discount_id,currency,status,start_at,expires_at,created_by,request_key,request_fingerprint)
 values ('52000000-0000-4000-8000-000000000001','SUB-REVIEW','12000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','USD','active','2026-01-01Z','2027-01-01Z','12000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001',repeat('a',64));
insert into public.subscription_lines(id,subscription_id,product_id,description,quantity,unit_price_minor,is_primary)
 select ('62000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'52000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','Review line '||n,1,10,n=1
 from generate_series(1,3) n;
insert into public.invoices(id,number,subscription_id,customer_id,currency,period_start,period_end,due_on)
 values ('72000000-0000-4000-8000-000000000001','INV-REVIEW-1','52000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','USD','2026-01-01Z','2026-02-01Z','2026-01-08'),
 ('72000000-0000-4000-8000-000000000002','INV-REVIEW-2','52000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','USD','2026-02-01Z','2026-03-01Z','2026-02-08');
insert into public.invoice_lines(id,invoice_id,subscription_line_id,description,quantity,unit_price_minor)
 select ('92000000-0000-4000-8000-'||lpad((n+offset_n)::text,12,'0'))::uuid,
 ('72000000-0000-4000-8000-'||lpad((offset_n/3+1)::text,12,'0'))::uuid,
 ('62000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Review line '||n,1,10
 from generate_series(1,3) n cross join (values(0),(3)) offsets(offset_n);

set local role service_role;
select private.price_invoice_draft('72000000-0000-4000-8000-000000000001','preview');
reset role;
select pg_temp.check_billing(
 (select array_agg(discount_minor order by id)=array[1,1,0]::bigint[] from public.invoice_lines where invoice_id='72000000-0000-4000-8000-000000000001'),
 'each residual cent goes to the next eligible line in UUID order');
select pg_temp.check_billing(
 (select discount_minor=2 and total_minor=28 from public.invoices where id='72000000-0000-4000-8000-000000000001'),
 'allocation retains header totals');

select pg_temp.billing_error($q$select public.confirm_invoice('12000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',2,'{"display_name":"Review","email":"review@example.invalid"}')$q$,'FORBIDDEN');
set local role service_role;
select public.confirm_invoice('12000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001',
 (select version from public.invoices where id='72000000-0000-4000-8000-000000000001'),'{"display_name":"Review","email":"review@example.invalid"}');
reset role;

-- Invalid references and overpayments must leave the issued document untouched.
create temporary table review_before as select to_jsonb(i) invoice from public.invoices i where id='72000000-0000-4000-8000-000000000001';
select pg_temp.billing_error(format($q$select public.record_payment('12000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001',%s,'b2000000-0000-4000-8000-000000000001',%L::jsonb,%L)$q$,
 (select version from public.invoices where id='72000000-0000-4000-8000-000000000001'),
 jsonb_build_object('amount_minor','10','currency','USD','method','cash','paid_at',private.iso_utc(clock_timestamp()),'external_reference',23),repeat('b',64)), 'VALIDATION_ERROR');
select pg_temp.billing_error(format($q$select public.record_payment('12000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001',%s,'b2000000-0000-4000-8000-000000000001',%L::jsonb,%L)$q$,
 (select version from public.invoices where id='72000000-0000-4000-8000-000000000001'),
 jsonb_build_object('amount_minor','29','currency','USD','method','cash','paid_at',private.iso_utc(clock_timestamp()),'external_reference','REVIEW-RECEIPT'),repeat('b',64)), 'PAYMENT_EXCEEDS_BALANCE');
select pg_temp.check_billing(
 (select to_jsonb(i)=(select invoice from review_before) from public.invoices i where id='72000000-0000-4000-8000-000000000001')
 and not exists(select 1 from public.payments where invoice_id='72000000-0000-4000-8000-000000000001'),
 'failed receipts retain invoice and payment state');

set local role service_role;
select public.record_payment('12000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001',
 (select version from public.invoices where id='72000000-0000-4000-8000-000000000001'),'b2000000-0000-4000-8000-000000000001',
 jsonb_build_object('amount_minor','10','currency','USD','method','cash','paid_at',private.iso_utc(clock_timestamp()),'external_reference','REVIEW-RECEIPT'),repeat('b',64));
reset role;
select pg_temp.check_billing((select status='confirmed' from public.invoices where id='72000000-0000-4000-8000-000000000001'), 'partial receipt remains confirmed');

update public.discounts set amount_minor=30 where id='42000000-0000-4000-8000-000000000001';
set local role service_role;
select public.confirm_invoice('12000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002',1,'{"display_name":"Review","email":"review@example.invalid"}');
reset role;
select pg_temp.check_billing((select status='paid' and total_minor=0 and issued_at is not null from public.invoices where id='72000000-0000-4000-8000-000000000002') and not exists(select 1 from public.payments where invoice_id='72000000-0000-4000-8000-000000000002'), 'zero-total confirmation is paid without a fabricated receipt');
rollback;

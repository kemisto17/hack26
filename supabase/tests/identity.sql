-- Development/disposable database only. Every fixture is rolled back.
begin;
create function pg_temp.ok(value boolean, label text) returns text language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %', label; end if; return 'PASS: ' || label; end; $$;
create function pg_temp.fails(statement text, message text) returns text language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm = message then return 'PASS: ' || message; end if;
    raise exception 'Expected %, got %', message, sqlerrm;
  end;
  raise exception 'Expected failure: %', message;
end; $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('11000000-0000-4000-8000-000000000001','d1-admin@example.invalid','{}'),
 ('11000000-0000-4000-8000-000000000002','d1-staff@example.invalid','{}'),
 ('11000000-0000-4000-8000-000000000003','d1-customer@example.invalid','{"role":"admin"}');
update public.users set role='admin' where id='11000000-0000-4000-8000-000000000001';
update public.users set role='internal' where id='11000000-0000-4000-8000-000000000002';
set local role service_role;
select pg_temp.ok((public.identity_update_profile('11000000-0000-4000-8000-000000000003',1,'New name')->>'version') = '2', 'own update returns decimal version');
select pg_temp.fails($q$select public.identity_update_profile('11000000-0000-4000-8000-000000000003',1,'stale')$q$, 'VERSION_CONFLICT');
select pg_temp.fails($q$select public.identity_set_access('11000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000002',2,'admin',null)$q$, 'FORBIDDEN');
select pg_temp.fails($q$select public.identity_set_access('11000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000003',2,'admin',null)$q$, 'FORBIDDEN');
select pg_temp.fails($q$select public.identity_set_access('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',2,'customer',null)$q$, 'INVALID_TRANSITION');
select pg_temp.ok((public.identity_set_access('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002',2,'admin',null)->>'role')='admin', 'admin can promote');
select pg_temp.ok((public.identity_set_access('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002',3,null,false)->>'is_active')='false', 'admin can disable');
select pg_temp.fails($q$select public.identity_update_profile('11000000-0000-4000-8000-000000000002',4,'Disabled')$q$, 'FORBIDDEN');
select pg_temp.fails($q$select public.identity_prepare_invitation('11000000-0000-4000-8000-000000000003','d1-invite@example.invalid','Staff')$q$, 'FORBIDDEN');
select pg_temp.fails($q$select public.identity_prepare_invitation('11000000-0000-4000-8000-000000000001','d1-customer@example.invalid','Staff')$q$, 'IDEMPOTENCY_CONFLICT');
select public.identity_prepare_invitation('11000000-0000-4000-8000-000000000001','d1-invite@example.invalid','Staff');
select pg_temp.fails($q$select public.identity_prepare_invitation('11000000-0000-4000-8000-000000000001','d1-invite@example.invalid','Staff')$q$, 'RATE_LIMITED');
reset role;
insert into auth.users(id,email,invited_at,raw_user_meta_data) values ('11000000-0000-4000-8000-000000000004','d1-invite@example.invalid',now(),'{"role":"admin"}');
select pg_temp.ok((select role='customer' from public.users where id='11000000-0000-4000-8000-000000000004'), 'invitation starts as customer');
select pg_temp.ok((public.identity_finish_invitation('11000000-0000-4000-8000-000000000001',
 (select id from private.staff_invitations where email='d1-invite@example.invalid'),
 (select claim_token from private.staff_invitations where email='d1-invite@example.invalid'))->>'accepted')='true', 'invitation can finish');
select pg_temp.ok((select role='internal' from public.users where id='11000000-0000-4000-8000-000000000004'), 'invited staff promoted only on completion');
select pg_temp.ok((public.identity_prepare_invitation('11000000-0000-4000-8000-000000000001','d1-invite@example.invalid','Staff')->>'status')='accepted', 'retry does not send or promote twice');
update public.users set role='customer' where id='11000000-0000-4000-8000-000000000004';
select public.identity_prepare_invitation('11000000-0000-4000-8000-000000000001','d1-invite@example.invalid','Staff');
select pg_temp.ok((select role='customer' from public.users where id='11000000-0000-4000-8000-000000000004'), 'retry never reverses later access changes');
select public.identity_prepare_invitation('11000000-0000-4000-8000-000000000001','d1-race@example.invalid','Race');
insert into auth.users(id,email,raw_user_meta_data) values ('11000000-0000-4000-8000-000000000005','d1-race@example.invalid','{}');
select pg_temp.fails($q$select public.identity_finish_invitation('11000000-0000-4000-8000-000000000001',(select id from private.staff_invitations where email='d1-race@example.invalid'),(select claim_token from private.staff_invitations where email='d1-race@example.invalid'))$q$, 'IDEMPOTENCY_CONFLICT');
select pg_temp.ok((select role='customer' from public.users where id='11000000-0000-4000-8000-000000000005'), 'signup race cannot become staff');
select public.identity_prepare_invitation('11000000-0000-4000-8000-000000000001','d1-revoked@example.invalid','Revoked');
insert into auth.users(id,email,invited_at) values ('11000000-0000-4000-8000-000000000006','d1-revoked@example.invalid',now());
update public.users set role='admin',is_active=true where id='11000000-0000-4000-8000-000000000002';
select public.identity_set_access('11000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001',2,'customer',null);
select pg_temp.fails($q$select public.identity_finish_invitation('11000000-0000-4000-8000-000000000001',(select id from private.staff_invitations where email='d1-revoked@example.invalid'),(select claim_token from private.staff_invitations where email='d1-revoked@example.invalid'))$q$, 'FORBIDDEN');
select pg_temp.ok((select role='customer' from public.users where id='11000000-0000-4000-8000-000000000006'), 'failed completion leaves customer permissions');
select public.identity_prepare_invitation('11000000-0000-4000-8000-000000000002','d1-null-claim@example.invalid','Claim');
insert into auth.users(id,email,invited_at) values ('11000000-0000-4000-8000-000000000007','d1-null-claim@example.invalid',now());
select public.identity_release_invitation('11000000-0000-4000-8000-000000000002',
 (select id from private.staff_invitations where email='d1-null-claim@example.invalid'),
 (select claim_token from private.staff_invitations where email='d1-null-claim@example.invalid'));
select pg_temp.fails($q$select public.identity_finish_invitation('11000000-0000-4000-8000-000000000002',(select id from private.staff_invitations where email='d1-null-claim@example.invalid'),null)$q$, 'FORBIDDEN');
select pg_temp.ok((select role='customer' from public.users where id='11000000-0000-4000-8000-000000000007'), 'released null claim cannot promote');
select pg_temp.ok(not has_function_privilege('anon','public.identity_set_access(uuid,uuid,bigint,text,boolean)','execute'), 'anon cannot invoke access RPC');
select pg_temp.ok(not has_function_privilege('authenticated','public.identity_set_access(uuid,uuid,bigint,text,boolean)','execute'), 'JWT clients cannot invoke access RPC');
rollback;

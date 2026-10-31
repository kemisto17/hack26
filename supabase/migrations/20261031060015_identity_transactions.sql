begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table private.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(trim(email)) and length(email) between 3 and 254),
  display_name text not null check (length(trim(display_name)) between 1 and 200),
  invited_by uuid not null references public.users(id) on delete restrict,
  user_id uuid unique references public.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted')),
  claim_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
alter table private.staff_invitations enable row level security;
revoke all on private.staff_invitations from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant select, insert, update on private.staff_invitations to service_role;
create index staff_invitations_inviter_idx on private.staff_invitations(invited_by);

create function private.identity_actor(p_actor_id uuid, p_roles text[]) returns public.users
language plpgsql security invoker set search_path = '' as $$
declare actor public.users;
begin
  -- All identity writers take this lock before row locks, including invitation completion.
  perform pg_advisory_xact_lock(26, 1);
  select * into actor from public.users where id = p_actor_id for update;
  if not found or not actor.is_active or not (actor.role = any(p_roles)) then
    raise exception using message = 'FORBIDDEN', errcode = 'P0001';
  end if;
  return actor;
end; $$;
revoke all on function private.identity_actor(uuid,text[]) from public, anon, authenticated;
grant execute on function private.identity_actor(uuid,text[]) to service_role;

create function private.identity_user_dto(u public.users) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',u.id,'display_name',u.display_name,'role',u.role,
    'is_active',u.is_active,'version',u.version::text,'created_at',u.created_at,'updated_at',u.updated_at);
$$;
revoke all on function private.identity_user_dto(public.users) from public, anon, authenticated;
grant execute on function private.identity_user_dto(public.users) to service_role;

create function private.protect_last_admin() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active) then
    perform pg_advisory_xact_lock(26, 1);
    if not exists (select 1 from public.users where role = 'admin' and is_active and id <> old.id) then
      raise exception using message = 'INVALID_TRANSITION', errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.protect_last_admin() from public, anon, authenticated, service_role;
create trigger protect_last_admin before update of role,is_active on public.users
for each row execute function private.protect_last_admin();

create function public.identity_update_profile(p_actor_id uuid,p_expected_version bigint,p_display_name text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare target public.users;
begin
  target := private.identity_actor(p_actor_id,array['admin','internal','customer']);
  if p_display_name is null or length(trim(p_display_name)) not between 1 and 200 then raise exception 'VALIDATION_ERROR'; end if;
  if p_expected_version is distinct from target.version then raise exception 'VERSION_CONFLICT'; end if;
  update public.users set display_name = trim(p_display_name) where id = target.id returning * into target;
  return private.identity_user_dto(target);
end; $$;

create function public.identity_set_access(p_actor_id uuid,p_user_id uuid,p_expected_version bigint,p_role text default null,p_is_active boolean default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare target public.users;
begin
  perform private.identity_actor(p_actor_id,array['admin']);
  if (p_role is null and p_is_active is null) or (p_role is not null and p_role not in ('admin','internal','customer')) then raise exception 'VALIDATION_ERROR'; end if;
  select * into target from public.users where id = p_user_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_expected_version is distinct from target.version then raise exception 'VERSION_CONFLICT'; end if;
  update public.users set role = coalesce(p_role,role), is_active = coalesce(p_is_active,is_active)
    where id = target.id returning * into target;
  return private.identity_user_dto(target);
end; $$;

create function public.identity_prepare_invitation(p_actor_id uuid,p_email text,p_display_name text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare invitation private.staff_invitations; token uuid;
begin
  perform private.identity_actor(p_actor_id,array['admin']);
  if p_email is null or p_email <> lower(trim(p_email)) or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(p_email) > 254 or p_display_name is null or length(trim(p_display_name)) not between 1 and 200 then raise exception 'VALIDATION_ERROR'; end if;
  select * into invitation from private.staff_invitations where email = p_email for update;
  if found then
    if invitation.status = 'accepted' then return jsonb_build_object('status','accepted'); end if;
    if invitation.lease_until > clock_timestamp() then raise exception 'RATE_LIMITED'; end if;
  else
    -- Never repurpose an existing customer/staff account as an invitation retry.
    if private.identity_auth_record(p_email) is not null then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    insert into private.staff_invitations(email,display_name,invited_by)
      values (p_email,trim(p_display_name),p_actor_id) returning * into invitation;
  end if;
  token := gen_random_uuid();
  update private.staff_invitations set invited_by=p_actor_id, display_name=trim(p_display_name),
    claim_token=token, lease_until=clock_timestamp()+interval '2 minutes', updated_at=clock_timestamp()
    where id=invitation.id;
  return jsonb_build_object('status','pending','id',invitation.id,'claim_token',token,'needs_delivery',invitation.user_id is null);
end; $$;

-- Auth schema reads use a narrow private helper, not new service-role grants on auth.users.
create function private.identity_auth_record(p_email text,p_id uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',u.id,'invited',u.invited_at is not null)
  from auth.users u where lower(u.email)=p_email and (p_id is null or u.id=p_id);
$$;
revoke all on function private.identity_auth_record(text,uuid) from public, anon, authenticated;
grant execute on function private.identity_auth_record(text,uuid) to service_role;

create function private.capture_staff_invitation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update private.staff_invitations set user_id=new.id,updated_at=clock_timestamp()
    where email=lower(new.email) and user_id is null and status='pending';
  return new;
end; $$;
revoke all on function private.capture_staff_invitation() from public, anon, authenticated, service_role;
create trigger hack26_capture_staff_invitation after insert on auth.users
for each row execute function private.capture_staff_invitation();

create function public.identity_finish_invitation(p_actor_id uuid,p_invitation_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare invitation private.staff_invitations; target public.users;
begin
  perform private.identity_actor(p_actor_id,array['admin']);
  select * into invitation from private.staff_invitations where id=p_invitation_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if invitation.invited_by <> p_actor_id or invitation.claim_token is distinct from p_claim_token then raise exception 'FORBIDDEN'; end if;
  if invitation.status = 'accepted' then return jsonb_build_object('accepted',true); end if;
  if invitation.lease_until < clock_timestamp() then raise exception 'RATE_LIMITED'; end if;
  if invitation.user_id is null or coalesce((private.identity_auth_record(invitation.email,invitation.user_id)->>'invited')::boolean,false) is not true then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  select * into target from public.users where id=invitation.user_id for update;
  if target.role <> 'customer' or not target.is_active then raise exception 'INVALID_TRANSITION'; end if;
  update public.users set role='internal',display_name=invitation.display_name where id=target.id;
  update private.staff_invitations set status='accepted',lease_until=null,updated_at=clock_timestamp() where id=invitation.id;
  return jsonb_build_object('accepted',true);
end; $$;

create function public.identity_release_invitation(p_actor_id uuid,p_invitation_id uuid,p_claim_token uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform private.identity_actor(p_actor_id,array['admin']);
  update private.staff_invitations set claim_token=null,lease_until=null,updated_at=clock_timestamp()
    where id=p_invitation_id and invited_by=p_actor_id and claim_token=p_claim_token and status='pending';
end; $$;

revoke all on function public.identity_update_profile(uuid,bigint,text),
  public.identity_set_access(uuid,uuid,bigint,text,boolean),
  public.identity_prepare_invitation(uuid,text,text),
  public.identity_finish_invitation(uuid,uuid,uuid),
  public.identity_release_invitation(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.identity_update_profile(uuid,bigint,text),
  public.identity_set_access(uuid,uuid,bigint,text,boolean),
  public.identity_prepare_invitation(uuid,text,text),
  public.identity_finish_invitation(uuid,uuid,uuid),
  public.identity_release_invitation(uuid,uuid,uuid) to service_role;

commit;

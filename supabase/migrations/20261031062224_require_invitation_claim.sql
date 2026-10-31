begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- A released lease has null fields; null must never count as a matching claim.
create or replace function public.identity_finish_invitation(p_actor_id uuid,p_invitation_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare invitation private.staff_invitations; target public.users;
begin
  perform private.identity_actor(p_actor_id,array['admin']);
  select * into invitation from private.staff_invitations where id=p_invitation_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_claim_token is null or invitation.claim_token is null or invitation.invited_by <> p_actor_id or invitation.claim_token is distinct from p_claim_token then raise exception 'FORBIDDEN'; end if;
  if invitation.status = 'accepted' then return jsonb_build_object('accepted',true); end if;
  if invitation.lease_until is null or invitation.lease_until < clock_timestamp() then raise exception 'RATE_LIMITED'; end if;
  if invitation.user_id is null or coalesce((private.identity_auth_record(invitation.email,invitation.user_id)->>'invited')::boolean,false) is not true then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  select * into target from public.users where id=invitation.user_id for update;
  if target.role <> 'customer' or not target.is_active then raise exception 'INVALID_TRANSITION'; end if;
  update public.users set role='internal',display_name=invitation.display_name where id=target.id;
  update private.staff_invitations set status='accepted',lease_until=null,updated_at=clock_timestamp() where id=invitation.id;
  return jsonb_build_object('accepted',true);
end; $$;

revoke all on function public.identity_finish_invitation(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.identity_finish_invitation(uuid,uuid,uuid) to service_role;
commit;

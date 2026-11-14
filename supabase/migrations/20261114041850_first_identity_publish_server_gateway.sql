begin;
create function api.execute_onboarding_publish_server(input_subject uuid,input_operation text,input_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  previous_claims text := current_setting('request.jwt.claims',true);
  previous_sub text := current_setting('request.jwt.claim.sub',true);
  actor_owner_id uuid;
  binding_owner uuid;
  result jsonb;
begin
  if input_subject is null or input_operation is distinct from 'publish_current_onboarding_identity'
    or jsonb_typeof(input_payload) is distinct from 'object'
    or not(input_payload ?& array['input_receipt_id','input_snapshot_hash'])
    or (input_payload-array['input_receipt_id','input_snapshot_hash'])<>'{}'::jsonb
    or jsonb_typeof(input_payload->'input_receipt_id') is distinct from 'string'
    or jsonb_typeof(input_payload->'input_snapshot_hash') is distinct from 'string'
    or (input_payload->>'input_receipt_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    or (input_payload->>'input_snapshot_hash') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status','unavailable');
  end if;
  -- Same Owner-first ordering as publication/Working commands. Hold the binding
  -- through delegation so a verified subject cannot be rebound mid-operation.
  select o.id into actor_owner_id from core.owners o join core.owner_auth_bindings b on b.owner_id=o.id
    where b.auth_user_id=input_subject for update of o;
  select b.owner_id into binding_owner from core.owner_auth_bindings b
    where b.auth_user_id=input_subject for share;
  if actor_owner_id is null or binding_owner is distinct from actor_owner_id then
    return jsonb_build_object('status','owner_missing');
  end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',input_subject,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',input_subject::text,true);
  if exists(select 1 from core.owners o where o.id=actor_owner_id and o.account_state='active' and o.onboarding_completed_at is null)
    and not exists(select 1 from core.first_onboarding_publications p where p.owner_id=actor_owner_id)
    and (exists(select 1 from core.identity_block_collections_working c where c.owner_id=actor_owner_id)
      or exists(select 1 from core.identity_profile_text_working t where t.owner_id=actor_owner_id)) then
    result:=jsonb_build_object('status','identity_preparation_pending');
  else
    result:=api.publish_current_onboarding((input_payload->>'input_receipt_id')::uuid,
      input_payload->>'input_snapshot_hash','identity_only');
  end if;
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  return result;
exception when others then
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  raise;
end;
$$;
revoke all on function api.execute_onboarding_publish_server(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function api.execute_onboarding_publish_server(uuid,text,jsonb) to service_role;
comment on function api.execute_onboarding_publish_server(uuid,text,jsonb) is
  'Default-off staged Identity-only first Publish transport. Verified subject, distributed quota, strict receipt review and same-Owner postproof required. Original RPC/table grants remain closed.';
commit;

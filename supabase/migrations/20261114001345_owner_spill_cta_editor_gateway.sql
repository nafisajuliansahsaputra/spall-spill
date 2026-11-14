begin;
create function api.execute_owner_spill_cta_editor_server(input_subject uuid,input_operation text,input_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  previous_claims text := current_setting('request.jwt.claims',true);
  previous_sub text := current_setting('request.jwt.claim.sub',true);
  result jsonb;
begin
  if input_subject is null or input_operation is null or jsonb_typeof(input_payload) is distinct from 'object'
    or input_operation not in ('initialize_current_owner_blocks_from_spill_cta','add_current_owner_spill_cta_block_working') then
    return jsonb_build_object('status','unavailable'); end if;
  if not(input_payload ? 'input_intent') or (input_payload-'input_intent')<>'{}'::jsonb then
    return jsonb_build_object('status','unavailable'); end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',input_subject,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',input_subject::text,true);
  case input_operation
    when 'initialize_current_owner_blocks_from_spill_cta' then result:=api.initialize_current_owner_blocks_from_spill_cta(input_payload->'input_intent');
    when 'add_current_owner_spill_cta_block_working' then result:=api.add_current_owner_spill_cta_block_working(input_payload->'input_intent');
  end case;
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  return result;
exception when others then
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  raise;
end;
$$;
revoke all on function api.execute_owner_spill_cta_editor_server(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function api.execute_owner_spill_cta_editor_server(uuid,text,jsonb) to service_role;
comment on function api.execute_owner_spill_cta_editor_server(uuid,text,jsonb) is
  'Fixed private Spill integration creation server admission; verified Auth subject and distributed save budget required. Original RPCs remain closed. No publication authority.';
commit;

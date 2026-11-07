begin;
create function api.execute_owner_block_controls_server(input_subject uuid,input_operation text,input_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  previous_claims text := current_setting('request.jwt.claims',true);
  previous_sub text := current_setting('request.jwt.claim.sub',true);
  result jsonb;
begin
  if input_subject is null or input_operation is null or jsonb_typeof(input_payload) is distinct from 'object'
    or input_operation not in ('save_current_owner_block_visibility_working','move_current_owner_block_working','remove_current_owner_block_working') then
    return jsonb_build_object('status','unavailable'); end if;
  if not(input_payload ? 'input_working') or (input_payload-'input_working')<>'{}'::jsonb then
    return jsonb_build_object('status','unavailable'); end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',input_subject,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',input_subject::text,true);
  case input_operation
    when 'save_current_owner_block_visibility_working' then result:=api.save_current_owner_block_visibility_working(input_payload->'input_working');
    when 'move_current_owner_block_working' then result:=api.move_current_owner_block_working(input_payload->'input_working');
    when 'remove_current_owner_block_working' then result:=api.remove_current_owner_block_working(input_payload->'input_working');
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
revoke all on function api.execute_owner_block_controls_server(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function api.execute_owner_block_controls_server(uuid,text,jsonb) to service_role;
comment on function api.execute_owner_block_controls_server(uuid,text,jsonb) is
  'Fixed Working block controls server admission; verified Auth subject and distributed save budget required. Original RPCs remain closed. No publication authority.';
commit;

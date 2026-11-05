begin;
-- Closed server admission; original current-Owner RPC ACLs remain unchanged.
create or replace function api.execute_owner_profile_editor_server(input_subject uuid,input_operation text,input_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  previous_claims text := current_setting('request.jwt.claims',true);
  previous_sub text := current_setting('request.jwt.claim.sub',true);
  result jsonb;
begin
  if input_subject is null or input_operation is null or jsonb_typeof(input_payload) is distinct from 'object' then
    return jsonb_build_object('status','unavailable'); end if;
  if input_operation not in ('resolve_current_owner_home_context','resolve_current_owner_editable_identity_working_page','save_current_owner_profile_text_working','save_current_owner_layout_working','save_current_owner_block_link_working') then
    return jsonb_build_object('status','unavailable'); end if;
  if (input_operation='resolve_current_owner_home_context' and input_payload<>'{}'::jsonb)
    or (input_operation='resolve_current_owner_editable_identity_working_page' and
      (not(input_payload ? 'input_request') or (input_payload-'input_request')<>'{}'::jsonb))
    or (input_operation in ('save_current_owner_profile_text_working','save_current_owner_layout_working','save_current_owner_block_link_working') and
      (not(input_payload ? 'input_working') or (input_payload-'input_working')<>'{}'::jsonb)) then
    return jsonb_build_object('status','unavailable'); end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',input_subject,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',input_subject::text,true);
  case input_operation
    when 'resolve_current_owner_home_context' then result:=api.resolve_current_owner_home_context();
    when 'resolve_current_owner_editable_identity_working_page' then result:=api.resolve_current_owner_editable_identity_working_page(input_payload->'input_request');
    when 'save_current_owner_block_link_working' then result:=api.save_current_owner_block_link_working(input_payload->'input_working');
    when 'save_current_owner_layout_working' then result:=api.save_current_owner_layout_working(input_payload->'input_working');
    when 'save_current_owner_profile_text_working' then result:=api.save_current_owner_profile_text_working(input_payload->'input_working');
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
revoke all on function api.execute_owner_profile_editor_server(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function api.execute_owner_profile_editor_server(uuid,text,jsonb) to service_role;
comment on function api.execute_owner_profile_editor_server(uuid,text,jsonb) is
  'Server-only fixed Profile/layout/saved-link Working admission. Application must verify subject and distributed budget. Original RPCs remain closed; no publication authority.';
commit;

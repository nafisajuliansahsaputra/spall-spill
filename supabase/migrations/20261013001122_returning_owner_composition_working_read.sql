begin;
create function api.resolve_current_owner_composition_working()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  context jsonb;
  comparison jsonb;
  current_owner uuid;
  profile_revision bigint;
  layout_revision bigint;
  starter core.identity_layout_working.starter_key%type;
  connection core.identity_connection_working%rowtype;
  connection_payload jsonb := 'null'::jsonb;
begin
  context := api.resolve_current_owner_home_context();
  comparison := api.resolve_current_owner_home_identity_work();
  if context->>'status' is distinct from 'success'
    or comparison->>'status' is distinct from 'success'
    or comparison->>'current_handle' is distinct from context->>'current_handle'
    or comparison->>'primary_use_case' is distinct from context->>'primary_use_case' then
    return jsonb_build_object('status','unavailable');
  end if;
  current_owner := (api.resolve_current_owner_state()->>'owner_id')::uuid;
  select i.revision,l.revision,l.starter_key
    into profile_revision,layout_revision,starter
    from core.identity_working i join core.identity_layout_working l on l.owner_id=i.owner_id
    where i.owner_id=current_owner;
  if not found or profile_revision not between 1 and 9007199254740991
    or layout_revision not between 1 and 9007199254740991 then
    return jsonb_build_object('status','unavailable');
  end if;
  select c.* into connection from core.identity_connection_working c where c.owner_id=current_owner;
  if found then
    if connection.revision not between 1 and 9007199254740991 then
      return jsonb_build_object('status','unavailable');
    end if;
    connection_payload := jsonb_build_object('connection_kind',connection.connection_kind,
      'social_platform',connection.social_platform,'destination_url',connection.destination_url,
      'revision',connection.revision);
  end if;
  return context || jsonb_build_object('profile_revision',profile_revision,
    'layout_working',jsonb_build_object('starter_key',starter,'revision',layout_revision),
    'connection_working',connection_payload,'identity_work',comparison->>'identity_work');
end;
$$;
revoke all on function api.resolve_current_owner_composition_working() from public, anon, authenticated, service_role;
comment on function api.resolve_current_owner_composition_working() is
  'Staged own saved layout/first connection slot and private revision comparison. Not full blocks, public/media readiness or publication authority. No writes or execution grants.';
commit;

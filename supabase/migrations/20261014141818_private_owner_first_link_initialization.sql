begin;
create function api.initialize_current_owner_blocks_from_link(input_intent jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  current_owner uuid;
  bound_owner uuid;
  account core.owner_account_state;
  completed timestamptz;
  new_block uuid;
  target_kind core.identity_block_kind;
  payload jsonb;
  field text;
  limit_chars integer;
begin
  if actor is null then return jsonb_build_object('status','unauthenticated'); end if;
  select o.id,o.account_state,o.onboarding_completed_at into current_owner,account,completed
    from core.owner_auth_bindings b join core.owners o on o.id=b.owner_id
    where b.auth_user_id=actor for update of o;
  if not found then return jsonb_build_object('status','owner_missing'); end if;
  select b.owner_id into bound_owner from core.owner_auth_bindings b where b.auth_user_id=actor for update;
  if not found or bound_owner is distinct from current_owner then return jsonb_build_object('status','unavailable'); end if;
  if account<>'active' or completed is null then return jsonb_build_object('status','owner_not_eligible'); end if;
  if api.resolve_current_owner_home_context()->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable'); end if;
  if jsonb_typeof(input_intent) is distinct from 'object' then return jsonb_build_object('status','invalid_initialization_intent'); end if;
  if not (input_intent ?& array['action','base_collection_revision','is_visible','link_working'])
    or exists(select 1 from jsonb_object_keys(input_intent) k where k not in ('action','base_collection_revision','is_visible','link_working'))
    or input_intent->>'action' is distinct from 'initialize_link_block'
    or jsonb_typeof(input_intent->'action') is distinct from 'string'
    or jsonb_typeof(input_intent->'is_visible') is distinct from 'boolean'
    or input_intent->'base_collection_revision' is distinct from 'null'::jsonb
    or jsonb_typeof(input_intent->'link_working') is distinct from 'object'
  then return jsonb_build_object('status','invalid_initialization_intent'); end if;
  payload := input_intent->'link_working';
  if not (payload ?& array['kind','title','social_platform','destination_url'])
    or exists(select 1 from jsonb_object_keys(payload) k where k not in ('kind','title','social_platform','destination_url'))
    or jsonb_typeof(payload->'kind') is distinct from 'string'
    or payload->>'kind' not in ('social','generic_link')
  then return jsonb_build_object('status','invalid_initialization_intent'); end if;
  foreach field in array array['title','social_platform','destination_url'] loop
    limit_chars := case field when 'title' then 512 when 'social_platform' then 40 else 2048 end;
    if jsonb_typeof(payload->field) not in ('string','null') or char_length(payload->>field)>limit_chars then
      return jsonb_build_object('status','invalid_initialization_intent'); end if;
  end loop;
  if exists(select 1 from core.identity_block_collections_working c where c.owner_id=current_owner) then
    return jsonb_build_object('status','already_initialized'); end if;
  insert into core.identity_block_collections_working(owner_id) values(current_owner);
  target_kind := (payload->>'kind')::core.identity_block_kind;
  insert into core.identity_blocks_working(owner_id,kind,position,is_visible)
    values(current_owner,target_kind,1,(input_intent->>'is_visible')::boolean)
    returning block_id into new_block;
  insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
    values(new_block,current_owner,target_kind,payload->>'title',payload->>'social_platform',payload->>'destination_url');
  return jsonb_build_object('status','success','block_id',new_block,'collection_revision',1);
end;
$$;
revoke all on function api.initialize_current_owner_blocks_from_link(jsonb) from public,anon,authenticated,service_role;
comment on function api.initialize_current_owner_blocks_from_link(jsonb) is
  'Staged private explicit manually supplied first link. Absent collection only/server UUID/position1/atomic raw payload; no source import/provenance/publication. All execution withheld.';
commit;

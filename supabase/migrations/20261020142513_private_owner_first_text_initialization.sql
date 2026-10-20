begin;
create function api.initialize_current_owner_blocks_from_text(input_intent jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  current_owner uuid;
  bound_owner uuid;
  account core.owner_account_state;
  completed timestamptz;
  new_block uuid;
  payload jsonb;
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
  if not (input_intent ?& array['action','base_collection_revision','is_visible','text_working'])
    or exists(select 1 from jsonb_object_keys(input_intent) k where k not in ('action','base_collection_revision','is_visible','text_working'))
    or input_intent->>'action' is distinct from 'initialize_text_block'
    or jsonb_typeof(input_intent->'action') is distinct from 'string'
    or jsonb_typeof(input_intent->'is_visible') is distinct from 'boolean'
    or input_intent->'base_collection_revision' is distinct from 'null'::jsonb
    or jsonb_typeof(input_intent->'text_working') is distinct from 'object'
  then return jsonb_build_object('status','invalid_initialization_intent'); end if;
  payload := input_intent->'text_working';
  if not (payload ?& array['kind','text'])
    or exists(select 1 from jsonb_object_keys(payload) k where k not in ('kind','text'))
    or jsonb_typeof(payload->'kind') is distinct from 'string'
    or payload->>'kind' is distinct from 'text'
    or jsonb_typeof(payload->'text') not in ('string','null')
    or char_length(payload->>'text')>16384
  then return jsonb_build_object('status','invalid_initialization_intent'); end if;
  if exists(select 1 from core.identity_block_collections_working c where c.owner_id=current_owner) then
    return jsonb_build_object('status','already_initialized'); end if;
  insert into core.identity_block_collections_working(owner_id) values(current_owner);
  insert into core.identity_blocks_working(owner_id,kind,position,is_visible)
    values(current_owner,'text',1,(input_intent->>'is_visible')::boolean)
    returning block_id into new_block;
  insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
    values(new_block,current_owner,'text',payload->>'text');
  return jsonb_build_object('status','success','block_id',new_block,'collection_revision',1);
end;
$$;
revoke all on function api.initialize_current_owner_blocks_from_text(jsonb) from public,anon,authenticated,service_role;
comment on function api.initialize_current_owner_blocks_from_text(jsonb) is
  'Staged private explicit manually supplied first Text. Absent collection only/server UUID/position1/atomic raw Text payload; no source import/provenance/publication. All execution withheld.';
commit;

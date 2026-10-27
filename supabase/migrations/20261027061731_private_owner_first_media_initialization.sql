begin;
create function api.initialize_current_owner_blocks_from_media(input_intent jsonb)
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
  if not (input_intent ?& array['action','base_collection_revision','is_visible','media_working'])
    or exists(select 1 from jsonb_object_keys(input_intent) k where k not in ('action','base_collection_revision','is_visible','media_working'))
    or input_intent->>'action' is distinct from 'initialize_media_block'
    or jsonb_typeof(input_intent->'action') is distinct from 'string'
    or jsonb_typeof(input_intent->'is_visible') is distinct from 'boolean'
    or input_intent->'base_collection_revision' is distinct from 'null'::jsonb
    or jsonb_typeof(input_intent->'media_working') is distinct from 'object'
  then return jsonb_build_object('status','invalid_initialization_intent'); end if;
  payload := input_intent->'media_working';
  if not (payload ?& array['kind','asset_key','alt_text'])
    or exists(select 1 from jsonb_object_keys(payload) k where k not in ('kind','asset_key','alt_text'))
    or jsonb_typeof(payload->'kind') is distinct from 'string'
    or payload->>'kind' is distinct from 'media'
    or jsonb_typeof(payload->'asset_key') not in ('string','null')
    or (payload->>'asset_key' is not null and payload->>'asset_key' !~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$')
    or jsonb_typeof(payload->'alt_text') not in ('string','null')
    or char_length(payload->>'alt_text')>2048
  then return jsonb_build_object('status','invalid_initialization_intent'); end if;
  if exists(select 1 from core.identity_block_collections_working c where c.owner_id=current_owner) then
    return jsonb_build_object('status','already_initialized'); end if;
  if payload->>'asset_key' is not null then
    perform 1 from core.profile_media_assets a
      join core.profile_media_upload_intents i on i.id=a.source_upload_intent_id and i.owner_id=a.owner_id
      where a.owner_id=current_owner and a.asset_key=payload->>'asset_key'
        and i.status='consumed' and a.object_key='working/profile/'||a.asset_key||'.webp'
        and a.stored_content_type='image/webp' and a.byte_size between 12 and 3145728
        and a.width between 1 and 2048 and a.height between 1 and 2048
        and a.width::bigint*a.height::bigint<=4194304
      for share of a,i;
    if not found then return jsonb_build_object('status','invalid_asset'); end if;
  end if;
  insert into core.identity_block_collections_working(owner_id) values(current_owner);
  insert into core.identity_blocks_working(owner_id,kind,position,is_visible)
    values(current_owner,'media',1,(input_intent->>'is_visible')::boolean)
    returning block_id into new_block;
  insert into core.identity_block_media_working(block_id,owner_id,kind,asset_key,alt_text)
    values(new_block,current_owner,'media',payload->>'asset_key',payload->>'alt_text');
  return jsonb_build_object('status','success','block_id',new_block,'collection_revision',1);
end;
$$;
revoke all on function api.initialize_current_owner_blocks_from_media(jsonb) from public,anon,authenticated,service_role;
comment on function api.initialize_current_owner_blocks_from_media(jsonb) is
  'Staged private explicit manually supplied first Media. Absent collection only/server UUID/position1/atomic raw Media payload with same-Owner consumed asset locks; no source import/provenance/publication. All execution withheld.';
commit;

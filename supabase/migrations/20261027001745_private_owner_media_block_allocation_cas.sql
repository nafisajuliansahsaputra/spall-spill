begin;
create function api.add_current_owner_media_block_working(input_intent jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  current_owner uuid;
  bound_owner uuid;
  account core.owner_account_state;
  completed timestamptz;
  base_revision numeric;
  collection_revision bigint;
  new_block uuid;
  last_position integer;
  member_count integer;
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
  if jsonb_typeof(input_intent) is distinct from 'object' then return jsonb_build_object('status','invalid_add_intent'); end if;
  if not (input_intent ?& array['action','base_collection_revision','is_visible','media_working'])
    or exists(select 1 from jsonb_object_keys(input_intent) k where k not in ('action','base_collection_revision','is_visible','media_working'))
    or input_intent->>'action' is distinct from 'add_media_block'
    or jsonb_typeof(input_intent->'action') is distinct from 'string'
    or jsonb_typeof(input_intent->'is_visible') is distinct from 'boolean'
    or jsonb_typeof(input_intent->'base_collection_revision') is distinct from 'number'
    or jsonb_typeof(input_intent->'media_working') is distinct from 'object'
  then return jsonb_build_object('status','invalid_add_intent'); end if;
  base_revision := (input_intent->>'base_collection_revision')::numeric;
  if base_revision not between 1 and 9007199254740991 or trunc(base_revision)<>base_revision then
    return jsonb_build_object('status','invalid_add_intent'); end if;
  payload := input_intent->'media_working';
  if not (payload ?& array['kind','asset_key','alt_text'])
    or exists(select 1 from jsonb_object_keys(payload) k where k not in ('kind','asset_key','alt_text'))
    or jsonb_typeof(payload->'kind') is distinct from 'string'
    or payload->>'kind' is distinct from 'media'
    or jsonb_typeof(payload->'asset_key') not in ('string','null')
    or (payload->>'asset_key' is not null and payload->>'asset_key' !~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$')
    or jsonb_typeof(payload->'alt_text') not in ('string','null')
    or char_length(payload->>'alt_text')>2048
  then return jsonb_build_object('status','invalid_add_intent'); end if;
  select c.revision into collection_revision from core.identity_block_collections_working c where c.owner_id=current_owner for update;
  if not found or collection_revision not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable'); end if;
  if collection_revision<>base_revision then return jsonb_build_object('status','stale_write'); end if;
  if collection_revision=9007199254740991 then return jsonb_build_object('status','revision_exhausted'); end if;
  -- 12.231: inherited membership availability bound; not full Media canvas or product quota.
  select count(*) into member_count from
    (select 1 from core.identity_blocks_working b where b.owner_id=current_owner limit 1000) members;
  if member_count>=1000 then return jsonb_build_object('status','unavailable'); end if;
  select max(b.position) into last_position from core.identity_blocks_working b where b.owner_id=current_owner;
  if last_position=2147483647 then return jsonb_build_object('status','position_exhausted'); end if;
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
  insert into core.identity_blocks_working(owner_id,kind,position,is_visible)
    values(current_owner,'media',coalesce(last_position,0)+1,(input_intent->>'is_visible')::boolean)
    returning block_id into new_block;
  insert into core.identity_block_media_working(block_id,owner_id,kind,asset_key,alt_text)
    values(new_block,current_owner,'media',payload->>'asset_key',payload->>'alt_text');
  update core.identity_block_collections_working set revision=collection_revision+1,updated_at=now() where owner_id=current_owner;
  return jsonb_build_object('status','success','block_id',new_block,'collection_revision',collection_revision+1);
end;
$$;
revoke all on function api.add_current_owner_media_block_working(jsonb) from public,anon,authenticated,service_role;
comment on function api.add_current_owner_media_block_working(jsonb) is
  'Staged private explicit Media addition to existing own collection. Aggregate CAS/server UUID/safe append/atomic raw Media payload; membership availability bound1000, not a product quota or full Media canvas. Source/provenance/Published retained; all execution withheld.';
commit;

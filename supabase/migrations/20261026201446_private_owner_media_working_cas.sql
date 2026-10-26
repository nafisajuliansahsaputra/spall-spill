begin;
create function api.save_current_owner_block_media_working(input_working jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  current_owner uuid;
  bound_owner uuid;
  account core.owner_account_state;
  completed timestamptz;
  base_revision numeric;
  collection_revision bigint;
  target_block uuid;
  target_kind core.identity_block_kind;
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
  if jsonb_typeof(input_working) is distinct from 'object' then return jsonb_build_object('status','invalid_media_working'); end if;
  if not (input_working ?& array['block_id','base_collection_revision','media_working'])
    or exists(select 1 from jsonb_object_keys(input_working) k where k not in ('block_id','base_collection_revision','media_working'))
    or jsonb_typeof(input_working->'block_id') is distinct from 'string'
    or input_working->>'block_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(input_working->'base_collection_revision') is distinct from 'number'
    or jsonb_typeof(input_working->'media_working') is distinct from 'object'
  then return jsonb_build_object('status','invalid_media_working'); end if;
  base_revision := (input_working->>'base_collection_revision')::numeric;
  if base_revision not between 1 and 9007199254740991 or trunc(base_revision)<>base_revision then
    return jsonb_build_object('status','invalid_media_working'); end if;
  payload := input_working->'media_working';
  if not (payload ?& array['kind','asset_key','alt_text'])
    or exists(select 1 from jsonb_object_keys(payload) k where k not in ('kind','asset_key','alt_text'))
    or jsonb_typeof(payload->'kind') is distinct from 'string'
    or payload->>'kind' is distinct from 'media'
    or jsonb_typeof(payload->'asset_key') not in ('string','null')
    or (payload->>'asset_key' is not null and payload->>'asset_key' !~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$')
    or jsonb_typeof(payload->'alt_text') not in ('string','null')
    or char_length(payload->>'alt_text')>2048
  then return jsonb_build_object('status','invalid_media_working'); end if;
  select c.revision into collection_revision from core.identity_block_collections_working c where c.owner_id=current_owner for update;
  if not found or collection_revision not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable'); end if;
  if collection_revision<>base_revision then return jsonb_build_object('status','stale_write'); end if;
  if collection_revision=9007199254740991 then return jsonb_build_object('status','revision_exhausted'); end if;
  target_block := (input_working->>'block_id')::uuid;
  select b.kind into target_kind from core.identity_blocks_working b where b.block_id=target_block and b.owner_id=current_owner for update;
  if not found then return jsonb_build_object('status','block_not_found'); end if;
  if target_kind<>'media' then return jsonb_build_object('status','unsupported_block_kind'); end if;
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
  insert into core.identity_block_media_working(block_id,owner_id,kind,asset_key,alt_text)
    values(target_block,current_owner,target_kind,payload->>'asset_key',payload->>'alt_text')
    on conflict(block_id) do update set asset_key=excluded.asset_key,alt_text=excluded.alt_text,updated_at=now();
  update core.identity_block_collections_working set revision=collection_revision+1,updated_at=now() where owner_id=current_owner;
  return jsonb_build_object('status','success','block_id',target_block,'collection_revision',collection_revision+1);
end;
$$;
revoke all on function api.save_current_owner_block_media_working(jsonb) from public,anon,authenticated,service_role;
comment on function api.save_current_owner_block_media_working(jsonb) is
  'Staged private explicit existing Media payload save. Current Owner/member/collection CAS and locked same-Owner consumed canonical registry eligibility. Raw nullable alt recovery, one aggregate bump. No membership, registry, blob or Published mutation; all execution withheld.';
commit;

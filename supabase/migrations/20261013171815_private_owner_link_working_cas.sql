begin;
create function api.save_current_owner_block_link_working(input_working jsonb)
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
  if jsonb_typeof(input_working) is distinct from 'object' then return jsonb_build_object('status','invalid_link_working'); end if;
  if not (input_working ?& array['block_id','base_collection_revision','link_working'])
    or exists(select 1 from jsonb_object_keys(input_working) k where k not in ('block_id','base_collection_revision','link_working'))
    or jsonb_typeof(input_working->'block_id') is distinct from 'string'
    or input_working->>'block_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(input_working->'base_collection_revision') is distinct from 'number'
    or jsonb_typeof(input_working->'link_working') is distinct from 'object'
  then return jsonb_build_object('status','invalid_link_working'); end if;
  base_revision := (input_working->>'base_collection_revision')::numeric;
  if base_revision not between 1 and 9007199254740991 or trunc(base_revision)<>base_revision then
    return jsonb_build_object('status','invalid_link_working'); end if;
  payload := input_working->'link_working';
  if not (payload ?& array['kind','title','social_platform','destination_url'])
    or exists(select 1 from jsonb_object_keys(payload) k where k not in ('kind','title','social_platform','destination_url'))
    or jsonb_typeof(payload->'kind') is distinct from 'string'
    or payload->>'kind' not in ('social','generic_link')
  then return jsonb_build_object('status','invalid_link_working'); end if;
  foreach field in array array['title','social_platform','destination_url'] loop
    limit_chars := case field when 'title' then 512 when 'social_platform' then 40 else 2048 end;
    if jsonb_typeof(payload->field) not in ('string','null') or char_length(payload->>field)>limit_chars then
      return jsonb_build_object('status','invalid_link_working'); end if;
  end loop;
  select c.revision into collection_revision from core.identity_block_collections_working c where c.owner_id=current_owner for update;
  if not found or collection_revision not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable'); end if;
  if collection_revision<>base_revision then return jsonb_build_object('status','stale_write'); end if;
  if collection_revision=9007199254740991 then return jsonb_build_object('status','revision_exhausted'); end if;
  target_block := (input_working->>'block_id')::uuid;
  select b.kind into target_kind from core.identity_blocks_working b where b.block_id=target_block and b.owner_id=current_owner for update;
  if not found then return jsonb_build_object('status','block_not_found'); end if;
  if target_kind not in ('social','generic_link') then return jsonb_build_object('status','unsupported_block_kind'); end if;
  if target_kind::text<>payload->>'kind' then return jsonb_build_object('status','invalid_link_working'); end if;
  insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
    values(target_block,current_owner,target_kind,payload->>'title',payload->>'social_platform',payload->>'destination_url')
    on conflict(block_id) do update set title=excluded.title,social_platform=excluded.social_platform,
      destination_url=excluded.destination_url,updated_at=now();
  update core.identity_block_collections_working set revision=collection_revision+1,updated_at=now() where owner_id=current_owner;
  return jsonb_build_object('status','success','block_id',target_block,'collection_revision',collection_revision+1);
end;
$$;
revoke all on function api.save_current_owner_block_link_working(jsonb) from public,anon,authenticated,service_role;
comment on function api.save_current_owner_block_link_working(jsonb) is
  'Staged private typed link Working save. Owner/collection CAS and actual kind binding; recoverable raw fields, one bump, no member/source/provenance/publication changes. All execution withheld pending guarded transport/runtime gates.';
commit;

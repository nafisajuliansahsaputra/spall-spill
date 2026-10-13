begin;
create function api.move_current_owner_block_working(input_working jsonb)
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
  move_direction text;
  target_position integer;
  neighbor_block uuid;
  neighbor_position integer;
  changed_rows integer;
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
  if jsonb_typeof(input_working) is distinct from 'object' then return jsonb_build_object('status','invalid_block_move'); end if;
  if not (input_working ?& array['block_id','base_collection_revision','direction'])
    or exists(select 1 from jsonb_object_keys(input_working) k where k not in ('block_id','base_collection_revision','direction'))
    or jsonb_typeof(input_working->'block_id') is distinct from 'string'
    or input_working->>'block_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(input_working->'base_collection_revision') is distinct from 'number'
    or jsonb_typeof(input_working->'direction') is distinct from 'string'
    or input_working->>'direction' not in ('up','down')
  then return jsonb_build_object('status','invalid_block_move'); end if;
  base_revision := (input_working->>'base_collection_revision')::numeric;
  if base_revision not between 1 and 9007199254740991 or trunc(base_revision)<>base_revision then
    return jsonb_build_object('status','invalid_block_move'); end if;
  select c.revision into collection_revision from core.identity_block_collections_working c where c.owner_id=current_owner for update;
  if not found or collection_revision not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable'); end if;
  if collection_revision<>base_revision then return jsonb_build_object('status','stale_write'); end if;
  if collection_revision=9007199254740991 then return jsonb_build_object('status','revision_exhausted'); end if;
  target_block := (input_working->>'block_id')::uuid;
  select b.position into target_position from core.identity_blocks_working b
    where b.block_id=target_block and b.owner_id=current_owner for update;
  if not found then return jsonb_build_object('status','block_not_found'); end if;
  move_direction := input_working->>'direction';
  if move_direction='up' then
    select b.block_id,b.position into neighbor_block,neighbor_position from core.identity_blocks_working b
      where b.owner_id=current_owner and b.position<target_position order by b.position desc limit 1 for update;
  else
    select b.block_id,b.position into neighbor_block,neighbor_position from core.identity_blocks_working b
      where b.owner_id=current_owner and b.position>target_position order by b.position asc limit 1 for update;
  end if;
  if not found then return jsonb_build_object('status','move_not_available'); end if;
  -- The existing deferrable immediate unique constraint checks at statement end.
  -- Swap existing values together: no sentinel, renumbering or SET CONSTRAINTS.
  update core.identity_blocks_working set
    position=case block_id when target_block then neighbor_position else target_position end,updated_at=now()
    where owner_id=current_owner and block_id in (target_block,neighbor_block);
  get diagnostics changed_rows = row_count;
  if changed_rows<>2 then raise exception 'Working block move invariant failed'; end if;
  update core.identity_block_collections_working set revision=collection_revision+1,updated_at=now() where owner_id=current_owner;
  return jsonb_build_object('status','success','block_id',target_block,'direction',move_direction,'collection_revision',collection_revision+1);
end;
$$;
revoke all on function api.move_current_owner_block_working(jsonb) from public,anon,authenticated,service_role;
comment on function api.move_current_owner_block_working(jsonb) is
  'Staged private adjacent Working block move. Current Owner/aggregate CAS; server neighbor and atomic position swap, stable IDs/payload/visibility. All execution withheld.';
commit;

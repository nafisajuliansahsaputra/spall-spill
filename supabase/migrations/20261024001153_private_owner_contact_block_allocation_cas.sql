begin;
create function api.add_current_owner_contact_block_working(input_intent jsonb)
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
  if not (input_intent ?& array['action','base_collection_revision','is_visible','contact_working'])
    or exists(select 1 from jsonb_object_keys(input_intent) k where k not in ('action','base_collection_revision','is_visible','contact_working'))
    or input_intent->>'action' is distinct from 'add_contact_block'
    or jsonb_typeof(input_intent->'action') is distinct from 'string'
    or jsonb_typeof(input_intent->'is_visible') is distinct from 'boolean'
    or jsonb_typeof(input_intent->'base_collection_revision') is distinct from 'number'
    or jsonb_typeof(input_intent->'contact_working') is distinct from 'object'
  then return jsonb_build_object('status','invalid_add_intent'); end if;
  base_revision := (input_intent->>'base_collection_revision')::numeric;
  if base_revision not between 1 and 9007199254740991 or trunc(base_revision)<>base_revision then
    return jsonb_build_object('status','invalid_add_intent'); end if;
  payload := input_intent->'contact_working';
  if not (payload ?& array['kind','contact_type','label','value'])
    or exists(select 1 from jsonb_object_keys(payload) k where k not in ('kind','contact_type','label','value'))
    or jsonb_typeof(payload->'kind') is distinct from 'string'
    or payload->>'kind' is distinct from 'contact'
    or jsonb_typeof(payload->'contact_type') not in ('string','null')
    or (payload->>'contact_type' is not null and payload->>'contact_type' not in ('email','whatsapp','phone'))
    or jsonb_typeof(payload->'label') not in ('string','null')
    or jsonb_typeof(payload->'value') not in ('string','null')
    or char_length(payload->>'label')>512 or char_length(payload->>'value')>2048
  then return jsonb_build_object('status','invalid_add_intent'); end if;
  select c.revision into collection_revision from core.identity_block_collections_working c where c.owner_id=current_owner for update;
  if not found or collection_revision not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable'); end if;
  if collection_revision<>base_revision then return jsonb_build_object('status','stale_write'); end if;
  if collection_revision=9007199254740991 then return jsonb_build_object('status','revision_exhausted'); end if;
  -- 12.189: inherited membership availability bound; not full Contact canvas or product quota.
  select count(*) into member_count from
    (select 1 from core.identity_blocks_working b where b.owner_id=current_owner limit 1000) members;
  if member_count>=1000 then return jsonb_build_object('status','unavailable'); end if;
  select max(b.position) into last_position from core.identity_blocks_working b where b.owner_id=current_owner;
  if last_position=2147483647 then return jsonb_build_object('status','position_exhausted'); end if;
  insert into core.identity_blocks_working(owner_id,kind,position,is_visible)
    values(current_owner,'contact',coalesce(last_position,0)+1,(input_intent->>'is_visible')::boolean)
    returning block_id into new_block;
  insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_type,label,contact_value)
    values(new_block,current_owner,'contact',payload->>'contact_type',payload->>'label',payload->>'value');
  update core.identity_block_collections_working set revision=collection_revision+1,updated_at=now() where owner_id=current_owner;
  return jsonb_build_object('status','success','block_id',new_block,'collection_revision',collection_revision+1);
end;
$$;
revoke all on function api.add_current_owner_contact_block_working(jsonb) from public,anon,authenticated,service_role;
comment on function api.add_current_owner_contact_block_working(jsonb) is
  'Staged private explicit Contact addition to existing own collection. Aggregate CAS/server UUID/safe append/atomic raw Contact payload; membership availability bound1000, not a product quota or full Contact canvas. Source/provenance/Published retained; all execution withheld.';
commit;

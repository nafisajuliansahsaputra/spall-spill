begin;
create table core.identity_block_spill_cta_working (
  block_id uuid primary key,
  owner_id uuid not null,
  kind core.identity_block_kind not null check(kind='spill_cta'),
  created_at timestamptz not null default now(),
  foreign key(block_id,owner_id,kind) references core.identity_blocks_working(block_id,owner_id,kind) on delete cascade
);
create index identity_block_spill_cta_working_owner_idx on core.identity_block_spill_cta_working(owner_id);
alter table core.identity_block_spill_cta_working enable row level security;
revoke all on table core.identity_block_spill_cta_working from public,anon,authenticated,service_role;
comment on table core.identity_block_spill_cta_working is
  'Private explicit structured own-Spill Working marker. No label/URL/public availability or publication authority, no backfill. Membership Owner/kind bound; RLS/no grants.';
create function api.add_current_owner_spill_cta_block_working(input_intent jsonb)
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
  if not (input_intent ?& array['action','base_collection_revision','is_visible','spill_cta_working'])
    or exists(select 1 from jsonb_object_keys(input_intent) k where k not in ('action','base_collection_revision','is_visible','spill_cta_working'))
    or input_intent->>'action' is distinct from 'add_spill_cta_block'
    or jsonb_typeof(input_intent->'action') is distinct from 'string'
    or jsonb_typeof(input_intent->'is_visible') is distinct from 'boolean'
    or jsonb_typeof(input_intent->'base_collection_revision') is distinct from 'number'
    or jsonb_typeof(input_intent->'spill_cta_working') is distinct from 'object'
  then return jsonb_build_object('status','invalid_add_intent'); end if;
  base_revision := (input_intent->>'base_collection_revision')::numeric;
  if base_revision not between 1 and 9007199254740991 or trunc(base_revision)<>base_revision then
    return jsonb_build_object('status','invalid_add_intent'); end if;
  payload := input_intent->'spill_cta_working';
  if payload is distinct from '{"kind":"spill_cta","target":"owner_spill"}'::jsonb then
    return jsonb_build_object('status','invalid_add_intent'); end if;
  select c.revision into collection_revision from core.identity_block_collections_working c where c.owner_id=current_owner for update;
  if not found or collection_revision not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable'); end if;
  if collection_revision<>base_revision then return jsonb_build_object('status','stale_write'); end if;
  if collection_revision=9007199254740991 then return jsonb_build_object('status','revision_exhausted'); end if;
  -- 12.243: inherited membership availability bound; not full Identity canvas or product quota.
  select count(*) into member_count from
    (select 1 from core.identity_blocks_working b where b.owner_id=current_owner limit 1000) members;
  if member_count>=1000 then return jsonb_build_object('status','unavailable'); end if;
  select max(b.position) into last_position from core.identity_blocks_working b where b.owner_id=current_owner;
  if last_position=2147483647 then return jsonb_build_object('status','position_exhausted'); end if;
  insert into core.identity_blocks_working(owner_id,kind,position,is_visible)
    values(current_owner,'spill_cta',coalesce(last_position,0)+1,(input_intent->>'is_visible')::boolean)
    returning block_id into new_block;
  insert into core.identity_block_spill_cta_working(block_id,owner_id,kind)
    values(new_block,current_owner,'spill_cta');
  update core.identity_block_collections_working set revision=collection_revision+1,updated_at=now() where owner_id=current_owner;
  return jsonb_build_object('status','success','block_id',new_block,'collection_revision',collection_revision+1);
end;
$$;
revoke all on function api.add_current_owner_spill_cta_block_working(jsonb) from public,anon,authenticated,service_role;

create function api.initialize_current_owner_blocks_from_spill_cta(input_intent jsonb)
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
  if not (input_intent ?& array['action','base_collection_revision','is_visible','spill_cta_working'])
    or exists(select 1 from jsonb_object_keys(input_intent) k where k not in ('action','base_collection_revision','is_visible','spill_cta_working'))
    or input_intent->>'action' is distinct from 'initialize_spill_cta_block'
    or jsonb_typeof(input_intent->'action') is distinct from 'string'
    or jsonb_typeof(input_intent->'is_visible') is distinct from 'boolean'
    or input_intent->'base_collection_revision' is distinct from 'null'::jsonb
    or jsonb_typeof(input_intent->'spill_cta_working') is distinct from 'object'
  then return jsonb_build_object('status','invalid_initialization_intent'); end if;
  payload := input_intent->'spill_cta_working';
  if payload is distinct from '{"kind":"spill_cta","target":"owner_spill"}'::jsonb then
    return jsonb_build_object('status','invalid_initialization_intent'); end if;
  if exists(select 1 from core.identity_block_collections_working c where c.owner_id=current_owner) then
    return jsonb_build_object('status','already_initialized'); end if;
  insert into core.identity_block_collections_working(owner_id) values(current_owner);
  insert into core.identity_blocks_working(owner_id,kind,position,is_visible)
    values(current_owner,'spill_cta',1,(input_intent->>'is_visible')::boolean)
    returning block_id into new_block;
  insert into core.identity_block_spill_cta_working(block_id,owner_id,kind)
    values(new_block,current_owner,'spill_cta');
  return jsonb_build_object('status','success','block_id',new_block,'collection_revision',1);
end;
$$;
revoke all on function api.initialize_current_owner_blocks_from_spill_cta(jsonb) from public,anon,authenticated,service_role;
create function api.resolve_current_owner_spill_cta_block_working(input_block_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  context jsonb;
  current_owner uuid;
  working record;
begin
  context := api.resolve_current_owner_home_context();
  if context->>'status' is distinct from 'success' or input_block_id is null then
    return jsonb_build_object('status','unavailable');
  end if;
  current_owner := (api.resolve_current_owner_state()->>'owner_id')::uuid;
  select b.block_id,b.kind,b.is_visible,b.position,c.revision,m.block_id payload_id
    into working
  from core.identity_blocks_working b
  join core.identity_block_collections_working c on c.owner_id=b.owner_id
  left join core.identity_block_spill_cta_working m on m.block_id=b.block_id and m.owner_id=b.owner_id and m.kind=b.kind
  where b.block_id=input_block_id and b.owner_id=current_owner and b.kind='spill_cta';
  if not found or working.revision not between 1 and 9007199254740991 then
    return jsonb_build_object('status','unavailable');
  end if;
  return context || jsonb_build_object('collection_revision',working.revision,
    'block',jsonb_build_object('block_id',working.block_id,'kind',working.kind,
      'is_visible',working.is_visible,'position',working.position,
      'payload_state',case when working.payload_id is null then 'missing' else 'present' end,
      'spill_cta_working',case when working.payload_id is null then null
        else jsonb_build_object('target','owner_spill') end));
end;
$$;
revoke all on function api.resolve_current_owner_spill_cta_block_working(uuid) from public,anon,authenticated,service_role;

comment on function api.add_current_owner_spill_cta_block_working(jsonb) is 'Staged private explicit own-Spill CTA append. Owner/binding/collection locks and exact CAS; atomic marker/member/revision; no label, URL, public eligibility or activation. All grants withheld.';
comment on function api.initialize_current_owner_blocks_from_spill_cta(jsonb) is 'Staged private explicit first own-Spill CTA. Absent collection only; no onboarding import or automatic public integration; atomic marker/member/collection. All grants withheld.';
comment on function api.resolve_current_owner_spill_cta_block_working(uuid) is 'Staged private current-Owner selected CTA read, uniform denial. Missing marker never inferred; own-Spill semantic target only, no public availability/URL/label/publication authority. All grants withheld.';
commit;

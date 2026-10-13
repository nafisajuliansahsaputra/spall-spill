begin;
create table core.identity_block_initialization_provenance (
  owner_id uuid primary key references core.identity_block_collections_working(owner_id) on delete cascade,
  initial_block_id uuid not null,
  source_connection_revision bigint not null check (source_connection_revision between 1 and 9007199254740991),
  source_connection_kind core.identity_connection_kind not null,
  source_social_platform text,
  source_destination_url text not null check (char_length(source_destination_url) between 8 and 2048
    and source_destination_url ~* '^https?://[^/?#]+([/?#].*)?$'
    and source_destination_url !~ '[[:space:][:cntrl:]]' and position(chr(92) in source_destination_url)=0),
  initial_title text check (initial_title is null or char_length(initial_title)<=512),
  created_at timestamptz not null default now(),
  constraint identity_block_initialization_source_shape check (
    (source_connection_kind='generic_link' and source_social_platform is null)
    or (source_connection_kind='social' and source_social_platform is not null
      and source_social_platform ~ '^[a-z0-9][a-z0-9_-]{0,39}$'))
);
alter table core.identity_block_initialization_provenance enable row level security;
revoke all on table core.identity_block_initialization_provenance from public,anon,authenticated,service_role;
comment on table core.identity_block_initialization_provenance is
  'Private original first-connection import provenance. Historical initial block pointer, not current membership authority or public/Audit projection. No backfill or runtime updater.';

create function api.initialize_current_owner_blocks_from_connection(input_intent jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  current_owner uuid;
  bound_owner uuid;
  account core.owner_account_state;
  completed timestamptz;
  source core.identity_connection_working%rowtype;
  acknowledged numeric;
  new_block uuid;
begin
  if actor is null then return jsonb_build_object('status','unauthenticated'); end if;
  -- Preserve canonical Owner-first lock order. Recheck binding after any Owner wait.
  select o.id,o.account_state,o.onboarding_completed_at into current_owner,account,completed
    from core.owner_auth_bindings b join core.owners o on o.id=b.owner_id
    where b.auth_user_id=actor for update of o;
  if not found then return jsonb_build_object('status','owner_missing'); end if;
  select b.owner_id into bound_owner from core.owner_auth_bindings b
    where b.auth_user_id=actor for update;
  if not found or bound_owner is distinct from current_owner then return jsonb_build_object('status','unavailable'); end if;
  if account<>'active' or completed is null then return jsonb_build_object('status','owner_not_eligible'); end if;
  if api.resolve_current_owner_home_context()->>'status' is distinct from 'success' then
    return jsonb_build_object('status','unavailable'); end if;
  if jsonb_typeof(input_intent) is distinct from 'object' then return jsonb_build_object('status','invalid_import_intent'); end if;
  if not (input_intent ?& array['action','source_revision','title','base_collection_revision'])
    or exists(select 1 from jsonb_object_keys(input_intent) k where k not in ('action','source_revision','title','base_collection_revision'))
    or input_intent->>'action' is distinct from 'import_onboarding_connection'
    or input_intent->'base_collection_revision' is distinct from 'null'::jsonb
    or jsonb_typeof(input_intent->'source_revision') is distinct from 'number'
    or jsonb_typeof(input_intent->'title') not in ('string','null')
    or char_length(input_intent->>'title')>512
  then return jsonb_build_object('status','invalid_import_intent'); end if;
  acknowledged := (input_intent->>'source_revision')::numeric;
  if acknowledged not between 1 and 9007199254740991 or trunc(acknowledged)<>acknowledged then
    return jsonb_build_object('status','invalid_import_intent'); end if;
  if exists(select 1 from core.identity_block_collections_working c where c.owner_id=current_owner) then
    return jsonb_build_object('status','already_initialized'); end if;
  select c.* into source from core.identity_connection_working c where c.owner_id=current_owner for update;
  if not found then return jsonb_build_object('status','no_source'); end if;
  if source.revision not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable'); end if;
  if source.revision<>acknowledged then return jsonb_build_object('status','stale_source'); end if;
  insert into core.identity_block_collections_working(owner_id) values(current_owner);
  insert into core.identity_blocks_working(owner_id,kind,position,is_visible)
    values(current_owner,source.connection_kind::text::core.identity_block_kind,1,true) returning block_id into new_block;
  insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
    values(new_block,current_owner,source.connection_kind::text::core.identity_block_kind,
      input_intent->>'title',source.social_platform,source.destination_url);
  insert into core.identity_block_initialization_provenance(owner_id,initial_block_id,source_connection_revision,
    source_connection_kind,source_social_platform,source_destination_url,initial_title)
    values(current_owner,new_block,source.revision,source.connection_kind,source.social_platform,source.destination_url,input_intent->>'title');
  return jsonb_build_object('status','success','collection_revision',1,'block_id',new_block);
end;
$$;
revoke all on function api.initialize_current_owner_blocks_from_connection(jsonb) from public,anon,authenticated,service_role;
comment on function api.initialize_current_owner_blocks_from_connection(jsonb) is
  'Staged private explicit acknowledged-source import. Atomic absent collection/membership/link/provenance; no overwrite, source mutation or publication. All execution withheld pending current-session transport/runtime gates.';
commit;

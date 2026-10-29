begin;
create table core.identity_profile_text_working (
  owner_id uuid primary key references core.identity_working(owner_id) on delete cascade,
  display_name text check(char_length(display_name)<=16384),
  bio text check(char_length(bio)<=16384),
  revision bigint not null check(revision between 1 and 9007199254740991),
  source_profile_revision bigint not null check(source_profile_revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table core.identity_profile_text_working enable row level security;
revoke all on table core.identity_profile_text_working from public,anon,authenticated,service_role;
comment on table core.identity_profile_text_working is
  'Private bounded recoverable raw profile text. Explicit saved overlay, not valid/published profile or media selection. No defaults/backfill/grants.';
create function api.save_current_owner_profile_text_working(input_working jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  current_owner uuid;
  bound_owner uuid;
  account core.owner_account_state;
  completed timestamptz;
  source_revision bigint;
  text_revision bigint;
  source_base numeric;
  text_base numeric;
  payload jsonb;
  exists_text boolean;
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
  if jsonb_typeof(input_working) is distinct from 'object' then return jsonb_build_object('status','invalid_profile_text_working'); end if;
  if not (input_working ?& array['action','base_profile_revision','base_text_revision','profile_text_working'])
    or exists(select 1 from jsonb_object_keys(input_working) k where k not in ('action','base_profile_revision','base_text_revision','profile_text_working'))
    or input_working->>'action' is distinct from 'save_profile_text_working'
    or jsonb_typeof(input_working->'action') is distinct from 'string'
    or jsonb_typeof(input_working->'base_profile_revision') is distinct from 'number'
    or jsonb_typeof(input_working->'base_text_revision') not in ('number','null')
    or jsonb_typeof(input_working->'profile_text_working') is distinct from 'object'
  then return jsonb_build_object('status','invalid_profile_text_working'); end if;
  source_base := (input_working->>'base_profile_revision')::numeric;
  text_base := (input_working->>'base_text_revision')::numeric;
  if source_base not between 1 and 9007199254740991 or trunc(source_base)<>source_base
    or (text_base is not null and (text_base not between 1 and 9007199254740991 or trunc(text_base)<>text_base))
  then return jsonb_build_object('status','invalid_profile_text_working'); end if;
  payload := input_working->'profile_text_working';
  if not (payload ?& array['display_name','bio'])
    or exists(select 1 from jsonb_object_keys(payload) k where k not in ('display_name','bio'))
    or jsonb_typeof(payload->'display_name') not in ('string','null')
    or jsonb_typeof(payload->'bio') not in ('string','null')
    or char_length(payload->>'display_name')>16384 or char_length(payload->>'bio')>16384
  then return jsonb_build_object('status','invalid_profile_text_working'); end if;
  select p.revision into source_revision from core.identity_working p where p.owner_id=current_owner for update;
  if not found or source_revision not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable'); end if;
  if source_revision<>source_base then return jsonb_build_object('status','stale_source'); end if;
  select p.revision into text_revision from core.identity_profile_text_working p where p.owner_id=current_owner for update;
  exists_text := found;
  if (exists_text and (text_base is null or text_base<>text_revision)) or (not exists_text and text_base is not null) then
    return jsonb_build_object('status','stale_write'); end if;
  if exists_text and text_revision=9007199254740991 then return jsonb_build_object('status','revision_exhausted'); end if;
  text_revision := case when exists_text then text_revision+1 else 1 end;
  insert into core.identity_profile_text_working(owner_id,display_name,bio,revision,source_profile_revision)
    values(current_owner,payload->>'display_name',payload->>'bio',text_revision,source_revision)
    on conflict(owner_id) do update set display_name=excluded.display_name,bio=excluded.bio,
      revision=excluded.revision,source_profile_revision=excluded.source_profile_revision,updated_at=now();
  return jsonb_build_object('status','success','text_revision',text_revision,'source_profile_revision',source_revision);
end;
$$;
revoke all on function api.save_current_owner_profile_text_working(jsonb) from public,anon,authenticated,service_role;
create function api.resolve_current_owner_editable_identity_working_page(input_request jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  page jsonb;
  current_owner uuid;
  saved core.identity_profile_text_working%rowtype;
  result jsonb;
  present boolean;
begin
  page := api.resolve_current_owner_identity_working_page(input_request);
  if page->>'status' is distinct from 'success' then return page; end if;
  current_owner := (api.resolve_current_owner_state()->>'owner_id')::uuid;
  select * into saved from core.identity_profile_text_working where owner_id=current_owner;
  present := found;
  result := page || jsonb_build_object(
    'profile_text_working',case when present then jsonb_build_object('display_name',saved.display_name,'bio',saved.bio,
      'revision',saved.revision,'source_profile_revision',saved.source_profile_revision) else null end,
    'profile_text_state',case when not present then 'source'
      when saved.source_profile_revision=(page#>>'{profile_working,revision}')::bigint then 'saved' else 'source_changed' end,
    'revision_vector',(page->'revision_vector') || jsonb_build_object('profile_text',case when present then saved.revision else null end));
  if octet_length(result::text)>8388608 then return jsonb_build_object('status','unavailable'); end if;
  return result;
end;
$$;
revoke all on function api.resolve_current_owner_editable_identity_working_page(jsonb) from public,anon,authenticated,service_role;
comment on function api.save_current_owner_profile_text_working(jsonb) is
  'Dormant current-Owner raw text overlay save with source/text CAS. No canonical profile/media/Published changes or execution grants.';
comment on function api.resolve_current_owner_editable_identity_working_page(jsonb) is
  'Dormant coherent private Identity/source/recoverable-text snapshot. Explicit source drift and revision vector. No public/whole-publication comparison/grants.';
commit;

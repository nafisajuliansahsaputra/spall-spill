-- O01-S5 Resource Draft: explicit meaning, private persistence, permanent identity.
begin;

create table core.resource_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references core.owners(id) on delete cascade,
  resource_type text not null check (resource_type in
    ('menu', 'price_list', 'catalog', 'portfolio', 'media_kit', 'document', 'website', 'other')),
  source_url text,
  title text,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_draft_meaningful check (source_url is not null or title is not null),
  constraint resource_draft_source_valid check (source_url is null or (
    char_length(source_url) between 8 and 2048
    and source_url = btrim(source_url)
    and source_url !~ '[[:space:][:cntrl:]]'
    and source_url !~ E'\\\\'
    and source_url ~* '^https?://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?([/?#].*)?$')),
  constraint resource_draft_title_valid check (title is null or (
    char_length(title) between 1 and 160
    and title = regexp_replace(title, '^[[:space:]]+|[[:space:]]+$', '', 'g')
    and title !~ '[[:cntrl:]]'))
);
alter table core.resource_drafts enable row level security;
revoke all on core.resource_drafts from public, anon, authenticated, service_role;
comment on table core.resource_drafts is
  'One private first onboarding Resource Draft per Owner. Meaning is explicitly selected, never inferred from URL/format. Persistence does not publish or certify its source.';

create function core.reserve_resource_draft_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id then
      raise exception using errcode = '23514', message = 'Resource Item identity and Owner are immutable.';
    end if;
  else
    perform core.reserve_spill_item_identity(new.id, new.owner_id, 'resource');
  end if;
  return new;
end;
$$;
create trigger resource_draft_reserve_identity after insert on core.resource_drafts
for each row execute function core.reserve_resource_draft_identity();
create trigger resource_draft_preserve_identity before update on core.resource_drafts
for each row execute function core.reserve_resource_draft_identity();
revoke all on function core.reserve_resource_draft_identity() from public, anon, authenticated, service_role;

-- Reuse the S5 prerequisite boundary; discard guidance/progress fields from failures.
create function core.resource_draft_eligibility()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare state jsonb;
begin
  state := api.resolve_current_relevant_first_job_state();
  if state->>'status' = 'step_not_available' then
    return jsonb_build_object('status', 'step_not_available', 'current_step', state->>'current_step');
  elsif state->>'status' = 'prerequisite_missing' then
    return jsonb_build_object('status', 'prerequisite_missing', 'prerequisite', state->>'prerequisite');
  elsif state->>'status' <> 'success' then
    return jsonb_build_object('status', state->>'status');
  end if;
  return jsonb_build_object('status', 'success', 'current_step', state->>'current_step');
end;
$$;
revoke all on function core.resource_draft_eligibility() from public, anon, authenticated, service_role;

create function api.resolve_current_resource_draft_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare eligibility jsonb; draft core.resource_drafts%rowtype;
begin
  eligibility := core.resource_draft_eligibility();
  if eligibility->>'status' <> 'success' then return eligibility; end if;
  select d.* into draft from core.resource_drafts d
  join core.owner_auth_bindings b on b.owner_id = d.owner_id where b.auth_user_id = auth.uid();
  return eligibility || jsonb_build_object('resource_draft', case when found then
    jsonb_build_object('resource_type', draft.resource_type, 'source_url', draft.source_url,
      'title', draft.title, 'revision', draft.revision) else null end);
end;
$$;

create function api.save_current_owner_resource_draft(
  input_resource_type text, input_source_url text, input_title text, base_resource_revision bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_record core.owners%rowtype;
  eligibility jsonb;
  draft core.resource_drafts%rowtype;
  draft_exists boolean;
  normalized_source text;
  normalized_title text;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
  select o.* into owner_record from core.owners o
  join core.owner_auth_bindings b on b.owner_id = o.id
  where b.auth_user_id = auth.uid() for update of o;
  if not found then return jsonb_build_object('status', 'owner_missing'); end if;
  if owner_record.account_state <> 'active' or owner_record.onboarding_completed_at is not null then
    return jsonb_build_object('status', 'owner_not_eligible');
  end if;
  perform 1 from core.owner_onboarding_progress where owner_id = owner_record.id for update;
  eligibility := core.resource_draft_eligibility();
  if eligibility->>'status' <> 'success' then return eligibility; end if;
  -- Shared mutations lock Owner first, so prerequisite updates cannot race this save.
  select * into draft from core.resource_drafts where owner_id = owner_record.id for update;
  draft_exists := found;
  if (draft_exists and base_resource_revision is distinct from draft.revision)
     or (not draft_exists and base_resource_revision is not null) then
    return jsonb_build_object('status', 'stale_write', 'resource_revision', draft.revision);
  end if;
  if input_resource_type is null or input_resource_type not in
    ('menu', 'price_list', 'catalog', 'portfolio', 'media_kit', 'document', 'website', 'other') then
    return jsonb_build_object('status', 'invalid_resource_type');
  end if;
  normalized_source := nullif(btrim(coalesce(input_source_url, '')), '');
  normalized_title := nullif(regexp_replace(coalesce(input_title, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  if normalized_source is not null and (
    char_length(normalized_source) not between 8 and 2048
    or normalized_source ~ '[[:space:][:cntrl:]]' or normalized_source ~ E'\\\\'
    or normalized_source !~* '^https?://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?([/?#].*)?$') then
    return jsonb_build_object('status', 'invalid_source_url');
  end if;
  if normalized_title is not null and (char_length(normalized_title) > 160 or normalized_title ~ '[[:cntrl:]]') then
    return jsonb_build_object('status', 'invalid_title');
  end if;
  if normalized_source is null and normalized_title is null then
    return jsonb_build_object('status', 'empty_draft');
  end if;
  if draft_exists then
    if draft.revision = 9007199254740991 then return jsonb_build_object('status', 'revision_exhausted'); end if;
    update core.resource_drafts set resource_type = input_resource_type, source_url = normalized_source,
      title = normalized_title, revision = revision + 1, updated_at = now()
    where owner_id = owner_record.id returning * into draft;
  else
    insert into core.resource_drafts(owner_id, resource_type, source_url, title)
    values(owner_record.id, input_resource_type, normalized_source, normalized_title) returning * into draft;
  end if;
  return eligibility || jsonb_build_object('resource_draft', jsonb_build_object(
    'resource_type', draft.resource_type, 'source_url', draft.source_url, 'title', draft.title, 'revision', draft.revision));
end;
$$;
revoke all on function api.resolve_current_resource_draft_state(),
  api.save_current_owner_resource_draft(text, text, text, bigint) from public, anon, authenticated, service_role;
grant execute on function api.resolve_current_resource_draft_state(),
  api.save_current_owner_resource_draft(text, text, text, bigint) to authenticated;
comment on function api.save_current_owner_resource_draft(text, text, text, bigint) is
  'Current authenticated Owner only. Explicit semantic type plus title or source creates a private Draft and permanent Resource identity atomically. Revision protects stale writes. No publication, safety assertion, network fetch, or progress advancement.';
commit;

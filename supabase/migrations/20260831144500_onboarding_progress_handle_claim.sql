-- Stage 6A — O01 onboarding foundation.
--
-- Implements:
-- - account-side resumable onboarding progress;
-- - S1 Handle namespace claim and protected historical aliases;
-- - S2 Primary Use Case persistence;
-- - revision-based stale-write rejection;
-- - narrow authenticated Owner-scoped RPC boundaries.
--
-- S3-S6 Identity/Starter/Item/Preview/Publish persistence is intentionally
-- deferred to later migrations.

create type core.onboarding_step as enum (
  'claim_handle',
  'primary_use_case',
  'basic_identity',
  'starter_composition',
  'relevant_first_job',
  'preview_publish'
);

create type core.primary_use_case as enum (
  'creator',
  'affiliate',
  'business',
  'personal',
  'other'
);

create type core.handle_namespace_kind as enum (
  'current',
  'alias'
);

-- ---------------------------------------------------------------------------
-- Canonical account-side onboarding progress
-- ---------------------------------------------------------------------------

create table core.owner_onboarding_progress (
  owner_id uuid primary key,
  current_step core.onboarding_step
    not null
    default 'claim_handle',
  primary_use_case core.primary_use_case,
  revision bigint
    not null
    default 1,
  created_at timestamptz
    not null
    default now(),
  updated_at timestamptz
    not null
    default now(),

  constraint owner_onboarding_progress_owner_fk
    foreign key (owner_id)
    references core.owners(id)
    on delete cascade,

  constraint owner_onboarding_progress_revision_positive
    check (revision > 0)
);

comment on table core.owner_onboarding_progress is
  'Private authoritative account-side O01 onboarding progress for one canonical Owner.';

comment on column core.owner_onboarding_progress.current_step is
  'Current resumable semantic O01 step; not a separate product destination.';

comment on column core.owner_onboarding_progress.primary_use_case is
  'Owner personalization signal only; never capability authorization.';

comment on column core.owner_onboarding_progress.revision is
  'Monotonic acknowledged onboarding revision used for stale-write rejection.';

-- ---------------------------------------------------------------------------
-- Handle namespace
-- ---------------------------------------------------------------------------

create table core.owner_handle_namespaces (
  normalized_handle text primary key,
  owner_id uuid not null,
  namespace_kind core.handle_namespace_kind
    not null,
  created_at timestamptz
    not null
    default now(),
  updated_at timestamptz
    not null
    default now(),

  constraint owner_handle_namespaces_owner_fk
    foreign key (owner_id)
    references core.owners(id)
    on delete restrict,

  constraint owner_handle_namespaces_normalized_format
    check (
      normalized_handle =
        lower(normalized_handle)
      and char_length(normalized_handle)
        between 3 and 30
      and normalized_handle
        ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
    )
);

comment on table core.owner_handle_namespaces is
  'Private canonical Handle namespace ownership, including current Handles and protected historical aliases.';

comment on column core.owner_handle_namespaces.normalized_handle is
  'Canonical normalized public Handle key.';

comment on column core.owner_handle_namespaces.owner_id is
  'Stable canonical Owner identity; Handle never replaces Owner identity.';

comment on column core.owner_handle_namespaces.namespace_kind is
  'current is the canonical public Handle; alias is a protected historical locator reserved to the same Owner.';

create index owner_handle_namespaces_owner_id_idx
  on core.owner_handle_namespaces (owner_id);

create unique index owner_handle_namespaces_one_current_per_owner_idx
  on core.owner_handle_namespaces (owner_id)
  where namespace_kind =
    'current'::core.handle_namespace_kind;

-- ---------------------------------------------------------------------------
-- Reserved system namespace
-- ---------------------------------------------------------------------------

create table core.reserved_handles (
  normalized_handle text primary key,
  created_at timestamptz
    not null
    default now(),

  constraint reserved_handles_normalized
    check (
      normalized_handle =
        lower(normalized_handle)
      and normalized_handle =
        btrim(normalized_handle)
      and char_length(normalized_handle) > 0
    )
);

comment on table core.reserved_handles is
  'Application-controlled Handle namespace values unavailable for ordinary Owner claims.';

insert into core.reserved_handles (
  normalized_handle
)
values
  ('api'),
  ('auth'),
  ('dashboard'),
  ('login'),
  ('signup'),
  ('recovery'),
  ('onboarding'),
  ('ops'),
  ('_next'),
  ('favicon.ico'),
  ('robots.txt'),
  ('sitemap.xml');

-- ---------------------------------------------------------------------------
-- Private-table security
-- ---------------------------------------------------------------------------

alter table core.owner_onboarding_progress
  enable row level security;

alter table core.owner_handle_namespaces
  enable row level security;

alter table core.reserved_handles
  enable row level security;

revoke all
  on table core.owner_onboarding_progress
  from public, anon, authenticated;

revoke all
  on table core.owner_handle_namespaces
  from public, anon, authenticated;

revoke all
  on table core.reserved_handles
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill all existing canonical Owners
-- ---------------------------------------------------------------------------

insert into core.owner_onboarding_progress (
  owner_id
)
select
  owner_record.id
from core.owners as owner_record
on conflict (owner_id) do nothing;

-- ---------------------------------------------------------------------------
-- Extend canonical Auth-user -> Owner provisioning
-- ---------------------------------------------------------------------------

create or replace function core.provision_owner_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provisioned_owner_id uuid;
begin
  insert into core.owners
  default values
  returning id into provisioned_owner_id;

  insert into core.owner_auth_bindings (
    auth_user_id,
    owner_id
  )
  values (
    new.id,
    provisioned_owner_id
  );

  insert into core.owner_onboarding_progress (
    owner_id
  )
  values (
    provisioned_owner_id
  );

  return new;
end;
$$;

comment on function core.provision_owner_for_auth_user() is
  'Transactionally provisions canonical Spall Spill Owner identity, Auth binding, and initial O01 onboarding progress for a new Supabase Auth user.';

revoke all
  on function core.provision_owner_for_auth_user()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated current-Owner onboarding read boundary
-- ---------------------------------------------------------------------------

create function api.resolve_current_onboarding_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  resolved_owner_id uuid;
  resolved_account_state core.owner_account_state;
  resolved_onboarding_completed_at timestamptz;
  resolved_current_step core.onboarding_step;
  resolved_primary_use_case core.primary_use_case;
  resolved_revision bigint;
  resolved_current_handle text;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    return jsonb_build_object(
      'status', 'unauthenticated'
    );
  end if;

  select
    binding.owner_id,
    owner_record.account_state,
    owner_record.onboarding_completed_at
  into
    resolved_owner_id,
    resolved_account_state,
    resolved_onboarding_completed_at
  from core.owner_auth_bindings as binding
  inner join core.owners as owner_record
    on owner_record.id = binding.owner_id
  where
    binding.auth_user_id =
      current_auth_user_id;

  if not found then
    return jsonb_build_object(
      'status', 'owner_missing'
    );
  end if;

  if
    resolved_account_state <>
      'active'::core.owner_account_state
  then
    return jsonb_build_object(
      'status', 'owner_unavailable'
    );
  end if;

  if
    resolved_onboarding_completed_at
      is not null
  then
    return jsonb_build_object(
      'status', 'onboarding_complete'
    );
  end if;

  select
    progress.current_step,
    progress.primary_use_case,
    progress.revision
  into
    resolved_current_step,
    resolved_primary_use_case,
    resolved_revision
  from core.owner_onboarding_progress
    as progress
  where
    progress.owner_id =
      resolved_owner_id;

  if not found then
    return jsonb_build_object(
      'status', 'progress_missing'
    );
  end if;

  select
    namespace_record.normalized_handle
  into
    resolved_current_handle
  from core.owner_handle_namespaces
    as namespace_record
  where
    namespace_record.owner_id =
      resolved_owner_id
    and namespace_record.namespace_kind =
      'current'::core.handle_namespace_kind;

  return jsonb_build_object(
    'status', 'success',
    'current_step',
      resolved_current_step::text,
    'current_handle',
      resolved_current_handle,
    'primary_use_case',
      case
        when resolved_primary_use_case
          is null
        then null
        else
          resolved_primary_use_case::text
      end,
    'revision',
      resolved_revision
  );
end;
$$;

comment on function api.resolve_current_onboarding_state() is
  'Returns only the authenticated current Owner O01 progress and current Handle state.';

revoke all
  on function api.resolve_current_onboarding_state()
  from public, anon, authenticated;

grant execute
  on function api.resolve_current_onboarding_state()
  to authenticated;

-- ---------------------------------------------------------------------------
-- S1 — Claim / replace current Handle
-- ---------------------------------------------------------------------------

create function api.claim_current_owner_handle(
  input_handle text,
  base_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  resolved_owner_id uuid;
  resolved_account_state core.owner_account_state;
  resolved_onboarding_completed_at timestamptz;

  resolved_current_step core.onboarding_step;
  resolved_primary_use_case core.primary_use_case;
  resolved_revision bigint;

  normalized_candidate text;

  existing_namespace_owner_id uuid;
  existing_namespace_kind
    core.handle_namespace_kind;

  existing_current_handle text;
  committed_step core.onboarding_step;
  committed_revision bigint;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    return jsonb_build_object(
      'status', 'unauthenticated'
    );
  end if;

  select
    binding.owner_id,
    owner_record.account_state,
    owner_record.onboarding_completed_at
  into
    resolved_owner_id,
    resolved_account_state,
    resolved_onboarding_completed_at
  from core.owner_auth_bindings as binding
  inner join core.owners as owner_record
    on owner_record.id = binding.owner_id
  where
    binding.auth_user_id =
      current_auth_user_id
  for update of owner_record;

  if not found then
    return jsonb_build_object(
      'status', 'owner_missing'
    );
  end if;

  if
    resolved_account_state <>
      'active'::core.owner_account_state
    or
    resolved_onboarding_completed_at
      is not null
  then
    return jsonb_build_object(
      'status', 'owner_not_eligible'
    );
  end if;

  select
    progress.current_step,
    progress.primary_use_case,
    progress.revision
  into
    resolved_current_step,
    resolved_primary_use_case,
    resolved_revision
  from core.owner_onboarding_progress
    as progress
  where
    progress.owner_id =
      resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'owner_missing'
    );
  end if;

  select
    namespace_record.normalized_handle
  into
    existing_current_handle
  from core.owner_handle_namespaces
    as namespace_record
  where
    namespace_record.owner_id =
      resolved_owner_id
    and namespace_record.namespace_kind =
      'current'::core.handle_namespace_kind
  for update;

  if
    base_revision is distinct from
      resolved_revision
  then
    return jsonb_build_object(
      'status', 'stale_write',
      'current_step',
        resolved_current_step::text,
      'current_handle',
        existing_current_handle,
      'primary_use_case',
        case
          when resolved_primary_use_case
            is null
          then null
          else
            resolved_primary_use_case::text
        end,
      'revision',
        resolved_revision
    );
  end if;

  normalized_candidate :=
    lower(
      regexp_replace(
        coalesce(input_handle, ''),
        '^[[:space:]]+|[[:space:]]+$',
        '',
        'g'
      )
    );

  if exists (
    select 1
    from core.reserved_handles
      as reserved
    where
      reserved.normalized_handle =
        normalized_candidate
  ) then
    return jsonb_build_object(
      'status', 'reserved_handle',
      'revision', resolved_revision
    );
  end if;

  if
    char_length(normalized_candidate)
      not between 3 and 30
    or normalized_candidate
      !~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
  then
    return jsonb_build_object(
      'status', 'invalid_handle',
      'revision', resolved_revision
    );
  end if;

  select
    namespace_record.owner_id,
    namespace_record.namespace_kind
  into
    existing_namespace_owner_id,
    existing_namespace_kind
  from core.owner_handle_namespaces
    as namespace_record
  where
    namespace_record.normalized_handle =
      normalized_candidate
  for update;

  if
    found
    and existing_namespace_owner_id <>
      resolved_owner_id
  then
    return jsonb_build_object(
      'status', 'handle_unavailable',
      'revision', resolved_revision
    );
  end if;

  if
    existing_current_handle =
      normalized_candidate
  then
    if
      resolved_current_step =
        'claim_handle'::core.onboarding_step
    then
      update core.owner_onboarding_progress
      set
        current_step =
          'primary_use_case'::core.onboarding_step,
        revision = revision + 1,
        updated_at = now()
      where owner_id =
        resolved_owner_id
      returning
        current_step,
        revision
      into
        committed_step,
        committed_revision;

      return jsonb_build_object(
        'status', 'success',
        'current_step',
          committed_step::text,
        'current_handle',
          normalized_candidate,
        'primary_use_case',
          case
            when resolved_primary_use_case
              is null
            then null
            else
              resolved_primary_use_case::text
          end,
        'revision',
          committed_revision
      );
    end if;

    return jsonb_build_object(
      'status', 'success',
      'current_step',
        resolved_current_step::text,
      'current_handle',
        normalized_candidate,
      'primary_use_case',
        case
          when resolved_primary_use_case
            is null
          then null
          else
            resolved_primary_use_case::text
        end,
      'revision',
        resolved_revision
    );
  end if;

  begin
    update core.owner_handle_namespaces
    set
      namespace_kind =
        'alias'::core.handle_namespace_kind,
      updated_at = now()
    where
      owner_id = resolved_owner_id
      and namespace_kind =
        'current'::core.handle_namespace_kind;

    if
      existing_namespace_owner_id =
        resolved_owner_id
      and existing_namespace_kind =
        'alias'::core.handle_namespace_kind
    then
      update core.owner_handle_namespaces
      set
        namespace_kind =
          'current'::core.handle_namespace_kind,
        updated_at = now()
      where
        normalized_handle =
          normalized_candidate;
    else
      insert into core.owner_handle_namespaces (
        normalized_handle,
        owner_id,
        namespace_kind
      )
      values (
        normalized_candidate,
        resolved_owner_id,
        'current'::core.handle_namespace_kind
      );
    end if;

    update core.owner_onboarding_progress
    set
      current_step =
        case
          when current_step =
            'claim_handle'::core.onboarding_step
          then
            'primary_use_case'::core.onboarding_step
          else
            current_step
        end,
      revision = revision + 1,
      updated_at = now()
    where
      owner_id = resolved_owner_id
    returning
      current_step,
      revision
    into
      committed_step,
      committed_revision;

  exception
    when unique_violation then
      return jsonb_build_object(
        'status', 'handle_unavailable',
        'revision', resolved_revision
      );
  end;

  return jsonb_build_object(
    'status', 'success',
    'current_step',
      committed_step::text,
    'current_handle',
      normalized_candidate,
    'primary_use_case',
      case
        when resolved_primary_use_case
          is null
        then null
        else
          resolved_primary_use_case::text
      end,
    'revision',
      committed_revision
  );
end;
$$;

comment on function api.claim_current_owner_handle(text, bigint) is
  'Atomically claims or replaces the authenticated incomplete Owner current Handle using onboarding revision preconditions.';

revoke all
  on function api.claim_current_owner_handle(text, bigint)
  from public, anon, authenticated;

grant execute
  on function api.claim_current_owner_handle(text, bigint)
  to authenticated;

-- ---------------------------------------------------------------------------
-- S2 — Primary Use Case
-- ---------------------------------------------------------------------------

create function api.set_current_owner_primary_use_case(
  input_primary_use_case text,
  base_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  resolved_owner_id uuid;
  resolved_account_state core.owner_account_state;
  resolved_onboarding_completed_at timestamptz;

  resolved_current_step core.onboarding_step;
  resolved_primary_use_case core.primary_use_case;
  resolved_revision bigint;
  resolved_current_handle text;

  normalized_use_case text;
  next_primary_use_case core.primary_use_case;

  committed_step core.onboarding_step;
  committed_primary_use_case
    core.primary_use_case;
  committed_revision bigint;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    return jsonb_build_object(
      'status', 'unauthenticated'
    );
  end if;

  select
    binding.owner_id,
    owner_record.account_state,
    owner_record.onboarding_completed_at
  into
    resolved_owner_id,
    resolved_account_state,
    resolved_onboarding_completed_at
  from core.owner_auth_bindings as binding
  inner join core.owners as owner_record
    on owner_record.id = binding.owner_id
  where
    binding.auth_user_id =
      current_auth_user_id
  for update of owner_record;

  if not found then
    return jsonb_build_object(
      'status', 'owner_missing'
    );
  end if;

  if
    resolved_account_state <>
      'active'::core.owner_account_state
    or
    resolved_onboarding_completed_at
      is not null
  then
    return jsonb_build_object(
      'status', 'owner_not_eligible'
    );
  end if;

  select
    progress.current_step,
    progress.primary_use_case,
    progress.revision
  into
    resolved_current_step,
    resolved_primary_use_case,
    resolved_revision
  from core.owner_onboarding_progress
    as progress
  where
    progress.owner_id =
      resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'owner_missing'
    );
  end if;

  select
    namespace_record.normalized_handle
  into
    resolved_current_handle
  from core.owner_handle_namespaces
    as namespace_record
  where
    namespace_record.owner_id =
      resolved_owner_id
    and namespace_record.namespace_kind =
      'current'::core.handle_namespace_kind;

  if
    base_revision is distinct from
      resolved_revision
  then
    return jsonb_build_object(
      'status', 'stale_write',
      'current_step',
        resolved_current_step::text,
      'current_handle',
        resolved_current_handle,
      'primary_use_case',
        case
          when resolved_primary_use_case
            is null
          then null
          else
            resolved_primary_use_case::text
        end,
      'revision',
        resolved_revision
    );
  end if;

  if resolved_current_handle is null then
    return jsonb_build_object(
      'status', 'handle_required',
      'revision', resolved_revision
    );
  end if;

  normalized_use_case :=
    lower(
      btrim(
        coalesce(
          input_primary_use_case,
          ''
        )
      )
    );

  if normalized_use_case not in (
    'creator',
    'affiliate',
    'business',
    'personal',
    'other'
  ) then
    return jsonb_build_object(
      'status', 'invalid_primary_use_case',
      'revision', resolved_revision
    );
  end if;

  next_primary_use_case :=
    normalized_use_case::core.primary_use_case;

  if
    resolved_primary_use_case =
      next_primary_use_case
    and resolved_current_step <>
      'primary_use_case'::core.onboarding_step
  then
    return jsonb_build_object(
      'status', 'success',
      'current_step',
        resolved_current_step::text,
      'current_handle',
        resolved_current_handle,
      'primary_use_case',
        next_primary_use_case::text,
      'revision',
        resolved_revision
    );
  end if;

  update core.owner_onboarding_progress
  set
    primary_use_case =
      next_primary_use_case,
    current_step =
      case
        when current_step =
          'primary_use_case'::core.onboarding_step
        then
          'basic_identity'::core.onboarding_step
        else
          current_step
      end,
    revision = revision + 1,
    updated_at = now()
  where
    owner_id =
      resolved_owner_id
  returning
    current_step,
    primary_use_case,
    revision
  into
    committed_step,
    committed_primary_use_case,
    committed_revision;

  return jsonb_build_object(
    'status', 'success',
    'current_step',
      committed_step::text,
    'current_handle',
      resolved_current_handle,
    'primary_use_case',
      committed_primary_use_case::text,
    'revision',
      committed_revision
  );
end;
$$;

comment on function api.set_current_owner_primary_use_case(text, bigint) is
  'Persists the authenticated incomplete Owner Primary Use Case personalization using onboarding revision preconditions.';

revoke all
  on function api.set_current_owner_primary_use_case(text, bigint)
  from public, anon, authenticated;

grant execute
  on function api.set_current_owner_primary_use_case(text, bigint)
  to authenticated;
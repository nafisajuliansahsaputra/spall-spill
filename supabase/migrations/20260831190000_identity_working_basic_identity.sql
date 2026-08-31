-- Stage 6B.1 — O01-S3 Basic Identity Working.
--
-- Implements:
-- - canonical private Identity Working state;
-- - Display Name + optional Bio persistence;
-- - independent Identity Working revision;
-- - S3 -> S4 authoritative progress advancement;
-- - stale-write protection;
-- - authenticated current-Owner read/write boundaries.
--
-- Profile asset storage transport is intentionally deferred to Stage 6B.3.
-- Starter Composition is intentionally deferred to Stage 6B.4.

-- ---------------------------------------------------------------------------
-- Canonical private Identity Working
-- ---------------------------------------------------------------------------

create table core.identity_working (
  owner_id uuid primary key,

  display_name text not null,
  bio text,
  profile_asset_key text,

  revision bigint
    not null
    default 1,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint identity_working_owner_fk
    foreign key (owner_id)
    references core.owners(id)
    on delete cascade,

  constraint identity_working_revision_positive
    check (revision > 0),

  constraint identity_working_display_name_valid
    check (
      char_length(display_name)
        between 1 and 80
      and display_name =
        regexp_replace(
          display_name,
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        )
      and display_name
        !~ '[[:cntrl:]]'
    ),

  constraint identity_working_bio_valid
    check (
      bio is null
      or (
        char_length(bio)
          between 1 and 300
        and bio =
          regexp_replace(
            bio,
            '^[[:space:]]+|[[:space:]]+$',
            '',
            'g'
          )
        and regexp_replace(
          bio,
          E'\n',
          '',
          'g'
        ) !~ '[[:cntrl:]]'
      )
    ),

  constraint identity_working_profile_asset_key_valid
    check (
      profile_asset_key is null
      or (
        char_length(profile_asset_key)
          between 1 and 512
        and profile_asset_key
          !~ '[[:cntrl:]]'
      )
    )
);

comment on table core.identity_working is
  'Private authoritative current Identity Working state. Working is not Published.';

comment on column core.identity_working.owner_id is
  'Stable canonical Owner identity. Handle and Auth identity do not replace this ownership key.';

comment on column core.identity_working.display_name is
  'Required human-readable Display Name, distinct from Handle.';

comment on column core.identity_working.bio is
  'Optional plain-text Bio. NULL means no Bio.';

comment on column core.identity_working.profile_asset_key is
  'Optional platform-controlled profile asset reference. Upload transport is defined separately.';

comment on column core.identity_working.revision is
  'Monotonic acknowledged Identity Working revision for stale-write protection.';

alter table core.identity_working
  enable row level security;

revoke all
  on table core.identity_working
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated current-Owner S3 read boundary
-- ---------------------------------------------------------------------------

create function api.resolve_current_basic_identity_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;

  resolved_owner_id uuid;
  resolved_account_state
    core.owner_account_state;
  resolved_onboarding_completed_at
    timestamptz;

  resolved_display_name text;
  resolved_bio text;
  resolved_profile_asset_key text;
  resolved_identity_revision bigint;

  identity_exists boolean;
begin
  current_auth_user_id :=
    auth.uid();

  if current_auth_user_id is null then
    return jsonb_build_object(
      'status',
      'unauthenticated'
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
  from core.owner_auth_bindings
    as binding
  inner join core.owners
    as owner_record
    on owner_record.id =
      binding.owner_id
  where
    binding.auth_user_id =
      current_auth_user_id;

  if not found then
    return jsonb_build_object(
      'status',
      'owner_missing'
    );
  end if;

  if
    resolved_account_state <>
      'active'::core.owner_account_state
  then
    return jsonb_build_object(
      'status',
      'owner_unavailable'
    );
  end if;

  if
    resolved_onboarding_completed_at
      is not null
  then
    return jsonb_build_object(
      'status',
      'onboarding_complete'
    );
  end if;

  select
    identity_record.display_name,
    identity_record.bio,
    identity_record.profile_asset_key,
    identity_record.revision
  into
    resolved_display_name,
    resolved_bio,
    resolved_profile_asset_key,
    resolved_identity_revision
  from core.identity_working
    as identity_record
  where
    identity_record.owner_id =
      resolved_owner_id;

  identity_exists := found;

  if not identity_exists then
    return jsonb_build_object(
      'status',
      'success',
      'identity_working',
      null
    );
  end if;

  return jsonb_build_object(
    'status',
    'success',
    'identity_working',
    jsonb_build_object(
      'display_name',
        resolved_display_name,
      'bio',
        resolved_bio,
      'profile_asset_key',
        resolved_profile_asset_key,
      'revision',
        resolved_identity_revision
    )
  );
end;
$$;

comment on function api.resolve_current_basic_identity_state() is
  'Returns only the authenticated incomplete Owner Basic Identity Working state, if one has been authoritatively created.';

revoke all
  on function api.resolve_current_basic_identity_state()
  from public, anon, authenticated;

grant execute
  on function api.resolve_current_basic_identity_state()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated current-Owner S3 mutation boundary
--
-- base_identity_revision:
-- - NULL means caller last acknowledged that no Identity Working record exists;
-- - N means caller last acknowledged Identity Working revision N.
--
-- base_progress_revision is enforced only when this save advances the
-- authoritative onboarding progress frontier from S3 to S4.
-- ---------------------------------------------------------------------------

create function api.save_current_owner_basic_identity(
  input_display_name text,
  input_bio text,
  base_identity_revision bigint,
  base_progress_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;

  resolved_owner_id uuid;
  resolved_account_state
    core.owner_account_state;
  resolved_onboarding_completed_at
    timestamptz;

  resolved_current_step
    core.onboarding_step;
  resolved_primary_use_case
    core.primary_use_case;
  resolved_progress_revision bigint;

  resolved_current_handle text;

  existing_display_name text;
  existing_bio text;
  existing_profile_asset_key text;
  existing_identity_revision bigint;
  identity_exists boolean;

  normalized_display_name text;
  normalized_bio text;

  committed_display_name text;
  committed_bio text;
  committed_profile_asset_key text;
  committed_identity_revision bigint;

  committed_step
    core.onboarding_step;
  committed_progress_revision bigint;
begin
  current_auth_user_id :=
    auth.uid();

  if current_auth_user_id is null then
    return jsonb_build_object(
      'status',
      'unauthenticated'
    );
  end if;

  -- Lock canonical Owner first.
  --
  -- Existing onboarding Handle / Primary Use Case mutations use the same
  -- Owner-first locking boundary, keeping cross-workflow lock order stable.
  select
    binding.owner_id,
    owner_record.account_state,
    owner_record.onboarding_completed_at
  into
    resolved_owner_id,
    resolved_account_state,
    resolved_onboarding_completed_at
  from core.owner_auth_bindings
    as binding
  inner join core.owners
    as owner_record
    on owner_record.id =
      binding.owner_id
  where
    binding.auth_user_id =
      current_auth_user_id
  for update of owner_record;

  if not found then
    return jsonb_build_object(
      'status',
      'owner_missing'
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
      'status',
      'owner_not_eligible'
    );
  end if;

  -- Lock onboarding progress second.
  select
    progress.current_step,
    progress.primary_use_case,
    progress.revision
  into
    resolved_current_step,
    resolved_primary_use_case,
    resolved_progress_revision
  from core.owner_onboarding_progress
    as progress
  where
    progress.owner_id =
      resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status',
      'progress_missing'
    );
  end if;

  -- S3 cannot bypass S1/S2.
  if
    resolved_current_step <
      'basic_identity'::core.onboarding_step
  then
    return jsonb_build_object(
      'status',
      'step_not_available',
      'current_step',
        resolved_current_step::text,
      'progress_revision',
        resolved_progress_revision
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
    resolved_current_handle is null
    or resolved_primary_use_case is null
  then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'current_step',
        resolved_current_step::text,
      'progress_revision',
        resolved_progress_revision
    );
  end if;

  -- Lock existing Identity Working third.
  select
    identity_record.display_name,
    identity_record.bio,
    identity_record.profile_asset_key,
    identity_record.revision
  into
    existing_display_name,
    existing_bio,
    existing_profile_asset_key,
    existing_identity_revision
  from core.identity_working
    as identity_record
  where
    identity_record.owner_id =
      resolved_owner_id
  for update;

  identity_exists := found;

  -- Explicit Working creation boundary.
  --
  -- NULL is not "revision 0". It means the caller last acknowledged that
  -- authoritative Identity Working did not yet exist.
  if identity_exists then
    if
      base_identity_revision is null
      or base_identity_revision <>
        existing_identity_revision
    then
      return jsonb_build_object(
        'status',
        'stale_write',
        'identity_revision',
          existing_identity_revision,
        'progress_revision',
          resolved_progress_revision
      );
    end if;
  else
    if base_identity_revision is not null then
      return jsonb_build_object(
        'status',
        'stale_write',
        'identity_revision',
          null,
        'progress_revision',
          resolved_progress_revision
      );
    end if;
  end if;

  -- Progress revision matters only when this mutation will advance the
  -- authoritative progress frontier.
  if
    resolved_current_step =
      'basic_identity'::core.onboarding_step
    and base_progress_revision
      is distinct from
        resolved_progress_revision
  then
    return jsonb_build_object(
      'status',
      'progress_stale',
      'identity_revision',
        case
          when identity_exists
          then existing_identity_revision
          else null
        end,
      'progress_revision',
        resolved_progress_revision
    );
  end if;

  -- -------------------------------------------------------------------------
  -- Canonical S3 validation / normalization
  -- -------------------------------------------------------------------------

  normalized_display_name :=
    regexp_replace(
      coalesce(
        input_display_name,
        ''
      ),
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    );

  if
    char_length(normalized_display_name)
      not between 1 and 80
    or normalized_display_name
      ~ '[[:cntrl:]]'
  then
    return jsonb_build_object(
      'status',
      'invalid_display_name',
      'identity_revision',
        case
          when identity_exists
          then existing_identity_revision
          else null
        end,
      'progress_revision',
        resolved_progress_revision
    );
  end if;

  normalized_bio :=
    replace(
      replace(
        coalesce(
          input_bio,
          ''
        ),
        E'\r\n',
        E'\n'
      ),
      E'\r',
      E'\n'
    );

  normalized_bio :=
    regexp_replace(
      normalized_bio,
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    );

  if normalized_bio = '' then
    normalized_bio := null;
  end if;

  if
    normalized_bio is not null
    and (
      char_length(normalized_bio) > 300
      or regexp_replace(
        normalized_bio,
        E'\n',
        '',
        'g'
      ) ~ '[[:cntrl:]]'
    )
  then
    return jsonb_build_object(
      'status',
      'invalid_bio',
      'identity_revision',
        case
          when identity_exists
          then existing_identity_revision
          else null
        end,
      'progress_revision',
        resolved_progress_revision
    );
  end if;

  -- -------------------------------------------------------------------------
  -- Persist acknowledged Identity Working
  -- -------------------------------------------------------------------------

  if not identity_exists then
    insert into core.identity_working (
      owner_id,
      display_name,
      bio,
      profile_asset_key,
      revision
    )
    values (
      resolved_owner_id,
      normalized_display_name,
      normalized_bio,
      null,
      1
    )
    returning
      display_name,
      bio,
      profile_asset_key,
      revision
    into
      committed_display_name,
      committed_bio,
      committed_profile_asset_key,
      committed_identity_revision;
  elsif
    existing_display_name =
      normalized_display_name
    and existing_bio
      is not distinct from
        normalized_bio
  then
    -- Exact same acknowledged Working state is idempotent.
    committed_display_name :=
      existing_display_name;

    committed_bio :=
      existing_bio;

    committed_profile_asset_key :=
      existing_profile_asset_key;

    committed_identity_revision :=
      existing_identity_revision;
  else
    update core.identity_working
    set
      display_name =
        normalized_display_name,
      bio =
        normalized_bio,
      revision =
        revision + 1,
      updated_at =
        now()
    where
      owner_id =
        resolved_owner_id
    returning
      display_name,
      bio,
      profile_asset_key,
      revision
    into
      committed_display_name,
      committed_bio,
      committed_profile_asset_key,
      committed_identity_revision;
  end if;

  -- -------------------------------------------------------------------------
  -- Advance S3 frontier only once
  -- -------------------------------------------------------------------------

  if
    resolved_current_step =
      'basic_identity'::core.onboarding_step
  then
    update core.owner_onboarding_progress
    set
      current_step =
        'starter_composition'::core.onboarding_step,
      revision =
        revision + 1,
      updated_at =
        now()
    where
      owner_id =
        resolved_owner_id
    returning
      current_step,
      revision
    into
      committed_step,
      committed_progress_revision;
  else
    committed_step :=
      resolved_current_step;

    committed_progress_revision :=
      resolved_progress_revision;
  end if;

  return jsonb_build_object(
    'status',
      'success',
    'current_step',
      committed_step::text,
    'current_handle',
      resolved_current_handle,
    'primary_use_case',
      resolved_primary_use_case::text,
    'progress_revision',
      committed_progress_revision,
    'identity_working',
      jsonb_build_object(
        'display_name',
          committed_display_name,
        'bio',
          committed_bio,
        'profile_asset_key',
          committed_profile_asset_key,
        'revision',
          committed_identity_revision
      )
  );
end;
$$;

comment on function api.save_current_owner_basic_identity(
  text,
  text,
  bigint,
  bigint
) is
  'Creates or updates authenticated incomplete Owner Basic Identity Working with independent revision protection and atomically advances O01 S3 when appropriate.';

revoke all
  on function api.save_current_owner_basic_identity(
    text,
    text,
    bigint,
    bigint
  )
  from public, anon, authenticated;

grant execute
  on function api.save_current_owner_basic_identity(
    text,
    text,
    bigint,
    bigint
  )
  to authenticated;
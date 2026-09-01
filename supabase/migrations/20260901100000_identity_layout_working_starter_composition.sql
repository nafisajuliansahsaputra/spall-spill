-- Stage 6B.4 — O01-S4 Starter Composition Working.
--
-- Implements:
-- - canonical private Identity Layout Working state;
-- - curated Starter Composition persistence;
-- - independent layout Working revision;
-- - S4 -> S5 authoritative progress advancement;
-- - stale-write protection;
-- - authenticated current-Owner read/write boundaries.
--
-- This stage does not:
-- - mutate Identity content;
-- - publish Identity;
-- - create public blocks;
-- - activate Spill;
-- - complete onboarding.

-- ---------------------------------------------------------------------------
-- Canonical Starter key
-- ---------------------------------------------------------------------------

create type core.identity_starter_key as enum (
  'clean',
  'social_focus',
  'featured',
  'business'
);

comment on type core.identity_starter_key is
  'Curated MVP Identity layout Starter Composition keys. These are layout recipes, not account types or permission classes.';

-- ---------------------------------------------------------------------------
-- Canonical private Identity Layout Working
-- ---------------------------------------------------------------------------

create table core.identity_layout_working (
  owner_id uuid primary key,

  starter_key core.identity_starter_key
    not null,

  revision bigint
    not null
    default 1,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint identity_layout_working_owner_fk
    foreign key (owner_id)
    references core.owners(id)
    on delete cascade,

  constraint identity_layout_working_revision_positive
    check (revision > 0)
);

comment on table core.identity_layout_working is
  'Private authoritative current Identity Layout Working state. Working is not Published.';

comment on column core.identity_layout_working.owner_id is
  'Stable canonical Owner identity. The client never selects another target Owner.';

comment on column core.identity_layout_working.starter_key is
  'Acknowledged curated Starter Composition key. This changes layout emphasis only.';

comment on column core.identity_layout_working.revision is
  'Independent monotonic Identity Layout Working revision for stale-write protection.';

alter table core.identity_layout_working
  enable row level security;

revoke all
  on table core.identity_layout_working
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated current-Owner S4 read boundary
-- ---------------------------------------------------------------------------

create function api.resolve_current_starter_composition_state()
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

  resolved_starter_key
    core.identity_starter_key;
  resolved_layout_revision bigint;

  layout_exists boolean;
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

  perform 1
  from core.owner_onboarding_progress
    as progress
  where
    progress.owner_id =
      resolved_owner_id;

  if not found then
    return jsonb_build_object(
      'status',
      'progress_missing'
    );
  end if;

  select
    layout_record.starter_key,
    layout_record.revision
  into
    resolved_starter_key,
    resolved_layout_revision
  from core.identity_layout_working
    as layout_record
  where
    layout_record.owner_id =
      resolved_owner_id;

  layout_exists := found;

  if not layout_exists then
    return jsonb_build_object(
      'status',
      'success',
      'layout_working',
      null
    );
  end if;

  return jsonb_build_object(
    'status',
    'success',
    'layout_working',
    jsonb_build_object(
      'starter_key',
        resolved_starter_key::text,
      'revision',
        resolved_layout_revision
    )
  );
end;
$$;

comment on function api.resolve_current_starter_composition_state() is
  'Returns only the authenticated incomplete Owner Starter Composition Working state, if one has been authoritatively created.';

revoke all
  on function api.resolve_current_starter_composition_state()
  from public, anon, authenticated;

grant execute
  on function api.resolve_current_starter_composition_state()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated current-Owner S4 mutation boundary
--
-- base_layout_revision:
-- - NULL means caller last acknowledged that no Layout Working record exists;
-- - N means caller last acknowledged Layout Working revision N.
--
-- base_progress_revision is enforced only when this save advances the
-- authoritative onboarding frontier from S4 to S5.
-- ---------------------------------------------------------------------------

create function api.save_current_owner_starter_composition(
  input_starter_key text,
  base_layout_revision bigint,
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
  resolved_progress_revision bigint;

  existing_starter_key
    core.identity_starter_key;
  existing_layout_revision bigint;
  layout_exists boolean;

  next_starter_key
    core.identity_starter_key;

  committed_starter_key
    core.identity_starter_key;
  committed_layout_revision bigint;

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
    progress.revision
  into
    resolved_current_step,
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

  -- S4 cannot bypass earlier onboarding steps.
  if
    resolved_current_step <
      'starter_composition'::core.onboarding_step
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

  -- Lock/verify acknowledged Basic Identity third.
  --
  -- S4 is invalid if authoritative progress claims S4+ while the required
  -- Identity Working record is missing.
  perform 1
  from core.identity_working
    as identity_record
  where
    identity_record.owner_id =
      resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status',
      'identity_required',
      'current_step',
        resolved_current_step::text,
      'progress_revision',
        resolved_progress_revision
    );
  end if;

  -- Lock existing Layout Working fourth.
  select
    layout_record.starter_key,
    layout_record.revision
  into
    existing_starter_key,
    existing_layout_revision
  from core.identity_layout_working
    as layout_record
  where
    layout_record.owner_id =
      resolved_owner_id
  for update;

  layout_exists := found;

  -- Explicit Working creation boundary.
  --
  -- NULL is not revision 0. It means the caller last acknowledged that
  -- authoritative Layout Working did not yet exist.
  if layout_exists then
    if
      base_layout_revision is null
      or base_layout_revision <>
        existing_layout_revision
    then
      return jsonb_build_object(
        'status',
        'stale_write',
        'layout_revision',
          existing_layout_revision,
        'progress_revision',
          resolved_progress_revision
      );
    end if;
  else
    if base_layout_revision is not null then
      return jsonb_build_object(
        'status',
        'stale_write',
        'layout_revision',
          null,
        'progress_revision',
          resolved_progress_revision
      );
    end if;
  end if;

  -- Progress revision matters only when this mutation will advance the
  -- authoritative frontier from S4 to S5.
  if
    resolved_current_step =
      'starter_composition'::core.onboarding_step
    and base_progress_revision
      is distinct from
        resolved_progress_revision
  then
    return jsonb_build_object(
      'status',
      'progress_stale',
      'layout_revision',
        case
          when layout_exists
          then existing_layout_revision
          else null
        end,
      'progress_revision',
        resolved_progress_revision
    );
  end if;

  -- Starter tokens are platform-controlled canonical identifiers rather than
  -- free-form human text. Accept only exact supported values.
  if
    input_starter_key is null
    or input_starter_key not in (
      'clean',
      'social_focus',
      'featured',
      'business'
    )
  then
    return jsonb_build_object(
      'status',
      'invalid_starter',
      'layout_revision',
        case
          when layout_exists
          then existing_layout_revision
          else null
        end,
      'progress_revision',
        resolved_progress_revision
    );
  end if;

  next_starter_key :=
    input_starter_key::core.identity_starter_key;

  -- -------------------------------------------------------------------------
  -- Persist acknowledged Identity Layout Working
  -- -------------------------------------------------------------------------

  if not layout_exists then
    insert into core.identity_layout_working (
      owner_id,
      starter_key,
      revision
    )
    values (
      resolved_owner_id,
      next_starter_key,
      1
    )
    returning
      starter_key,
      revision
    into
      committed_starter_key,
      committed_layout_revision;

  elsif
    existing_starter_key =
      next_starter_key
  then
    -- Exact same acknowledged Working state is idempotent.
    committed_starter_key :=
      existing_starter_key;

    committed_layout_revision :=
      existing_layout_revision;

  else
    update core.identity_layout_working
    set
      starter_key =
        next_starter_key,
      revision =
        revision + 1,
      updated_at =
        now()
    where
      owner_id =
        resolved_owner_id
    returning
      starter_key,
      revision
    into
      committed_starter_key,
      committed_layout_revision;
  end if;

  -- -------------------------------------------------------------------------
  -- Advance S4 frontier only once
  -- -------------------------------------------------------------------------

  if
    resolved_current_step =
      'starter_composition'::core.onboarding_step
  then
    update core.owner_onboarding_progress
    set
      current_step =
        'relevant_first_job'::core.onboarding_step,
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
    'layout_working',
      jsonb_build_object(
        'starter_key',
          committed_starter_key::text,
        'revision',
          committed_layout_revision
      ),
    'current_step',
      committed_step::text,
    'progress_revision',
      committed_progress_revision
  );
end;
$$;

comment on function api.save_current_owner_starter_composition(text, bigint, bigint) is
  'Persists authenticated current-Owner Starter Composition Working using independent layout and onboarding progress revision preconditions.';

revoke all
  on function api.save_current_owner_starter_composition(text, bigint, bigint)
  from public, anon, authenticated;

grant execute
  on function api.save_current_owner_starter_composition(text, bigint, bigint)
  to authenticated;
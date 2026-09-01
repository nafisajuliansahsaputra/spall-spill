-- O01-S5 — Relevant First Job progress/resolver foundation.
--
-- Implements:
-- - adaptive S5 recommendation from Primary Use Case;
-- - authenticated current-Owner S5 read boundary;
-- - explicit S5 -> S6 Continue/Skip advancement;
-- - idempotent retry behavior;
-- - prerequisite validation;
-- - progress stale-write protection.
--
-- This migration does NOT create Product, Resource, Identity-block,
-- Published Identity, public Spill, or onboarding completion state.

-- ---------------------------------------------------------------------------
-- Current-Owner S5 resolver
-- ---------------------------------------------------------------------------

create function api.resolve_current_relevant_first_job_state()
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
  resolved_progress_revision bigint;

  recommended_first_job text;
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
    binding.auth_user_id = current_auth_user_id;

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

  if resolved_onboarding_completed_at is not null then
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
    resolved_progress_revision
  from core.owner_onboarding_progress as progress
  where
    progress.owner_id = resolved_owner_id;

  if not found then
    return jsonb_build_object(
      'status', 'progress_missing'
    );
  end if;

  if
    resolved_current_step <
      'relevant_first_job'::core.onboarding_step
  then
    return jsonb_build_object(
      'status', 'step_not_available',
      'current_step', resolved_current_step::text,
      'progress_revision', resolved_progress_revision
    );
  end if;

  if resolved_primary_use_case is null then
    return jsonb_build_object(
      'status', 'prerequisite_missing',
      'prerequisite', 'primary_use_case'
    );
  end if;

  perform 1
  from core.owner_handle_namespaces as handle_record
  where
    handle_record.owner_id = resolved_owner_id
    and handle_record.namespace_kind =
      'current'::core.handle_namespace_kind;

  if not found then
    return jsonb_build_object(
      'status', 'prerequisite_missing',
      'prerequisite', 'current_handle'
    );
  end if;

  perform 1
  from core.identity_working as identity_record
  where
    identity_record.owner_id = resolved_owner_id;

  if not found then
    return jsonb_build_object(
      'status', 'prerequisite_missing',
      'prerequisite', 'identity_working'
    );
  end if;

  perform 1
  from core.identity_layout_working as layout_record
  where
    layout_record.owner_id = resolved_owner_id;

  if not found then
    return jsonb_build_object(
      'status', 'prerequisite_missing',
      'prerequisite', 'identity_layout_working'
    );
  end if;

  recommended_first_job :=
    case resolved_primary_use_case
      when 'personal'::core.primary_use_case
        then 'identity_connection'
      when 'creator'::core.primary_use_case
        then 'identity_connection'
      when 'affiliate'::core.primary_use_case
        then 'product'
      when 'business'::core.primary_use_case
        then 'resource'
      when 'other'::core.primary_use_case
        then 'neutral'
    end;

  return jsonb_build_object(
    'status', 'success',
    'current_step', resolved_current_step::text,
    'primary_use_case', resolved_primary_use_case::text,
    'recommended_first_job', recommended_first_job,
    'progress_revision', resolved_progress_revision
  );
end;
$$;

comment on function api.resolve_current_relevant_first_job_state() is
  'Returns private O01-S5 guidance for the authenticated incomplete current Owner. Primary Use Case personalizes guidance only and grants no capability authority.';

revoke all
  on function api.resolve_current_relevant_first_job_state()
  from public, anon, authenticated;

grant execute
  on function api.resolve_current_relevant_first_job_state()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Explicit S5 -> S6 progress advancement
-- ---------------------------------------------------------------------------

create function api.advance_current_owner_relevant_first_job(
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
  resolved_account_state core.owner_account_state;
  resolved_onboarding_completed_at timestamptz;

  resolved_current_step core.onboarding_step;
  resolved_primary_use_case core.primary_use_case;
  resolved_progress_revision bigint;

  committed_progress_revision bigint;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    return jsonb_build_object(
      'status', 'unauthenticated'
    );
  end if;

  -- Lock Owner first.
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
    binding.auth_user_id = current_auth_user_id
  for update of owner_record;

  if not found then
    return jsonb_build_object(
      'status', 'owner_missing'
    );
  end if;

  if
    resolved_account_state <>
      'active'::core.owner_account_state
    or resolved_onboarding_completed_at is not null
  then
    return jsonb_build_object(
      'status', 'owner_not_eligible'
    );
  end if;

  -- Lock progress second.
  select
    progress.current_step,
    progress.primary_use_case,
    progress.revision
  into
    resolved_current_step,
    resolved_primary_use_case,
    resolved_progress_revision
  from core.owner_onboarding_progress as progress
  where
    progress.owner_id = resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'progress_missing'
    );
  end if;

  if
    resolved_current_step <
      'relevant_first_job'::core.onboarding_step
  then
    return jsonb_build_object(
      'status', 'step_not_available',
      'current_step', resolved_current_step::text,
      'progress_revision', resolved_progress_revision
    );
  end if;

  -- Retry after an already-successful S5 -> S6 advancement is idempotent.
  if
    resolved_current_step >
      'relevant_first_job'::core.onboarding_step
  then
    return jsonb_build_object(
      'status', 'success',
      'advanced', false,
      'current_step', resolved_current_step::text,
      'progress_revision', resolved_progress_revision
    );
  end if;

  if
    base_progress_revision is distinct from
      resolved_progress_revision
  then
    return jsonb_build_object(
      'status', 'stale_write',
      'current_step', resolved_current_step::text,
      'progress_revision', resolved_progress_revision
    );
  end if;

  if resolved_primary_use_case is null then
    return jsonb_build_object(
      'status', 'prerequisite_missing',
      'prerequisite', 'primary_use_case',
      'progress_revision', resolved_progress_revision
    );
  end if;

  perform 1
  from core.owner_handle_namespaces as handle_record
  where
    handle_record.owner_id = resolved_owner_id
    and handle_record.namespace_kind =
      'current'::core.handle_namespace_kind;

  if not found then
    return jsonb_build_object(
      'status', 'prerequisite_missing',
      'prerequisite', 'current_handle',
      'progress_revision', resolved_progress_revision
    );
  end if;

  perform 1
  from core.identity_working as identity_record
  where
    identity_record.owner_id = resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'prerequisite_missing',
      'prerequisite', 'identity_working',
      'progress_revision', resolved_progress_revision
    );
  end if;

  perform 1
  from core.identity_layout_working as layout_record
  where
    layout_record.owner_id = resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'prerequisite_missing',
      'prerequisite', 'identity_layout_working',
      'progress_revision', resolved_progress_revision
    );
  end if;

  update core.owner_onboarding_progress
  set
    current_step =
      'preview_publish'::core.onboarding_step,
    revision = revision + 1,
    updated_at = now()
  where
    owner_id = resolved_owner_id
  returning revision
  into committed_progress_revision;

  return jsonb_build_object(
    'status', 'success',
    'advanced', true,
    'current_step', 'preview_publish',
    'progress_revision', committed_progress_revision
  );
end;
$$;

comment on function api.advance_current_owner_relevant_first_job(bigint) is
  'Explicitly advances the authenticated current Owner from O01-S5 to S6 without requiring Product, Resource, Social, or Link content and without publishing anything.';

revoke all
  on function api.advance_current_owner_relevant_first_job(bigint)
  from public, anon, authenticated;

grant execute
  on function api.advance_current_owner_relevant_first_job(bigint)
  to authenticated;
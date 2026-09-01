-- Stage 6B.3B.2 — Attach canonical Profile Media to Basic Identity Working.
--
-- Adds:
-- - explicit media-aware Basic Identity mutation overload;
-- - Owner-scoped canonical asset validation;
-- - media participation in Identity Working optimistic concurrency;
-- - explicit media removal through NULL;
-- - immutable old-asset retention.
--
-- The existing four-argument Basic Identity mutation remains available during
-- the transition so the already-shipped S3 application flow is not broken
-- before Stage 6B.3E switches the UI to the media-aware signature.

create function api.save_current_owner_basic_identity(
  input_display_name text,
  input_bio text,
  input_profile_asset_key text,
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
  normalized_profile_asset_key text;

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

  -- Keep the same canonical mutation lock order as the existing S3 mutation:
  --
  -- Owner -> Onboarding Progress -> Identity Working -> selected Media Asset.
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

  -- Explicit optimistic-concurrency boundary.
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
  -- Display Name normalization / validation
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

  -- -------------------------------------------------------------------------
  -- Bio normalization / validation
  -- -------------------------------------------------------------------------

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
  -- Profile Media selection normalization / validation
  --
  -- NULL / empty means explicit no-media selection.
  --
  -- Any non-NULL asset must already be a canonical immutable Profile Media
  -- asset owned by the same stable canonical Owner.
  --
  -- A foreign/nonexistent asset deliberately returns the same status so this
  -- mutation does not become an asset-existence oracle.
  -- -------------------------------------------------------------------------

  normalized_profile_asset_key :=
    nullif(
      lower(
        btrim(
          coalesce(
            input_profile_asset_key,
            ''
          )
        )
      ),
      ''
    );

  if
    normalized_profile_asset_key is not null
    and normalized_profile_asset_key !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return jsonb_build_object(
      'status',
      'invalid_profile_asset',
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

  if normalized_profile_asset_key is not null then
    perform 1
    from core.profile_media_assets
      as asset
    where
      asset.asset_key =
        normalized_profile_asset_key
      and asset.owner_id =
        resolved_owner_id
    for key share;

    if not found then
      return jsonb_build_object(
        'status',
        'invalid_profile_asset',
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
      normalized_profile_asset_key,
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
    and existing_profile_asset_key
      is not distinct from
        normalized_profile_asset_key
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
      profile_asset_key =
        normalized_profile_asset_key,
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
  -- Advance S3 frontier only once.
  -- Media presence remains optional.
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
  text,
  bigint,
  bigint
) is
  'Creates or updates current incomplete Owner Basic Identity Working with optional Owner-owned canonical Profile Media, independent Identity revision protection, and one-time O01 S3 advancement.';

revoke all
  on function api.save_current_owner_basic_identity(
    text,
    text,
    text,
    bigint,
    bigint
  )
  from
    public,
    anon,
    authenticated;

grant execute
  on function api.save_current_owner_basic_identity(
    text,
    text,
    text,
    bigint,
    bigint
  )
  to authenticated;
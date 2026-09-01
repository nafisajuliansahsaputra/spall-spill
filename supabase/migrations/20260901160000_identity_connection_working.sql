-- O01-S5 — Identity Connection Working.
--
-- Implements the private first Identity Connection Working slot used during
-- Relevant First Job.
--
-- Guarantees:
-- - current Owner is always derived from auth.uid();
-- - one private first connection Working record per Owner;
-- - structured social vs generic-link semantics;
-- - only ordinary http/https destinations are accepted;
-- - independent Working revision / stale-write protection;
-- - saving never advances onboarding progress;
-- - saving never publishes Identity or creates public Spill state.

-- ---------------------------------------------------------------------------
-- Canonical Identity Connection kind
-- ---------------------------------------------------------------------------

create type core.identity_connection_kind as enum (
  'social',
  'generic_link'
);

comment on type core.identity_connection_kind is
  'Private Identity Connection Working kind. Social keeps a structured platform key; generic_link is an ordinary external link.';

-- ---------------------------------------------------------------------------
-- Private first Identity Connection Working
-- ---------------------------------------------------------------------------

create table core.identity_connection_working (
  owner_id uuid primary key,

  connection_kind core.identity_connection_kind
    not null,

  social_platform text,

  destination_url text
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

  constraint identity_connection_working_owner_fk
    foreign key (owner_id)
    references core.owners(id)
    on delete cascade,

  constraint identity_connection_working_revision_positive
    check (revision > 0),

  constraint identity_connection_working_kind_shape
    check (
      (
        connection_kind =
          'social'::core.identity_connection_kind
        and social_platform is not null
      )
      or
      (
        connection_kind =
          'generic_link'::core.identity_connection_kind
        and social_platform is null
      )
    ),

  constraint identity_connection_working_social_platform_valid
    check (
      social_platform is null
      or (
        char_length(social_platform)
          between 1 and 40
        and social_platform =
          lower(
            regexp_replace(
              social_platform,
              '^[[:space:]]+|[[:space:]]+$',
              '',
              'g'
            )
          )
        and social_platform
          ~ '^[a-z0-9][a-z0-9_-]{0,39}$'
      )
    ),

  constraint identity_connection_working_destination_valid
    check (
      char_length(destination_url)
        between 8 and 2048
      and destination_url =
        regexp_replace(
          destination_url,
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        )
      and destination_url
        !~ '[[:space:][:cntrl:]]'
      and destination_url
        !~ E'\\\\'
      and destination_url
        ~* '^https?://[^/?#]+([/?#].*)?$'
    )
);

comment on table core.identity_connection_working is
  'Private authoritative first Identity Connection Working state for onboarding. Working is not Published.';

comment on column core.identity_connection_working.owner_id is
  'Canonical Owner identity. Client mutations never select another Owner.';

comment on column core.identity_connection_working.connection_kind is
  'Structured connection kind: social or generic_link.';

comment on column core.identity_connection_working.social_platform is
  'Normalized platform key required only for social connections.';

comment on column core.identity_connection_working.destination_url is
  'Normalized ordinary http/https external destination. No server-side fetch is performed by this slice.';

comment on column core.identity_connection_working.revision is
  'Independent monotonic Working revision used for stale-write protection.';

alter table core.identity_connection_working
  enable row level security;

revoke all
  on table core.identity_connection_working
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated current-Owner read boundary
-- ---------------------------------------------------------------------------

create function api.resolve_current_identity_connection_state()
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

  resolved_current_step
    core.onboarding_step;
  resolved_primary_use_case
    core.primary_use_case;

  resolved_connection_kind
    core.identity_connection_kind;
  resolved_social_platform text;
  resolved_destination_url text;
  resolved_connection_revision bigint;

  connection_exists boolean;
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
    progress.current_step,
    progress.primary_use_case
  into
    resolved_current_step,
    resolved_primary_use_case
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

  if
    resolved_current_step <
      'relevant_first_job'::core.onboarding_step
  then
    return jsonb_build_object(
      'status',
      'step_not_available',
      'current_step',
      resolved_current_step::text
    );
  end if;

  if resolved_primary_use_case is null then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'primary_use_case'
    );
  end if;

  perform 1
  from core.owner_handle_namespaces
    as namespace_record
  where
    namespace_record.owner_id =
      resolved_owner_id
    and namespace_record.namespace_kind =
      'current'::core.handle_namespace_kind;

  if not found then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'current_handle'
    );
  end if;

  perform 1
  from core.identity_working
    as identity_record
  where
    identity_record.owner_id =
      resolved_owner_id;

  if not found then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'identity_working'
    );
  end if;

  perform 1
  from core.identity_layout_working
    as layout_record
  where
    layout_record.owner_id =
      resolved_owner_id;

  if not found then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'identity_layout_working'
    );
  end if;

  select
    connection_record.connection_kind,
    connection_record.social_platform,
    connection_record.destination_url,
    connection_record.revision
  into
    resolved_connection_kind,
    resolved_social_platform,
    resolved_destination_url,
    resolved_connection_revision
  from core.identity_connection_working
    as connection_record
  where
    connection_record.owner_id =
      resolved_owner_id;

  connection_exists := found;

  if not connection_exists then
    return jsonb_build_object(
      'status',
      'success',
      'current_step',
      resolved_current_step::text,
      'connection_working',
      null
    );
  end if;

  return jsonb_build_object(
    'status',
    'success',
    'current_step',
    resolved_current_step::text,
    'connection_working',
    jsonb_build_object(
      'connection_kind',
      resolved_connection_kind::text,
      'social_platform',
      resolved_social_platform,
      'destination_url',
      resolved_destination_url,
      'revision',
      resolved_connection_revision
    )
  );
end;
$$;

comment on function api.resolve_current_identity_connection_state() is
  'Returns only the authenticated incomplete current Owner first Identity Connection Working state.';

revoke all
  on function api.resolve_current_identity_connection_state()
  from public, anon, authenticated;

grant execute
  on function api.resolve_current_identity_connection_state()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated current-Owner save boundary
--
-- base_connection_revision:
-- - NULL = caller last acknowledged that no connection Working exists;
-- - N    = caller last acknowledged revision N.
--
-- This mutation intentionally does not accept Owner id or progress revision.
-- It never advances onboarding progress.
-- ---------------------------------------------------------------------------

create function api.save_current_owner_identity_connection(
  input_connection_kind text,
  input_social_platform text,
  input_destination_url text,
  base_connection_revision bigint
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

  existing_connection_revision bigint;
  connection_exists boolean;

  normalized_connection_kind text;
  normalized_social_platform text;
  normalized_destination_url text;

  committed_connection_kind
    core.identity_connection_kind;
  committed_social_platform text;
  committed_destination_url text;
  committed_connection_revision bigint;
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
    or resolved_onboarding_completed_at
      is not null
  then
    return jsonb_build_object(
      'status',
      'owner_not_eligible'
    );
  end if;

  -- Lock progress second to serialize against S5 -> S6 advancement.
  select
    progress.current_step,
    progress.primary_use_case
  into
    resolved_current_step,
    resolved_primary_use_case
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
      'relevant_first_job'::core.onboarding_step
  then
    return jsonb_build_object(
      'status',
      'step_not_available',
      'current_step',
      resolved_current_step::text
    );
  end if;

  if resolved_primary_use_case is null then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'primary_use_case'
    );
  end if;

  perform 1
  from core.owner_handle_namespaces
    as namespace_record
  where
    namespace_record.owner_id =
      resolved_owner_id
    and namespace_record.namespace_kind =
      'current'::core.handle_namespace_kind;

  if not found then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'current_handle'
    );
  end if;

  -- Keep the same lock ordering used by the S5 advancement mutation.
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
      'prerequisite_missing',
      'prerequisite',
      'identity_working'
    );
  end if;

  perform 1
  from core.identity_layout_working
    as layout_record
  where
    layout_record.owner_id =
      resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'identity_layout_working'
    );
  end if;

  -- Lock Connection Working after the shared onboarding prerequisites.
  select
    connection_record.revision
  into
    existing_connection_revision
  from core.identity_connection_working
    as connection_record
  where
    connection_record.owner_id =
      resolved_owner_id
  for update;

  connection_exists := found;

  if connection_exists then
    if
      base_connection_revision is null
      or base_connection_revision <>
        existing_connection_revision
    then
      return jsonb_build_object(
        'status',
        'stale_write',
        'connection_revision',
        existing_connection_revision
      );
    end if;
  else
    if base_connection_revision is not null then
      return jsonb_build_object(
        'status',
        'stale_write',
        'connection_revision',
        null
      );
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- Canonical normalization / validation
  -- -------------------------------------------------------------------------

  normalized_connection_kind :=
    lower(
      btrim(
        coalesce(
          input_connection_kind,
          ''
        )
      )
    );

  normalized_social_platform :=
    nullif(
      lower(
        btrim(
          coalesce(
            input_social_platform,
            ''
          )
        )
      ),
      ''
    );

  normalized_destination_url :=
    btrim(
      coalesce(
        input_destination_url,
        ''
      )
    );

  if
    normalized_connection_kind
      not in (
        'social',
        'generic_link'
      )
  then
    return jsonb_build_object(
      'status',
      'invalid_connection_kind'
    );
  end if;

  if
    normalized_connection_kind =
      'social'
    and (
      normalized_social_platform is null
      or char_length(
        normalized_social_platform
      ) > 40
      or normalized_social_platform
        !~ '^[a-z0-9][a-z0-9_-]{0,39}$'
    )
  then
    return jsonb_build_object(
      'status',
      'invalid_social_platform'
    );
  end if;

  if
    normalized_connection_kind =
      'generic_link'
    and normalized_social_platform
      is not null
  then
    return jsonb_build_object(
      'status',
      'invalid_social_platform'
    );
  end if;

  if
    char_length(
      normalized_destination_url
    ) < 8
    or char_length(
      normalized_destination_url
    ) > 2048
    or normalized_destination_url
      ~ '[[:space:][:cntrl:]]'
    or normalized_destination_url
      ~ E'\\\\'
    or normalized_destination_url
      !~* '^https?://[^/?#]+([/?#].*)?$'
  then
    return jsonb_build_object(
      'status',
      'invalid_destination_url'
    );
  end if;

  -- -------------------------------------------------------------------------
  -- Acknowledged Working persistence only.
  -- -------------------------------------------------------------------------

  if connection_exists then
    update core.identity_connection_working
    set
      connection_kind =
        normalized_connection_kind::
          core.identity_connection_kind,
      social_platform =
        normalized_social_platform,
      destination_url =
        normalized_destination_url,
      revision =
        revision + 1,
      updated_at =
        now()
    where
      owner_id =
        resolved_owner_id
    returning
      connection_kind,
      social_platform,
      destination_url,
      revision
    into
      committed_connection_kind,
      committed_social_platform,
      committed_destination_url,
      committed_connection_revision;
  else
    insert into core.identity_connection_working (
      owner_id,
      connection_kind,
      social_platform,
      destination_url
    )
    values (
      resolved_owner_id,
      normalized_connection_kind::
        core.identity_connection_kind,
      normalized_social_platform,
      normalized_destination_url
    )
    returning
      connection_kind,
      social_platform,
      destination_url,
      revision
    into
      committed_connection_kind,
      committed_social_platform,
      committed_destination_url,
      committed_connection_revision;
  end if;

  return jsonb_build_object(
    'status',
    'success',
    'current_step',
    resolved_current_step::text,
    'connection_working',
    jsonb_build_object(
      'connection_kind',
      committed_connection_kind::text,
      'social_platform',
      committed_social_platform,
      'destination_url',
      committed_destination_url,
      'revision',
      committed_connection_revision
    )
  );
end;
$$;

comment on function api.save_current_owner_identity_connection(
  text,
  text,
  text,
  bigint
) is
  'Creates or updates only the authenticated current Owner private first Identity Connection Working record. It never advances onboarding or publishes content.';

revoke all
  on function api.save_current_owner_identity_connection(
    text,
    text,
    text,
    bigint
  )
  from public, anon, authenticated;

grant execute
  on function api.save_current_owner_identity_connection(
    text,
    text,
    text,
    bigint
  )
  to authenticated;
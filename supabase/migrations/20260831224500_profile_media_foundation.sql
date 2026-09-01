-- Stage 6B.3B.1 — Profile Media private database foundation.
--
-- Implements:
-- - private upload-intent lifecycle;
-- - immutable canonical Profile Media asset registry;
-- - Owner-scoped media authority;
-- - service-only upload orchestration RPCs;
-- - duplicate-safe finalization.
--
-- Does NOT yet:
-- - connect profile_asset_key to Basic Identity mutation;
-- - access Cloudflare R2;
-- - process image bytes;
-- - expose upload UI.

create type core.profile_media_upload_status
as enum (
  'pending',
  'processing',
  'consumed',
  'rejected',
  'expired'
);

-- ---------------------------------------------------------------------------
-- Private upload intents
-- ---------------------------------------------------------------------------

create table core.profile_media_upload_intents (
  id uuid primary key,

  owner_id uuid not null,

  expected_content_type text not null,

  declared_byte_size bigint not null,

  staging_object_key text
    not null
    unique,

  status core.profile_media_upload_status
    not null
    default 'pending',

  expires_at timestamptz not null,

  created_at timestamptz
    not null
    default now(),

  consumed_at timestamptz,

  constraint profile_media_upload_intents_owner_fk
    foreign key (owner_id)
    references core.owners(id)
    on delete cascade,

  constraint profile_media_upload_intents_owner_id_unique
    unique (owner_id, id),

  constraint profile_media_upload_intents_content_type_valid
    check (
      expected_content_type in (
        'image/jpeg',
        'image/png',
        'image/webp'
      )
    ),

  constraint profile_media_upload_intents_byte_size_valid
    check (
      declared_byte_size
        between 1 and 5242880
    ),

  constraint profile_media_upload_intents_staging_key_valid
    check (
      staging_object_key ~
        '^staging/profile/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),

  constraint profile_media_upload_intents_expiry_valid
    check (
      expires_at > created_at
    ),

  constraint profile_media_upload_intents_consumed_state_valid
    check (
      (
        status =
          'consumed'::core.profile_media_upload_status
        and consumed_at is not null
      )
      or
      (
        status <>
          'consumed'::core.profile_media_upload_status
        and consumed_at is null
      )
    )
);

comment on table core.profile_media_upload_intents is
  'Private short-lived Owner-scoped Profile Media upload intents. Staging objects are untrusted until server finalization succeeds.';

comment on column core.profile_media_upload_intents.staging_object_key is
  'Trusted server-generated temporary R2 staging object key. Never canonical Identity state.';

comment on column core.profile_media_upload_intents.declared_byte_size is
  'Client-declared source size used for initiation validation only; finalization must inspect authoritative R2 object size.';

create index profile_media_upload_intents_owner_status_idx
  on core.profile_media_upload_intents (
    owner_id,
    status
  );

create index profile_media_upload_intents_expiry_idx
  on core.profile_media_upload_intents (
    expires_at
  )
  where status in (
    'pending'::core.profile_media_upload_status,
    'processing'::core.profile_media_upload_status
  );

-- ---------------------------------------------------------------------------
-- Immutable canonical Profile Media assets
-- ---------------------------------------------------------------------------

create table core.profile_media_assets (
  asset_key text primary key,

  owner_id uuid not null,

  object_key text
    not null
    unique,

  stored_content_type text
    not null,

  byte_size bigint
    not null,

  width integer
    not null,

  height integer
    not null,

  source_upload_intent_id uuid
    not null
    unique,

  created_at timestamptz
    not null
    default now(),

  constraint profile_media_assets_owner_fk
    foreign key (owner_id)
    references core.owners(id)
    on delete cascade,

  constraint profile_media_assets_owner_asset_unique
    unique (owner_id, asset_key),

  constraint profile_media_assets_source_intent_owner_fk
    foreign key (
      owner_id,
      source_upload_intent_id
    )
    references core.profile_media_upload_intents (
      owner_id,
      id
    ),

  constraint profile_media_assets_asset_key_valid
    check (
      asset_key ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),

  constraint profile_media_assets_object_key_valid
    check (
      object_key =
        'working/profile/' ||
        asset_key ||
        '.webp'
    ),

  constraint profile_media_assets_content_type_valid
    check (
      stored_content_type =
        'image/webp'
    ),

  constraint profile_media_assets_byte_size_valid
    check (
      byte_size > 0
    ),

  constraint profile_media_assets_dimensions_valid
    check (
      width between 1 and 2048
      and height between 1 and 2048
      and (
        width::bigint *
        height::bigint
      ) <= 4194304
    )
);

comment on table core.profile_media_assets is
  'Private immutable canonical sanitized Profile Media asset registry. Binary bytes live in Cloudflare R2.';

comment on column core.profile_media_assets.asset_key is
  'Stable opaque application media identity stored by Working/Published records instead of public URLs.';

comment on column core.profile_media_assets.object_key is
  'Immutable private R2 canonical WebP object key.';

comment on column core.profile_media_assets.source_upload_intent_id is
  'Exactly one canonical asset may result from one consumed upload intent.';

create index profile_media_assets_owner_idx
  on core.profile_media_assets (
    owner_id
  );

-- ---------------------------------------------------------------------------
-- Private-table authorization
-- ---------------------------------------------------------------------------

alter table core.profile_media_upload_intents
  enable row level security;

alter table core.profile_media_assets
  enable row level security;

revoke all
  on table core.profile_media_upload_intents
  from
    public,
    anon,
    authenticated,
    service_role;

revoke all
  on table core.profile_media_assets
  from
    public,
    anon,
    authenticated,
    service_role;

-- service_role needs schema reachability before it can invoke the explicitly
-- granted service-only RPCs. This grants no direct core-table access.
grant usage
  on schema api
  to service_role;

-- ---------------------------------------------------------------------------
-- Service-only upload-intent creation
--
-- The trusted application server verifies the request-scoped Supabase session
-- first, then supplies that verified Auth user ID to this service-only RPC.
-- Browser roles cannot execute this function.
-- ---------------------------------------------------------------------------

create function api.create_profile_media_upload_intent_server(
  input_auth_user_id uuid,
  input_expected_content_type text,
  input_declared_byte_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_owner_id uuid;

  resolved_account_state
    core.owner_account_state;

  resolved_onboarding_completed_at
    timestamptz;

  resolved_current_step
    core.onboarding_step;

  normalized_content_type text;

  generated_intent_id uuid;
  generated_staging_token uuid;
  generated_staging_key text;
  generated_expires_at timestamptz;
begin
  if input_auth_user_id is null then
    return jsonb_build_object(
      'status',
      'owner_missing'
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
      input_auth_user_id;

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
    progress.current_step
  into
    resolved_current_step
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
      'basic_identity'::core.onboarding_step
  then
    return jsonb_build_object(
      'status',
      'step_not_available',
      'current_step',
        resolved_current_step::text
    );
  end if;

  normalized_content_type :=
    lower(
      btrim(
        coalesce(
          input_expected_content_type,
          ''
        )
      )
    );

  if
    normalized_content_type not in (
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  then
    return jsonb_build_object(
      'status',
      'invalid_content_type'
    );
  end if;

  if
    input_declared_byte_size is null
    or input_declared_byte_size
      not between 1 and 5242880
  then
    return jsonb_build_object(
      'status',
      'invalid_byte_size'
    );
  end if;

  generated_intent_id :=
    gen_random_uuid();

  generated_staging_token :=
    gen_random_uuid();

  generated_staging_key :=
    'staging/profile/' ||
    generated_intent_id::text ||
    '/' ||
    generated_staging_token::text;

  generated_expires_at :=
    now() + interval '5 minutes';

  insert into
    core.profile_media_upload_intents (
      id,
      owner_id,
      expected_content_type,
      declared_byte_size,
      staging_object_key,
      expires_at
    )
  values (
    generated_intent_id,
    resolved_owner_id,
    normalized_content_type,
    input_declared_byte_size,
    generated_staging_key,
    generated_expires_at
  );

  return jsonb_build_object(
    'status',
      'success',
    'upload_intent_id',
      generated_intent_id::text,
    'staging_object_key',
      generated_staging_key,
    'expected_content_type',
      normalized_content_type,
    'declared_byte_size',
      input_declared_byte_size,
    'expires_at',
      generated_expires_at
  );
end;
$$;

comment on function api.create_profile_media_upload_intent_server(
  uuid,
  text,
  bigint
) is
  'Service-only creation of a short-lived Owner-scoped Profile Media upload intent after trusted server authentication verification.';

revoke all
  on function api.create_profile_media_upload_intent_server(
    uuid,
    text,
    bigint
  )
  from
    public,
    anon,
    authenticated,
    service_role;

grant execute
  on function api.create_profile_media_upload_intent_server(
    uuid,
    text,
    bigint
  )
  to service_role;

-- ---------------------------------------------------------------------------
-- Service-only upload-intent resolver
-- ---------------------------------------------------------------------------

create function api.resolve_profile_media_upload_intent_server(
  input_auth_user_id uuid,
  input_upload_intent_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_owner_id uuid;

  resolved_account_state
    core.owner_account_state;

  resolved_onboarding_completed_at
    timestamptz;

  resolved_status
    core.profile_media_upload_status;

  resolved_expected_content_type text;
  resolved_declared_byte_size bigint;
  resolved_staging_object_key text;
  resolved_expires_at timestamptz;

  resolved_asset_key text;
  resolved_object_key text;
  resolved_byte_size bigint;
  resolved_width integer;
  resolved_height integer;
begin
  if
    input_auth_user_id is null
    or input_upload_intent_id is null
  then
    return jsonb_build_object(
      'status',
      'intent_missing'
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
      input_auth_user_id;

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
    intent.status,
    intent.expected_content_type,
    intent.declared_byte_size,
    intent.staging_object_key,
    intent.expires_at
  into
    resolved_status,
    resolved_expected_content_type,
    resolved_declared_byte_size,
    resolved_staging_object_key,
    resolved_expires_at
  from core.profile_media_upload_intents
    as intent
  where
    intent.id =
      input_upload_intent_id
    and intent.owner_id =
      resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status',
      'intent_missing'
    );
  end if;

  if
    resolved_status in (
      'pending'::core.profile_media_upload_status,
      'processing'::core.profile_media_upload_status
    )
    and resolved_expires_at <= now()
  then
    update core.profile_media_upload_intents
    set
      status =
        'expired'::core.profile_media_upload_status
    where
      id =
        input_upload_intent_id;

    return jsonb_build_object(
      'status',
      'expired'
    );
  end if;

  if
    resolved_status =
      'expired'::core.profile_media_upload_status
  then
    return jsonb_build_object(
      'status',
      'expired'
    );
  end if;

  if
    resolved_status =
      'rejected'::core.profile_media_upload_status
  then
    return jsonb_build_object(
      'status',
      'rejected'
    );
  end if;

  if
    resolved_status =
      'consumed'::core.profile_media_upload_status
  then
    select
      asset.asset_key,
      asset.object_key,
      asset.byte_size,
      asset.width,
      asset.height
    into
      resolved_asset_key,
      resolved_object_key,
      resolved_byte_size,
      resolved_width,
      resolved_height
    from core.profile_media_assets
      as asset
    where
      asset.owner_id =
        resolved_owner_id
      and asset.source_upload_intent_id =
        input_upload_intent_id;

    if not found then
      return jsonb_build_object(
        'status',
        'asset_missing'
      );
    end if;

    return jsonb_build_object(
      'status',
        'consumed',
      'asset_key',
        resolved_asset_key,
      'object_key',
        resolved_object_key,
      'stored_content_type',
        'image/webp',
      'byte_size',
        resolved_byte_size,
      'width',
        resolved_width,
      'height',
        resolved_height
    );
  end if;

  return jsonb_build_object(
    'status',
      'success',
    'intent_status',
      resolved_status::text,
    'expected_content_type',
      resolved_expected_content_type,
    'declared_byte_size',
      resolved_declared_byte_size,
    'staging_object_key',
      resolved_staging_object_key,
    'expires_at',
      resolved_expires_at
  );
end;
$$;

comment on function api.resolve_profile_media_upload_intent_server(
  uuid,
  uuid
) is
  'Service-only resolver for the verified Auth user current Profile Media upload intent, including duplicate-finalization recovery.';

revoke all
  on function api.resolve_profile_media_upload_intent_server(
    uuid,
    uuid
  )
  from
    public,
    anon,
    authenticated,
    service_role;

grant execute
  on function api.resolve_profile_media_upload_intent_server(
    uuid,
    uuid
  )
  to service_role;

-- ---------------------------------------------------------------------------
-- Service-only canonical asset registration / upload-intent completion
--
-- R2 byte inspection, decoding, sanitization, and canonical PutObject happen
-- in trusted server code BEFORE this function is called.
-- ---------------------------------------------------------------------------

create function api.complete_profile_media_upload_server(
  input_auth_user_id uuid,
  input_upload_intent_id uuid,
  input_asset_key text,
  input_object_key text,
  input_stored_content_type text,
  input_byte_size bigint,
  input_width integer,
  input_height integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_owner_id uuid;

  resolved_account_state
    core.owner_account_state;

  resolved_onboarding_completed_at
    timestamptz;

  resolved_status
    core.profile_media_upload_status;

  resolved_expires_at timestamptz;

  normalized_asset_key text;
  normalized_object_key text;
  normalized_content_type text;

  existing_asset_key text;
  existing_object_key text;
  existing_byte_size bigint;
  existing_width integer;
  existing_height integer;
begin
  if
    input_auth_user_id is null
    or input_upload_intent_id is null
  then
    return jsonb_build_object(
      'status',
      'intent_missing'
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
      input_auth_user_id
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
    intent.status,
    intent.expires_at
  into
    resolved_status,
    resolved_expires_at
  from core.profile_media_upload_intents
    as intent
  where
    intent.id =
      input_upload_intent_id
    and intent.owner_id =
      resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status',
      'intent_missing'
    );
  end if;

  -- Lost-response retry: one intent can produce only one canonical asset.
  if
    resolved_status =
      'consumed'::core.profile_media_upload_status
  then
    select
      asset.asset_key,
      asset.object_key,
      asset.byte_size,
      asset.width,
      asset.height
    into
      existing_asset_key,
      existing_object_key,
      existing_byte_size,
      existing_width,
      existing_height
    from core.profile_media_assets
      as asset
    where
      asset.owner_id =
        resolved_owner_id
      and asset.source_upload_intent_id =
        input_upload_intent_id;

    if not found then
      return jsonb_build_object(
        'status',
        'asset_missing'
      );
    end if;

    return jsonb_build_object(
      'status',
        'success',
      'idempotent',
        true,
      'asset_key',
        existing_asset_key,
      'object_key',
        existing_object_key,
      'stored_content_type',
        'image/webp',
      'byte_size',
        existing_byte_size,
      'width',
        existing_width,
      'height',
        existing_height
    );
  end if;

  if
    resolved_status in (
      'pending'::core.profile_media_upload_status,
      'processing'::core.profile_media_upload_status
    )
    and resolved_expires_at <= now()
  then
    update core.profile_media_upload_intents
    set
      status =
        'expired'::core.profile_media_upload_status
    where
      id =
        input_upload_intent_id;

    return jsonb_build_object(
      'status',
      'expired'
    );
  end if;

  if
    resolved_status =
      'expired'::core.profile_media_upload_status
  then
    return jsonb_build_object(
      'status',
      'expired'
    );
  end if;

  if
    resolved_status =
      'rejected'::core.profile_media_upload_status
  then
    return jsonb_build_object(
      'status',
      'rejected'
    );
  end if;

  normalized_asset_key :=
    lower(
      btrim(
        coalesce(
          input_asset_key,
          ''
        )
      )
    );

  normalized_object_key :=
    btrim(
      coalesce(
        input_object_key,
        ''
      )
    );

  normalized_content_type :=
    lower(
      btrim(
        coalesce(
          input_stored_content_type,
          ''
        )
      )
    );

  if
    normalized_asset_key !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return jsonb_build_object(
      'status',
      'invalid_asset_metadata'
    );
  end if;

  if
    normalized_object_key <>
      (
        'working/profile/' ||
        normalized_asset_key ||
        '.webp'
      )
  then
    return jsonb_build_object(
      'status',
      'invalid_asset_metadata'
    );
  end if;

  if
    normalized_content_type <>
      'image/webp'
  then
    return jsonb_build_object(
      'status',
      'invalid_asset_metadata'
    );
  end if;

  if
    input_byte_size is null
    or input_byte_size <= 0
    or input_width is null
    or input_height is null
    or input_width not between 1 and 2048
    or input_height not between 1 and 2048
    or (
      input_width::bigint *
      input_height::bigint
    ) > 4194304
  then
    return jsonb_build_object(
      'status',
      'invalid_asset_metadata'
    );
  end if;

  begin
    insert into core.profile_media_assets (
      asset_key,
      owner_id,
      object_key,
      stored_content_type,
      byte_size,
      width,
      height,
      source_upload_intent_id
    )
    values (
      normalized_asset_key,
      resolved_owner_id,
      normalized_object_key,
      normalized_content_type,
      input_byte_size,
      input_width,
      input_height,
      input_upload_intent_id
    );
  exception
    when unique_violation then
      return jsonb_build_object(
        'status',
        'asset_conflict'
      );
  end;

  update core.profile_media_upload_intents
  set
    status =
      'consumed'::core.profile_media_upload_status,
    consumed_at =
      now()
  where
    id =
      input_upload_intent_id;

  return jsonb_build_object(
    'status',
      'success',
    'idempotent',
      false,
    'asset_key',
      normalized_asset_key,
    'object_key',
      normalized_object_key,
    'stored_content_type',
      normalized_content_type,
    'byte_size',
      input_byte_size,
    'width',
      input_width,
    'height',
      input_height
  );
end;
$$;

comment on function api.complete_profile_media_upload_server(
  uuid,
  uuid,
  text,
  text,
  text,
  bigint,
  integer,
  integer
) is
  'Service-only duplicate-safe registration of one immutable sanitized canonical Profile Media asset from one verified upload intent.';

revoke all
  on function api.complete_profile_media_upload_server(
    uuid,
    uuid,
    text,
    text,
    text,
    bigint,
    integer,
    integer
  )
  from
    public,
    anon,
    authenticated,
    service_role;

grant execute
  on function api.complete_profile_media_upload_server(
    uuid,
    uuid,
    text,
    text,
    text,
    bigint,
    integer,
    integer
  )
  to service_role;
begin;

select no_plan();

-- ===========================================================================
-- Stage 6B.3B.1 — Profile Media private database foundation
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Schema foundation
-- ---------------------------------------------------------------------------

select has_type(
  'core',
  'profile_media_upload_status',
  'Profile Media upload-status enum exists'
);

select ok(
  (
    select array_agg(
      enum_value.enumlabel::text
      order by enum_value.enumsortorder
    )
    from pg_enum as enum_value
    join pg_type as enum_type
      on enum_type.oid = enum_value.enumtypid
    join pg_namespace as namespace_record
      on namespace_record.oid = enum_type.typnamespace
    where
      namespace_record.nspname = 'core'
      and enum_type.typname = 'profile_media_upload_status'
  ) = array[
    'pending',
    'processing',
    'consumed',
    'rejected',
    'expired'
  ]::text[],
  'Profile Media upload status contains locked lifecycle states'
);

select has_table(
  'core',
  'profile_media_upload_intents',
  'private Profile Media upload-intent table exists'
);

select has_column(
  'core',
  'profile_media_upload_intents',
  'id',
  'upload intent has authoritative ID'
);

select has_column(
  'core',
  'profile_media_upload_intents',
  'owner_id',
  'upload intent belongs to canonical Owner'
);

select has_column(
  'core',
  'profile_media_upload_intents',
  'expected_content_type',
  'upload intent stores expected source MIME'
);

select has_column(
  'core',
  'profile_media_upload_intents',
  'declared_byte_size',
  'upload intent stores declared byte size'
);

select has_column(
  'core',
  'profile_media_upload_intents',
  'staging_object_key',
  'upload intent stores server-generated staging key'
);

select has_column(
  'core',
  'profile_media_upload_intents',
  'status',
  'upload intent stores lifecycle status'
);

select has_column(
  'core',
  'profile_media_upload_intents',
  'expires_at',
  'upload intent stores expiry'
);

select has_column(
  'core',
  'profile_media_upload_intents',
  'consumed_at',
  'upload intent stores consumption timestamp'
);

select has_table(
  'core',
  'profile_media_assets',
  'private canonical Profile Media asset registry exists'
);

select has_column(
  'core',
  'profile_media_assets',
  'asset_key',
  'canonical asset has stable application asset identity'
);

select has_column(
  'core',
  'profile_media_assets',
  'owner_id',
  'canonical asset belongs to canonical Owner'
);

select has_column(
  'core',
  'profile_media_assets',
  'object_key',
  'canonical asset stores private R2 object key'
);

select has_column(
  'core',
  'profile_media_assets',
  'stored_content_type',
  'canonical asset stores authoritative media type'
);

select has_column(
  'core',
  'profile_media_assets',
  'byte_size',
  'canonical asset stores processed byte size'
);

select has_column(
  'core',
  'profile_media_assets',
  'width',
  'canonical asset stores processed width'
);

select has_column(
  'core',
  'profile_media_assets',
  'height',
  'canonical asset stores processed height'
);

select has_column(
  'core',
  'profile_media_assets',
  'source_upload_intent_id',
  'canonical asset traces to source upload intent'
);

select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    where
      constraint_record.conrelid =
        'core.profile_media_upload_intents'::regclass
      and constraint_record.contype = 'p'
  ),
  'upload intent has primary key'
);

select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    where
      constraint_record.conname =
        'profile_media_upload_intents_owner_fk'
      and constraint_record.conrelid =
        'core.profile_media_upload_intents'::regclass
      and constraint_record.confrelid =
        'core.owners'::regclass
      and constraint_record.contype = 'f'
  ),
  'upload intent references stable Owner'
);

select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    where
      constraint_record.conname =
        'profile_media_assets_owner_fk'
      and constraint_record.conrelid =
        'core.profile_media_assets'::regclass
      and constraint_record.confrelid =
        'core.owners'::regclass
      and constraint_record.contype = 'f'
  ),
  'canonical asset references stable Owner'
);

select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    where
      constraint_record.conname =
        'profile_media_assets_source_intent_owner_fk'
      and constraint_record.conrelid =
        'core.profile_media_assets'::regclass
      and constraint_record.confrelid =
        'core.profile_media_upload_intents'::regclass
      and constraint_record.contype = 'f'
  ),
  'canonical asset source intent must belong to same Owner'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where
      schemaname = 'core'
      and tablename = 'profile_media_upload_intents'
      and indexname =
        'profile_media_upload_intents_owner_status_idx'
  ),
  'upload intents support Owner/status lookup'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where
      schemaname = 'core'
      and tablename = 'profile_media_upload_intents'
      and indexname =
        'profile_media_upload_intents_expiry_idx'
  ),
  'upload intents support expiry lookup'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where
      schemaname = 'core'
      and tablename = 'profile_media_assets'
      and indexname = 'profile_media_assets_owner_idx'
  ),
  'canonical assets support Owner lookup'
);

-- ---------------------------------------------------------------------------
-- Deny-by-default private relations
-- ---------------------------------------------------------------------------

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'core.profile_media_upload_intents'::regclass
  ),
  'RLS is enabled on upload intents'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'core.profile_media_assets'::regclass
  ),
  'RLS is enabled on canonical media assets'
);

select ok(
  not has_table_privilege(
    'anon',
    'core.profile_media_upload_intents',
    'SELECT'
  ),
  'anon cannot read upload intents'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.profile_media_upload_intents',
    'SELECT'
  ),
  'authenticated cannot read upload intents'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.profile_media_upload_intents',
    'INSERT'
  ),
  'authenticated cannot directly create upload intents'
);

select ok(
  not has_table_privilege(
    'service_role',
    'core.profile_media_upload_intents',
    'SELECT'
  ),
  'service role has no direct upload-intent table grant'
);

select ok(
  not has_table_privilege(
    'anon',
    'core.profile_media_assets',
    'SELECT'
  ),
  'anon cannot enumerate canonical media assets'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.profile_media_assets',
    'SELECT'
  ),
  'authenticated cannot read canonical media assets directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.profile_media_assets',
    'INSERT'
  ),
  'authenticated cannot register canonical assets directly'
);

select ok(
  not has_table_privilege(
    'service_role',
    'core.profile_media_assets',
    'INSERT'
  ),
  'service role uses service RPC instead of direct asset-table grant'
);

-- ---------------------------------------------------------------------------
-- Service-only RPC boundary
-- ---------------------------------------------------------------------------

select ok(
  has_schema_privilege(
    'service_role',
    'api',
    'USAGE'
  ),
  'service role may reach dedicated api schema'
);

select ok(
  to_regprocedure(
    'api.create_profile_media_upload_intent_server(uuid,text,bigint)'
  ) is not null,
  'service upload-intent creation RPC exists'
);

select ok(
  to_regprocedure(
    'api.resolve_profile_media_upload_intent_server(uuid,uuid)'
  ) is not null,
  'service upload-intent resolver exists'
);

select ok(
  to_regprocedure(
    'api.complete_profile_media_upload_server(uuid,uuid,text,text,text,bigint,integer,integer)'
  ) is not null,
  'service canonical completion RPC exists'
);

select is(
  (
    select count(*)
    from pg_proc as procedure_record
    join pg_namespace as namespace_record
      on namespace_record.oid =
        procedure_record.pronamespace
    where
      namespace_record.nspname = 'api'
      and procedure_record.proname in (
        'create_profile_media_upload_intent_server',
        'resolve_profile_media_upload_intent_server',
        'complete_profile_media_upload_server'
      )
      and procedure_record.prosecdef
  ),
  3::bigint,
  'all Profile Media service RPCs are SECURITY DEFINER'
);

select is(
  (
    select count(*)
    from pg_proc as procedure_record
    join pg_namespace as namespace_record
      on namespace_record.oid =
        procedure_record.pronamespace
    where
      namespace_record.nspname = 'api'
      and procedure_record.proname in (
        'create_profile_media_upload_intent_server',
        'resolve_profile_media_upload_intent_server',
        'complete_profile_media_upload_server'
      )
      and exists (
        select 1
        from unnest(
          coalesce(
            procedure_record.proconfig,
            array[]::text[]
          )
        ) as config(value)
        where
          config.value ~ '^search_path=(""){0,1}$'
      )
  ),
  3::bigint,
  'all Profile Media service RPCs use empty fixed search_path'
);

select ok(
  has_function_privilege(
    'service_role',
    'api.create_profile_media_upload_intent_server(uuid,text,bigint)',
    'EXECUTE'
  ),
  'service role may create upload intents'
);

select ok(
  has_function_privilege(
    'service_role',
    'api.resolve_profile_media_upload_intent_server(uuid,uuid)',
    'EXECUTE'
  ),
  'service role may resolve upload intents'
);

select ok(
  has_function_privilege(
    'service_role',
    'api.complete_profile_media_upload_server(uuid,uuid,text,text,text,bigint,integer,integer)',
    'EXECUTE'
  ),
  'service role may complete canonical media'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'api.create_profile_media_upload_intent_server(uuid,text,bigint)',
    'EXECUTE'
  ),
  'authenticated cannot call service intent creation RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'api.resolve_profile_media_upload_intent_server(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot call service intent resolver'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'api.complete_profile_media_upload_server(uuid,uuid,text,text,text,bigint,integer,integer)',
    'EXECUTE'
  ),
  'authenticated cannot call service completion RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.create_profile_media_upload_intent_server(uuid,text,bigint)',
    'EXECUTE'
  ),
  'anon cannot create Profile Media upload intents'
);

-- ---------------------------------------------------------------------------
-- Owner fixtures
-- ---------------------------------------------------------------------------

reset role;

insert into auth.users (
  id,
  email
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    'media-owner-a@example.test'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    'media-owner-b@example.test'
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    'media-owner-too-early@example.test'
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    'media-owner-complete@example.test'
  );

-- Owner A -> S3.

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000001"}';

select is(
  api.claim_current_owner_handle(
    'media-owner-a',
    1
  ) ->> 'status',
  'success',
  'Owner A completes S1'
);

select is(
  api.set_current_owner_primary_use_case(
    'creator',
    2
  ) ->> 'status',
  'success',
  'Owner A completes S2 and reaches S3'
);

-- Owner B -> S3.

set local request.jwt.claims =
  '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000002"}';

select is(
  api.claim_current_owner_handle(
    'media-owner-b',
    1
  ) ->> 'status',
  'success',
  'Owner B completes S1'
);

select is(
  api.set_current_owner_primary_use_case(
    'business',
    2
  ) ->> 'status',
  'success',
  'Owner B completes S2 and reaches S3'
);

-- Owner C intentionally remains before S3.

reset role;

-- Owner D is completed and must not replay O01.

update core.owners as owner_record
set
  onboarding_completed_at = now(),
  updated_at = now()
from core.owner_auth_bindings as binding
where
  binding.owner_id = owner_record.id
  and binding.auth_user_id =
    '40000000-0000-4000-8000-000000000004';

-- ---------------------------------------------------------------------------
-- Eligibility and upload limits
-- ---------------------------------------------------------------------------

set local role service_role;

select is(
  api.create_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000099',
    'image/jpeg',
    1000
  ) ->> 'status',
  'owner_missing',
  'unknown Auth principal fails closed'
);

select is(
  api.create_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000003',
    'image/jpeg',
    1000
  ) ->> 'status',
  'step_not_available',
  'Profile Media cannot bypass S1/S2'
);

select is(
  api.create_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000004',
    'image/jpeg',
    1000
  ) ->> 'status',
  'owner_not_eligible',
  'completed Owner cannot replay O01 Profile Media flow'
);

select is(
  api.create_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000001',
    'image/gif',
    1000
  ) ->> 'status',
  'invalid_content_type',
  'GIF source MIME is rejected'
);

select is(
  api.create_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000001',
    'image/svg+xml',
    1000
  ) ->> 'status',
  'invalid_content_type',
  'SVG source MIME is rejected'
);

select is(
  api.create_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000001',
    'image/jpeg',
    0
  ) ->> 'status',
  'invalid_byte_size',
  'zero-byte source is rejected'
);

select is(
  api.create_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000001',
    'image/jpeg',
    5242881
  ) ->> 'status',
  'invalid_byte_size',
  'source larger than 5 MiB is rejected'
);

select is(
  api.create_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000001',
    '  IMAGE/PNG  ',
    5242880
  ) ->> 'status',
  'success',
  'supported normalized MIME at exact 5 MiB boundary succeeds'
);

reset role;

select is(
  (
    select count(*)
    from core.profile_media_upload_intents as intent
    join core.owner_auth_bindings as binding
      on binding.owner_id = intent.owner_id
    where
      binding.auth_user_id =
        '40000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'valid initiation creates exactly one upload intent'
);

select is(
  (
    select intent.expected_content_type
    from core.profile_media_upload_intents as intent
    join core.owner_auth_bindings as binding
      on binding.owner_id = intent.owner_id
    where
      binding.auth_user_id =
        '40000000-0000-4000-8000-000000000001'
  ),
  'image/png',
  'source MIME is normalized before persistence'
);

select is(
  (
    select intent.declared_byte_size
    from core.profile_media_upload_intents as intent
    join core.owner_auth_bindings as binding
      on binding.owner_id = intent.owner_id
    where
      binding.auth_user_id =
        '40000000-0000-4000-8000-000000000001'
  ),
  5242880::bigint,
  'declared byte size is persisted'
);

select ok(
  (
    select intent.staging_object_key ~
      '^staging/profile/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    from core.profile_media_upload_intents as intent
    join core.owner_auth_bindings as binding
      on binding.owner_id = intent.owner_id
    where
      binding.auth_user_id =
        '40000000-0000-4000-8000-000000000001'
  ),
  'staging object key is opaque and server-generated'
);

select ok(
  (
    select
      intent.expires_at > intent.created_at
      and intent.expires_at <=
        intent.created_at + interval '5 minutes 1 second'
    from core.profile_media_upload_intents as intent
    join core.owner_auth_bindings as binding
      on binding.owner_id = intent.owner_id
    where
      binding.auth_user_id =
        '40000000-0000-4000-8000-000000000001'
  ),
  'upload intent expires after approximately five minutes'
);

select is(
  (
    select intent.status::text
    from core.profile_media_upload_intents as intent
    join core.owner_auth_bindings as binding
      on binding.owner_id = intent.owner_id
    where
      binding.auth_user_id =
        '40000000-0000-4000-8000-000000000001'
  ),
  'pending',
  'new upload intent starts pending'
);

select is(
  (
    select count(*)
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id = identity_record.owner_id
    where
      binding.auth_user_id =
        '40000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'creating upload intent does not create Identity Working'
);

create temporary table media_test_state (
  name text primary key,
  value uuid not null
);

grant select
  on table media_test_state
  to service_role;

insert into media_test_state (
  name,
  value
)
select
  'owner_a_expiring_intent',
  intent.id
from core.profile_media_upload_intents as intent
join core.owner_auth_bindings as binding
  on binding.owner_id = intent.owner_id
where
  binding.auth_user_id =
    '40000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Owner isolation
-- ---------------------------------------------------------------------------

set local role service_role;

select is(
  api.resolve_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000002',
    (
      select value
      from media_test_state
      where name = 'owner_a_expiring_intent'
    )
  ) ->> 'status',
  'intent_missing',
  'Owner B cannot resolve Owner A private upload intent'
);

select is(
  api.resolve_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000001',
    (
      select value
      from media_test_state
      where name = 'owner_a_expiring_intent'
    )
  ) ->> 'status',
  'success',
  'Owner A resolves its own pending upload intent'
);

-- ---------------------------------------------------------------------------
-- Expiry
-- ---------------------------------------------------------------------------

reset role;

update core.profile_media_upload_intents
set
  created_at = now() - interval '10 minutes',
  expires_at = now() - interval '1 second'
where
  id = (
    select value
    from media_test_state
    where name = 'owner_a_expiring_intent'
  );

set local role service_role;

select is(
  api.resolve_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000001',
    (
      select value
      from media_test_state
      where name = 'owner_a_expiring_intent'
    )
  ) ->> 'status',
  'expired',
  'expired pending intent cannot continue'
);

reset role;

select is(
  (
    select intent.status::text
    from core.profile_media_upload_intents as intent
    where
      intent.id = (
        select value
        from media_test_state
        where name = 'owner_a_expiring_intent'
      )
  ),
  'expired',
  'resolver persists authoritative expired state'
);

-- ---------------------------------------------------------------------------
-- Fresh intent for canonical completion
-- ---------------------------------------------------------------------------

set local role service_role;

select is(
  api.create_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000001',
    'image/webp',
    400000
  ) ->> 'status',
  'success',
  'Owner A creates fresh completion intent'
);

reset role;

insert into media_test_state (
  name,
  value
)
select
  'owner_a_complete_intent',
  intent.id
from core.profile_media_upload_intents as intent
join core.owner_auth_bindings as binding
  on binding.owner_id = intent.owner_id
where
  binding.auth_user_id =
    '40000000-0000-4000-8000-000000000001'
  and intent.status =
    'pending'::core.profile_media_upload_status
order by intent.created_at desc
limit 1;

-- ---------------------------------------------------------------------------
-- Canonical metadata validation
-- ---------------------------------------------------------------------------

set local role service_role;

select is(
  api.complete_profile_media_upload_server(
    '40000000-0000-4000-8000-000000000001',
    (
      select value
      from media_test_state
      where name = 'owner_a_complete_intent'
    ),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
    'image/png',
    120000,
    512,
    512
  ) ->> 'status',
  'invalid_asset_metadata',
  'canonical stored media must be WebP'
);

select is(
  api.complete_profile_media_upload_server(
    '40000000-0000-4000-8000-000000000001',
    (
      select value
      from media_test_state
      where name = 'owner_a_complete_intent'
    ),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'working/profile/not-the-asset.webp',
    'image/webp',
    120000,
    512,
    512
  ) ->> 'status',
  'invalid_asset_metadata',
  'canonical object key must exactly derive from asset key'
);

select is(
  api.complete_profile_media_upload_server(
    '40000000-0000-4000-8000-000000000001',
    (
      select value
      from media_test_state
      where name = 'owner_a_complete_intent'
    ),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
    'image/webp',
    120000,
    2048,
    2049
  ) ->> 'status',
  'invalid_asset_metadata',
  'canonical dimensions cannot exceed 2048 boundary'
);

reset role;

select is(
  (
    select intent.status::text
    from core.profile_media_upload_intents as intent
    where
      intent.id = (
        select value
        from media_test_state
        where name = 'owner_a_complete_intent'
      )
  ),
  'pending',
  'invalid canonical metadata does not consume upload intent'
);

select is(
  (
    select count(*)
    from core.profile_media_assets as asset
  ),
  0::bigint,
  'invalid completion creates no canonical asset'
);

-- ---------------------------------------------------------------------------
-- Valid canonical completion
-- ---------------------------------------------------------------------------

set local role service_role;

select is(
  api.complete_profile_media_upload_server(
    '40000000-0000-4000-8000-000000000001',
    (
      select value
      from media_test_state
      where name = 'owner_a_complete_intent'
    ),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
    'image/webp',
    120000,
    1024,
    768
  ) ->> 'status',
  'success',
  'valid sanitized canonical media registration succeeds'
);

reset role;

select is(
  (
    select count(*)
    from core.profile_media_assets as asset
  ),
  1::bigint,
  'one completed intent creates exactly one canonical asset'
);

select is(
  (
    select asset.asset_key
    from core.profile_media_assets as asset
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'canonical opaque asset key is persisted'
);

select is(
  (
    select asset.object_key
    from core.profile_media_assets as asset
  ),
  'working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
  'canonical private object key is persisted'
);

select is(
  (
    select asset.stored_content_type
    from core.profile_media_assets as asset
  ),
  'image/webp',
  'canonical asset stores WebP MIME'
);

select is(
  (
    select asset.byte_size
    from core.profile_media_assets as asset
  ),
  120000::bigint,
  'canonical asset stores processed byte size'
);

select is(
  (
    select asset.width
    from core.profile_media_assets as asset
  ),
  1024,
  'canonical asset stores width'
);

select is(
  (
    select asset.height
    from core.profile_media_assets as asset
  ),
  768,
  'canonical asset stores height'
);

select is(
  (
    select intent.status::text
    from core.profile_media_upload_intents as intent
    where
      intent.id = (
        select value
        from media_test_state
        where name = 'owner_a_complete_intent'
      )
  ),
  'consumed',
  'successful canonical completion consumes upload intent'
);

select ok(
  (
    select intent.consumed_at is not null
    from core.profile_media_upload_intents as intent
    where
      intent.id = (
        select value
        from media_test_state
        where name = 'owner_a_complete_intent'
      )
  ),
  'consumed upload intent records completion timestamp'
);

select is(
  (
    select count(*)
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id = identity_record.owner_id
    where
      binding.auth_user_id =
        '40000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'finalized media remains unattached until Basic Identity save'
);

-- ---------------------------------------------------------------------------
-- Idempotent lost-response retry
-- ---------------------------------------------------------------------------

set local role service_role;

select is(
  api.complete_profile_media_upload_server(
    '40000000-0000-4000-8000-000000000001',
    (
      select value
      from media_test_state
      where name = 'owner_a_complete_intent'
    ),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'working/profile/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
    'image/webp',
    999999,
    2000,
    2000
  ) ->> 'status',
  'success',
  'consumed-intent retry returns prior success'
);

select is(
  api.complete_profile_media_upload_server(
    '40000000-0000-4000-8000-000000000001',
    (
      select value
      from media_test_state
      where name = 'owner_a_complete_intent'
    ),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'working/profile/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
    'image/webp',
    999999,
    2000,
    2000
  ) ->> 'idempotent',
  'true',
  'duplicate canonical completion explicitly reports idempotency'
);

select is(
  api.resolve_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000001',
    (
      select value
      from media_test_state
      where name = 'owner_a_complete_intent'
    )
  ) ->> 'asset_key',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'consumed intent always resolves original canonical asset'
);

reset role;

select is(
  (
    select count(*)
    from core.profile_media_assets as asset
  ),
  1::bigint,
  'duplicate completion creates no duplicate asset'
);

select is(
  (
    select asset.asset_key
    from core.profile_media_assets as asset
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'duplicate completion cannot overwrite immutable asset identity'
);

-- ---------------------------------------------------------------------------
-- Cross-Owner completion isolation
-- ---------------------------------------------------------------------------

set local role service_role;

select is(
  api.complete_profile_media_upload_server(
    '40000000-0000-4000-8000-000000000002',
    (
      select value
      from media_test_state
      where name = 'owner_a_complete_intent'
    ),
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'working/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp',
    'image/webp',
    80000,
    512,
    512
  ) ->> 'status',
  'intent_missing',
  'Owner B cannot complete Owner A upload intent'
);

-- ---------------------------------------------------------------------------
-- Immutable asset-key conflict
-- ---------------------------------------------------------------------------

select is(
  api.create_profile_media_upload_intent_server(
    '40000000-0000-4000-8000-000000000002',
    'image/jpeg',
    100000
  ) ->> 'status',
  'success',
  'Owner B can create its own upload intent'
);

reset role;

insert into media_test_state (
  name,
  value
)
select
  'owner_b_complete_intent',
  intent.id
from core.profile_media_upload_intents as intent
join core.owner_auth_bindings as binding
  on binding.owner_id = intent.owner_id
where
  binding.auth_user_id =
    '40000000-0000-4000-8000-000000000002'
  and intent.status =
    'pending'::core.profile_media_upload_status
order by intent.created_at desc
limit 1;

set local role service_role;

select is(
  api.complete_profile_media_upload_server(
    '40000000-0000-4000-8000-000000000002',
    (
      select value
      from media_test_state
      where name = 'owner_b_complete_intent'
    ),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
    'image/webp',
    90000,
    600,
    600
  ) ->> 'status',
  'asset_conflict',
  'existing immutable asset identity cannot be claimed again'
);

reset role;

select is(
  (
    select intent.status::text
    from core.profile_media_upload_intents as intent
    where
      intent.id = (
        select value
        from media_test_state
        where name = 'owner_b_complete_intent'
      )
  ),
  'pending',
  'asset conflict does not falsely consume Owner B intent'
);

select is(
  (
    select count(*)
    from core.profile_media_assets as asset
  ),
  1::bigint,
  'asset conflict creates no second canonical asset'
);

-- ---------------------------------------------------------------------------
-- Foundation must not publish or complete onboarding
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)
    from core.owners as owner_record
    join core.owner_auth_bindings as binding
      on binding.owner_id = owner_record.id
    where
      binding.auth_user_id in (
        '40000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000003'
      )
      and owner_record.onboarding_completed_at is not null
  ),
  0::bigint,
  'Profile Media foundation never completes onboarding'
);

select * from finish();

rollback;
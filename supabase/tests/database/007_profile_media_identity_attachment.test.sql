begin;

select no_plan();

-- ===========================================================================
-- Stage 6B.3B.2 — Profile Media attachment to Basic Identity Working
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Mutation surface
-- ---------------------------------------------------------------------------

select ok(
  to_regprocedure(
    'api.save_current_owner_basic_identity(text,text,text,bigint,bigint)'
  ) is not null,
  'media-aware five-argument Basic Identity mutation exists'
);

select ok(
  to_regprocedure(
    'api.save_current_owner_basic_identity(text,text,bigint,bigint)'
  ) is not null,
  'existing four-argument Basic Identity mutation remains available during transition'
);

select ok(
  (
    select procedure_record.prosecdef
    from pg_proc as procedure_record
    where
      procedure_record.oid =
        'api.save_current_owner_basic_identity(text,text,text,bigint,bigint)'::regprocedure
  ),
  'media-aware Basic Identity mutation is SECURITY DEFINER'
);

select ok(
  exists (
    select 1
    from pg_proc as procedure_record
    where
      procedure_record.oid =
        'api.save_current_owner_basic_identity(text,text,text,bigint,bigint)'::regprocedure
      and exists (
        select 1
        from unnest(
          coalesce(
            procedure_record.proconfig,
            array[]::text[]
          )
        ) as config(value)
        where
          config.value ~
            '^search_path=(""){0,1}$'
      )
  ),
  'media-aware Basic Identity mutation uses empty fixed search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.save_current_owner_basic_identity(text,text,text,bigint,bigint)',
    'EXECUTE'
  ),
  'authenticated Owner may invoke media-aware Basic Identity mutation'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.save_current_owner_basic_identity(text,text,text,bigint,bigint)',
    'EXECUTE'
  ),
  'anon cannot invoke media-aware Basic Identity mutation'
);

-- ---------------------------------------------------------------------------
-- Canonical Owner fixtures
-- ---------------------------------------------------------------------------

reset role;

insert into auth.users (
  id,
  email
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    'media-attach-a@example.test'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    'media-attach-b@example.test'
  ),
  (
    '50000000-0000-4000-8000-000000000003',
    'media-attach-no-media@example.test'
  );

-- Owner A -> S3.

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000001"}';

select is(
  api.claim_current_owner_handle(
    'media-attach-a',
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
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000002"}';

select is(
  api.claim_current_owner_handle(
    'media-attach-b',
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

-- Owner C -> S3.

set local request.jwt.claims =
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000003"}';

select is(
  api.claim_current_owner_handle(
    'media-attach-no-media',
    1
  ) ->> 'status',
  'success',
  'Owner C completes S1'
);

select is(
  api.set_current_owner_primary_use_case(
    'personal',
    2
  ) ->> 'status',
  'success',
  'Owner C completes S2 and reaches S3'
);

-- ---------------------------------------------------------------------------
-- Canonical immutable media fixtures
--
-- These rows represent already-finalized sanitized R2 assets.
-- Storage processing itself belongs to later 6B.3C/6B.3D application tests.
-- ---------------------------------------------------------------------------

reset role;

insert into core.profile_media_upload_intents (
  id,
  owner_id,
  expected_content_type,
  declared_byte_size,
  staging_object_key,
  status,
  expires_at,
  created_at,
  consumed_at
)
select
  '51000000-0000-4000-8000-000000000001',
  binding.owner_id,
  'image/jpeg',
  300000,
  'staging/profile/51000000-0000-4000-8000-000000000001/61000000-0000-4000-8000-000000000001',
  'consumed'::core.profile_media_upload_status,
  now() + interval '4 minutes',
  now() - interval '1 minute',
  now()
from core.owner_auth_bindings as binding
where
  binding.auth_user_id =
    '50000000-0000-4000-8000-000000000001';

insert into core.profile_media_upload_intents (
  id,
  owner_id,
  expected_content_type,
  declared_byte_size,
  staging_object_key,
  status,
  expires_at,
  created_at,
  consumed_at
)
select
  '51000000-0000-4000-8000-000000000002',
  binding.owner_id,
  'image/png',
  350000,
  'staging/profile/51000000-0000-4000-8000-000000000002/61000000-0000-4000-8000-000000000002',
  'consumed'::core.profile_media_upload_status,
  now() + interval '4 minutes',
  now() - interval '1 minute',
  now()
from core.owner_auth_bindings as binding
where
  binding.auth_user_id =
    '50000000-0000-4000-8000-000000000001';

insert into core.profile_media_upload_intents (
  id,
  owner_id,
  expected_content_type,
  declared_byte_size,
  staging_object_key,
  status,
  expires_at,
  created_at,
  consumed_at
)
select
  '52000000-0000-4000-8000-000000000001',
  binding.owner_id,
  'image/webp',
  200000,
  'staging/profile/52000000-0000-4000-8000-000000000001/62000000-0000-4000-8000-000000000001',
  'consumed'::core.profile_media_upload_status,
  now() + interval '4 minutes',
  now() - interval '1 minute',
  now()
from core.owner_auth_bindings as binding
where
  binding.auth_user_id =
    '50000000-0000-4000-8000-000000000002';

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
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  binding.owner_id,
  'working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.webp',
  'image/webp',
  110000,
  1024,
  1024,
  '51000000-0000-4000-8000-000000000001'
from core.owner_auth_bindings as binding
where
  binding.auth_user_id =
    '50000000-0000-4000-8000-000000000001';

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
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  binding.owner_id,
  'working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.webp',
  'image/webp',
  125000,
  1200,
  900,
  '51000000-0000-4000-8000-000000000002'
from core.owner_auth_bindings as binding
where
  binding.auth_user_id =
    '50000000-0000-4000-8000-000000000001';

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
select
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  binding.owner_id,
  'working/profile/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1.webp',
  'image/webp',
  90000,
  800,
  800,
  '52000000-0000-4000-8000-000000000001'
from core.owner_auth_bindings as binding
where
  binding.auth_user_id =
    '50000000-0000-4000-8000-000000000002';

select is(
  (
    select count(*)
    from core.profile_media_assets
  ),
  3::bigint,
  'fixture contains three immutable canonical media assets'
);

-- ---------------------------------------------------------------------------
-- Owner A first S3 save may attach its own finalized media
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    'Media Owner A',
    'Initial identity with media.',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    null,
    3
  ) ->> 'status',
  'success',
  'first S3 save succeeds with valid Owner-owned canonical media'
);

reset role;

select is(
  (
    select identity_record.display_name
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  'Media Owner A',
  'first media-aware save creates Basic Identity Working'
);

select is(
  (
    select identity_record.profile_asset_key
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'first S3 save attaches selected canonical media asset'
);

select is(
  (
    select identity_record.revision
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'first media-aware Identity Working save starts at revision 1'
);

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  'starter_composition',
  'first successful media-aware S3 save advances frontier to S4'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'first S3 save increments progress revision exactly once'
);

-- ---------------------------------------------------------------------------
-- Transitional four-argument mutation preserves existing selected media
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    'Media Owner A',
    'Bio edited through current four-argument app flow.',
    1,
    4
  ) ->> 'status',
  'success',
  'existing four-argument S3 mutation remains usable after media attachment'
);

reset role;

select is(
  (
    select identity_record.profile_asset_key
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'four-argument Basic Identity edit preserves acknowledged media selection'
);

select is(
  (
    select identity_record.revision
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'four-argument content edit increments Identity revision without dropping media'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'editing S3 after frontier advancement does not increment progress revision'
);

-- ---------------------------------------------------------------------------
-- Exact same media-aware Working state is idempotent
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    'Media Owner A',
    'Bio edited through current four-argument app flow.',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    2,
    999
  ) ->> 'status',
  'success',
  'same media-aware Working state is accepted idempotently after frontier passed S3'
);

reset role;

select is(
  (
    select identity_record.revision
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'idempotent media-aware save creates no phantom Identity revision'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'base progress revision is irrelevant once authoritative frontier is beyond S3'
);

-- ---------------------------------------------------------------------------
-- Replacement creates a new Identity Working revision
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    'Media Owner A',
    'Bio edited through current four-argument app flow.',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    2,
    4
  ) ->> 'status',
  'success',
  'Owner may replace selected media with another canonical asset it owns'
);

reset role;

select is(
  (
    select identity_record.profile_asset_key
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  'replacement acknowledges new media asset in Identity Working'
);

select is(
  (
    select identity_record.revision
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'media replacement increments Identity Working revision'
);

select is(
  (
    select count(*)
    from core.profile_media_assets as asset
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        asset.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'replacing Working media does not delete prior immutable Owner asset'
);

-- ---------------------------------------------------------------------------
-- Stale tab cannot overwrite newer media selection
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    'Stale overwrite attempt',
    'This request must not win.',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    2,
    4
  ) ->> 'status',
  'stale_write',
  'stale Identity revision cannot replace newer media Working state'
);

reset role;

select is(
  (
    select identity_record.profile_asset_key
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  'stale mutation leaves latest acknowledged media selection unchanged'
);

select is(
  (
    select identity_record.display_name
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  'Media Owner A',
  'stale media mutation cannot overwrite other Basic Identity fields'
);

select is(
  (
    select identity_record.revision
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'stale media mutation creates no new Identity revision'
);

-- ---------------------------------------------------------------------------
-- Explicit media removal stores NULL but retains immutable asset rows
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    'Media Owner A',
    'Bio edited through current four-argument app flow.',
    null,
    3,
    4
  ) ->> 'status',
  'success',
  'Owner may explicitly remove Profile Media from Working'
);

reset role;

select is(
  (
    select identity_record.profile_asset_key
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  null::text,
  'Profile Media removal stores NULL in Identity Working'
);

select is(
  (
    select identity_record.revision
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'removing media increments Identity Working revision'
);

select is(
  (
    select count(*)
    from core.profile_media_assets as asset
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        asset.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'removing Working media does not garbage-collect immutable asset history'
);

-- Empty/whitespace selection is the same canonical no-media state.

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    'Media Owner A',
    'Bio edited through current four-argument app flow.',
    '   ',
    4,
    4
  ) ->> 'status',
  'success',
  'empty Profile Media input normalizes to explicit no-media state'
);

reset role;

select is(
  (
    select identity_record.revision
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'repeated no-media state is idempotent'
);

-- ---------------------------------------------------------------------------
-- Foreign and nonexistent assets fail indistinguishably
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000002"}';

select is(
  api.save_current_owner_basic_identity(
    'Owner B',
    null,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    null,
    3
  ) ->> 'status',
  'invalid_profile_asset',
  'Owner B cannot attach Owner A canonical media asset'
);

select is(
  api.save_current_owner_basic_identity(
    'Owner B',
    null,
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    null,
    3
  ) ->> 'status',
  'invalid_profile_asset',
  'nonexistent media asset returns same fail-closed status as foreign asset'
);

select is(
  api.save_current_owner_basic_identity(
    'Owner B',
    null,
    'not-an-asset-key',
    null,
    3
  ) ->> 'status',
  'invalid_profile_asset',
  'malformed media asset identity is rejected'
);

reset role;

select is(
  (
    select count(*)
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'invalid foreign/nonexistent media attempts do not create Identity Working'
);

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000002'
  ),
  'basic_identity',
  'invalid media attempts do not advance onboarding frontier'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000002'
  ),
  3::bigint,
  'invalid media attempts do not change onboarding progress revision'
);

-- Owner B can attach its own canonical asset afterward.

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000002"}';

select is(
  api.save_current_owner_basic_identity(
    'Owner B',
    'Own media works.',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    null,
    3
  ) ->> 'status',
  'success',
  'Owner B may attach its own canonical media asset'
);

reset role;

select is(
  (
    select identity_record.profile_asset_key
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000002'
  ),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  'Owner B Working references only its own canonical asset'
);

select is(
  (
    select identity_record.revision
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'Owner B valid first media-aware save creates revision 1'
);

-- ---------------------------------------------------------------------------
-- Profile Media remains optional
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"50000000-0000-4000-8000-000000000003"}';

select is(
  api.save_current_owner_basic_identity(
    'No Media Owner',
    'Profile Media is optional.',
    '   ',
    null,
    3
  ) ->> 'status',
  'success',
  'valid S3 save succeeds without Profile Media'
);

reset role;

select is(
  (
    select identity_record.profile_asset_key
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000003'
  ),
  null::text,
  'optional Profile Media remains NULL when omitted'
);

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000003'
  ),
  'starter_composition',
  'absence of Profile Media does not block S3 -> S4 advancement'
);

-- ---------------------------------------------------------------------------
-- Media changes do not mutate Handle / Use Case / onboarding completion
-- ---------------------------------------------------------------------------

select is(
  (
    select namespace_record.normalized_handle
    from core.owner_handle_namespaces as namespace_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        namespace_record.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
      and namespace_record.namespace_kind =
        'current'::core.handle_namespace_kind
  ),
  'media-attach-a',
  'Profile Media mutations do not mutate current Handle'
);

select is(
  (
    select progress.primary_use_case::text
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '50000000-0000-4000-8000-000000000001'
  ),
  'creator',
  'Profile Media mutations do not mutate Primary Use Case'
);

select is(
  (
    select count(*)
    from core.owners as owner_record
    join core.owner_auth_bindings as binding
      on binding.owner_id =
        owner_record.id
    where
      binding.auth_user_id in (
        '50000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000002',
        '50000000-0000-4000-8000-000000000003'
      )
      and owner_record.onboarding_completed_at
        is not null
  ),
  0::bigint,
  'Profile Media attachment/removal does not complete onboarding or publish Identity'
);

select is(
  (
    select count(*)
    from core.profile_media_assets
  ),
  3::bigint,
  'all immutable canonical media assets still exist after Working replacement/removal'
);

select * from finish();

rollback;
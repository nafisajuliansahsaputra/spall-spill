begin;

select no_plan();

-- ===========================================================================
-- Stage 6B.1 — O01-S3 Basic Identity Working
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Canonical private relation
-- ---------------------------------------------------------------------------

select has_table(
  'core',
  'identity_working',
  'canonical private Identity Working table exists'
);

select has_column(
  'core',
  'identity_working',
  'owner_id',
  'Identity Working is scoped by canonical Owner'
);

select has_column(
  'core',
  'identity_working',
  'display_name',
  'Identity Working stores required Display Name'
);

select has_column(
  'core',
  'identity_working',
  'bio',
  'Identity Working stores optional Bio'
);

select has_column(
  'core',
  'identity_working',
  'profile_asset_key',
  'Identity Working reserves optional platform asset key'
);

select has_column(
  'core',
  'identity_working',
  'revision',
  'Identity Working stores independent monotonic revision'
);

select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    where
      constraint_record.conrelid =
        'core.identity_working'::regclass
      and constraint_record.contype = 'p'
      and pg_get_constraintdef(
        constraint_record.oid
      ) = 'PRIMARY KEY (owner_id)'
  ),
  'one current Identity Working record exists at most once per Owner'
);

select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    where
      constraint_record.conname =
        'identity_working_owner_fk'
      and constraint_record.conrelid =
        'core.identity_working'::regclass
      and constraint_record.confrelid =
        'core.owners'::regclass
      and constraint_record.contype = 'f'
  ),
  'Identity Working references stable canonical Owner identity'
);

select ok(
  (
    select is_nullable = 'NO'
    from information_schema.columns
    where
      table_schema = 'core'
      and table_name =
        'identity_working'
      and column_name =
        'display_name'
  ),
  'Display Name is required in persisted Identity Working'
);

select ok(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where
      table_schema = 'core'
      and table_name =
        'identity_working'
      and column_name = 'bio'
  ),
  'Bio remains optional'
);

select ok(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where
      table_schema = 'core'
      and table_name =
        'identity_working'
      and column_name =
        'profile_asset_key'
  ),
  'Profile asset remains optional'
);

select ok(
  (
    select column_default = '1'
    from information_schema.columns
    where
      table_schema = 'core'
      and table_name =
        'identity_working'
      and column_name = 'revision'
  ),
  'first authoritative Identity Working revision defaults to 1'
);

-- ---------------------------------------------------------------------------
-- Private / deny-by-default security
-- ---------------------------------------------------------------------------

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'core.identity_working'::regclass
  ),
  'RLS is enabled on private Identity Working'
);

select ok(
  not has_table_privilege(
    'anon',
    'core.identity_working',
    'SELECT'
  ),
  'anon cannot directly read Identity Working'
);

select ok(
  not has_table_privilege(
    'anon',
    'core.identity_working',
    'INSERT'
  ),
  'anon cannot directly create Identity Working'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.identity_working',
    'SELECT'
  ),
  'authenticated cannot directly read private Identity Working'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.identity_working',
    'INSERT'
  ),
  'authenticated cannot directly create private Identity Working'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.identity_working',
    'UPDATE'
  ),
  'authenticated cannot directly overwrite private Identity Working'
);

-- ---------------------------------------------------------------------------
-- Narrow API boundaries
-- ---------------------------------------------------------------------------

select ok(
  to_regprocedure(
    'api.resolve_current_basic_identity_state()'
  ) is not null,
  'current-Owner Basic Identity resolver exists'
);

select ok(
  to_regprocedure(
    'api.save_current_owner_basic_identity(text,text,bigint,bigint)'
  ) is not null,
  'Basic Identity mutation exists without target Owner argument'
);

select ok(
  (
    select procedure_record.prosecdef
    from pg_proc as procedure_record
    join pg_namespace as namespace_record
      on namespace_record.oid =
        procedure_record.pronamespace
    where
      namespace_record.nspname = 'api'
      and procedure_record.proname =
        'resolve_current_basic_identity_state'
      and procedure_record.pronargs = 0
  ),
  'Basic Identity resolver is SECURITY DEFINER'
);

select ok(
  (
    select procedure_record.prosecdef
    from pg_proc as procedure_record
    join pg_namespace as namespace_record
      on namespace_record.oid =
        procedure_record.pronamespace
    where
      namespace_record.nspname = 'api'
      and procedure_record.proname =
        'save_current_owner_basic_identity'
      and procedure_record.pronargs = 4
  ),
  'Basic Identity mutation is SECURITY DEFINER'
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
      and (
        (
          procedure_record.proname =
            'resolve_current_basic_identity_state'
          and procedure_record.pronargs = 0
        )
        or
        (
          procedure_record.proname =
            'save_current_owner_basic_identity'
          and procedure_record.pronargs = 4
        )
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
          config.value ~
            '^search_path=(""){0,1}$'
      )
  ),
  2::bigint,
  'all S3 RPCs use an empty fixed search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.resolve_current_basic_identity_state()',
    'EXECUTE'
  ),
  'authenticated may resolve current Basic Identity state'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.save_current_owner_basic_identity(text,text,bigint,bigint)',
    'EXECUTE'
  ),
  'authenticated may invoke Basic Identity save boundary'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.resolve_current_basic_identity_state()',
    'EXECUTE'
  ),
  'anon cannot invoke Basic Identity resolver'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.save_current_owner_basic_identity(text,text,bigint,bigint)',
    'EXECUTE'
  ),
  'anon cannot invoke Basic Identity mutation'
);

-- ---------------------------------------------------------------------------
-- Unauthenticated behavior
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{}';

select is(
  api.resolve_current_basic_identity_state()
    ->> 'status',
  'unauthenticated',
  'Basic Identity resolver fails closed without authenticated principal'
);

select is(
  api.save_current_owner_basic_identity(
    'Anonymous',
    null,
    null,
    1
  ) ->> 'status',
  'unauthenticated',
  'unauthenticated principal cannot create Identity Working'
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
    '30000000-0000-4000-8000-000000000001',
    'identity-owner-a@example.test'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'identity-owner-b@example.test'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'identity-owner-c@example.test'
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    'identity-owner-complete@example.test'
  );

select is(
  (
    select count(*)
    from core.identity_working
  ),
  0::bigint,
  'creating/auth-provisioning Owners alone does not create Identity Working'
);

-- ---------------------------------------------------------------------------
-- Reading/entering S3 does not create canonical Working
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001"}';

select is(
  api.resolve_current_basic_identity_state()
    ->> 'status',
  'success',
  'authenticated incomplete Owner may resolve Basic Identity state'
);

select is(
  api.resolve_current_basic_identity_state()
    ->> 'identity_working',
  null,
  'Basic Identity resolver returns no Working before creation threshold'
);

reset role;

select is(
  (
    select count(*)
    from core.identity_working
  ),
  0::bigint,
  'reading Basic Identity does not create an empty-shell Working record'
);

-- ---------------------------------------------------------------------------
-- S3 cannot bypass S1/S2
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000003"}';

select is(
  api.save_current_owner_basic_identity(
    'Too Early',
    null,
    null,
    1
  ) ->> 'status',
  'step_not_available',
  'Basic Identity cannot bypass S1 Claim Handle'
);

select is(
  api.claim_current_owner_handle(
    'identity-owner-c',
    1
  ) ->> 'status',
  'success',
  'fixture Owner C can complete S1'
);

select is(
  api.save_current_owner_basic_identity(
    'Still Too Early',
    null,
    null,
    2
  ) ->> 'status',
  'step_not_available',
  'Basic Identity cannot bypass S2 Primary Use Case'
);

reset role;

select is(
  (
    select count(*)
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'rejected early S3 attempts create no Working state'
);

-- ---------------------------------------------------------------------------
-- Advance Owner A to canonical S3 through real S1/S2 boundaries
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001"}';

select is(
  api.claim_current_owner_handle(
    'identity-owner-a',
    1
  ) ->> 'status',
  'success',
  'Owner A completes S1 through canonical Handle boundary'
);

select is(
  api.set_current_owner_primary_use_case(
    'creator',
    2
  ) ->> 'status',
  'success',
  'Owner A completes S2 through canonical Primary Use Case boundary'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_step',
  'basic_identity',
  'Owner A authoritative progress frontier reaches S3'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  3::bigint,
  'Owner A reaches S3 with authoritative progress revision 3'
);

select is(
  api.resolve_current_basic_identity_state()
    ->> 'identity_working',
  null,
  'reaching S3 still does not create Identity Working until successful save'
);

-- ---------------------------------------------------------------------------
-- Progress stale is distinct and creates no Working
-- ---------------------------------------------------------------------------

select is(
  api.save_current_owner_basic_identity(
    'Valid Name',
    null,
    null,
    2
  ) ->> 'status',
  'progress_stale',
  'first S3 save rejects stale onboarding progress revision'
);

reset role;

select is(
  (
    select count(*)
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'progress-stale first save creates no canonical Identity Working'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress
      as progress
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'progress-stale save leaves onboarding revision unchanged'
);

-- ---------------------------------------------------------------------------
-- Invalid Display Name remains local and durable state is untouched
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    '      ',
    null,
    null,
    3
  ) ->> 'status',
  'invalid_display_name',
  'whitespace-only Display Name is rejected'
);

select is(
  api.save_current_owner_basic_identity(
    repeat('a', 81),
    null,
    null,
    3
  ) ->> 'status',
  'invalid_display_name',
  'Display Name over 80 characters is rejected'
);

select is(
  api.save_current_owner_basic_identity(
    E'Line\nBreak',
    null,
    null,
    3
  ) ->> 'status',
  'invalid_display_name',
  'Display Name rejects control/newline characters'
);

reset role;

select is(
  (
    select count(*)
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'invalid Display Name attempts create no canonical Working'
);

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress
      as progress
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  'basic_identity',
  'invalid Display Name does not advance S3 frontier'
);

-- ---------------------------------------------------------------------------
-- Invalid Bio must not create Working or advance progress
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    'Valid Name',
    repeat('b', 301),
    null,
    3
  ) ->> 'status',
  'invalid_bio',
  'Bio over 300 characters is rejected'
);

select is(
  api.save_current_owner_basic_identity(
    'Valid Name',
    'valid' || chr(1) || 'invalid',
    null,
    3
  ) ->> 'status',
  'invalid_bio',
  'Bio rejects unsupported control characters'
);

reset role;

select is(
  (
    select count(*)
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'invalid Bio attempts do not cross Identity Working creation threshold'
);

-- ---------------------------------------------------------------------------
-- First valid authoritative S3 save
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    '  Natsx 世界  ',
    E'  First line\r\nSecond line  ',
    null,
    3
  ) ->> 'status',
  'success',
  'first valid Basic Identity save succeeds'
);

reset role;

select is(
  (
    select identity_record.display_name
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  'Natsx 世界',
  'Display Name supports Unicode and trims boundary whitespace'
);

select is(
  (
    select identity_record.bio
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  E'First line\nSecond line',
  'Bio normalizes CRLF and preserves valid line breaks'
);

select is(
  (
    select identity_record.profile_asset_key
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  null,
  'optional profile asset remains NULL without storage integration'
);

select is(
  (
    select identity_record.revision
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'first acknowledged Identity Working begins at revision 1'
);

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress
      as progress
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  'starter_composition',
  'first valid S3 save advances authoritative frontier to S4'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress
      as progress
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'first valid S3 save increments onboarding progress revision exactly once'
);

select is(
  (
    select namespace_record.normalized_handle
    from core.owner_handle_namespaces
      as namespace_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        namespace_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
      and namespace_record.namespace_kind =
        'current'::core.handle_namespace_kind
  ),
  'identity-owner-a',
  'Display Name save does not mutate distinct Handle identity'
);

select is(
  (
    select owner_record.onboarding_completed_at
    from core.owners as owner_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        owner_record.id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  null,
  'successful S3 save does not complete onboarding'
);

-- ---------------------------------------------------------------------------
-- Read boundary returns acknowledged Working
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001"}';

select is(
  api.resolve_current_basic_identity_state()
    ->> 'status',
  'success',
  'Basic Identity resolver remains available after first Working save'
);

select is(
  api.resolve_current_basic_identity_state()
    -> 'identity_working'
    ->> 'display_name',
  'Natsx 世界',
  'resolver returns acknowledged Display Name Working state'
);

select is(
  api.resolve_current_basic_identity_state()
    -> 'identity_working'
    ->> 'bio',
  E'First line\nSecond line',
  'resolver returns acknowledged Bio Working state'
);

select is(
  (
    api.resolve_current_basic_identity_state()
      -> 'identity_working'
      ->> 'revision'
  )::bigint,
  1::bigint,
  'resolver exposes authoritative Identity Working revision'
);

-- ---------------------------------------------------------------------------
-- Existing Identity requires its acknowledged revision
-- ---------------------------------------------------------------------------

select is(
  api.save_current_owner_basic_identity(
    'Should Not Win',
    null,
    null,
    999
  ) ->> 'status',
  'stale_write',
  'existing Working rejects a NULL creation precondition'
);

select is(
  api.save_current_owner_basic_identity(
    'Should Not Win',
    null,
    0,
    999
  ) ->> 'status',
  'stale_write',
  'revision 0 is not treated as a fake persisted Working revision'
);

reset role;

select is(
  (
    select identity_record.display_name
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  'Natsx 世界',
  'stale Identity attempts cannot overwrite acknowledged Working'
);

select is(
  (
    select identity_record.revision
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'stale Identity attempts do not advance Identity revision'
);

-- ---------------------------------------------------------------------------
-- Later S3 edit updates only Identity Working, not progress frontier
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    'Updated Name',
    'Updated bio',
    1,
    999999
  ) ->> 'status',
  'success',
  'later Basic Identity edit succeeds from acknowledged Identity revision'
);

reset role;

select is(
  (
    select identity_record.display_name
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  'Updated Name',
  'later S3 edit updates Display Name Working state'
);

select is(
  (
    select identity_record.bio
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  'Updated bio',
  'later S3 edit updates Bio Working state'
);

select is(
  (
    select identity_record.revision
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'later S3 edit increments only Identity Working revision'
);

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress
      as progress
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  'starter_composition',
  'editing earlier S3 does not regress authoritative progress frontier'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress
      as progress
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'later S3 edit does not create unrelated onboarding progress revision'
);

-- ---------------------------------------------------------------------------
-- Same acknowledged Identity payload is idempotent
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    'Updated Name',
    'Updated bio',
    2,
    1
  ) ->> 'status',
  'success',
  'reconfirming unchanged acknowledged Basic Identity is idempotent'
);

reset role;

select is(
  (
    select identity_record.revision
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'idempotent same-state save creates no phantom Identity revision'
);

-- ---------------------------------------------------------------------------
-- Older Identity revision cannot overwrite newer Working
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_basic_identity(
    'Old Tab',
    'Old data',
    1,
    4
  ) ->> 'status',
  'stale_write',
  'older tab/session Identity revision is rejected'
);

reset role;

select is(
  (
    select identity_record.display_name
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  'Updated Name',
  'stale later edit leaves newest acknowledged Identity untouched'
);

-- ---------------------------------------------------------------------------
-- Owner B proves optional empty Bio normalization + Owner isolation
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000002"}';

select is(
  api.claim_current_owner_handle(
    'identity-owner-b',
    1
  ) ->> 'status',
  'success',
  'Owner B completes S1 independently'
);

select is(
  api.set_current_owner_primary_use_case(
    'business',
    2
  ) ->> 'status',
  'success',
  'Owner B completes S2 independently'
);

select is(
  api.save_current_owner_basic_identity(
    'Business Owner',
    '     ',
    null,
    3
  ) ->> 'status',
  'success',
  'Owner B creates independent Basic Identity with optional empty Bio'
);

reset role;

select is(
  (
    select identity_record.bio
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000002'
  ),
  null,
  'empty normalized Bio persists canonically as NULL'
);

select is(
  (
    select identity_record.revision
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'Owner B has its own independent Identity Working revision'
);

select is(
  (
    select identity_record.display_name
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000001'
  ),
  'Updated Name',
  'Owner B mutation cannot alter Owner A Identity Working'
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
      and procedure_record.proname =
        'save_current_owner_basic_identity'
      and procedure_record.pronargs = 4
      and not exists (
        select 1
        from unnest(
          procedure_record.proargnames
        ) as argument_name
        where
          argument_name in (
            'owner_id',
            'input_owner_id',
            'target_owner_id'
          )
      )
  ),
  1::bigint,
  'Basic Identity mutation exposes no client-selectable Owner target'
);

-- ---------------------------------------------------------------------------
-- Completed Owner cannot replay S3
-- ---------------------------------------------------------------------------

reset role;

update core.owners
  as owner_record
set
  onboarding_completed_at = now(),
  updated_at = now()
from core.owner_auth_bindings
  as binding
where
  binding.owner_id =
    owner_record.id
  and binding.auth_user_id =
    '30000000-0000-4000-8000-000000000004';

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000004"}';

select is(
  api.resolve_current_basic_identity_state()
    ->> 'status',
  'onboarding_complete',
  'completed active Owner does not replay normal S3 resolver state'
);

select is(
  api.save_current_owner_basic_identity(
    'Should Not Exist',
    null,
    null,
    1
  ) ->> 'status',
  'owner_not_eligible',
  'completed Owner cannot create onboarding Identity Working through S3'
);

reset role;

select is(
  (
    select count(*)
    from core.identity_working
      as identity_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        identity_record.owner_id
    where
      binding.auth_user_id =
        '30000000-0000-4000-8000-000000000004'
  ),
  0::bigint,
  'rejected completed-Owner S3 mutation creates no Working record'
);

-- ---------------------------------------------------------------------------
-- Missing Owner binding fails closed
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000099"}';

select is(
  api.resolve_current_basic_identity_state()
    ->> 'status',
  'owner_missing',
  'Basic Identity resolver fails closed for principal without Owner binding'
);

select is(
  api.save_current_owner_basic_identity(
    'Missing Owner',
    null,
    null,
    1
  ) ->> 'status',
  'owner_missing',
  'Basic Identity mutation fails closed without canonical Owner binding'
);

-- ---------------------------------------------------------------------------
-- S3 never completes onboarding
-- ---------------------------------------------------------------------------

reset role;

select is(
  (
    select count(*)
    from core.owners as owner_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        owner_record.id
    where
      binding.auth_user_id in (
        '30000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000002',
        '30000000-0000-4000-8000-000000000003'
      )
      and owner_record.onboarding_completed_at
        is not null
  ),
  0::bigint,
  'all normal S1-S3 fixtures remain onboarding-incomplete'
);

select * from finish();

rollback;
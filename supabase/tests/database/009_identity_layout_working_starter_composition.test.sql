begin;

select no_plan();

-- ===========================================================================
-- Stage 6B.4 — O01-S4 Starter Composition Working
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Canonical relation / type
-- ---------------------------------------------------------------------------

select has_table(
  'core',
  'identity_layout_working',
  'canonical private Identity Layout Working table exists'
);

select has_column(
  'core',
  'identity_layout_working',
  'owner_id',
  'Layout Working is scoped by canonical Owner'
);

select has_column(
  'core',
  'identity_layout_working',
  'starter_key',
  'Layout Working stores curated Starter Composition key'
);

select has_column(
  'core',
  'identity_layout_working',
  'revision',
  'Layout Working stores independent monotonic revision'
);

select is(
  (
    select
      array_agg(
        enum_record.enumlabel::text
        order by
          enum_record.enumsortorder
      )::text
    from pg_enum
      as enum_record
    inner join pg_type
      as type_record
      on type_record.oid =
        enum_record.enumtypid
    inner join pg_namespace
      as namespace_record
      on namespace_record.oid =
        type_record.typnamespace
    where
      namespace_record.nspname =
        'core'
      and type_record.typname =
        'identity_starter_key'
  ),
  '{clean,social_focus,featured,business}',
  'Starter enum contains exactly the four locked MVP Starter keys'
);

select ok(
  exists (
    select 1
    from pg_constraint
      as constraint_record
    where
      constraint_record.conrelid =
        'core.identity_layout_working'::regclass
      and constraint_record.contype = 'p'
      and pg_get_constraintdef(
        constraint_record.oid
      ) = 'PRIMARY KEY (owner_id)'
  ),
  'one current Layout Working record exists at most once per Owner'
);

select ok(
  exists (
    select 1
    from pg_constraint
      as constraint_record
    where
      constraint_record.conname =
        'identity_layout_working_owner_fk'
      and constraint_record.conrelid =
        'core.identity_layout_working'::regclass
      and constraint_record.confrelid =
        'core.owners'::regclass
      and constraint_record.contype = 'f'
  ),
  'Layout Working references stable canonical Owner identity'
);

select ok(
  (
    select column_default = '1'
    from information_schema.columns
    where
      table_schema = 'core'
      and table_name =
        'identity_layout_working'
      and column_name = 'revision'
  ),
  'first authoritative Layout Working revision defaults to 1'
);

-- ---------------------------------------------------------------------------
-- Private / deny-by-default security
-- ---------------------------------------------------------------------------

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'core.identity_layout_working'::regclass
  ),
  'RLS is enabled on private Layout Working'
);

select ok(
  not has_table_privilege(
    'anon',
    'core.identity_layout_working',
    'SELECT'
  ),
  'anon cannot directly read Layout Working'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.identity_layout_working',
    'SELECT'
  ),
  'authenticated cannot directly read private Layout Working'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.identity_layout_working',
    'INSERT'
  ),
  'authenticated cannot directly create private Layout Working'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.identity_layout_working',
    'UPDATE'
  ),
  'authenticated cannot directly overwrite private Layout Working'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.identity_layout_working',
    'DELETE'
  ),
  'authenticated cannot directly delete private Layout Working'
);

-- ---------------------------------------------------------------------------
-- Narrow API boundaries
-- ---------------------------------------------------------------------------

select ok(
  to_regprocedure(
    'api.resolve_current_starter_composition_state()'
  ) is not null,
  'current-Owner Starter Composition resolver exists'
);

select ok(
  to_regprocedure(
    'api.save_current_owner_starter_composition(text,bigint,bigint)'
  ) is not null,
  'Starter Composition mutation exists without target Owner argument'
);

select ok(
  (
    select procedure_record.prosecdef
    from pg_proc
      as procedure_record
    where
      procedure_record.oid =
        'api.resolve_current_starter_composition_state()'::regprocedure
  ),
  'Starter Composition resolver is SECURITY DEFINER'
);

select ok(
  (
    select procedure_record.prosecdef
    from pg_proc
      as procedure_record
    where
      procedure_record.oid =
        'api.save_current_owner_starter_composition(text,bigint,bigint)'::regprocedure
  ),
  'Starter Composition mutation is SECURITY DEFINER'
);

select ok(
  exists (
    select 1
    from pg_proc
      as procedure_record
    where
      procedure_record.oid =
        'api.resolve_current_starter_composition_state()'::regprocedure
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
  'Starter resolver uses empty fixed search_path'
);

select ok(
  exists (
    select 1
    from pg_proc
      as procedure_record
    where
      procedure_record.oid =
        'api.save_current_owner_starter_composition(text,bigint,bigint)'::regprocedure
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
  'Starter mutation uses empty fixed search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.resolve_current_starter_composition_state()',
    'EXECUTE'
  ),
  'authenticated Owner may invoke Starter resolver'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.resolve_current_starter_composition_state()',
    'EXECUTE'
  ),
  'anon cannot invoke Starter resolver'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.save_current_owner_starter_composition(text,bigint,bigint)',
    'EXECUTE'
  ),
  'authenticated Owner may invoke Starter mutation'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.save_current_owner_starter_composition(text,bigint,bigint)',
    'EXECUTE'
  ),
  'anon cannot invoke Starter mutation'
);

select is(
  (
    select count(*)
    from pg_proc
      as procedure_record
    join pg_namespace
      as namespace_record
      on namespace_record.oid =
        procedure_record.pronamespace
    where
      namespace_record.nspname = 'api'
      and procedure_record.proname =
        'save_current_owner_starter_composition'
      and procedure_record.pronargs = 3
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
  'Starter mutation exposes no client-selectable Owner target'
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
    '60000000-0000-4000-8000-000000000001',
    'layout-owner-a@example.test'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    'layout-owner-b@example.test'
  ),
  (
    '60000000-0000-4000-8000-000000000003',
    'layout-owner-c@example.test'
  ),
  (
    '60000000-0000-4000-8000-000000000004',
    'layout-owner-d@example.test'
  );

-- Owner A reaches S4.

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000001"}';

select is(
  api.claim_current_owner_handle(
    'layout-owner-a',
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
  'Owner A completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'Layout Owner A',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Owner A completes S3 and reaches S4'
);

-- Owner B reaches S4 independently.

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000002"}';

select is(
  api.claim_current_owner_handle(
    'layout-owner-b',
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
  'Owner B completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'Layout Owner B',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Owner B completes S3 and reaches S4'
);

-- Owner C stops at S3 and must not bypass into S4.

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000003"}';

select is(
  api.claim_current_owner_handle(
    'layout-owner-c',
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
  'Owner C reaches S3 only'
);

-- Owner D reaches S4 so we can test an impossible/corrupt missing-Identity
-- state fail-closed.

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000004"}';

select is(
  api.claim_current_owner_handle(
    'layout-owner-d',
    1
  ) ->> 'status',
  'success',
  'Owner D completes S1'
);

select is(
  api.set_current_owner_primary_use_case(
    'affiliate',
    2
  ) ->> 'status',
  'success',
  'Owner D completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'Layout Owner D',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Owner D completes S3 and reaches S4'
);

reset role;

-- ---------------------------------------------------------------------------
-- S4 entry/read alone creates no Layout Working
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000001"}';

select is(
  api.resolve_current_starter_composition_state()
    ->> 'status',
  'success',
  'S4 resolver succeeds for eligible current Owner'
);

select is(
  api.resolve_current_starter_composition_state()
    -> 'layout_working',
  'null'::jsonb,
  'entering/resolving S4 does not create acknowledged Layout Working'
);

reset role;

select is(
  (
    select count(*)
    from core.identity_layout_working
  ),
  0::bigint,
  'no Layout Working row exists before explicit Starter confirmation'
);

-- ---------------------------------------------------------------------------
-- Earlier step cannot bypass S4
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000003"}';

select is(
  api.save_current_owner_starter_composition(
    'clean',
    null,
    3
  ) ->> 'status',
  'step_not_available',
  'Owner at S3 cannot bypass directly into Starter Composition save'
);

reset role;

select is(
  (
    select count(*)
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'rejected early S4 attempt creates no Layout Working'
);

-- ---------------------------------------------------------------------------
-- Invalid Starter and stale progress fail before first creation
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_starter_composition(
    'not-a-starter',
    null,
    4
  ) ->> 'status',
  'invalid_starter',
  'unsupported Starter key is rejected'
);

select is(
  api.save_current_owner_starter_composition(
    'clean',
    null,
    3
  ) ->> 'status',
  'progress_stale',
  'stale onboarding progress revision cannot perform first S4 save'
);

reset role;

select is(
  (
    select count(*)
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'invalid/stale first S4 attempts create no acknowledged Layout Working'
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
        '60000000-0000-4000-8000-000000000001'
  ),
  'starter_composition',
  'failed first S4 attempts do not advance onboarding frontier'
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
        '60000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'failed first S4 attempts do not mutate onboarding revision'
);

-- ---------------------------------------------------------------------------
-- First Starter save creates Layout Working and atomically advances S4 -> S5
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_starter_composition(
    'clean',
    null,
    4
  ) ->> 'status',
  'success',
  'Owner A explicitly confirms clean Starter'
);

reset role;

select is(
  (
    select
      layout_record.starter_key::text
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  'clean',
  'first S4 save persists selected clean Starter'
);

select is(
  (
    select layout_record.revision
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'first S4 save creates Layout Working revision 1'
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
        '60000000-0000-4000-8000-000000000001'
  ),
  'relevant_first_job',
  'first S4 save advances authoritative frontier to S5'
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
        '60000000-0000-4000-8000-000000000001'
  ),
  5::bigint,
  'first S4 save increments onboarding revision exactly once'
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
        '60000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Starter save does not mutate independent Identity content revision'
);

-- ---------------------------------------------------------------------------
-- Authenticated resolver returns acknowledged Starter
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000001"}';

select is(
  api.resolve_current_starter_composition_state()
    -> 'layout_working'
    ->> 'starter_key',
  'clean',
  'Starter resolver returns current Owner acknowledged Starter'
);

select is(
  (
    api.resolve_current_starter_composition_state()
      -> 'layout_working'
      ->> 'revision'
  )::bigint,
  1::bigint,
  'Starter resolver returns acknowledged Layout Working revision'
);

-- ---------------------------------------------------------------------------
-- Same acknowledged Starter is idempotent after frontier passed S4
-- ---------------------------------------------------------------------------

select is(
  api.save_current_owner_starter_composition(
    'clean',
    1,
    999999
  ) ->> 'status',
  'success',
  'same acknowledged Starter is idempotent after frontier passed S4'
);

reset role;

select is(
  (
    select layout_record.revision
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'idempotent same-Starter save creates no phantom Layout revision'
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
        '60000000-0000-4000-8000-000000000001'
  ),
  5::bigint,
  'later idempotent S4 save does not mutate progress revision'
);

-- ---------------------------------------------------------------------------
-- Primary Use Case changes do not silently change saved Starter
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000001"}';

select is(
  api.set_current_owner_primary_use_case(
    'affiliate',
    5
  ) ->> 'status',
  'success',
  'Owner A may later change Primary Use Case independently'
);

reset role;

select is(
  (
    select
      layout_record.starter_key::text
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  'clean',
  'Primary Use Case change does not silently change acknowledged Starter'
);

select is(
  (
    select layout_record.revision
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Primary Use Case change creates no Layout revision'
);

-- ---------------------------------------------------------------------------
-- Later Starter changes use independent Layout revision and do not regress S5
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_starter_composition(
    'social_focus',
    1,
    1
  ) ->> 'status',
  'success',
  'Owner A changes Starter to social_focus'
);

reset role;

select is(
  (
    select layout_record.revision
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'later Starter change increments independent Layout revision'
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
        '60000000-0000-4000-8000-000000000001'
  ),
  'relevant_first_job',
  'later Starter edit does not regress authoritative S5 frontier'
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
        '60000000-0000-4000-8000-000000000001'
  ),
  6::bigint,
  'later Starter edit does not mutate onboarding revision after independent Primary Use Case edit'
);

-- ---------------------------------------------------------------------------
-- Stale Layout write cannot overwrite newer Starter
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_starter_composition(
    'featured',
    1,
    6
  ) ->> 'status',
  'stale_write',
  'older Layout revision cannot overwrite newer Starter'
);

reset role;

select is(
  (
    select
      layout_record.starter_key::text
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  'social_focus',
  'stale Starter mutation leaves latest acknowledged Layout untouched'
);

select is(
  (
    select layout_record.revision
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'stale Starter mutation creates no Layout revision'
);

-- ---------------------------------------------------------------------------
-- Remaining curated starters can be acknowledged
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_starter_composition(
    'featured',
    2,
    1
  ) ->> 'status',
  'success',
  'featured Starter can be persisted'
);

select is(
  api.save_current_owner_starter_composition(
    'business',
    3,
    1
  ) ->> 'status',
  'success',
  'business Starter can be persisted'
);

reset role;

select is(
  (
    select
      layout_record.starter_key::text
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  'business',
  'latest acknowledged Starter is business'
);

select is(
  (
    select layout_record.revision
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'four distinct acknowledged Starter states produce Layout revision 4'
);

select is(
  (
    select progress.primary_use_case::text
    from core.owner_onboarding_progress
      as progress
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  'affiliate',
  'changing Starter does not mutate Primary Use Case'
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
        '60000000-0000-4000-8000-000000000001'
  ),
  'Layout Owner A',
  'Starter changes do not mutate Identity content'
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
        '60000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Layout revision evolves independently from Identity content revision'
);

-- ---------------------------------------------------------------------------
-- Owner isolation
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000002"}';

select is(
  api.save_current_owner_starter_composition(
    'featured',
    null,
    4
  ) ->> 'status',
  'success',
  'Owner B saves its own independent Starter'
);

reset role;

select is(
  (
    select
      layout_record.starter_key::text
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000002'
  ),
  'featured',
  'Owner B has its own Layout Working state'
);

select is(
  (
    select layout_record.revision
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'Owner B has independent Layout revision 1'
);

select is(
  (
    select
      layout_record.starter_key::text
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000001'
  ),
  'business',
  'Owner B mutation cannot alter Owner A Layout Working'
);

-- ---------------------------------------------------------------------------
-- Missing prerequisite Identity fails closed
-- ---------------------------------------------------------------------------

reset role;

delete from core.identity_working
  as identity_record
using core.owner_auth_bindings
  as binding
where
  binding.owner_id =
    identity_record.owner_id
  and binding.auth_user_id =
    '60000000-0000-4000-8000-000000000004';

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000004"}';

select is(
  api.save_current_owner_starter_composition(
    'clean',
    null,
    4
  ) ->> 'status',
  'identity_required',
  'S4 mutation fails closed if required authoritative Identity Working is missing'
);

reset role;

select is(
  (
    select count(*)
    from core.identity_layout_working
      as layout_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        layout_record.owner_id
    where
      binding.auth_user_id =
        '60000000-0000-4000-8000-000000000004'
  ),
  0::bigint,
  'identity_required failure creates no Layout Working'
);

-- ---------------------------------------------------------------------------
-- Completed Owner cannot replay S4
-- ---------------------------------------------------------------------------

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
    '60000000-0000-4000-8000-000000000004';

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000004"}';

select is(
  api.resolve_current_starter_composition_state()
    ->> 'status',
  'onboarding_complete',
  'completed Owner does not replay normal S4 resolver state'
);

select is(
  api.save_current_owner_starter_composition(
    'clean',
    null,
    4
  ) ->> 'status',
  'owner_not_eligible',
  'completed Owner cannot create onboarding Layout Working through S4'
);

-- ---------------------------------------------------------------------------
-- Missing Owner binding fails closed
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"60000000-0000-4000-8000-000000000099"}';

select is(
  api.resolve_current_starter_composition_state()
    ->> 'status',
  'owner_missing',
  'Starter resolver fails closed for principal without Owner binding'
);

select is(
  api.save_current_owner_starter_composition(
    'clean',
    null,
    1
  ) ->> 'status',
  'owner_missing',
  'Starter mutation fails closed without canonical Owner binding'
);

-- ---------------------------------------------------------------------------
-- S4 never completes onboarding for normal Owners
-- ---------------------------------------------------------------------------

reset role;

select is(
  (
    select count(*)
    from core.owners
      as owner_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        owner_record.id
    where
      binding.auth_user_id in (
        '60000000-0000-4000-8000-000000000001',
        '60000000-0000-4000-8000-000000000002',
        '60000000-0000-4000-8000-000000000003'
      )
      and owner_record.onboarding_completed_at
        is not null
  ),
  0::bigint,
  'normal S1-S4 fixtures remain onboarding-incomplete'
);

select * from finish();

rollback;
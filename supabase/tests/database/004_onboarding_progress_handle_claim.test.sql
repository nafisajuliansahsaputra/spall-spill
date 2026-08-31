begin;

select no_plan();

-- ===========================================================================
-- Stage 6A — O01 onboarding progress / Handle / Primary Use Case
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Canonical enum contracts
-- ---------------------------------------------------------------------------

select has_type(
  'core',
  'onboarding_step',
  'O01 onboarding-step enum exists'
);

select ok(
  (
    select array_agg(
      enum_value.enumlabel::text
      order by enum_value.enumsortorder
    )
    from pg_enum as enum_value
    join pg_type as enum_type
      on enum_type.oid =
        enum_value.enumtypid
    join pg_namespace as namespace_record
      on namespace_record.oid =
        enum_type.typnamespace
    where
      namespace_record.nspname = 'core'
      and enum_type.typname =
        'onboarding_step'
  ) = array[
    'claim_handle',
    'primary_use_case',
    'basic_identity',
    'starter_composition',
    'relevant_first_job',
    'preview_publish'
  ]::text[],
  'O01 onboarding-step enum contains exactly the locked six semantic steps'
);

select has_type(
  'core',
  'primary_use_case',
  'Primary Use Case enum exists'
);

select ok(
  (
    select array_agg(
      enum_value.enumlabel::text
      order by enum_value.enumsortorder
    )
    from pg_enum as enum_value
    join pg_type as enum_type
      on enum_type.oid =
        enum_value.enumtypid
    join pg_namespace as namespace_record
      on namespace_record.oid =
        enum_type.typnamespace
    where
      namespace_record.nspname = 'core'
      and enum_type.typname =
        'primary_use_case'
  ) = array[
    'creator',
    'affiliate',
    'business',
    'personal',
    'other'
  ]::text[],
  'Primary Use Case enum contains exactly the canonical personalization values'
);

select has_type(
  'core',
  'handle_namespace_kind',
  'Handle namespace-kind enum exists'
);

select ok(
  (
    select array_agg(
      enum_value.enumlabel::text
      order by enum_value.enumsortorder
    )
    from pg_enum as enum_value
    join pg_type as enum_type
      on enum_type.oid =
        enum_value.enumtypid
    join pg_namespace as namespace_record
      on namespace_record.oid =
        enum_type.typnamespace
    where
      namespace_record.nspname = 'core'
      and enum_type.typname =
        'handle_namespace_kind'
  ) = array[
    'current',
    'alias'
  ]::text[],
  'Handle namespace kind distinguishes current Handle from protected alias'
);

-- ---------------------------------------------------------------------------
-- Canonical private tables
-- ---------------------------------------------------------------------------

select has_table(
  'core',
  'owner_onboarding_progress',
  'canonical Owner onboarding-progress table exists'
);

select has_column(
  'core',
  'owner_onboarding_progress',
  'owner_id',
  'onboarding progress is scoped by canonical Owner'
);

select has_column(
  'core',
  'owner_onboarding_progress',
  'current_step',
  'onboarding progress stores current semantic step'
);

select has_column(
  'core',
  'owner_onboarding_progress',
  'primary_use_case',
  'onboarding progress stores Primary Use Case personalization'
);

select has_column(
  'core',
  'owner_onboarding_progress',
  'revision',
  'onboarding progress stores monotonic revision'
);

select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    where
      constraint_record.conrelid =
        'core.owner_onboarding_progress'::regclass
      and constraint_record.contype = 'p'
      and pg_get_constraintdef(
        constraint_record.oid
      ) = 'PRIMARY KEY (owner_id)'
  ),
  'one authoritative onboarding-progress row exists per Owner'
);

select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    where
      constraint_record.conname =
        'owner_onboarding_progress_owner_fk'
      and constraint_record.conrelid =
        'core.owner_onboarding_progress'::regclass
      and constraint_record.confrelid =
        'core.owners'::regclass
      and constraint_record.contype = 'f'
  ),
  'onboarding progress references canonical Owner identity'
);

select ok(
  (
    select column_default
    from information_schema.columns
    where
      table_schema = 'core'
      and table_name =
        'owner_onboarding_progress'
      and column_name = 'current_step'
  ) like '%claim_handle%',
  'new onboarding progress begins at S1 Claim Handle'
);

select ok(
  (
    select column_default = '1'
    from information_schema.columns
    where
      table_schema = 'core'
      and table_name =
        'owner_onboarding_progress'
      and column_name = 'revision'
  ),
  'new onboarding progress begins at revision 1'
);

select has_table(
  'core',
  'owner_handle_namespaces',
  'canonical private Handle namespace table exists'
);

select has_column(
  'core',
  'owner_handle_namespaces',
  'normalized_handle',
  'Handle namespace stores canonical normalized key'
);

select has_column(
  'core',
  'owner_handle_namespaces',
  'owner_id',
  'Handle namespace belongs to stable canonical Owner'
);

select has_column(
  'core',
  'owner_handle_namespaces',
  'namespace_kind',
  'Handle namespace stores current versus alias state'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where
      schemaname = 'core'
      and tablename =
        'owner_handle_namespaces'
      and indexname =
        'owner_handle_namespaces_one_current_per_owner_idx'
  ),
  'database enforces at most one current Handle per Owner'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where
      schemaname = 'core'
      and tablename =
        'owner_handle_namespaces'
      and indexname =
        'owner_handle_namespaces_owner_id_idx'
  ),
  'Handle namespace supports Owner-scoped lookup'
);

select has_table(
  'core',
  'reserved_handles',
  'application-controlled reserved Handle table exists'
);

select is(
  (
    select count(*)
    from core.reserved_handles
    where normalized_handle in (
      'api',
      'auth',
      'dashboard',
      'login',
      'signup',
      'recovery',
      'onboarding',
      'ops',
      '_next',
      'favicon.ico',
      'robots.txt',
      'sitemap.xml'
    )
  ),
  12::bigint,
  'minimum locked system namespace is reserved'
);

-- ---------------------------------------------------------------------------
-- Private / deny-by-default table boundary
-- ---------------------------------------------------------------------------

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'core.owner_onboarding_progress'::regclass
  ),
  'RLS is enabled on onboarding progress'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'core.owner_handle_namespaces'::regclass
  ),
  'RLS is enabled on Handle namespace'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'core.reserved_handles'::regclass
  ),
  'RLS is enabled on reserved Handle namespace'
);

select ok(
  not has_schema_privilege(
    'anon',
    'core',
    'USAGE'
  ),
  'anon cannot use private core schema'
);

select ok(
  not has_schema_privilege(
    'authenticated',
    'core',
    'USAGE'
  ),
  'authenticated cannot use private core schema directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.owner_onboarding_progress',
    'SELECT'
  ),
  'authenticated cannot directly read onboarding progress'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.owner_onboarding_progress',
    'UPDATE'
  ),
  'authenticated cannot directly mutate onboarding progress'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.owner_handle_namespaces',
    'SELECT'
  ),
  'authenticated cannot directly read Handle namespace'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.owner_handle_namespaces',
    'INSERT'
  ),
  'authenticated cannot directly claim Handle namespace rows'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.owner_handle_namespaces',
    'UPDATE'
  ),
  'authenticated cannot directly replace Handle namespace rows'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.reserved_handles',
    'SELECT'
  ),
  'authenticated cannot directly enumerate private reserved namespace table'
);

-- ---------------------------------------------------------------------------
-- Narrow API functions
-- ---------------------------------------------------------------------------

select ok(
  to_regprocedure(
    'api.resolve_current_onboarding_state()'
  ) is not null,
  'current-Owner onboarding resolver exists'
);

select ok(
  to_regprocedure(
    'api.claim_current_owner_handle(text,bigint)'
  ) is not null,
  'S1 Handle mutation boundary exists with no target Owner argument'
);

select ok(
  to_regprocedure(
    'api.set_current_owner_primary_use_case(text,bigint)'
  ) is not null,
  'S2 Primary Use Case boundary exists with no target Owner argument'
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
        'resolve_current_onboarding_state'
      and procedure_record.pronargs = 0
  ),
  'onboarding resolver is SECURITY DEFINER'
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
        'claim_current_owner_handle'
      and procedure_record.pronargs = 2
  ),
  'Handle mutation is SECURITY DEFINER'
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
        'set_current_owner_primary_use_case'
      and procedure_record.pronargs = 2
  ),
  'Primary Use Case mutation is SECURITY DEFINER'
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
            'resolve_current_onboarding_state'
          and procedure_record.pronargs = 0
        )
        or
        (
          procedure_record.proname =
            'claim_current_owner_handle'
          and procedure_record.pronargs = 2
        )
        or
        (
          procedure_record.proname =
            'set_current_owner_primary_use_case'
          and procedure_record.pronargs = 2
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
  3::bigint,
  'all O01 RPCs use an empty fixed search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.resolve_current_onboarding_state()',
    'EXECUTE'
  ),
  'authenticated may execute current onboarding resolver'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.claim_current_owner_handle(text,bigint)',
    'EXECUTE'
  ),
  'authenticated may execute S1 Handle mutation'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.set_current_owner_primary_use_case(text,bigint)',
    'EXECUTE'
  ),
  'authenticated may execute S2 Primary Use Case mutation'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.resolve_current_onboarding_state()',
    'EXECUTE'
  ),
  'anon cannot execute onboarding resolver'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.claim_current_owner_handle(text,bigint)',
    'EXECUTE'
  ),
  'anon cannot execute Handle mutation'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.set_current_owner_primary_use_case(text,bigint)',
    'EXECUTE'
  ),
  'anon cannot execute Primary Use Case mutation'
);

-- ---------------------------------------------------------------------------
-- Unauthenticated behavior
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{}';

select is(
  api.resolve_current_onboarding_state()
    ->> 'status',
  'unauthenticated',
  'onboarding resolver fails closed without authenticated principal'
);

select is(
  api.claim_current_owner_handle(
    'anonymous-handle',
    1
  ) ->> 'status',
  'unauthenticated',
  'unauthenticated principal cannot claim a Handle'
);

select is(
  api.set_current_owner_primary_use_case(
    'creator',
    1
  ) ->> 'status',
  'unauthenticated',
  'unauthenticated principal cannot set Primary Use Case'
);

-- ---------------------------------------------------------------------------
-- Canonical Owner fixtures
--
-- auth.users inserts intentionally exercise the real provisioning trigger.
-- ---------------------------------------------------------------------------

reset role;

insert into auth.users (
  id,
  email
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'onboarding-owner-a@example.test'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'onboarding-owner-b@example.test'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'onboarding-owner-c@example.test'
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    'onboarding-complete@example.test'
  );

select is(
  (
    select count(*)
    from core.owner_auth_bindings
    where auth_user_id in (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000004'
    )
  ),
  4::bigint,
  'future Auth users transactionally provision canonical Owner bindings'
);

select is(
  (
    select count(*)
    from core.owner_onboarding_progress
      as progress
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where binding.auth_user_id in (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000004'
    )
  ),
  4::bigint,
  'future Owners transactionally provision O01 progress'
);

select ok(
  not exists (
    select 1
    from core.owners as owner_record
    left join core.owner_onboarding_progress
      as progress
      on progress.owner_id =
        owner_record.id
    where progress.owner_id is null
  ),
  'every canonical Owner has account-side onboarding progress after migration/provisioning'
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
    where binding.auth_user_id =
      '20000000-0000-4000-8000-000000000001'
  ),
  'claim_handle',
  'fresh Owner begins at S1 Claim Handle'
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
    where binding.auth_user_id =
      '20000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'fresh Owner begins at onboarding revision 1'
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
    where binding.auth_user_id =
      '20000000-0000-4000-8000-000000000001'
  ),
  null,
  'fresh Owner has no Primary Use Case before S2'
);

select is(
  (
    select owner_record.onboarding_completed_at
    from core.owners as owner_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        owner_record.id
    where binding.auth_user_id =
      '20000000-0000-4000-8000-000000000001'
  ),
  null,
  'fresh Owner remains authoritatively onboarding-incomplete'
);

-- ---------------------------------------------------------------------------
-- S1 initial read
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001"}';

select is(
  api.resolve_current_onboarding_state()
    ->> 'status',
  'success',
  'authenticated incomplete Owner can read current O01 state'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_step',
  'claim_handle',
  'initial authenticated O01 state resumes at S1'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_handle',
  null,
  'initial authenticated O01 state has no automatically chosen Handle'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  1::bigint,
  'initial authenticated O01 state exposes authoritative revision'
);

-- ---------------------------------------------------------------------------
-- S1 invalid Handle must remain local to Handle
-- ---------------------------------------------------------------------------

select is(
  api.claim_current_owner_handle(
    'ab',
    1
  ) ->> 'status',
  'invalid_handle',
  'too-short Handle is rejected'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_step',
  'claim_handle',
  'invalid Handle does not advance onboarding'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_handle',
  null,
  'invalid Handle does not create canonical namespace state'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  1::bigint,
  'invalid Handle does not advance revision'
);

-- ---------------------------------------------------------------------------
-- S1 reserved namespace rejection
-- ---------------------------------------------------------------------------

select is(
  api.claim_current_owner_handle(
    'dashboard',
    1
  ) ->> 'status',
  'reserved_handle',
  'reserved platform route cannot be claimed as Handle'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  1::bigint,
  'reserved Handle rejection leaves authoritative revision unchanged'
);

-- ---------------------------------------------------------------------------
-- S1 valid normalized claim
-- ---------------------------------------------------------------------------

select is(
  api.claim_current_owner_handle(
    '  Natsx.Test  ',
    1
  ) ->> 'status',
  'success',
  'valid Handle claim succeeds'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_handle',
  'natsx.test',
  'Handle claim trims and normalizes ASCII casing'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_step',
  'primary_use_case',
  'successful first Handle claim advances S1 to S2'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  2::bigint,
  'successful Handle claim increments onboarding revision'
);

-- ---------------------------------------------------------------------------
-- Same Owner + same current Handle is idempotent
-- ---------------------------------------------------------------------------

select is(
  api.claim_current_owner_handle(
    'NATSX.TEST',
    2
  ) ->> 'status',
  'success',
  'same Owner can safely reconfirm the same normalized current Handle'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  2::bigint,
  'idempotent same-Handle reconfirmation does not create a phantom revision'
);

-- ---------------------------------------------------------------------------
-- Stale S1 write cannot overwrite newer authority
-- ---------------------------------------------------------------------------

select is(
  api.claim_current_owner_handle(
    'stale-attempt',
    1
  ) ->> 'status',
  'stale_write',
  'Handle mutation rejects stale base revision'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_handle',
  'natsx.test',
  'stale Handle mutation cannot replace authoritative current Handle'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  2::bigint,
  'stale Handle mutation does not advance authoritative revision'
);

-- ---------------------------------------------------------------------------
-- Cross-Owner normalized collision
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000002"}';

select is(
  api.claim_current_owner_handle(
    'Natsx.Test',
    1
  ) ->> 'status',
  'handle_unavailable',
  'another Owner cannot claim an already-owned normalized Handle'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_handle',
  null,
  'failed cross-Owner Handle claim does not mutate caller namespace'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  1::bigint,
  'failed cross-Owner Handle collision does not advance caller revision'
);

-- ---------------------------------------------------------------------------
-- Onboarding Handle replacement -> previous Handle becomes protected alias
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001"}';

select is(
  api.claim_current_owner_handle(
    'new.handle',
    2
  ) ->> 'status',
  'success',
  'incomplete Owner may return to S1 semantics and choose a different Handle'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_handle',
  'new.handle',
  'replacement Handle becomes canonical current Handle'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  3::bigint,
  'Handle replacement advances authoritative revision'
);

reset role;

select is(
  (
    select namespace_record.namespace_kind::text
    from core.owner_handle_namespaces
      as namespace_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        namespace_record.owner_id
    where
      binding.auth_user_id =
        '20000000-0000-4000-8000-000000000001'
      and namespace_record.normalized_handle =
        'natsx.test'
  ),
  'alias',
  'previous onboarding Handle becomes protected historical alias'
);

select is(
  (
    select namespace_record.namespace_kind::text
    from core.owner_handle_namespaces
      as namespace_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        namespace_record.owner_id
    where
      binding.auth_user_id =
        '20000000-0000-4000-8000-000000000001'
      and namespace_record.normalized_handle =
        'new.handle'
  ),
  'current',
  'replacement namespace row is the single current Handle'
);

select is(
  (
    select count(*)
    from core.owner_handle_namespaces
      as namespace_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        namespace_record.owner_id
    where
      binding.auth_user_id =
        '20000000-0000-4000-8000-000000000001'
      and namespace_record.namespace_kind =
        'current'::core.handle_namespace_kind
  ),
  1::bigint,
  'Owner retains exactly one current canonical Handle'
);

-- ---------------------------------------------------------------------------
-- Historical alias remains unavailable to another Owner
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000002"}';

select is(
  api.claim_current_owner_handle(
    'natsx.test',
    1
  ) ->> 'status',
  'handle_unavailable',
  'historical alias cannot be recycled to another Owner'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  1::bigint,
  'failed historical-alias takeover leaves attacker Owner progress unchanged'
);

-- ---------------------------------------------------------------------------
-- Same Owner may make its protected alias current again
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001"}';

select is(
  api.claim_current_owner_handle(
    'natsx.test',
    3
  ) ->> 'status',
  'success',
  'Owner may safely restore its own protected historical Handle during onboarding'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_handle',
  'natsx.test',
  'restored alias becomes current Handle for the same stable Owner'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  4::bigint,
  'restoring own alias advances authoritative revision exactly once'
);

reset role;

select is(
  (
    select namespace_record.namespace_kind::text
    from core.owner_handle_namespaces
      as namespace_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        namespace_record.owner_id
    where
      binding.auth_user_id =
        '20000000-0000-4000-8000-000000000001'
      and namespace_record.normalized_handle =
        'new.handle'
  ),
  'alias',
  'displaced current Handle remains reserved as protected alias'
);

select is(
  (
    select namespace_record.namespace_kind::text
    from core.owner_handle_namespaces
      as namespace_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        namespace_record.owner_id
    where
      binding.auth_user_id =
        '20000000-0000-4000-8000-000000000001'
      and namespace_record.normalized_handle =
        'natsx.test'
  ),
  'current',
  'restored historical Handle is current without creating duplicate ownership'
);

-- ---------------------------------------------------------------------------
-- S2 cannot bypass required S1 Handle
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000003"}';

select is(
  api.set_current_owner_primary_use_case(
    'creator',
    1
  ) ->> 'status',
  'handle_required',
  'S2 cannot bypass required S1 Handle claim'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_step',
  'claim_handle',
  'Handle-required failure leaves Owner at S1'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'primary_use_case',
  null,
  'Handle-required failure does not persist Primary Use Case'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  1::bigint,
  'Handle-required failure does not advance revision'
);

-- ---------------------------------------------------------------------------
-- S2 invalid Primary Use Case
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001"}';

select is(
  api.set_current_owner_primary_use_case(
    'not-a-persona',
    4
  ) ->> 'status',
  'invalid_primary_use_case',
  'non-canonical Primary Use Case is rejected'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'primary_use_case',
  null,
  'invalid Primary Use Case does not persist personalization state'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  4::bigint,
  'invalid Primary Use Case leaves revision unchanged'
);

-- ---------------------------------------------------------------------------
-- S2 valid Primary Use Case
-- ---------------------------------------------------------------------------

select is(
  api.set_current_owner_primary_use_case(
    'AFFILIATE',
    4
  ) ->> 'status',
  'success',
  'valid Primary Use Case persists using canonical normalized value'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'primary_use_case',
  'affiliate',
  'Primary Use Case is persisted as canonical personalization metadata'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_step',
  'basic_identity',
  'successful S2 selection advances onboarding to S3 Basic Identity'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  5::bigint,
  'successful Primary Use Case selection increments revision'
);

-- ---------------------------------------------------------------------------
-- Same selected use case is idempotent after S2
-- ---------------------------------------------------------------------------

select is(
  api.set_current_owner_primary_use_case(
    'affiliate',
    5
  ) ->> 'status',
  'success',
  'reconfirming unchanged Primary Use Case is idempotent'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  5::bigint,
  'unchanged Primary Use Case reconfirmation creates no phantom revision'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_step',
  'basic_identity',
  'reconfirming Primary Use Case does not regress later onboarding step'
);

-- ---------------------------------------------------------------------------
-- Stale S2 write cannot overwrite newer personalization
-- ---------------------------------------------------------------------------

select is(
  api.set_current_owner_primary_use_case(
    'personal',
    4
  ) ->> 'status',
  'stale_write',
  'Primary Use Case mutation rejects stale base revision'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'primary_use_case',
  'affiliate',
  'stale Primary Use Case write cannot overwrite acknowledged personalization'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  5::bigint,
  'stale Primary Use Case write does not advance revision'
);

-- ---------------------------------------------------------------------------
-- Primary Use Case remains editable and does not create a role lock
-- ---------------------------------------------------------------------------

select is(
  api.set_current_owner_primary_use_case(
    'creator',
    5
  ) ->> 'status',
  'success',
  'Owner may change Primary Use Case after S2 without migration'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'primary_use_case',
  'creator',
  'changed Primary Use Case becomes authoritative personalization state'
);

select is(
  api.resolve_current_onboarding_state()
    ->> 'current_step',
  'basic_identity',
  'changing Primary Use Case does not destroy or regress downstream progress'
);

select is(
  (
    api.resolve_current_onboarding_state()
      ->> 'revision'
  )::bigint,
  6::bigint,
  'changed Primary Use Case increments revision exactly once'
);

reset role;

select is(
  (
    select owner_record.account_state::text
    from core.owners as owner_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        owner_record.id
    where binding.auth_user_id =
      '20000000-0000-4000-8000-000000000001'
  ),
  'active',
  'Primary Use Case personalization does not alter Owner authorization state'
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
        '20000000-0000-4000-8000-000000000001'
      and namespace_record.namespace_kind =
        'current'::core.handle_namespace_kind
  ),
  'natsx.test',
  'changing Primary Use Case does not recreate or change Handle identity'
);

-- ---------------------------------------------------------------------------
-- S1/S2 never complete onboarding
-- ---------------------------------------------------------------------------

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
        '20000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000003'
      )
      and owner_record.onboarding_completed_at
        is not null
  ),
  0::bigint,
  'S1/S2 mutations never write onboarding completion'
);

-- ---------------------------------------------------------------------------
-- Completed Owner cannot replay O01 mutations
-- ---------------------------------------------------------------------------

update core.owners as owner_record
set
  onboarding_completed_at = now(),
  updated_at = now()
from core.owner_auth_bindings
  as binding
where
  binding.owner_id =
    owner_record.id
  and binding.auth_user_id =
    '20000000-0000-4000-8000-000000000004';

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000004"}';

select is(
  api.resolve_current_onboarding_state()
    ->> 'status',
  'onboarding_complete',
  'completed active Owner does not replay normal O01 progress'
);

select is(
  api.claim_current_owner_handle(
    'should-not-claim',
    1
  ) ->> 'status',
  'owner_not_eligible',
  'completed Owner cannot mutate onboarding Handle through O01'
);

select is(
  api.set_current_owner_primary_use_case(
    'business',
    1
  ) ->> 'status',
  'owner_not_eligible',
  'completed Owner cannot mutate Primary Use Case through O01 boundary'
);

reset role;

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress
      as progress
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where binding.auth_user_id =
      '20000000-0000-4000-8000-000000000004'
  ),
  1::bigint,
  'rejected completed-Owner O01 mutations leave progress unchanged'
);

select is(
  (
    select count(*)
    from core.owner_handle_namespaces
      as namespace_record
    join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        namespace_record.owner_id
    where binding.auth_user_id =
      '20000000-0000-4000-8000-000000000004'
  ),
  0::bigint,
  'rejected completed-Owner Handle mutation creates no namespace record'
);

-- ---------------------------------------------------------------------------
-- Missing canonical Owner binding fails closed
-- ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000099"}';

select is(
  api.resolve_current_onboarding_state()
    ->> 'status',
  'owner_missing',
  'authenticated principal without canonical Owner binding fails closed'
);

select is(
  api.claim_current_owner_handle(
    'missing-owner',
    1
  ) ->> 'status',
  'owner_missing',
  'Handle mutation fails closed when canonical Owner binding is missing'
);

select is(
  api.set_current_owner_primary_use_case(
    'other',
    1
  ) ->> 'status',
  'owner_missing',
  'Primary Use Case mutation fails closed when canonical Owner binding is missing'
);

select * from finish();

rollback;
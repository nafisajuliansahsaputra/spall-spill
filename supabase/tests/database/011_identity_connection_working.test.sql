begin;

select no_plan();

-- ===========================================================================
-- O01-S5 — Identity Connection Working
-- ===========================================================================

select ok(
  to_regprocedure(
    'api.resolve_current_identity_connection_state()'
  ) is not null,
  'Identity Connection current-Owner resolver exists'
);

select ok(
  to_regprocedure(
    'api.save_current_owner_identity_connection(text,text,text,bigint)'
  ) is not null,
  'Identity Connection current-Owner save RPC exists'
);

select ok(
  (
    select p.prosecdef
    from pg_proc as p
    where p.oid =
      'api.resolve_current_identity_connection_state()'::regprocedure
  ),
  'Identity Connection resolver is SECURITY DEFINER'
);

select ok(
  (
    select p.prosecdef
    from pg_proc as p
    where p.oid =
      'api.save_current_owner_identity_connection(text,text,text,bigint)'::regprocedure
  ),
  'Identity Connection save RPC is SECURITY DEFINER'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.resolve_current_identity_connection_state()',
    'EXECUTE'
  ),
  'authenticated may execute Identity Connection resolver'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.resolve_current_identity_connection_state()',
    'EXECUTE'
  ),
  'anon cannot execute Identity Connection resolver'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.save_current_owner_identity_connection(text,text,text,bigint)',
    'EXECUTE'
  ),
  'authenticated may execute Identity Connection save RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.save_current_owner_identity_connection(text,text,text,bigint)',
    'EXECUTE'
  ),
  'anon cannot execute Identity Connection save RPC'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.identity_connection_working',
    'SELECT'
  ),
  'authenticated cannot read private Connection Working table directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.identity_connection_working',
    'INSERT'
  ),
  'authenticated cannot insert private Connection Working directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.identity_connection_working',
    'UPDATE'
  ),
  'authenticated cannot update private Connection Working directly'
);

select is(
  (
    select count(*)
    from pg_proc as p
    join pg_namespace as n
      on n.oid = p.pronamespace
    where
      n.nspname = 'api'
      and p.proname =
        'save_current_owner_identity_connection'
      and not exists (
        select 1
        from unnest(
          coalesce(
            p.proargnames,
            array[]::text[]
          )
        ) as argument_name
        where argument_name in (
          'owner_id',
          'input_owner_id',
          'target_owner_id'
        )
      )
  ),
  1::bigint,
  'Identity Connection save exposes no client-selectable Owner target'
);

-- ---------------------------------------------------------------------------
-- Unauthenticated authenticated-role request still fails closed
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated"}';

select is(
  api.resolve_current_identity_connection_state() ->> 'status',
  'unauthenticated',
  'resolver fails closed when auth.uid() is absent'
);

select is(
  api.save_current_owner_identity_connection(
    'generic_link',
    null,
    'https://example.com',
    null
  ) ->> 'status',
  'unauthenticated',
  'save fails closed when auth.uid() is absent'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

reset role;

insert into auth.users (id, email)
values
  (
    '71000000-0000-4000-8000-000000000001',
    'connection-owner-a@example.test'
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    'connection-owner-b@example.test'
  ),
  (
    '71000000-0000-4000-8000-000000000003',
    'connection-early@example.test'
  );

-- Owner A -> S5

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001"}';

select is(
  api.claim_current_owner_handle(
    'connection-owner-a',
    1
  ) ->> 'status',
  'success',
  'Owner A completes S1'
);

select is(
  api.set_current_owner_primary_use_case(
    'personal',
    2
  ) ->> 'status',
  'success',
  'Owner A completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'Connection Owner A',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Owner A completes S3'
);

select is(
  api.save_current_owner_starter_composition(
    'social_focus',
    null,
    4
  ) ->> 'status',
  'success',
  'Owner A reaches S5'
);

-- Owner B -> S5

set local request.jwt.claims =
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002"}';

select is(
  api.claim_current_owner_handle(
    'connection-owner-b',
    1
  ) ->> 'status',
  'success',
  'Owner B completes S1'
);

select is(
  api.set_current_owner_primary_use_case(
    'creator',
    2
  ) ->> 'status',
  'success',
  'Owner B completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'Connection Owner B',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Owner B completes S3'
);

select is(
  api.save_current_owner_starter_composition(
    'featured',
    null,
    4
  ) ->> 'status',
  'success',
  'Owner B reaches S5'
);

-- Early Owner stops at S4

set local request.jwt.claims =
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000003"}';

select is(
  api.claim_current_owner_handle(
    'connection-early',
    1
  ) ->> 'status',
  'success',
  'Early Owner completes S1'
);

select is(
  api.set_current_owner_primary_use_case(
    'personal',
    2
  ) ->> 'status',
  'success',
  'Early Owner completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'Connection Early',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Early Owner reaches S4'
);

select is(
  api.save_current_owner_identity_connection(
    'generic_link',
    null,
    'https://example.com/too-early',
    null
  ) ->> 'status',
  'step_not_available',
  'Owner below S5 cannot create Connection Working'
);

-- ---------------------------------------------------------------------------
-- Owner A initial state and first Social save
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001"}';

select is(
  api.resolve_current_identity_connection_state()
    ->> 'status',
  'success',
  'Owner A resolver succeeds at S5'
);

select ok(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    is null
    or
  api.resolve_current_identity_connection_state()
    -> 'connection_working' =
      'null'::jsonb,
  'Owner A has no implicit Connection Working before explicit save'
);

select is(
  api.save_current_owner_identity_connection(
    ' SOCIAL ',
    ' Instagram ',
    ' https://instagram.com/natsx ',
    null
  ) ->> 'status',
  'success',
  'Owner A explicitly creates Social Connection Working'
);

select is(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    ->> 'connection_kind',
  'social',
  'Social connection kind is normalized'
);

select is(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    ->> 'social_platform',
  'instagram',
  'Social platform key is normalized'
);

select is(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    ->> 'destination_url',
  'https://instagram.com/natsx',
  'destination URL outer whitespace is normalized'
);

select is(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    ->> 'revision',
  '1',
  'first Connection Working save starts at revision 1'
);

-- Save must not advance onboarding.

reset role;

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress as progress
    inner join core.owner_auth_bindings as binding
      on binding.owner_id =
        progress.owner_id
    where binding.auth_user_id =
      '71000000-0000-4000-8000-000000000001'
  ),
  'relevant_first_job',
  'saving Connection Working does not advance Owner A beyond S5'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress as progress
    inner join core.owner_auth_bindings as binding
      on binding.owner_id =
        progress.owner_id
    where binding.auth_user_id =
      '71000000-0000-4000-8000-000000000001'
  ),
  5::bigint,
  'saving Connection Working does not mutate progress revision'
);

select ok(
  (
    select owner_record.onboarding_completed_at
    from core.owners as owner_record
    inner join core.owner_auth_bindings as binding
      on binding.owner_id =
        owner_record.id
    where binding.auth_user_id =
      '71000000-0000-4000-8000-000000000001'
  ) is null,
  'saving Connection Working does not complete onboarding'
);

-- ---------------------------------------------------------------------------
-- Edit, stale-write protection, and shape validation
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_identity_connection(
    'generic_link',
    null,
    'https://example.com/about',
    1
  ) ->> 'status',
  'success',
  'Owner A may edit its acknowledged Connection Working'
);

select is(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    ->> 'revision',
  '2',
  'editing Connection Working increments revision'
);

select is(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    ->> 'connection_kind',
  'generic_link',
  'Owner A may change Social into generic link Working'
);

select is(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    ->> 'social_platform',
  null,
  'generic link stores no social platform'
);

select is(
  api.save_current_owner_identity_connection(
    'generic_link',
    null,
    'https://stale.example.test',
    1
  ) ->> 'status',
  'stale_write',
  'stale Connection Working revision is rejected'
);

select is(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    ->> 'destination_url',
  'https://example.com/about',
  'stale write cannot overwrite acknowledged destination'
);

select is(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    ->> 'revision',
  '2',
  'stale write does not increment revision'
);

select is(
  api.save_current_owner_identity_connection(
    'product',
    null,
    'https://example.com/product',
    2
  ) ->> 'status',
  'invalid_connection_kind',
  'unsupported connection kind is rejected'
);

select is(
  api.save_current_owner_identity_connection(
    'social',
    'instagram.com',
    'https://instagram.com/natsx',
    2
  ) ->> 'status',
  'invalid_social_platform',
  'malformed Social platform key is rejected'
);

select is(
  api.save_current_owner_identity_connection(
    'generic_link',
    'instagram',
    'https://example.com',
    2
  ) ->> 'status',
  'invalid_social_platform',
  'generic link cannot smuggle a Social platform key'
);

-- ---------------------------------------------------------------------------
-- Dangerous / unsupported destination schemes
-- ---------------------------------------------------------------------------

select is(
  api.save_current_owner_identity_connection(
    'generic_link',
    null,
    'javascript:alert(1)',
    2
  ) ->> 'status',
  'invalid_destination_url',
  'javascript destination is rejected'
);

select is(
  api.save_current_owner_identity_connection(
    'generic_link',
    null,
    'data:text/html,test',
    2
  ) ->> 'status',
  'invalid_destination_url',
  'data destination is rejected'
);

select is(
  api.save_current_owner_identity_connection(
    'generic_link',
    null,
    'file:///etc/passwd',
    2
  ) ->> 'status',
  'invalid_destination_url',
  'file destination is rejected'
);

select is(
  api.save_current_owner_identity_connection(
    'generic_link',
    null,
    '//example.com/no-scheme',
    2
  ) ->> 'status',
  'invalid_destination_url',
  'protocol-relative destination is rejected'
);

select is(
  api.save_current_owner_identity_connection(
    'generic_link',
    null,
    E'https://example.com\\@evil.test',
    2
  ) ->> 'status',
  'invalid_destination_url',
  'backslash-based destination ambiguity is rejected'
);

-- Ordinary HTTP remains supported.

select is(
  api.save_current_owner_identity_connection(
    'social',
    'x',
    'http://example.com/natsx',
    2
  ) ->> 'status',
  'success',
  'ordinary http destination remains supported'
);

select is(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    ->> 'revision',
  '3',
  'valid second edit advances Connection Working to revision 3'
);

-- ---------------------------------------------------------------------------
-- Owner isolation / BOLA boundary
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002"}';

select ok(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    is null
    or
  api.resolve_current_identity_connection_state()
    -> 'connection_working' =
      'null'::jsonb,
  'Owner B cannot see Owner A Connection Working'
);

select is(
  api.save_current_owner_identity_connection(
    'generic_link',
    null,
    'https://owner-b.example.test',
    null
  ) ->> 'status',
  'success',
  'Owner B creates only its own Connection Working'
);

select is(
  api.resolve_current_identity_connection_state()
    -> 'connection_working'
    ->> 'destination_url',
  'https://owner-b.example.test',
  'Owner B resolver returns only Owner B destination'
);

reset role;

select is(
  (
    select count(*)
    from core.identity_connection_working
  ),
  2::bigint,
  'two authenticated Owners produce two isolated Working records'
);

select is(
  (
    select connection_record.destination_url
    from core.identity_connection_working
      as connection_record
    inner join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        connection_record.owner_id
    where binding.auth_user_id =
      '71000000-0000-4000-8000-000000000001'
  ),
  'http://example.com/natsx',
  'Owner A persisted destination remains untouched by Owner B'
);

select is(
  (
    select connection_record.revision
    from core.identity_connection_working
      as connection_record
    inner join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        connection_record.owner_id
    where binding.auth_user_id =
      '71000000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'Owner A Working revision remains isolated'
);

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress
      as progress
    inner join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where binding.auth_user_id =
      '71000000-0000-4000-8000-000000000002'
  ),
  'relevant_first_job',
  'Owner B Connection save also remains at S5'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress
      as progress
    inner join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where binding.auth_user_id =
      '71000000-0000-4000-8000-000000000002'
  ),
  5::bigint,
  'Owner B Connection save does not mutate progress revision'
);

select * from finish();

rollback;
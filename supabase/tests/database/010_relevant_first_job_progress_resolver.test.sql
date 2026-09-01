begin;

select no_plan();

-- ===========================================================================
-- O01-S5 — Relevant First Job progress/resolver foundation
-- ===========================================================================

select ok(
  to_regprocedure(
    'api.resolve_current_relevant_first_job_state()'
  ) is not null,
  'S5 current-Owner resolver exists'
);

select ok(
  to_regprocedure(
    'api.advance_current_owner_relevant_first_job(bigint)'
  ) is not null,
  'S5 explicit Continue/Skip advancement exists'
);

select ok(
  (
    select p.prosecdef
    from pg_proc as p
    where p.oid =
      'api.resolve_current_relevant_first_job_state()'::regprocedure
  ),
  'S5 resolver is SECURITY DEFINER'
);

select ok(
  (
    select p.prosecdef
    from pg_proc as p
    where p.oid =
      'api.advance_current_owner_relevant_first_job(bigint)'::regprocedure
  ),
  'S5 advancement is SECURITY DEFINER'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.resolve_current_relevant_first_job_state()',
    'EXECUTE'
  ),
  'authenticated may execute S5 resolver'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.resolve_current_relevant_first_job_state()',
    'EXECUTE'
  ),
  'anon cannot execute S5 resolver'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.advance_current_owner_relevant_first_job(bigint)',
    'EXECUTE'
  ),
  'authenticated may execute S5 advancement'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.advance_current_owner_relevant_first_job(bigint)',
    'EXECUTE'
  ),
  'anon cannot execute S5 advancement'
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
        'advance_current_owner_relevant_first_job'
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
  'S5 mutation exposes no client-selectable Owner target'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

reset role;

insert into auth.users (id, email)
values
  (
    '70000000-0000-4000-8000-000000000001',
    's5-personal@example.test'
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    's5-creator@example.test'
  ),
  (
    '70000000-0000-4000-8000-000000000003',
    's5-affiliate@example.test'
  ),
  (
    '70000000-0000-4000-8000-000000000004',
    's5-business@example.test'
  ),
  (
    '70000000-0000-4000-8000-000000000005',
    's5-other@example.test'
  ),
  (
    '70000000-0000-4000-8000-000000000006',
    's5-early@example.test'
  );

-- Personal -> S5

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000001"}';

select is(
  api.claim_current_owner_handle('s5-personal', 1) ->> 'status',
  'success',
  'Personal Owner completes S1'
);

select is(
  api.set_current_owner_primary_use_case('personal', 2) ->> 'status',
  'success',
  'Personal Owner completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'S5 Personal',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Personal Owner completes S3'
);

select is(
  api.save_current_owner_starter_composition(
    'clean',
    null,
    4
  ) ->> 'status',
  'success',
  'Personal Owner reaches S5'
);

-- Creator -> S5

set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000002"}';

select is(
  api.claim_current_owner_handle('s5-creator', 1) ->> 'status',
  'success',
  'Creator Owner completes S1'
);

select is(
  api.set_current_owner_primary_use_case('creator', 2) ->> 'status',
  'success',
  'Creator Owner completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'S5 Creator',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Creator Owner completes S3'
);

select is(
  api.save_current_owner_starter_composition(
    'featured',
    null,
    4
  ) ->> 'status',
  'success',
  'Creator Owner reaches S5'
);

-- Affiliate -> S5

set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000003"}';

select is(
  api.claim_current_owner_handle('s5-affiliate', 1) ->> 'status',
  'success',
  'Affiliate Owner completes S1'
);

select is(
  api.set_current_owner_primary_use_case('affiliate', 2) ->> 'status',
  'success',
  'Affiliate Owner completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'S5 Affiliate',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Affiliate Owner completes S3'
);

select is(
  api.save_current_owner_starter_composition(
    'social_focus',
    null,
    4
  ) ->> 'status',
  'success',
  'Affiliate Owner reaches S5'
);

-- Business -> S5

set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000004"}';

select is(
  api.claim_current_owner_handle('s5-business', 1) ->> 'status',
  'success',
  'Business Owner completes S1'
);

select is(
  api.set_current_owner_primary_use_case('business', 2) ->> 'status',
  'success',
  'Business Owner completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'S5 Business',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Business Owner completes S3'
);

select is(
  api.save_current_owner_starter_composition(
    'business',
    null,
    4
  ) ->> 'status',
  'success',
  'Business Owner reaches S5'
);

-- Other -> S5

set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000005"}';

select is(
  api.claim_current_owner_handle('s5-other', 1) ->> 'status',
  'success',
  'Other Owner completes S1'
);

select is(
  api.set_current_owner_primary_use_case('other', 2) ->> 'status',
  'success',
  'Other Owner completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'S5 Other',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Other Owner completes S3'
);

select is(
  api.save_current_owner_starter_composition(
    'clean',
    null,
    4
  ) ->> 'status',
  'success',
  'Other Owner reaches S5'
);

-- Early Owner remains at S4.

set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000006"}';

select is(
  api.claim_current_owner_handle('s5-early', 1) ->> 'status',
  'success',
  'Early Owner completes S1'
);

select is(
  api.set_current_owner_primary_use_case('personal', 2) ->> 'status',
  'success',
  'Early Owner completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'S5 Early',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Early Owner stops at S4'
);

-- ---------------------------------------------------------------------------
-- Adaptive recommendation is guidance only
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000001"}';

select is(
  api.resolve_current_relevant_first_job_state()
    ->> 'recommended_first_job',
  'identity_connection',
  'Personal recommends Identity connection'
);

set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000002"}';

select is(
  api.resolve_current_relevant_first_job_state()
    ->> 'recommended_first_job',
  'identity_connection',
  'Creator recommends Identity connection'
);

set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000003"}';

select is(
  api.resolve_current_relevant_first_job_state()
    ->> 'recommended_first_job',
  'product',
  'Affiliate recommends Product'
);

set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000004"}';

select is(
  api.resolve_current_relevant_first_job_state()
    ->> 'recommended_first_job',
  'resource',
  'Business recommends Resource'
);

set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000005"}';

select is(
  api.resolve_current_relevant_first_job_state()
    ->> 'recommended_first_job',
  'neutral',
  'Other receives neutral guidance'
);

-- ---------------------------------------------------------------------------
-- Earlier step cannot bypass S5
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000006"}';

select is(
  api.resolve_current_relevant_first_job_state()
    ->> 'status',
  'step_not_available',
  'S4 Owner cannot resolve S5 as active'
);

select is(
  api.advance_current_owner_relevant_first_job(4)
    ->> 'status',
  'step_not_available',
  'S4 Owner cannot bypass directly to S6'
);

-- ---------------------------------------------------------------------------
-- Stale-write rejection and explicit S5 -> S6 advancement
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000001"}';

select is(
  api.advance_current_owner_relevant_first_job(4)
    ->> 'status',
  'stale_write',
  'stale S5 progress revision is rejected'
);

reset role;

reset role;

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id = progress.owner_id
    where binding.auth_user_id =
      '70000000-0000-4000-8000-000000000001'
  ),
  'relevant_first_job',
  'stale S5 mutation does not advance progress'
);

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000001"}';

select is(
  api.advance_current_owner_relevant_first_job(5)
    ->> 'status',
  'success',
  'current Owner may explicitly Continue/Skip S5'
);

reset role;

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id = progress.owner_id
    where binding.auth_user_id =
      '70000000-0000-4000-8000-000000000001'
  ),
  'preview_publish',
  'successful S5 advancement reaches S6'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id = progress.owner_id
    where binding.auth_user_id =
      '70000000-0000-4000-8000-000000000001'
  ),
  6::bigint,
  'successful S5 advancement increments progress exactly once'
);

-- Retry must be idempotent even with the old request revision.

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000001"}';

select is(
  api.advance_current_owner_relevant_first_job(5)
    ->> 'status',
  'success',
  'retry after successful advancement remains successful'
);

select is(
  api.advance_current_owner_relevant_first_job(5)
    ->> 'advanced',
  'false',
  'retry does not advance S5 twice'
);

reset role;

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id = progress.owner_id
    where binding.auth_user_id =
      '70000000-0000-4000-8000-000000000001'
  ),
  6::bigint,
  'idempotent retry does not increment progress twice'
);

reset role;

-- ---------------------------------------------------------------------------
-- Current-Owner isolation
-- ---------------------------------------------------------------------------

reset role;

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id = progress.owner_id
    where binding.auth_user_id =
      '70000000-0000-4000-8000-000000000002'
  ),
  'relevant_first_job',
  'advancing Owner A does not mutate Owner B progress'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress as progress
    join core.owner_auth_bindings as binding
      on binding.owner_id = progress.owner_id
    where binding.auth_user_id =
      '70000000-0000-4000-8000-000000000002'
  ),
  5::bigint,
  'Owner B progress revision remains unchanged'
);

-- ---------------------------------------------------------------------------
-- Corrupt prerequisite fails closed
-- ---------------------------------------------------------------------------

delete from core.identity_layout_working
where owner_id = (
  select binding.owner_id
  from core.owner_auth_bindings as binding
  where binding.auth_user_id =
    '70000000-0000-4000-8000-000000000004'
);

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000004"}';

select is(
  api.resolve_current_relevant_first_job_state()
    ->> 'status',
  'prerequisite_missing',
  'S5 resolver fails closed when required Layout Working is missing'
);

select is(
  api.advance_current_owner_relevant_first_job(5)
    ->> 'status',
  'prerequisite_missing',
  'S5 advancement fails closed when required Layout Working is missing'
);

-- ---------------------------------------------------------------------------
-- S5 advancement does not publish or complete onboarding
-- ---------------------------------------------------------------------------

reset role;

select is(
  (
    select owner_record.onboarding_completed_at
    from core.owners as owner_record
    join core.owner_auth_bindings as binding
      on binding.owner_id = owner_record.id
    where binding.auth_user_id =
      '70000000-0000-4000-8000-000000000001'
  ),
  null::timestamptz,
  'S5 advancement does not complete onboarding'
);

select is(
  (
    select identity_record.revision
    from core.identity_working as identity_record
    join core.owner_auth_bindings as binding
      on binding.owner_id = identity_record.owner_id
    where binding.auth_user_id =
      '70000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'S5 advancement does not mutate Identity Working'
);

select is(
  (
    select layout_record.revision
    from core.identity_layout_working as layout_record
    join core.owner_auth_bindings as binding
      on binding.owner_id = layout_record.owner_id
    where binding.auth_user_id =
      '70000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'S5 advancement does not mutate Layout Working'
);

select * from finish();

rollback;
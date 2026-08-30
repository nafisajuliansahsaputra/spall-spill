begin;

select plan(24);

-- ---------------------------------------------------------------------------
-- Dedicated API boundary
-- ---------------------------------------------------------------------------

select ok(
  has_schema_privilege('authenticated', 'api', 'USAGE'),
  'authenticated can use dedicated api schema'
);

select ok(
  not has_schema_privilege('anon', 'api', 'USAGE'),
  'anon cannot use dedicated api schema'
);

select ok(
  to_regprocedure(
    'api.resolve_current_owner_state()'
  ) is not null,
  'Owner-state resolver function exists'
);

select ok(
  (
    select p.pronargs = 0
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.proname = 'resolve_current_owner_state'
  ),
  'Owner-state resolver accepts zero arguments'
);

select ok(
  (
    select p.prorettype = 'jsonb'::regtype
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.proname = 'resolve_current_owner_state'
      and p.pronargs = 0
  ),
  'Owner-state resolver returns jsonb'
);

select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.proname = 'resolve_current_owner_state'
      and p.pronargs = 0
  ),
  'Owner-state resolver is SECURITY DEFINER'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    cross join lateral unnest(
      coalesce(p.proconfig, array[]::text[])
    ) as config(value)
    where n.nspname = 'api'
      and p.proname = 'resolve_current_owner_state'
      and p.pronargs = 0
      and config.value ~ '^search_path=(""){0,1}$'
  ),
  'Owner-state resolver has an empty fixed search_path'
);

select ok(
  not exists (
    select 1
    from information_schema.routine_privileges rp
    where rp.routine_schema = 'api'
      and rp.routine_name = 'resolve_current_owner_state'
      and rp.grantee = 'PUBLIC'
      and rp.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute Owner-state resolver'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.resolve_current_owner_state()',
    'EXECUTE'
  ),
  'anon cannot execute Owner-state resolver'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.resolve_current_owner_state()',
    'EXECUTE'
  ),
  'authenticated can execute Owner-state resolver'
);

select ok(
  not has_schema_privilege(
    'authenticated',
    'core',
    'USAGE'
  ),
  'authenticated still cannot use private core schema'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.owners',
    'SELECT'
  ),
  'authenticated still cannot directly read canonical Owner rows'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.owner_auth_bindings',
    'SELECT'
  ),
  'authenticated still cannot directly read Auth bindings'
);

-- ---------------------------------------------------------------------------
-- Resolver behavior without canonical Owner authority
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{}';

select is(
  api.resolve_current_owner_state() ->> 'status',
  'unauthenticated',
  'missing authenticated principal resolves unauthenticated'
);

set local request.jwt.claims =
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000099"}';

select is(
  api.resolve_current_owner_state() ->> 'status',
  'owner_missing',
  'authenticated identity without Owner binding fails closed'
);

-- ---------------------------------------------------------------------------
-- Canonical Owner fixtures
--
-- Inserts into auth.users intentionally exercise the provisioning trigger.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id,
  email
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'resolver-incomplete@example.test'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'resolver-active@example.test'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'resolver-restricted@example.test'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'resolver-suspended@example.test'
  );

update core.owners as owner_record
set onboarding_completed_at = now()
from core.owner_auth_bindings as binding
where binding.owner_id = owner_record.id
  and binding.auth_user_id in (
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004'
  );

update core.owners as owner_record
set account_state = 'restricted'
from core.owner_auth_bindings as binding
where binding.owner_id = owner_record.id
  and binding.auth_user_id =
    '10000000-0000-4000-8000-000000000003';

update core.owners as owner_record
set account_state = 'suspended'
from core.owner_auth_bindings as binding
where binding.owner_id = owner_record.id
  and binding.auth_user_id =
    '10000000-0000-4000-8000-000000000004';

-- Capture canonical fixture IDs while the test still runs as postgres.
--
-- These transaction-local settings let later authenticated assertions compare
-- resolver output without granting authenticated any access to private core
-- tables merely for the sake of the test.

do $$
declare
  incomplete_owner_id text;
  active_owner_id text;
begin
  select binding.owner_id::text
  into incomplete_owner_id
  from core.owner_auth_bindings as binding
  where binding.auth_user_id =
    '10000000-0000-4000-8000-000000000001';

  select binding.owner_id::text
  into active_owner_id
  from core.owner_auth_bindings as binding
  where binding.auth_user_id =
    '10000000-0000-4000-8000-000000000002';

  perform set_config(
    'spall_test.incomplete_owner_id',
    incomplete_owner_id,
    true
  );

  perform set_config(
    'spall_test.active_owner_id',
    active_owner_id,
    true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute the public RPC exactly as an authenticated database role.
-- ---------------------------------------------------------------------------

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Active + onboarding incomplete
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000001"}';

select is(
  api.resolve_current_owner_state() ->> 'status',
  'onboarding_incomplete',
  'Active Owner without onboarding completion resolves incomplete'
);

select is(
  api.resolve_current_owner_state() ->> 'owner_id',
  current_setting(
    'spall_test.incomplete_owner_id',
    true
  ),
  'incomplete resolver result returns canonical Owner ID'
);

select is(
  api.resolve_current_owner_state() ->> 'account_state',
  'active',
  'incomplete resolver result retains authoritative active state'
);

select is(
  (
    api.resolve_current_owner_state()
      ->> 'onboarding_completed'
  )::boolean,
  false,
  'incomplete resolver reports onboarding incomplete'
);

-- ---------------------------------------------------------------------------
-- Active + onboarding complete
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000002"}';

select is(
  api.resolve_current_owner_state() ->> 'status',
  'active',
  'Active Owner with completed onboarding resolves active'
);

select is(
  api.resolve_current_owner_state() ->> 'owner_id',
  current_setting(
    'spall_test.active_owner_id',
    true
  ),
  'active resolver result returns canonical Owner ID'
);

select is(
  (
    api.resolve_current_owner_state()
      ->> 'onboarding_completed'
  )::boolean,
  true,
  'active resolver reports onboarding completed'
);

-- ---------------------------------------------------------------------------
-- Restriction precedence
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000003"}';

select is(
  api.resolve_current_owner_state() ->> 'status',
  'restricted',
  'restricted state takes precedence over completed onboarding'
);

-- ---------------------------------------------------------------------------
-- Suspension precedence
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000004"}';

select is(
  api.resolve_current_owner_state() ->> 'status',
  'suspended',
  'suspended state takes precedence over completed onboarding'
);

select * from finish();

rollback;

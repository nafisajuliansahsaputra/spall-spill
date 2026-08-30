begin;

select no_plan();

-- ---------------------------------------------------------------------------
-- Canonical Owner model
-- ---------------------------------------------------------------------------

select has_type(
  'core',
  'owner_account_state',
  'Owner account-state enum exists'
);

select ok(
  (
    select array_agg(e.enumlabel::text order by e.enumsortorder)
    from pg_enum e
    join pg_type t
      on t.oid = e.enumtypid
    join pg_namespace n
      on n.oid = t.typnamespace
    where n.nspname = 'core'
      and t.typname = 'owner_account_state'
  ) = array['active', 'restricted', 'suspended']::text[],
  'Owner account-state enum contains exactly the locked initial states'
);

select has_table(
  'core',
  'owners',
  'canonical Owner table exists'
);

select has_column(
  'core',
  'owners',
  'id',
  'Owner has stable application-owned id'
);

select has_column(
  'core',
  'owners',
  'account_state',
  'Owner has authoritative account state'
);

select has_column(
  'core',
  'owners',
  'onboarding_completed_at',
  'Owner has authoritative onboarding completion state'
);

select ok(
  (
    select column_default like '%gen_random_uuid%'
    from information_schema.columns
    where table_schema = 'core'
      and table_name = 'owners'
      and column_name = 'id'
  ),
  'Owner id is generated independently by the application database'
);

select ok(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'core'
      and table_name = 'owners'
      and column_name = 'account_state'
  ) like '%active%',
  'new Owner account state defaults to active'
);

select ok(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'core'
      and table_name = 'owners'
      and column_name = 'onboarding_completed_at'
  ),
  'onboarding completion starts nullable/incomplete'
);

-- ---------------------------------------------------------------------------
-- Auth principal -> canonical Owner binding
-- ---------------------------------------------------------------------------

select has_table(
  'core',
  'owner_auth_bindings',
  'Owner Auth binding table exists'
);

select has_column(
  'core',
  'owner_auth_bindings',
  'auth_user_id',
  'binding stores Supabase Auth user id'
);

select has_column(
  'core',
  'owner_auth_bindings',
  'owner_id',
  'binding stores stable Spall Spill Owner id'
);

select ok(
  exists (
    select 1
    from pg_constraint c
    where c.conname = 'owner_auth_bindings_auth_user_fk'
      and c.conrelid = 'core.owner_auth_bindings'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.contype = 'f'
  ),
  'Auth binding references auth.users primary identity table'
);

select ok(
  exists (
    select 1
    from pg_constraint c
    where c.conname = 'owner_auth_bindings_owner_fk'
      and c.conrelid = 'core.owner_auth_bindings'::regclass
      and c.confrelid = 'core.owners'::regclass
      and c.contype = 'f'
  ),
  'Auth binding references canonical Owner'
);

select ok(
  exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'core.owner_auth_bindings'::regclass
      and c.contype = 'p'
      and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (auth_user_id)'
  ),
  'one Auth user can resolve to at most one canonical Owner'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'core'
      and tablename = 'owner_auth_bindings'
      and indexname = 'owner_auth_bindings_owner_id_idx'
  ),
  'Owner binding supports authoritative Owner lookup'
);

-- ---------------------------------------------------------------------------
-- Private / deny-by-default boundary
-- ---------------------------------------------------------------------------

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'core.owners'::regclass
  ),
  'RLS is enabled on canonical Owner table'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'core.owner_auth_bindings'::regclass
  ),
  'RLS is enabled on Owner Auth binding table'
);

select ok(
  not has_schema_privilege('anon', 'core', 'USAGE'),
  'anon cannot use private core schema'
);

select ok(
  not has_schema_privilege('authenticated', 'core', 'USAGE'),
  'authenticated cannot use private core schema directly'
);

select ok(
  not has_table_privilege(
    'anon',
    'core.owners',
    'SELECT'
  ),
  'anon cannot directly read canonical Owner rows'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.owners',
    'SELECT'
  ),
  'authenticated cannot directly read canonical Owner rows'
);

select ok(
  not has_table_privilege(
    'anon',
    'core.owner_auth_bindings',
    'SELECT'
  ),
  'anon cannot directly read Auth bindings'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.owner_auth_bindings',
    'SELECT'
  ),
  'authenticated cannot directly read Auth bindings'
);

-- ---------------------------------------------------------------------------
-- Provisioning trigger security
-- ---------------------------------------------------------------------------

select ok(
  to_regprocedure(
    'core.provision_owner_for_auth_user()'
  ) is not null,
  'private Owner provisioning trigger function exists'
);

select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'core'
      and p.proname = 'provision_owner_for_auth_user'
      and p.pronargs = 0
  ),
  'Owner provisioning function is SECURITY DEFINER'
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
    where n.nspname = 'core'
      and p.proname = 'provision_owner_for_auth_user'
      and p.pronargs = 0
      and config.value ~ '^search_path=(""){0,1}$'
  ),
  'Owner provisioning function has an empty fixed search_path'
);

select ok(
  not exists (
    select 1
    from information_schema.routine_privileges rp
    where rp.routine_schema = 'core'
      and rp.routine_name = 'provision_owner_for_auth_user'
      and rp.grantee = 'PUBLIC'
      and rp.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot invoke Owner provisioning function directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'core.provision_owner_for_auth_user()',
    'EXECUTE'
  ),
  'anon cannot invoke Owner provisioning function directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'core.provision_owner_for_auth_user()',
    'EXECUTE'
  ),
  'authenticated cannot invoke Owner provisioning function directly'
);

select ok(
  exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'on_auth_user_created_provision_owner'
      and not t.tgisinternal
  ),
  'auth.users has canonical Owner provisioning trigger'
);

select * from finish();

rollback;

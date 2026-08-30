begin;

select plan(21);

-- ---------------------------------------------------------------------------
-- Architectural schema boundaries
-- ---------------------------------------------------------------------------

select has_schema(
  'core',
  'core schema exists'
);

select has_schema(
  'publication',
  'publication schema exists'
);

select has_schema(
  'analytics',
  'analytics schema exists'
);

select has_schema(
  'moderation',
  'moderation schema exists'
);

select has_schema(
  'audit',
  'audit schema exists'
);

select has_schema(
  'ops',
  'ops schema exists'
);

select has_schema(
  'api',
  'api schema exists'
);

-- ---------------------------------------------------------------------------
-- Deny-by-default client access
--
-- Canonical/private schemas remain unavailable to normal client roles.
--
-- The dedicated api schema is the intentional narrow application Data API
-- boundary. authenticated receives schema USAGE only after an implementation
-- migration explicitly grants it. Individual api objects still require their
-- own explicit grants.
-- ---------------------------------------------------------------------------

select ok(
  not has_schema_privilege('anon', 'core', 'USAGE'),
  'anon cannot use core schema'
);

select ok(
  not has_schema_privilege('authenticated', 'core', 'USAGE'),
  'authenticated cannot use core schema'
);

select ok(
  not has_schema_privilege('anon', 'publication', 'USAGE'),
  'anon cannot use publication schema by default'
);

select ok(
  not has_schema_privilege(
    'authenticated',
    'publication',
    'USAGE'
  ),
  'authenticated cannot use publication schema by default'
);

select ok(
  not has_schema_privilege('anon', 'analytics', 'USAGE'),
  'anon cannot use analytics schema'
);

select ok(
  not has_schema_privilege(
    'authenticated',
    'analytics',
    'USAGE'
  ),
  'authenticated cannot use analytics schema'
);

select ok(
  not has_schema_privilege('anon', 'moderation', 'USAGE'),
  'anon cannot use moderation schema'
);

select ok(
  not has_schema_privilege(
    'authenticated',
    'moderation',
    'USAGE'
  ),
  'authenticated cannot use moderation schema'
);

select ok(
  not has_schema_privilege('anon', 'audit', 'USAGE'),
  'anon cannot use audit schema'
);

select ok(
  not has_schema_privilege(
    'authenticated',
    'audit',
    'USAGE'
  ),
  'authenticated cannot use audit schema'
);

select ok(
  not has_schema_privilege('anon', 'ops', 'USAGE'),
  'anon cannot use ops schema'
);

select ok(
  not has_schema_privilege(
    'authenticated',
    'ops',
    'USAGE'
  ),
  'authenticated cannot use ops schema'
);

select ok(
  not has_schema_privilege('anon', 'api', 'USAGE'),
  'anon cannot use dedicated api schema'
);

select ok(
  has_schema_privilege('authenticated', 'api', 'USAGE'),
  'authenticated can use dedicated api schema'
);

select * from finish();

rollback;

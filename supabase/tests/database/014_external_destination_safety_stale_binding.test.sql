begin;

select no_plan();

select ok(
  to_regprocedure(
    'api.record_external_destination_safety_bound_server(text,text,bigint,text,text[],text,integer)'
  ) is not null,
  'stale-bound scanner verdict RPC exists'
);

select ok(
  (
    select p.prosecdef
    from pg_proc as p
    where p.oid =
      'api.record_external_destination_safety_bound_server(text,text,bigint,text,text[],text,integer)'
        ::regprocedure
  ),
  'stale-bound scanner verdict RPC is SECURITY DEFINER'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'api.record_external_destination_safety_bound_server(text,text,bigint,text,text[],text,integer)',
    'EXECUTE'
  ),
  'authenticated cannot call stale-bound scanner writer'
);

select ok(
  has_function_privilege(
    'service_role',
    'api.record_external_destination_safety_bound_server(text,text,bigint,text,text[],text,integer)',
    'EXECUTE'
  ),
  'service role may call stale-bound scanner writer'
);

-- --------------------------------------------------------------
-- Internal role check
-- --------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated"}',
  true
);

select is(
  api.record_external_destination_safety_bound_server(
    'https://missing.example.test/',
    repeat('0', 64),
    1,
    'safe',
    '{}'::text[],
    'spall-url-safety-v1',
    3600
  ) ->> 'status',
  'unauthorized',
  'bound writer rejects non-service JWT authority'
);

select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

-- --------------------------------------------------------------
-- Correct exact binding succeeds
-- --------------------------------------------------------------

create temporary table safety_binding_probe (
  normalized_url text primary key,
  url_hash text not null,
  revision bigint not null
) on commit drop;

with pending as (
  select
    api.ensure_external_destination_pending_server(
      'https://bound-success.example.test/',
      '{}'::text[]
    ) as result
)
insert into safety_binding_probe (
  normalized_url,
  url_hash,
  revision
)
select
  'https://bound-success.example.test/',
  result ->> 'url_hash',
  (result ->> 'revision')::bigint
from pending;

select is(
  api.record_external_destination_safety_bound_server(
    'https://bound-success.example.test/',
    (
      select url_hash
      from safety_binding_probe
      where normalized_url =
        'https://bound-success.example.test/'
    ),
    (
      select revision
      from safety_binding_probe
      where normalized_url =
        'https://bound-success.example.test/'
    ),
    'safe',
    '{}'::text[],
    'spall-url-safety-v1',
    3600
  ) ->> 'status',
  'success',
  'exact URL hash and revision binding may complete pending scan'
);

-- --------------------------------------------------------------
-- Wrong hash fails closed
-- --------------------------------------------------------------

with pending as (
  select
    api.ensure_external_destination_pending_server(
      'https://bound-hash.example.test/',
      '{}'::text[]
    ) as result
)
insert into safety_binding_probe (
  normalized_url,
  url_hash,
  revision
)
select
  'https://bound-hash.example.test/',
  result ->> 'url_hash',
  (result ->> 'revision')::bigint
from pending;

select is(
  api.record_external_destination_safety_bound_server(
    'https://bound-hash.example.test/',
    repeat('f', 64),
    (
      select revision
      from safety_binding_probe
      where normalized_url =
        'https://bound-hash.example.test/'
    ),
    'safe',
    '{}'::text[],
    'spall-url-safety-v1',
    3600
  ) ->> 'status',
  'stale_url_hash',
  'scanner verdict cannot cross exact URL hash identity'
);

-- --------------------------------------------------------------
-- Revision changed while scanning fails closed
-- --------------------------------------------------------------

with pending as (
  select
    api.ensure_external_destination_pending_server(
      'https://bound-revision.example.test/',
      '{}'::text[]
    ) as result
)
insert into safety_binding_probe (
  normalized_url,
  url_hash,
  revision
)
select
  'https://bound-revision.example.test/',
  result ->> 'url_hash',
  (result ->> 'revision')::bigint
from pending;

update core.external_destination_safety
set
  revision =
    revision + 1,
  updated_at =
    now()
where
  normalized_url =
    'https://bound-revision.example.test/';

select is(
  api.record_external_destination_safety_bound_server(
    'https://bound-revision.example.test/',
    (
      select url_hash
      from safety_binding_probe
      where normalized_url =
        'https://bound-revision.example.test/'
    ),
    (
      select revision
      from safety_binding_probe
      where normalized_url =
        'https://bound-revision.example.test/'
    ),
    'safe',
    '{}'::text[],
    'spall-url-safety-v1',
    3600
  ) ->> 'status',
  'stale_revision',
  'late scanner verdict cannot overwrite a newer revision'
);

-- --------------------------------------------------------------
-- Completed state cannot be overwritten
-- --------------------------------------------------------------

with pending as (
  select
    api.ensure_external_destination_pending_server(
      'https://bound-state.example.test/',
      '{}'::text[]
    ) as result
)
insert into safety_binding_probe (
  normalized_url,
  url_hash,
  revision
)
select
  'https://bound-state.example.test/',
  result ->> 'url_hash',
  (result ->> 'revision')::bigint
from pending;

select is(
  api.record_external_destination_safety_bound_server(
    'https://bound-state.example.test/',
    (
      select url_hash
      from safety_binding_probe
      where normalized_url =
        'https://bound-state.example.test/'
    ),
    (
      select revision
      from safety_binding_probe
      where normalized_url =
        'https://bound-state.example.test/'
    ),
    'review',
    array['content:manual_review']::text[],
    'spall-url-safety-v1',
    3600
  ) ->> 'status',
  'success',
  'first completed verdict succeeds'
);

select is(
  api.record_external_destination_safety_bound_server(
    'https://bound-state.example.test/',
    (
      select url_hash
      from safety_binding_probe
      where normalized_url =
        'https://bound-state.example.test/'
    ),
    (
      select revision + 1
      from safety_binding_probe
      where normalized_url =
        'https://bound-state.example.test/'
    ),
    'safe',
    '{}'::text[],
    'spall-url-safety-v1',
    3600
  ) ->> 'status',
  'stale_state',
  'completed verdict cannot be overwritten without new pending registration'
);

select * from finish();

rollback;
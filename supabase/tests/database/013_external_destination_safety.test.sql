begin;

select no_plan();

-- ===========================================================================
-- External Destination Safety
-- ===========================================================================

select ok(
  to_regtype(
    'core.external_destination_safety_status'
  ) is not null,
  'external destination safety enum exists'
);

select ok(
  to_regclass(
    'core.external_destination_safety'
  ) is not null,
  'private external destination safety table exists'
);

select ok(
  to_regprocedure(
    'api.ensure_external_destination_pending_server(text,text[])'
  ) is not null,
  'pending registration RPC exists'
);

select ok(
  to_regprocedure(
    'api.record_external_destination_safety_server(text,text,text[],text,integer)'
  ) is not null,
  'scanner verdict RPC exists'
);

select ok(
  to_regprocedure(
    'api.resolve_external_destination_safety_server(text)'
  ) is not null,
  'safety resolver RPC exists'
);

select ok(
  (
    select p.prosecdef
    from pg_proc as p
    where p.oid =
      'api.ensure_external_destination_pending_server(text,text[])'
        ::regprocedure
  ),
  'pending registration RPC is SECURITY DEFINER'
);

select ok(
  (
    select p.prosecdef
    from pg_proc as p
    where p.oid =
      'api.record_external_destination_safety_server(text,text,text[],text,integer)'
        ::regprocedure
  ),
  'scanner verdict RPC is SECURITY DEFINER'
);

select ok(
  (
    select p.prosecdef
    from pg_proc as p
    where p.oid =
      'api.resolve_external_destination_safety_server(text)'
        ::regprocedure
  ),
  'safety resolver is SECURITY DEFINER'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'api.ensure_external_destination_pending_server(text,text[])',
    'EXECUTE'
  ),
  'authenticated cannot register safety records'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'api.record_external_destination_safety_server(text,text,text[],text,integer)',
    'EXECUTE'
  ),
  'authenticated cannot write scanner verdicts'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'api.resolve_external_destination_safety_server(text)',
    'EXECUTE'
  ),
  'authenticated cannot call private safety resolver'
);

select ok(
  has_function_privilege(
    'service_role',
    'api.ensure_external_destination_pending_server(text,text[])',
    'EXECUTE'
  ),
  'service role may register pending destinations'
);

select ok(
  not has_function_privilege(
    'service_role',
    'api.record_external_destination_safety_server(text,text,text[],text,integer)',
    'EXECUTE'
  ),
  'service role cannot bypass stale-bound scanner verdict writer'
);

select ok(
  has_function_privilege(
    'service_role',
    'api.resolve_external_destination_safety_server(text)',
    'EXECUTE'
  ),
  'service role may resolve safety state'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.external_destination_safety',
    'SELECT'
  ),
  'authenticated cannot read safety table directly'
);

select ok(
  not has_table_privilege(
    'service_role',
    'core.external_destination_safety',
    'SELECT'
  ),
  'service role receives RPC authority rather than direct table read'
);

select ok(
  not has_table_privilege(
    'service_role',
    'core.external_destination_safety',
    'INSERT'
  ),
  'service role cannot directly insert safety rows'
);

select ok(
  not has_table_privilege(
    'service_role',
    'core.external_destination_safety',
    'UPDATE'
  ),
  'service role cannot directly forge safety verdicts'
);

-- ---------------------------------------------------------------------------
-- Missing state is fail closed
-- ---------------------------------------------------------------------------

set local role service_role;
set local request.jwt.claims =
  '{"role":"service_role"}';

select is(
  api.resolve_external_destination_safety_server(
    'https://missing.example.test/item'
  ) ->> 'status',
  'missing',
  'unknown exact URL is missing'
);

select is(
  api.resolve_external_destination_safety_server(
    'https://missing.example.test/item'
  ) ->> 'safety_status',
  'pending',
  'unknown exact URL resolves as pending'
);

select is(
  api.resolve_external_destination_safety_server(
    'https://missing.example.test/item'
  ) ->> 'requires_scan',
  'true',
  'unknown exact URL requires a scan'
);

-- ---------------------------------------------------------------------------
-- Registration
-- ---------------------------------------------------------------------------

select is(
  api.ensure_external_destination_pending_server(
    'https://shop.example.test/item?a=1&b=2',
    '{}'::text[]
  ) ->> 'status',
  'success',
  'ordinary exact URL may be registered'
);

select is(
  api.ensure_external_destination_pending_server(
    'https://shop.example.test/item?a=1&b=2',
    '{}'::text[]
  ) ->> 'safety_status',
  'pending',
  'new destination starts pending'
);

select is(
  length(
    api.ensure_external_destination_pending_server(
      'https://shop.example.test/item?a=1&b=2',
      '{}'::text[]
    ) ->> 'url_hash'
  ),
  64,
  'destination receives SHA-256 URL identity'
);

select is(
  api.ensure_external_destination_pending_server(
    'https://xn--e1afmkfd.xn--p1ai/',
    array['punycode_hostname']::text[]
  ) ->> 'safety_status',
  'pending',
  'punycode URL remains pending for downstream review'
);

select is(
  api.ensure_external_destination_pending_server(
    'javascript:alert(1)',
    '{}'::text[]
  ) ->> 'status',
  'invalid_destination',
  'dangerous scheme is rejected at DB boundary too'
);

select is(
  api.ensure_external_destination_pending_server(
    'https://user@example.test/item',
    '{}'::text[]
  ) ->> 'status',
  'invalid_destination',
  'credential-bearing authority is rejected at DB boundary'
);

select is(
  api.ensure_external_destination_pending_server(
    'https://example.test:8443/item',
    '{}'::text[]
  ) ->> 'status',
  'invalid_destination',
  'non-standard port is rejected at DB boundary'
);

select is(
  api.ensure_external_destination_pending_server(
    'https://example.test/item',
    array['unknown_signal']::text[]
  ) ->> 'status',
  'invalid_risk_signals',
  'unknown policy risk signal is rejected'
);

-- ---------------------------------------------------------------------------
-- Scanner verdict

/*
 * Legacy writer is internal-only now.
 * Run its direct behavior tests as the DB owner while
 * request.jwt.claims remains service_role for auth.role().
 */
reset role;
-- ---------------------------------------------------------------------------

select is(
  api.record_external_destination_safety_server(
    'https://not-registered.example.test/',
    'safe',
    '{}'::text[],
    'spall-url-safety-v1',
    3600
  ) ->> 'status',
  'destination_missing',
  'scanner cannot forge verdict for unregistered destination'
);

select is(
  api.record_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2',
    'pending',
    '{}'::text[],
    'spall-url-safety-v1',
    3600
  ) ->> 'status',
  'invalid_safety_status',
  'scanner cannot record pending as a completed verdict'
);

select is(
  api.record_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2',
    'blocked',
    '{}'::text[],
    'spall-url-safety-v1',
    3600
  ) ->> 'status',
  'reason_required',
  'blocked verdict requires a reason'
);

select is(
  api.record_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2',
    'safe',
    '{}'::text[],
    'spall-url-safety-v1',
    3600
  ) ->> 'status',
  'success',
  'scanner may record an aggregate safe verdict'
);

select is(
  api.resolve_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2'
  ) ->> 'safety_status',
  'safe',
  'unexpired safe verdict resolves safe'
);

select is(
  api.resolve_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2'
  ) ->> 'requires_scan',
  'false',
  'unexpired safe verdict does not require immediate rescan'
);

select ok(
  not (
    api.resolve_external_destination_safety_server(
      'https://shop.example.test/item?a=1&b=2'
    ) ? 'normalized_url'
  ),
  'private resolver does not echo normalized destination URL'
);

-- ---------------------------------------------------------------------------
-- Exact URL identity / TOCTOU protection
-- ---------------------------------------------------------------------------

select is(
  api.resolve_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=3'
  ) ->> 'status',
  'missing',
  'different query value does not inherit safe verdict'
);

select isnt(
  api.ensure_external_destination_pending_server(
    'https://shop.example.test/item?a=1&b=3',
    '{}'::text[]
  ) ->> 'url_hash',
  api.ensure_external_destination_pending_server(
    'https://shop.example.test/item?a=1&b=2',
    '{}'::text[]
  ) ->> 'url_hash',
  'different exact normalized URLs receive different hashes'
);

-- ---------------------------------------------------------------------------
-- Expiry is fail closed
-- ---------------------------------------------------------------------------

reset role;

update core.external_destination_safety
set
  checked_at =
    now() - interval '2 hours',
  expires_at =
    now() - interval '1 hour'
where
  normalized_url =
    'https://shop.example.test/item?a=1&b=2';

set local role service_role;
set local request.jwt.claims =
  '{"role":"service_role"}';

select is(
  api.resolve_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2'
  ) ->> 'safety_status',
  'pending',
  'expired safe verdict fails closed as pending'
);

select is(
  api.resolve_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2'
  ) ->> 'stored_safety_status',
  'safe',
  'resolver preserves expired stored verdict only as evidence'
);

select is(
  api.resolve_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2'
  ) ->> 'requires_scan',
  'true',
  'expired verdict requires rescan'
);

select is(
  api.resolve_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2'
  ) ->> 'expired',
  'true',
  'expired verdict is explicitly marked expired'
);

select is(
  api.ensure_external_destination_pending_server(
    'https://shop.example.test/item?a=1&b=2',
    '{}'::text[]
  ) ->> 'safety_status',
  'pending',
  're-registration converts expired verdict into authoritative pending state'
);

select is(
  api.resolve_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2'
  ) ->> 'expired',
  'false',
  'pending state no longer pretends an expired verdict is current'
);

-- ---------------------------------------------------------------------------
-- Blocked / review state

/*
 * Legacy writer is internal-only.
 * Exercise its direct behavior as DB owner while preserving
 * service_role JWT claims for auth.role().
 */
reset role;
-- ---------------------------------------------------------------------------

select is(
  api.record_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2',
    'blocked',
    array[
      'malware',
      'social_engineering',
      'malware'
    ]::text[],
    'spall-url-safety-v1',
    86400
  ) ->> 'status',
  'success',
  'scanner may record blocked aggregate verdict'
);

select is(
  api.resolve_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2'
  ) ->> 'safety_status',
  'blocked',
  'blocked URL resolves blocked'
);

select is(
  api.resolve_external_destination_safety_server(
    'https://shop.example.test/item?a=1&b=2'
  ) ->> 'requires_scan',
  'false',
  'unexpired blocked verdict is authoritative'
);

select is(
  (
    api.resolve_external_destination_safety_server(
      'https://shop.example.test/item?a=1&b=2'
    ) -> 'reason_codes'
  )::text,
  '["malware", "social_engineering"]',
  'reason codes are normalized and deduplicated'
);

select * from finish();

rollback;
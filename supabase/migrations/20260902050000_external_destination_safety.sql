-- External Destination Safety foundation.
--
-- Private aggregate safety verdict for an exact normalized URL.
-- Draft content may exist without a safe verdict, but later publication /
-- clickability must require an unexpired "safe" result.
--
-- Safety states:
--   pending -> requires scan / fail closed
--   safe    -> may become eligible for publication/clickability
--   review  -> requires human/policy review
--   blocked -> explicitly unsafe
--
-- URL changes create a different SHA-256 identity. An expired verdict is
-- resolved as pending without ever being treated as safe.

create extension if not exists pgcrypto
  with schema extensions;

create type core.external_destination_safety_status
as enum (
  'pending',
  'safe',
  'review',
  'blocked'
);

create table core.external_destination_safety (
  id uuid primary key
    default gen_random_uuid(),

  normalized_url text not null unique,

  url_hash text
    not null,

  safety_status
    core.external_destination_safety_status
    not null
    default 'pending',

  risk_signals text[]
    not null
    default '{}'::text[],

  reason_codes text[]
    not null
    default '{}'::text[],

  scanner_version text,

  checked_at timestamptz,
  expires_at timestamptz,

  revision bigint
    not null
    default 1,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint external_destination_url_hash_unique
    unique (url_hash),

  constraint external_destination_url_hash_shape
    check (
      url_hash ~
        '^[0-9a-f]{64}$'
    ),

  constraint external_destination_url_length
    check (
      length(normalized_url)
        between 8 and 2048
    ),

  constraint external_destination_url_trimmed
    check (
      normalized_url =
        btrim(normalized_url)
    ),

  constraint external_destination_url_no_whitespace_or_control
    check (
      normalized_url !~
        '[[:space:][:cntrl:]]'
    ),

  constraint external_destination_url_no_backslash
    check (
      position(
        E'\\'
        in normalized_url
      ) = 0
    ),

  constraint external_destination_url_no_fragment
    check (
      position(
        '#'
        in normalized_url
      ) = 0
    ),

  constraint external_destination_url_http_only
    check (
      normalized_url ~
        '^https?://'
    ),

  constraint external_destination_risk_signals_known
    check (
      risk_signals <@
        array[
          'http_transport',
          'punycode_hostname'
        ]::text[]
    ),

  constraint external_destination_revision_positive
    check (
      revision > 0
    ),

  constraint external_destination_pending_shape
    check (
      (
        safety_status =
          'pending'::core.external_destination_safety_status
        and checked_at is null
        and expires_at is null
        and scanner_version is null
        and cardinality(reason_codes) = 0
      )
      or
      (
        safety_status <>
          'pending'::core.external_destination_safety_status
        and checked_at is not null
        and expires_at is not null
        and expires_at > checked_at
        and scanner_version is not null
      )
    ),

  constraint external_destination_unsafe_reason_required
    check (
      safety_status not in (
        'review'::core.external_destination_safety_status,
        'blocked'::core.external_destination_safety_status
      )
      or cardinality(reason_codes) > 0
    )
);

create index external_destination_safety_scan_index
  on core.external_destination_safety (
    safety_status,
    expires_at
  );

alter table
  core.external_destination_safety
enable row level security;

revoke all
  on table core.external_destination_safety
  from
    public,
    anon,
    authenticated,
    service_role;

-- ---------------------------------------------------------------------------
-- Register / refresh a destination as pending
-- ---------------------------------------------------------------------------

create function api.ensure_external_destination_pending_server(
  input_normalized_url text,
  input_risk_signals text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_authority text;
  normalized_risk_signals text[];

  destination_record
    core.external_destination_safety%rowtype;
begin
  if
    coalesce(
      auth.role(),
      ''
    ) <> 'service_role'
  then
    return jsonb_build_object(
      'status',
      'unauthorized'
    );
  end if;

  if
    input_normalized_url is null
    or length(input_normalized_url)
      not between 8 and 2048
    or input_normalized_url <>
      btrim(input_normalized_url)
    or input_normalized_url ~
      '[[:space:][:cntrl:]]'
    or position(
      E'\\'
      in input_normalized_url
    ) > 0
    or position(
      '#'
      in input_normalized_url
    ) > 0
    or input_normalized_url !~
      '^https?://'
  then
    return jsonb_build_object(
      'status',
      'invalid_destination'
    );
  end if;

  resolved_authority :=
    split_part(
      split_part(
        split_part(
          input_normalized_url,
          '://',
          2
        ),
        '/',
        1
      ),
      '?',
      1
    );

  if
    resolved_authority = ''
    or resolved_authority <>
      lower(resolved_authority)
    or position(
      '@'
      in resolved_authority
    ) > 0
    or position(
      ':'
      in resolved_authority
    ) > 0
    or position(
      '.'
      in resolved_authority
    ) = 0
    or resolved_authority ~
      '^[0-9.]+$'
    or resolved_authority =
      'localhost'
    or resolved_authority like
      '%.localhost'
    or resolved_authority like
      '%.local'
    or resolved_authority like
      '%.internal'
    or resolved_authority =
      'home.arpa'
    or resolved_authority like
      '%.home.arpa'
  then
    return jsonb_build_object(
      'status',
      'invalid_destination'
    );
  end if;

  if exists (
    select 1
    from unnest(
      coalesce(
        input_risk_signals,
        '{}'::text[]
      )
    ) as signal(value)
    where
      signal.value is null
      or signal.value not in (
        'http_transport',
        'punycode_hostname'
      )
  ) then
    return jsonb_build_object(
      'status',
      'invalid_risk_signals'
    );
  end if;

  select
    coalesce(
      array_agg(
        distinct signal.value
        order by signal.value
      ),
      '{}'::text[]
    )
  into normalized_risk_signals
  from unnest(
    coalesce(
      input_risk_signals,
      '{}'::text[]
    )
  ) as signal(value);

  insert into
    core.external_destination_safety (
      normalized_url,
      url_hash,
      risk_signals
    )
  values (
    input_normalized_url,
    encode(
      extensions.digest(
        input_normalized_url,
        'sha256'
      ),
      'hex'
    ),
    normalized_risk_signals
  )
  on conflict (normalized_url)
  do nothing;

  select destination.*
  into destination_record
  from core.external_destination_safety
    as destination
  where
    destination.normalized_url =
      input_normalized_url
  for update;

  if
    destination_record.risk_signals
      is distinct from
        normalized_risk_signals
    or (
      destination_record.safety_status <>
        'pending'::core.external_destination_safety_status
      and destination_record.expires_at <=
        now()
    )
  then
    update core.external_destination_safety
    set
      safety_status =
        'pending'::core.external_destination_safety_status,
      risk_signals =
        normalized_risk_signals,
      reason_codes =
        '{}'::text[],
      scanner_version =
        null,
      checked_at =
        null,
      expires_at =
        null,
      revision =
        revision + 1,
      updated_at =
        now()
    where
      id =
        destination_record.id
    returning *
    into destination_record;
  end if;

  return jsonb_build_object(
    'status',
    'success',
    'url_hash',
    destination_record.url_hash,
    'safety_status',
    destination_record.safety_status::text,
    'requires_scan',
    destination_record.safety_status =
      'pending'::core.external_destination_safety_status,
    'revision',
    destination_record.revision
  );
end;
$$;

revoke all
  on function
    api.ensure_external_destination_pending_server(
      text,
      text[]
    )
  from
    public,
    anon,
    authenticated,
    service_role;

grant execute
  on function
    api.ensure_external_destination_pending_server(
      text,
      text[]
    )
  to service_role;

-- ---------------------------------------------------------------------------
-- Record aggregate scanner verdict
-- ---------------------------------------------------------------------------

create function api.record_external_destination_safety_server(
  input_normalized_url text,
  input_safety_status text,
  input_reason_codes text[],
  input_scanner_version text,
  input_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_reason_codes text[];

  destination_record
    core.external_destination_safety%rowtype;
begin
  if
    coalesce(
      auth.role(),
      ''
    ) <> 'service_role'
  then
    return jsonb_build_object(
      'status',
      'unauthorized'
    );
  end if;

  if
    input_safety_status not in (
      'safe',
      'review',
      'blocked'
    )
  then
    return jsonb_build_object(
      'status',
      'invalid_safety_status'
    );
  end if;

  if
    input_scanner_version is null
    or input_scanner_version !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  then
    return jsonb_build_object(
      'status',
      'invalid_scanner_version'
    );
  end if;

  if
    input_ttl_seconds is null
    or input_ttl_seconds
      not between 60 and 604800
  then
    return jsonb_build_object(
      'status',
      'invalid_ttl'
    );
  end if;

  if exists (
    select 1
    from unnest(
      coalesce(
        input_reason_codes,
        '{}'::text[]
      )
    ) as reason(value)
    where
      reason.value is null
      or reason.value !~
        '^[a-z0-9][a-z0-9_:-]{0,63}$'
  ) then
    return jsonb_build_object(
      'status',
      'invalid_reason_codes'
    );
  end if;

  select
    coalesce(
      array_agg(
        distinct reason.value
        order by reason.value
      ),
      '{}'::text[]
    )
  into normalized_reason_codes
  from unnest(
    coalesce(
      input_reason_codes,
      '{}'::text[]
    )
  ) as reason(value);

  if
    input_safety_status in (
      'review',
      'blocked'
    )
    and cardinality(
      normalized_reason_codes
    ) = 0
  then
    return jsonb_build_object(
      'status',
      'reason_required'
    );
  end if;

  select destination.*
  into destination_record
  from core.external_destination_safety
    as destination
  where
    destination.normalized_url =
      input_normalized_url
  for update;

  if not found then
    return jsonb_build_object(
      'status',
      'destination_missing'
    );
  end if;

  update core.external_destination_safety
  set
    safety_status =
      input_safety_status::
        core.external_destination_safety_status,
    reason_codes =
      normalized_reason_codes,
    scanner_version =
      input_scanner_version,
    checked_at =
      now(),
    expires_at =
      now() +
        make_interval(
          secs =>
            input_ttl_seconds
        ),
    revision =
      revision + 1,
    updated_at =
      now()
  where
    id =
      destination_record.id
  returning *
  into destination_record;

  return jsonb_build_object(
    'status',
    'success',
    'url_hash',
    destination_record.url_hash,
    'safety_status',
    destination_record.safety_status::text,
    'reason_codes',
    to_jsonb(
      destination_record.reason_codes
    ),
    'checked_at',
    destination_record.checked_at,
    'expires_at',
    destination_record.expires_at,
    'revision',
    destination_record.revision
  );
end;
$$;

revoke all
  on function
    api.record_external_destination_safety_server(
      text,
      text,
      text[],
      text,
      integer
    )
  from
    public,
    anon,
    authenticated,
    service_role;

grant execute
  on function
    api.record_external_destination_safety_server(
      text,
      text,
      text[],
      text,
      integer
    )
  to service_role;

-- ---------------------------------------------------------------------------
-- Resolve effective safety state
-- ---------------------------------------------------------------------------

create function api.resolve_external_destination_safety_server(
  input_normalized_url text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  destination_record
    core.external_destination_safety%rowtype;

  verdict_expired boolean;
begin
  if
    coalesce(
      auth.role(),
      ''
    ) <> 'service_role'
  then
    return jsonb_build_object(
      'status',
      'unauthorized'
    );
  end if;

  select destination.*
  into destination_record
  from core.external_destination_safety
    as destination
  where
    destination.normalized_url =
      input_normalized_url;

  if not found then
    return jsonb_build_object(
      'status',
      'missing',
      'safety_status',
      'pending',
      'requires_scan',
      true
    );
  end if;

  if
    destination_record.safety_status =
      'pending'::core.external_destination_safety_status
  then
    return jsonb_build_object(
      'status',
      'success',
      'url_hash',
      destination_record.url_hash,
      'safety_status',
      'pending',
      'requires_scan',
      true,
      'expired',
      false,
      'risk_signals',
      to_jsonb(
        destination_record.risk_signals
      ),
      'reason_codes',
      '[]'::jsonb,
      'revision',
      destination_record.revision
    );
  end if;

  verdict_expired :=
    destination_record.expires_at <=
      now();

  if verdict_expired then
    return jsonb_build_object(
      'status',
      'success',
      'url_hash',
      destination_record.url_hash,
      'safety_status',
      'pending',
      'stored_safety_status',
      destination_record.safety_status::text,
      'requires_scan',
      true,
      'expired',
      true,
      'risk_signals',
      to_jsonb(
        destination_record.risk_signals
      ),
      'reason_codes',
      to_jsonb(
        destination_record.reason_codes
      ),
      'checked_at',
      destination_record.checked_at,
      'expires_at',
      destination_record.expires_at,
      'revision',
      destination_record.revision
    );
  end if;

  return jsonb_build_object(
    'status',
    'success',
    'url_hash',
    destination_record.url_hash,
    'safety_status',
    destination_record.safety_status::text,
    'requires_scan',
    false,
    'expired',
    false,
    'risk_signals',
    to_jsonb(
      destination_record.risk_signals
    ),
    'reason_codes',
    to_jsonb(
      destination_record.reason_codes
    ),
    'checked_at',
    destination_record.checked_at,
    'expires_at',
    destination_record.expires_at,
    'revision',
    destination_record.revision
  );
end;
$$;

revoke all
  on function
    api.resolve_external_destination_safety_server(
      text
    )
  from
    public,
    anon,
    authenticated,
    service_role;

grant execute
  on function
    api.resolve_external_destination_safety_server(
      text
    )
  to service_role;

comment on table
  core.external_destination_safety
is
  'Private aggregate safety verdict keyed to an exact normalized external URL. Missing, pending, or expired verdicts fail closed.';

comment on function
  api.ensure_external_destination_pending_server(
    text,
    text[]
  )
is
  'Service-only registration boundary for an exact normalized URL. Expired verdicts or changed policy risk signals become pending again.';

comment on function
  api.record_external_destination_safety_server(
    text,
    text,
    text[],
    text,
    integer
  )
is
  'Service-only aggregate scanner verdict writer for an already-registered exact normalized URL.';

comment on function
  api.resolve_external_destination_safety_server(
    text
  )
is
  'Service-only safety resolver. Missing and expired destinations resolve fail-closed as pending/requires_scan.';
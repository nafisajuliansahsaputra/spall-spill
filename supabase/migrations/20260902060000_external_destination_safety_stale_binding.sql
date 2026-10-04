-- ==============================================================
-- External destination safety stale-result binding
--
-- Scanner verdicts must be bound to the exact URL identity and
-- revision that existed before scanning started.
-- ==============================================================

create function api.record_external_destination_safety_bound_server(
  input_normalized_url text,
  input_expected_url_hash text,
  input_expected_revision bigint,
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
  destination_record
    core.external_destination_safety%rowtype;

  result jsonb;
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

  /*
   * Lock the exact registered URL row before checking
   * scanner identity. This lock remains held while the
   * existing trusted writer executes below, preventing
   * a concurrent revision change between check + write.
   */
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

  if
    input_expected_url_hash is null
    or input_expected_url_hash !~
      '^[0-9a-f]{64}$'
  then
    return jsonb_build_object(
      'status',
      'invalid_expected_url_hash'
    );
  end if;

  if
    input_expected_revision is null
    or input_expected_revision < 1
  then
    return jsonb_build_object(
      'status',
      'invalid_expected_revision'
    );
  end if;

  if
    destination_record.url_hash <>
      input_expected_url_hash
  then
    return jsonb_build_object(
      'status',
      'stale_url_hash'
    );
  end if;

  if
    destination_record.revision::bigint <>
      input_expected_revision
  then
    return jsonb_build_object(
      'status',
      'stale_revision'
    );
  end if;

  /*
   * Only a currently pending scan may be completed.
   * A completed/replaced state can never be overwritten
   * by a late scanner response.
   */
  if
    destination_record.safety_status <>
      'pending'::core.external_destination_safety_status
  then
    return jsonb_build_object(
      'status',
      'stale_state'
    );
  end if;

  /*
   * Input validation and actual mutation remain delegated
   * to the existing aggregate writer. The row lock above
   * remains active for the complete transaction.
   */
  result :=
    api.record_external_destination_safety_server(
      input_normalized_url,
      input_safety_status,
      input_reason_codes,
      input_scanner_version,
      input_ttl_seconds
    );

  return result;
end;
$$;

revoke all
  on function
    api.record_external_destination_safety_bound_server(
      text,
      text,
      bigint,
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
    api.record_external_destination_safety_bound_server(
      text,
      text,
      bigint,
      text,
      text[],
      text,
      integer
    )
  to service_role;

/*
 * The original aggregate writer remains an internal implementation
 * helper for the stale-bound SECURITY DEFINER function above.
 *
 * Service callers must not bypass URL hash, revision, and pending
 * state binding.
 */
revoke execute
  on function
    api.record_external_destination_safety_server(
      text,
      text,
      text[],
      text,
      integer
    )
  from service_role;

comment on function
  api.record_external_destination_safety_bound_server(
    text,
    text,
    bigint,
    text,
    text[],
    text,
    integer
  )
is
  'Service-only stale-safe scanner verdict writer. Verdicts are accepted only when exact normalized URL hash, revision, and pending state still match the state registered before scanning.';
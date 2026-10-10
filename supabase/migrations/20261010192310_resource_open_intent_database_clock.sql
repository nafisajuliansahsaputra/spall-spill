begin;
create function api.read_resource_open_clock_server()
returns bigint language sql volatile security definer set search_path = '' set timezone = 'UTC' as $$
  select floor(extract(epoch from clock_timestamp())*1000)::bigint;
$$;
create function api.resolve_resource_open_intent_source_server(input_record jsonb)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare binding jsonb; result jsonb; checked_at bigint;
begin
  if core.resource_open_intent_record_valid(input_record) is distinct from true then
    return jsonb_build_object('status','unavailable'); end if;
  checked_at := api.read_resource_open_clock_server();
  if checked_at<(input_record->>'issued_at')::bigint or checked_at>=(input_record->>'expires_at')::bigint then
    return jsonb_build_object('status','unavailable'); end if;
  binding := input_record->'binding';
  result := api.resolve_published_resource_source_server(binding->>'handle',(binding->>'spill_reference')::bigint,
    binding->>'publication_token',binding->>'source_hash');
  checked_at := api.read_resource_open_clock_server();
  if checked_at<(input_record->>'issued_at')::bigint or checked_at>=(input_record->>'expires_at')::bigint then
    return jsonb_build_object('status','unavailable'); end if;
  return coalesce(result,jsonb_build_object('status','unavailable'));
end;
$$;
revoke all on function api.read_resource_open_clock_server(),
  api.resolve_resource_open_intent_source_server(jsonb) from public, anon, authenticated, service_role;
comment on function api.resolve_resource_open_intent_source_server(jsonb) is
  'Withheld private expiry-aware exact resolver. Caller must first commit one-use consumption; a supplied record is not capability authentication. Database clock checked before/after fresh resolution; no grants, writes or public transport.';
commit;

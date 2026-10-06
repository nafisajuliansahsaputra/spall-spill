begin;
create function api.resolve_published_product_destination_server(
  input_handle text, input_spill_reference bigint, input_provider_key text,
  input_publication_token text, input_destination_hash text)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare descriptor jsonb; payload jsonb; validation_time timestamptz;
begin
  if input_publication_token is null or input_publication_token !~ '^[0-9a-f]{64}$'
    or input_destination_hash is null or input_destination_hash !~ '^[0-9a-f]{64}$'
    or input_provider_key is null or char_length(input_provider_key) not between 1 and 262 then
    return jsonb_build_object('status','unavailable'); end if;
  descriptor := api.resolve_published_product_media_server(input_handle,input_spill_reference);
  if descriptor->>'status' is distinct from 'success'
    or descriptor->>'publication_token' is distinct from input_publication_token then
    return jsonb_build_object('status','unavailable'); end if;
  validation_time := clock_timestamp();
  select jsonb_build_object('status','success','destination_url',d.value->>'destination_url') into payload
    from core.spill_item_publications p
    join core.owners o on o.id=p.owner_id and o.account_state='active' and o.onboarding_completed_at is not null
    join core.identity_publications i on i.owner_id=p.owner_id and i.lifecycle_state='published'
    join core.owner_handle_namespaces n on n.owner_id=p.owner_id and n.namespace_kind='current'
    cross join lateral jsonb_array_elements(case when jsonb_typeof(p.snapshot->'destinations')='array'
      then p.snapshot->'destinations' else '[]'::jsonb end) as d(value)
    where n.normalized_handle=descriptor->>'current_handle' and p.spill_reference=input_spill_reference
      and p.item_type='product' and p.lifecycle_state='published'
      and jsonb_typeof(i.snapshot->'display_name')='string'
      and char_length(btrim(i.snapshot->>'display_name')) between 1 and 80
      and encode(extensions.digest(i::text||p::text,'sha256'),'hex')=input_publication_token
      and d.value->>'provider_key'=input_provider_key
      and encode(extensions.digest(d.value->>'destination_url','sha256'),'hex')=input_destination_hash
      and core.publication_destination_is_safe(d.value->>'destination_url',validation_time);
  return coalesce(payload,jsonb_build_object('status','unavailable'));
end;
$$;
revoke all on function api.resolve_published_product_destination_server(text,bigint,text,text,text)
  from public, anon, authenticated, service_role;
comment on function api.resolve_published_product_destination_server(text,bigint,text,text,text) is
  'Staged server dependency: exact Published Identity/Product token, provider and original URL hash with current fresh safety. Generic denial and no writes. All execution withheld until context-intent/click transport and required live gates; not browser confirmation authority.';
commit;

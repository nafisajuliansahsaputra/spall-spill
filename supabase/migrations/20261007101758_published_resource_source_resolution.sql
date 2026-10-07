begin;
create function api.resolve_published_resource_source_server(
  input_handle text, input_spill_reference bigint, input_publication_token text, input_source_hash text)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare descriptor jsonb; payload jsonb; validation_time timestamptz;
begin
  if input_publication_token is null or input_publication_token !~ '^[0-9a-f]{64}$'
    or input_source_hash is null or input_source_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status','unavailable'); end if;
  descriptor := api.resolve_public_resource_context(input_handle,input_spill_reference);
  if descriptor->>'status' is distinct from 'success' then
    return jsonb_build_object('status','unavailable'); end if;
  validation_time := clock_timestamp();
  select jsonb_build_object('status','success','source_url',p.snapshot->>'source_url')
    into payload from core.spill_item_publications p
    join core.owners o on o.id=p.owner_id and o.account_state='active' and o.onboarding_completed_at is not null
    join core.identity_publications i on i.owner_id=p.owner_id and i.lifecycle_state='published'
    join core.owner_handle_namespaces n on n.owner_id=p.owner_id and n.namespace_kind='current'
    where n.normalized_handle=descriptor->>'current_handle' and p.spill_reference=input_spill_reference
      and p.item_type='resource' and p.lifecycle_state='published'
      and jsonb_typeof(i.snapshot->'display_name')='string'
      and char_length(i.snapshot->>'display_name') between 1 and 80
      and btrim(i.snapshot->>'display_name')<>'' and i.snapshot->>'display_name' !~ '[[:cntrl:]]'
      and jsonb_typeof(p.snapshot->'resource_type')='string'
      and p.snapshot->>'resource_type' in ('menu','price_list','catalog','portfolio','media_kit','document','website','other')
      and jsonb_typeof(p.snapshot->'title')='string'
      and char_length(p.snapshot->>'title') between 1 and 160
      and btrim(p.snapshot->>'title')<>'' and p.snapshot->>'title' !~ '[[:cntrl:]]'
      and jsonb_typeof(p.snapshot->'source_url')='string'
      and char_length(p.snapshot->>'source_url') between 8 and 2048
      and p.snapshot->>'source_url'=btrim(p.snapshot->>'source_url')
      and p.snapshot->>'source_url' !~ '[[:space:][:cntrl:]]'
      and p.snapshot->>'source_url' !~ E'\\\\'
      and p.snapshot->>'source_url' ~* '^https?://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?([/?#].*)?$'
      and encode(extensions.digest(i::text||p::text,'sha256'),'hex')=input_publication_token
      and encode(extensions.digest(p.snapshot->>'source_url','sha256'),'hex')=input_source_hash
      and core.publication_destination_is_safe(p.snapshot->>'source_url',validation_time);
  return coalesce(payload,jsonb_build_object('status','unavailable'));
end;
$$;
revoke all on function api.resolve_published_resource_source_server(text,bigint,text,text)
  from public, anon, authenticated, service_role;
comment on function api.resolve_published_resource_source_server(text,bigint,text,text) is
  'Staged exact Published Identity/Resource row binding and original source hash with current fresh safety. No private fallback or writes. All execution withheld pending server context issuance and public safety transport gates; raw bindings are not browser authority.';
commit;

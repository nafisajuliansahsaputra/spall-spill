begin;
create function api.resolve_published_resource_context_server(input_handle text, input_spill_reference bigint)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare normalized text; validation_time timestamptz; payload jsonb;
begin
  if input_handle is null or input_handle<>btrim(input_handle) or char_length(input_handle) not between 3 and 30
    or input_spill_reference is null or input_spill_reference not between 1 and 9007199254740991 then
    return jsonb_build_object('status','unavailable'); end if;
  normalized := lower(input_handle);
  if normalized !~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' then
    return jsonb_build_object('status','unavailable'); end if;
  validation_time := clock_timestamp();
  with context as materialized (
    select n.normalized_handle as handle, p.spill_reference, i.snapshot->'display_name' as display_name,
      p.snapshot->'resource_type' as resource_type, p.snapshot->'title' as title,
      p.snapshot->>'source_url' as source_url,
      encode(extensions.digest(i::text||p::text,'sha256'),'hex') as publication_token,
      core.publication_destination_is_safe(p.snapshot->>'source_url',validation_time) as available
    from core.owner_handle_namespaces requested
    join core.owners o on o.id=requested.owner_id and o.account_state='active' and o.onboarding_completed_at is not null
    join core.identity_publications i on i.owner_id=o.id and i.lifecycle_state='published'
    join core.spill_item_publications p on p.owner_id=o.id and p.spill_reference=input_spill_reference
    join core.owner_handle_namespaces n on n.owner_id=o.id and n.namespace_kind='current'
    where requested.normalized_handle=normalized
      and api.resolve_public_identity(input_handle)->>'status'='success'
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
  )
  select jsonb_build_object('status','success','recognition',jsonb_build_object(
    'status','success','current_handle',handle,'display_name',display_name,
    'spill_reference',spill_reference,'resource_type',resource_type,'title',title,
    'available',available,'source_url',case when available then source_url else null end),
    'binding',case when available then jsonb_build_object('handle',handle,'spill_reference',spill_reference,
      'publication_token',publication_token,'source_hash',encode(extensions.digest(source_url,'sha256'),'hex'))
      else null end) into payload from context;
  return coalesce(payload,jsonb_build_object('status','unavailable'));
end;
$$;
revoke all on function api.resolve_published_resource_context_server(text,bigint)
  from public, anon, authenticated, service_role;
comment on function api.resolve_published_resource_context_server(text,bigint) is
  'Staged same-snapshot Published Resource recognition and private exact source binding. Degradation retains recognition with null binding; not a browser payload or outbound permission. Execution withheld pending source transport gates.';
commit;

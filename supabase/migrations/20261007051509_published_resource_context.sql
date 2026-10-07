begin;
create function api.resolve_public_resource_context(input_handle text, input_spill_reference bigint)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare identity jsonb; payload jsonb; validation_time timestamptz;
begin
  if input_spill_reference is null or input_spill_reference not between 1 and 9007199254740991 then
    return jsonb_build_object('status','unavailable'); end if;
  identity := api.resolve_public_identity(input_handle);
  if identity->>'status' is distinct from 'success' then
    return jsonb_build_object('status','unavailable'); end if;
  validation_time := clock_timestamp();
  select jsonb_build_object('status','success','current_handle',n.normalized_handle,
    'display_name',i.snapshot->'display_name','spill_reference',p.spill_reference,
    'resource_type',p.snapshot->'resource_type','title',p.snapshot->'title',
    'available',core.publication_destination_is_safe(p.snapshot->>'source_url',validation_time),
    'source_url',case when core.publication_destination_is_safe(p.snapshot->>'source_url',validation_time)
      then p.snapshot->>'source_url' else null end)
    into payload from core.spill_item_publications p
    join core.owners o on o.id=p.owner_id and o.account_state='active' and o.onboarding_completed_at is not null
    join core.identity_publications i on i.owner_id=p.owner_id and i.lifecycle_state='published'
    join core.owner_handle_namespaces n on n.owner_id=p.owner_id and n.namespace_kind='current'
    where n.normalized_handle=identity->>'current_handle' and p.spill_reference=input_spill_reference
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
      and p.snapshot->>'source_url' ~* '^https?://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?([/?#].*)?$';
  return coalesce(payload,jsonb_build_object('status','unavailable'));
end;
$$;
revoke all on function api.resolve_public_resource_context(text,bigint) from public, anon, authenticated, service_role;
comment on function api.resolve_public_resource_context(text,bigint) is
  'Staged exact Published Resource context with current exact-source safety availability. Degradation masks URL without hiding recognition or mutating lifecycle. Existing safe-source reader unchanged; execution withheld pending public safety-click and transport gates.';
commit;

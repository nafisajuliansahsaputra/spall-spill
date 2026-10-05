begin;
create function api.resolve_public_product(input_handle text, input_spill_reference bigint)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare descriptor jsonb; payload jsonb; validation_time timestamptz;
begin
  descriptor := api.resolve_published_product_media_server(input_handle,input_spill_reference);
  if descriptor->>'status'<>'success' then return jsonb_build_object('status','unavailable'); end if;
  validation_time := clock_timestamp();
  select jsonb_build_object('status','success','current_handle',n.normalized_handle,
    'display_name',i.snapshot->'display_name','spill_reference',p.spill_reference,
    'title',p.snapshot->'title','primary_image_path','/media/product/'||n.normalized_handle||'/'||p.spill_reference,
    'destinations',(select jsonb_agg(jsonb_build_object('provider_key',d.value->'provider_key',
      'available',core.publication_destination_is_safe(d.value->>'destination_url',validation_time),
      'destination_url',case when core.publication_destination_is_safe(d.value->>'destination_url',validation_time)
        then d.value->>'destination_url' else null end) order by d.ordinality)
      from jsonb_array_elements(p.snapshot->'destinations') with ordinality as d(value,ordinality)))
    into payload from core.spill_item_publications p
    join core.owners o on o.id=p.owner_id and o.account_state='active' and o.onboarding_completed_at is not null
    join core.identity_publications i on i.owner_id=p.owner_id and i.lifecycle_state='published'
    join core.owner_handle_namespaces n on n.owner_id=p.owner_id and n.namespace_kind='current'
    where n.normalized_handle=descriptor->>'current_handle' and p.spill_reference=input_spill_reference
      and p.item_type='product' and p.lifecycle_state='published'
      and encode(extensions.digest(i::text||p::text,'sha256'),'hex')=descriptor->>'publication_token'
      and jsonb_typeof(i.snapshot->'display_name')='string'
      and char_length(btrim(i.snapshot->>'display_name')) between 1 and 80;
  return coalesce(payload,jsonb_build_object('status','unavailable'));
end;
$$;
revoke all on function api.resolve_public_product(text,bigint) from public, anon, authenticated, service_role;
comment on function api.resolve_public_product(text,bigint) is
  'Staged minimal exact Published Product DTO with ordered current per-destination availability and same-origin image path. Private fields excluded; degradation never mutates lifecycle. Execution withheld pending public renderer/click/safety/live transport gates.';
commit;

begin;
create function api.resolve_published_product_click_context_server(
  input_handle text,input_spill_reference bigint,input_provider_key text)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare descriptor jsonb; payload jsonb; validation_time timestamptz;
begin
  if input_provider_key is null or char_length(input_provider_key) not between 1 and 262 then
    return jsonb_build_object('status','unavailable'); end if;
  descriptor := api.resolve_published_product_media_server(input_handle,input_spill_reference);
  if descriptor->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable'); end if;
  validation_time := clock_timestamp();
  select jsonb_build_object('status','success',
    'confirmation',jsonb_build_object('status','success','current_handle',n.normalized_handle,
      'display_name',i.snapshot->'display_name','spill_reference',p.spill_reference,
      'title',p.snapshot->'title','primary_image_path','/media/product/'||n.normalized_handle||'/'||p.spill_reference,
      'destinations',(select jsonb_agg(jsonb_build_object('provider_key',d.value->'provider_key',
        'available',core.publication_destination_is_safe(d.value->>'destination_url',validation_time),
        'destination_url',case when core.publication_destination_is_safe(d.value->>'destination_url',validation_time)
          then d.value->>'destination_url' else null end) order by d.ordinality)
        from jsonb_array_elements(p.snapshot->'destinations') with ordinality as d(value,ordinality))),
    'binding',jsonb_build_object('handle',n.normalized_handle,'spill_reference',p.spill_reference,
      'provider_key',chosen.value->'provider_key',
      'publication_token',encode(extensions.digest(i::text||p::text,'sha256'),'hex'),
      'destination_hash',encode(extensions.digest(chosen.value->>'destination_url','sha256'),'hex')))
    into payload from core.spill_item_publications p
    join core.owners o on o.id=p.owner_id and o.account_state='active' and o.onboarding_completed_at is not null
    join core.identity_publications i on i.owner_id=p.owner_id and i.lifecycle_state='published'
    join core.owner_handle_namespaces n on n.owner_id=p.owner_id and n.namespace_kind='current'
    join core.profile_media_assets a on a.owner_id=p.owner_id and a.asset_key=p.snapshot->>'primary_asset_key'
      and a.object_key='working/profile/'||a.asset_key||'.webp'
      and a.stored_content_type='image/webp' and a.byte_size between 12 and 3145728
      and a.width between 1 and 2048 and a.height between 1 and 2048
      and a.width::bigint*a.height::bigint<=4194304
    join core.profile_media_upload_intents u on u.id=a.source_upload_intent_id and u.owner_id=a.owner_id and u.status='consumed'
    cross join lateral jsonb_array_elements(case when core.product_destinations_valid(p.snapshot->'destinations')
      then p.snapshot->'destinations' else '[]'::jsonb end) as chosen(value)
    where n.normalized_handle=descriptor->>'current_handle' and p.spill_reference=input_spill_reference
      and p.item_type='product' and p.lifecycle_state='published'
      and encode(extensions.digest(i::text||p::text,'sha256'),'hex')=descriptor->>'publication_token'
      and jsonb_typeof(i.snapshot->'display_name')='string'
      and char_length(btrim(i.snapshot->>'display_name')) between 1 and 80
      and chosen.value->>'provider_key'=input_provider_key
      and core.publication_destination_is_safe(chosen.value->>'destination_url',validation_time);
  return coalesce(payload,jsonb_build_object('status','unavailable'));
end;
$$;
revoke all on function api.resolve_published_product_click_context_server(text,bigint,text)
  from public, anon, authenticated, service_role;
comment on function api.resolve_published_product_click_context_server(text,bigint,text) is
  'Withheld server-only same-Published-row confirmation and selected destination binding. Current finalized media and fresh safety; no raw browser binding authority, lifecycle writes, grants or public transport.';
commit;

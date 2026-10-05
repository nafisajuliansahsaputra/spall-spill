begin;
create function api.resolve_published_product_media_server(input_handle text, input_spill_reference bigint)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare identity_publication core.identity_publications%rowtype; product_publication core.spill_item_publications%rowtype;
  asset core.profile_media_assets%rowtype; canonical_handle text; normalized text;
begin
  if input_handle is null or input_handle<>btrim(input_handle) or char_length(input_handle) not between 3 and 30
    or input_spill_reference is null or input_spill_reference not between 1 and 9007199254740991 then
    return jsonb_build_object('status','unavailable'); end if;
  normalized := lower(input_handle);
  if normalized !~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' then return jsonb_build_object('status','unavailable'); end if;
  select p.* into identity_publication from core.owner_handle_namespaces n
    join core.owners o on o.id=n.owner_id and o.account_state='active' and o.onboarding_completed_at is not null
    join core.identity_publications p on p.owner_id=o.id and p.lifecycle_state='published'
    where n.normalized_handle=normalized;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select normalized_handle into canonical_handle from core.owner_handle_namespaces
    where owner_id=identity_publication.owner_id and namespace_kind='current';
  if canonical_handle is null then return jsonb_build_object('status','unavailable'); end if;
  select * into product_publication from core.spill_item_publications
    where owner_id=identity_publication.owner_id and spill_reference=input_spill_reference
      and item_type='product' and lifecycle_state='published';
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if jsonb_typeof(product_publication.snapshot->'title') is distinct from 'string'
    or char_length(btrim(product_publication.snapshot->>'title')) not between 1 and 160
    or jsonb_typeof(product_publication.snapshot->'preparation_revision') is distinct from 'number'
    or product_publication.snapshot->>'preparation_revision' !~ '^[1-9][0-9]{0,15}$'
    or not core.product_destinations_valid(product_publication.snapshot->'destinations') then
    return jsonb_build_object('status','unavailable'); end if;
  if (product_publication.snapshot->>'preparation_revision')::numeric>9007199254740991
    or jsonb_array_length(product_publication.snapshot->'destinations')<1 then
    return jsonb_build_object('status','unavailable'); end if;
  select a.* into asset from core.profile_media_assets a
    join core.profile_media_upload_intents i on i.id=a.source_upload_intent_id and i.owner_id=a.owner_id and i.status='consumed'
    where a.owner_id=product_publication.owner_id and a.asset_key=product_publication.snapshot->>'primary_asset_key'
      and a.object_key='working/profile/'||a.asset_key||'.webp'
      and a.stored_content_type='image/webp' and a.byte_size between 12 and 3145728
      and a.width between 1 and 2048 and a.height between 1 and 2048
      and a.width::bigint*a.height::bigint<=4194304;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  return jsonb_build_object('status','success','current_handle',canonical_handle,'spill_reference',product_publication.spill_reference,
    'object_key',asset.object_key,'content_type',asset.stored_content_type,'byte_size',asset.byte_size,
    'width',asset.width,'height',asset.height,
    'publication_token',encode(extensions.digest(identity_publication::text||product_publication::text,'sha256'),'hex'));
end;
$$;
revoke all on function api.resolve_published_product_media_server(text,bigint) from public, anon, authenticated, service_role;
grant execute on function api.resolve_published_product_media_server(text,bigint) to service_role;
comment on function api.resolve_published_product_media_server(text,bigint) is
  'Server-only exact Published Product image descriptor. Public Handle/reference only, active/completed/Published Owner/Identity/Product and finalized same-Owner canonical media. No outbound authority or browser descriptor access. Publication/public reader gates remain withheld.';
commit;

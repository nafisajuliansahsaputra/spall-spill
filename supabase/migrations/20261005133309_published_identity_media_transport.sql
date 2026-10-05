begin;
create function api.resolve_published_identity_media_server(input_handle text)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare publication core.identity_publications%rowtype; asset core.profile_media_assets%rowtype;
  canonical_handle text; normalized text;
begin
  if input_handle is null or input_handle<>btrim(input_handle) or char_length(input_handle) not between 3 and 30 then
    return jsonb_build_object('status','unavailable'); end if;
  normalized := lower(input_handle);
  if normalized !~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' then return jsonb_build_object('status','unavailable'); end if;
  select p.* into publication from core.owner_handle_namespaces n
    join core.owners o on o.id=n.owner_id and o.account_state='active' and o.onboarding_completed_at is not null
    join core.identity_publications p on p.owner_id=o.id and p.lifecycle_state='published'
    where n.normalized_handle=normalized;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select normalized_handle into canonical_handle from core.owner_handle_namespaces
    where owner_id=publication.owner_id and namespace_kind='current';
  if canonical_handle is null then return jsonb_build_object('status','unavailable'); end if;
  select a.* into asset from core.profile_media_assets a
    join core.profile_media_upload_intents i on i.id=a.source_upload_intent_id and i.owner_id=a.owner_id and i.status='consumed'
    where a.owner_id=publication.owner_id and a.asset_key=publication.snapshot->>'profile_asset_key'
      and a.object_key='working/profile/'||a.asset_key||'.webp'
      and a.stored_content_type='image/webp' and a.byte_size between 12 and 3145728
      and a.width between 1 and 2048 and a.height between 1 and 2048
      and a.width::bigint*a.height::bigint<=4194304;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  return jsonb_build_object('status','success','current_handle',canonical_handle,
    'object_key',asset.object_key,'content_type',asset.stored_content_type,'byte_size',asset.byte_size,
    'width',asset.width,'height',asset.height,
    'publication_token',encode(extensions.digest(publication::text,'sha256'),'hex'));
end;
$$;
revoke all on function api.resolve_published_identity_media_server(text) from public, anon, authenticated, service_role;
grant execute on function api.resolve_published_identity_media_server(text) to service_role;
comment on function api.resolve_published_identity_media_server(text) is
  'Server-only exact Published Identity image descriptor. Public locators only; active/completed/Published gates; same-Owner finalized canonical media. Never expose this DTO to browsers. Existing publication/read grants remain withheld.';
commit;

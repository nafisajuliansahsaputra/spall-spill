begin;
create function api.resolve_public_identity(input_handle text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  normalized text;
  resolved_owner uuid;
  current_handle text;
  publication core.identity_publications%rowtype;
  connection jsonb := null;
  available boolean;
  validation_time timestamptz := clock_timestamp();
begin
  if input_handle is null or input_handle <> btrim(input_handle) or char_length(input_handle) not between 3 and 30 then
    return jsonb_build_object('status','unavailable');
  end if;
  normalized := lower(input_handle);
  if normalized !~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' then return jsonb_build_object('status','unavailable'); end if;
  select p.* into publication from core.owner_handle_namespaces n
    join core.owners o on o.id=n.owner_id and o.account_state='active' and o.onboarding_completed_at is not null
    join core.identity_publications p on p.owner_id=o.id and p.lifecycle_state='published'
    where n.normalized_handle=normalized;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  resolved_owner := publication.owner_id;
  if publication.snapshot->>'profile_asset_key' is not null then return jsonb_build_object('status','unavailable'); end if;
  select normalized_handle into current_handle from core.owner_handle_namespaces where owner_id=resolved_owner and namespace_kind='current';
  if current_handle is null then return jsonb_build_object('status','unavailable'); end if;
  if publication.snapshot->'connection' is not null and publication.snapshot->'connection' <> 'null'::jsonb then
    available := core.publication_destination_is_safe(publication.snapshot->'connection'->>'destination_url',validation_time);
    connection := jsonb_build_object('connection_kind',publication.snapshot->'connection'->>'connection_kind',
      'social_platform',publication.snapshot->'connection'->'social_platform','available',available,
      'destination_url',case when available then publication.snapshot->'connection'->>'destination_url' else null end);
  end if;
  return jsonb_build_object('status','success','current_handle',current_handle,
    'display_name',publication.snapshot->'display_name','bio',publication.snapshot->'bio',
    'starter_key',publication.snapshot->'starter_key','connection',connection,
    'has_spill',exists(select 1 from core.spill_item_publications where owner_id=resolved_owner
      and item_type='resource' and lifecycle_state='published'
      and core.publication_destination_is_safe(snapshot->>'source_url',validation_time)));
end;
$$;

create function api.resolve_public_resource(input_handle text,input_spill_reference bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare identity jsonb; item core.spill_item_publications%rowtype; validation_time timestamptz := clock_timestamp();
begin
  if input_spill_reference is null or input_spill_reference not between 1 and 9007199254740991 then
    return jsonb_build_object('status','unavailable');
  end if;
  identity := api.resolve_public_identity(input_handle);
  if identity->>'status' <> 'success' then return jsonb_build_object('status','unavailable'); end if;
  select p.* into item from core.spill_item_publications p join core.owner_handle_namespaces n on n.owner_id=p.owner_id
    where n.normalized_handle=identity->>'current_handle' and n.namespace_kind='current'
      and p.spill_reference=input_spill_reference and p.item_type='resource' and p.lifecycle_state='published';
  if not found or not core.publication_destination_is_safe(item.snapshot->>'source_url',validation_time) then
    return jsonb_build_object('status','unavailable');
  end if;
  return jsonb_build_object('status','success','current_handle',identity->>'current_handle',
    'display_name',identity->'display_name','spill_reference',item.spill_reference,
    'resource_type',item.snapshot->'resource_type','title',item.snapshot->'title','source_url',item.snapshot->'source_url');
end;
$$;
revoke all on function api.resolve_public_identity(text) from public, anon, authenticated, service_role;
revoke all on function api.resolve_public_resource(text,bigint) from public, anon, authenticated, service_role;
comment on function api.resolve_public_identity(text) is
  'Staged public-only snapshot DTO with uniform unavailable visibility. No private Working/receipt/media data. Execution withheld until public transport verification.';
comment on function api.resolve_public_resource(text,bigint) is
  'Staged public-only Resource DTO scoped by public Handle and existing Owner reference, with current exact-source safety. Execution withheld until transport verification.';
commit;

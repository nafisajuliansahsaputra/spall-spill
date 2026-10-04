-- S6 private preview: coherent read-only review, no publication authority.
begin;

create function core.preview_destination_safety(input_url text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce((select jsonb_build_object(
    'status', case when s.expires_at is null or s.expires_at <= now()
      then 'pending' else s.safety_status::text end,
    'revision', s.revision, 'expires_at', s.expires_at)
  from core.external_destination_safety s
  where s.normalized_url = input_url
    and s.url_hash = encode(extensions.digest(input_url, 'sha256'), 'hex')),
    jsonb_build_object('status', 'pending', 'revision', null, 'expires_at', null));
$$;
revoke all on function core.preview_destination_safety(text) from public, anon, authenticated, service_role;

create function api.resolve_current_onboarding_preview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  eligibility jsonb;
  resolved_owner uuid;
  current_handle text;
  identity_record core.identity_working%rowtype;
  layout_record core.identity_layout_working%rowtype;
  connection_record core.identity_connection_working%rowtype;
  product_record core.product_drafts%rowtype;
  resource_record core.resource_drafts%rowtype;
  connection_payload jsonb := null;
  product_payload jsonb := null;
  resource_payload jsonb := null;
  safety jsonb;
  item_reference bigint;
  issues text[];
  identity_issues text[] := '{}';
  payload jsonb;
begin
  eligibility := api.resolve_current_relevant_first_job_state();
  if eligibility->>'status' = 'prerequisite_missing' then
    return jsonb_build_object('status', 'prerequisite_missing', 'prerequisite', eligibility->>'prerequisite');
  elsif eligibility->>'status' = 'step_not_available' then
    return jsonb_build_object('status', 'step_not_available', 'current_step', eligibility->>'current_step');
  elsif eligibility->>'status' <> 'success' then
    return jsonb_build_object('status', eligibility->>'status');
  end if;
  if eligibility->>'current_step' <> 'preview_publish' then
    return jsonb_build_object('status', 'step_not_available', 'current_step', eligibility->>'current_step');
  end if;

  select owner_id into resolved_owner from core.owner_auth_bindings where auth_user_id = auth.uid();
  select normalized_handle into current_handle from core.owner_handle_namespaces
    where owner_id = resolved_owner and namespace_kind = 'current';
  select * into identity_record from core.identity_working where owner_id = resolved_owner;
  select * into layout_record from core.identity_layout_working where owner_id = resolved_owner;

  if identity_record.profile_asset_key is not null then
    identity_issues := array_append(identity_issues, 'profile_media_publication_pending');
  end if;
  select * into connection_record from core.identity_connection_working where owner_id = resolved_owner;
  if found then
    safety := core.preview_destination_safety(connection_record.destination_url);
    if safety->>'status' <> 'safe' then
      identity_issues := array_append(identity_issues, 'connection_not_safe');
    end if;
    connection_payload := jsonb_build_object(
      'connection_kind', connection_record.connection_kind,
      'social_platform', connection_record.social_platform,
      'destination_url', connection_record.destination_url,
      'revision', connection_record.revision, 'safety', safety);
  end if;

  select * into product_record from core.product_drafts where owner_id = resolved_owner;
  if found then
    select spill_reference into item_reference from core.spill_item_identity_registry
      where item_id = product_record.id and owner_id = resolved_owner and item_type = 'product';
    safety := core.preview_destination_safety(product_record.source_url);
    issues := array_remove(array[
      case when product_record.title is null then 'title_missing' end,
      case when safety->>'status' <> 'safe' then 'source_not_safe' end,
      case when item_reference is null then 'identity_reservation_missing' end
    ], null);
    product_payload := jsonb_build_object(
      'spill_reference', item_reference, 'source_url', product_record.source_url,
      'title', product_record.title, 'revision', product_record.revision,
      'safety', safety, 'validation_issues', issues);
  end if;

  select * into resource_record from core.resource_drafts where owner_id = resolved_owner;
  if found then
    select spill_reference into item_reference from core.spill_item_identity_registry
      where item_id = resource_record.id and owner_id = resolved_owner and item_type = 'resource';
    safety := core.preview_destination_safety(resource_record.source_url);
    issues := array_remove(array[
      case when resource_record.title is null then 'title_missing' end,
      case when resource_record.source_url is null then 'source_missing' end,
      case when resource_record.source_url is not null and safety->>'status' <> 'safe' then 'source_not_safe' end,
      case when item_reference is null then 'identity_reservation_missing' end
    ], null);
    resource_payload := jsonb_build_object(
      'spill_reference', item_reference, 'resource_type', resource_record.resource_type,
      'source_url', resource_record.source_url, 'title', resource_record.title,
      'revision', resource_record.revision, 'safety', safety, 'validation_issues', issues);
  end if;

  payload := jsonb_build_object(
    'status', 'success', 'current_step', 'preview_publish',
    'progress_revision', (eligibility->>'progress_revision')::bigint,
    'current_handle', current_handle,
    'identity_working', jsonb_build_object('display_name', identity_record.display_name,
      'bio', identity_record.bio, 'profile_asset_key', identity_record.profile_asset_key,
      'revision', identity_record.revision),
    'layout_working', jsonb_build_object('starter_key', layout_record.starter_key, 'revision', layout_record.revision),
    'identity_validation_issues', identity_issues,
    'connection_working', connection_payload, 'product_draft', product_payload, 'resource_draft', resource_payload);
  return payload || jsonb_build_object('snapshot_hash', encode(extensions.digest(payload::text, 'sha256'), 'hex'));
end;
$$;
revoke all on function api.resolve_current_onboarding_preview() from public, anon, authenticated, service_role;
grant execute on function api.resolve_current_onboarding_preview() to authenticated;
comment on function api.resolve_current_onboarding_preview() is
  'Read-only authenticated current-Owner S6 preview. Exact URL safety and saved content are one coherent snapshot. Creates no public state, preview receipt, Item or progress. Digest grants no publication authority.';
commit;

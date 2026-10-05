begin;
create or replace function api.resolve_current_onboarding_preview()
returns jsonb language plpgsql stable security definer set search_path = '' set timezone = 'UTC' as $$
declare payload jsonb; preparation core.product_preparations%rowtype; destinations jsonb; prepared jsonb := null;
begin
  payload := core.resolve_onboarding_preview_snapshot();
  if payload->>'status'<>'success' then return payload; end if;
  if payload->'product_draft'<>'null'::jsonb then
    select p.* into preparation from core.product_preparations p
      join core.owner_auth_bindings b on b.owner_id=p.owner_id where b.auth_user_id=auth.uid();
    if found then
      select coalesce(jsonb_agg(d.value || jsonb_build_object('safety',core.preview_destination_safety(d.value->>'destination_url'))
        order by d.ordinality),'[]'::jsonb) into destinations
        from jsonb_array_elements(preparation.destinations) with ordinality as d(value,ordinality);
      prepared := jsonb_build_object('primary_asset_key',preparation.primary_asset_key,
        'revision',preparation.revision,'destinations',destinations);
    end if;
    payload := jsonb_set(payload,'{product_draft,preparation}',coalesce(prepared,'null'::jsonb));
    payload := jsonb_set(payload,'{product_draft,validation_issues}',
      (payload->'product_draft'->'validation_issues') || '["product_publication_preparation_pending"]'::jsonb);
  end if;
  payload := payload - 'snapshot_hash';
  return payload || jsonb_build_object('snapshot_hash',encode(extensions.digest(payload::text,'sha256'),'hex'));
end;
$$;
revoke all on function api.resolve_current_onboarding_preview() from public, anon, authenticated, service_role;
grant execute on function api.resolve_current_onboarding_preview() to authenticated;
comment on function api.resolve_current_onboarding_preview() is
  'Read-only coherent current-Owner S6 review. Exact Product preparation/image/ordered destinations and per-source safety included in UTC digest. Product publication remains pending; creates no receipt/public state.';
commit;

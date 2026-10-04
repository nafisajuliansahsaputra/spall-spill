-- Preserve the exercised snapshot reader; add the upstream Product preparation gate.
begin;
alter function api.resolve_current_onboarding_preview() set schema core;
alter function core.resolve_current_onboarding_preview() rename to resolve_onboarding_preview_snapshot;
revoke all on function core.resolve_onboarding_preview_snapshot() from public, anon, authenticated, service_role;
create function api.resolve_current_onboarding_preview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare payload jsonb;
begin
  payload := core.resolve_onboarding_preview_snapshot();
  if payload->>'status' <> 'success' then return payload; end if;
  if payload->'product_draft' <> 'null'::jsonb then
    payload := jsonb_set(payload, '{product_draft,validation_issues}',
      (payload->'product_draft'->'validation_issues') || '["product_publication_preparation_pending"]'::jsonb);
  end if;
  payload := payload - 'snapshot_hash';
  return payload || jsonb_build_object('snapshot_hash',encode(extensions.digest(payload::text,'sha256'),'hex'));
end;
$$;
revoke all on function api.resolve_current_onboarding_preview() from public, anon, authenticated, service_role;
grant execute on function api.resolve_current_onboarding_preview() to authenticated;
comment on function api.resolve_current_onboarding_preview() is
  'Read-only current-Owner preview. Product title/URL do not prove publication readiness: mandatory primary image and structured marketplace preparation remain pending. No receipt/publication authority.';
commit;

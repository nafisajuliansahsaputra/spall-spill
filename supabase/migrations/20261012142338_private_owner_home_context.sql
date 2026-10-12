begin;
create function api.resolve_current_owner_home_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  eligibility jsonb;
  current_owner uuid;
  current_handle text;
  use_case core.primary_use_case;
begin
  eligibility := api.resolve_current_owner_state();
  if eligibility->>'status' is distinct from 'active' then
    return jsonb_build_object('status','unavailable');
  end if;
  current_owner := (eligibility->>'owner_id')::uuid;
  select h.normalized_handle, p.primary_use_case into current_handle, use_case
  from core.owner_handle_namespaces h
  join core.owner_onboarding_progress p on p.owner_id = h.owner_id
  where h.owner_id = current_owner
    and h.namespace_kind = 'current'::core.handle_namespace_kind;
  if not found or current_handle is null or use_case is null then
    return jsonb_build_object('status','unavailable');
  end if;
  return jsonb_build_object('status','success','current_handle',current_handle,
    'primary_use_case',use_case::text);
end;
$$;
revoke all on function api.resolve_current_owner_home_context()
  from public, anon, authenticated, service_role;
comment on function api.resolve_current_owner_home_context() is
  'Staged read-only current active/completed Owner context. Zero target arguments, auth.uid() provenance, no capability/publication inference. All execution withheld pending private workspace transport gates.';
commit;

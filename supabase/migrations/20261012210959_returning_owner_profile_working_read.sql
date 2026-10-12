begin;
create function api.resolve_current_owner_profile_working()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  context jsonb;
  current_owner uuid;
  profile core.identity_working%rowtype;
begin
  context := api.resolve_current_owner_home_context();
  if context->>'status' is distinct from 'success' then
    return jsonb_build_object('status','unavailable');
  end if;
  current_owner := (api.resolve_current_owner_state()->>'owner_id')::uuid;
  select * into profile from core.identity_working where owner_id=current_owner;
  if not found or profile.revision not between 1 and 9007199254740991 then
    return jsonb_build_object('status','unavailable');
  end if;
  return context || jsonb_build_object('profile_working',jsonb_build_object(
    'display_name',profile.display_name,'bio',profile.bio,
    'profile_asset_key',profile.profile_asset_key,'revision',profile.revision));
end;
$$;
revoke all on function api.resolve_current_owner_profile_working() from public, anon, authenticated, service_role;
comment on function api.resolve_current_owner_profile_working() is
  'Staged returning-Owner private Core Profile Working read. No whole Identity/public/media readiness inference, mutation or execution grants.';
commit;

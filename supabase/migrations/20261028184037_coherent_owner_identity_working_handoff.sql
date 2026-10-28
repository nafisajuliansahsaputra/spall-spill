begin;
create function api.resolve_current_owner_identity_working_page(input_request jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  page jsonb;
  profile jsonb;
  composition jsonb;
  result jsonb;
begin
  page := api.resolve_current_owner_typed_blocks_working_page(input_request);
  if page->>'status' is distinct from 'success' then return page; end if;
  profile := api.resolve_current_owner_profile_working();
  composition := api.resolve_current_owner_composition_working();
  if profile->>'status' is distinct from 'success' or composition->>'status' is distinct from 'success'
    or profile->'current_handle' is distinct from page->'current_handle'
    or composition->'current_handle' is distinct from page->'current_handle'
    or profile->'primary_use_case' is distinct from page->'primary_use_case'
    or composition->'primary_use_case' is distinct from page->'primary_use_case'
    or profile#>'{profile_working,revision}' is distinct from composition->'profile_revision' then
    return jsonb_build_object('status','unavailable');
  end if;
  result := page || jsonb_build_object(
    'profile_working',profile->'profile_working',
    'layout_working',composition->'layout_working',
    'connection_source_working',composition->'connection_working',
    'legacy_identity_work',composition->'identity_work',
    'publication_comparison','not_assessed',
    'revision_vector',jsonb_build_object(
      'profile',profile#>'{profile_working,revision}',
      'layout',composition#>'{layout_working,revision}',
      'connection',composition#>'{connection_working,revision}',
      'blocks',page#>'{collection,revision}'));
  if octet_length(result::text)>8388608 then return jsonb_build_object('status','unavailable'); end if;
  return result;
end;
$$;
revoke all on function api.resolve_current_owner_identity_working_page(jsonb) from public,anon,authenticated,service_role;
comment on function api.resolve_current_owner_identity_working_page(jsonb) is
  'Staged private persisted Identity Working handoff. Same-statement profile/layout/separate first-slot source/typed blocks and revision vector. Legacy comparison is not whole-document publication status. No defaults/import/write/publication/grants.';
commit;

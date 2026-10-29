begin;
create function api.resolve_current_owner_identity_destination_review_page(input_request jsonb)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare
  page jsonb;
  rows jsonb;
  result jsonb;
begin
  page := api.resolve_current_owner_editable_identity_working_page(input_request);
  if page->>'status' is distinct from 'success' then return page; end if;
  result := page || jsonb_build_object('source_destination_safety',case
    when page->'connection_source_working'='null'::jsonb then null
    else core.preview_destination_safety(page#>>'{connection_source_working,destination_url}') end);
  if page->'collection'<>'null'::jsonb then
    select coalesce(jsonb_agg(r.value || jsonb_build_object('destination_safety',case
      when r.value->>'kind' in ('social','generic_link') and r.value->>'is_visible'='true'
        and r.value->>'payload_state'='present' and r.value#>>'{working,destination_url}' is not null
      then core.preview_destination_safety(r.value#>>'{working,destination_url}') else null end)
      order by r.ordinality),'[]'::jsonb) into rows
      from jsonb_array_elements(page#>'{collection,blocks}') with ordinality r(value,ordinality);
    result := jsonb_set(result,'{collection,blocks}',rows);
  end if;
  if octet_length(result::text)>8388608 then return jsonb_build_object('status','unavailable'); end if;
  return result;
end;
$$;
revoke all on function api.resolve_current_owner_identity_destination_review_page(jsonb) from public,anon,authenticated,service_role;
comment on function api.resolve_current_owner_identity_destination_review_page(jsonb) is
  'Dormant coherent current-Owner Working graph plus exact URL/hash stored safety preview. No fetch/write/Publish/redirect permission; wall-clock-after-lock validation remains required. All execution withheld.';
commit;

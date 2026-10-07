begin;
create function api.resolve_public_spill_item(input_handle text, input_spill_reference bigint)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare normalized text; resolved_type text; detail jsonb;
begin
  if input_handle is null or input_handle<>btrim(input_handle) or char_length(input_handle) not between 3 and 30
    or input_spill_reference is null or input_spill_reference not between 1 and 9007199254740991 then
    return jsonb_build_object('status','unavailable'); end if;
  normalized := lower(input_handle);
  if normalized !~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' then
    return jsonb_build_object('status','unavailable'); end if;
  select r.item_type into resolved_type from core.owner_handle_namespaces n
    join core.owners o on o.id=n.owner_id and o.account_state='active' and o.onboarding_completed_at is not null
    join core.identity_publications i on i.owner_id=o.id and i.lifecycle_state='published'
    join core.spill_item_identity_registry r on r.owner_id=o.id and r.spill_reference=input_spill_reference
    join core.spill_item_publications p on p.item_id=r.item_id and p.owner_id=r.owner_id
      and p.item_type=r.item_type and p.spill_reference=r.spill_reference and p.lifecycle_state='published'
    where n.normalized_handle=normalized;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if resolved_type='product' then
    detail := api.resolve_public_product(input_handle,input_spill_reference);
  elsif resolved_type='resource' then
    detail := api.resolve_public_resource_context(input_handle,input_spill_reference);
  else
    return jsonb_build_object('status','unavailable');
  end if;
  if detail->>'status' is distinct from 'success'
    or detail->'spill_reference' is distinct from to_jsonb(input_spill_reference) then
    return jsonb_build_object('status','unavailable'); end if;
  return jsonb_build_object('status','success','item_type',resolved_type,'detail',detail);
end;
$$;
revoke all on function api.resolve_public_spill_item(text,bigint) from public, anon, authenticated, service_role;
comment on function api.resolve_public_spill_item(text,bigint) is
  'Staged exact Published Item dispatch from immutable Owner/reference/type binding to existing Product/Resource context readers only. No private fallback or outbound permission. Execution withheld pending public transport/safety gates.';
commit;

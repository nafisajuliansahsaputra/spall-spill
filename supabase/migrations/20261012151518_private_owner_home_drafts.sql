begin;
create function api.resolve_current_owner_home_drafts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  context jsonb;
  current_owner uuid;
  total_rows bigint;
  bound_rows bigint;
  products bigint;
  resources bigint;
begin
  context := api.resolve_current_owner_home_context();
  if context->>'status' is distinct from 'success' then
    return jsonb_build_object('status','unavailable');
  end if;
  current_owner := (api.resolve_current_owner_state()->>'owner_id')::uuid;
  with drafts as (
    select id,owner_id,'product'::text as item_type from core.product_drafts where owner_id=current_owner
    union all
    select id,owner_id,'resource'::text as item_type from core.resource_drafts where owner_id=current_owner
  )
  select count(*),count(r.item_id),
    count(*) filter (where d.item_type='product' and p.item_id is null),
    count(*) filter (where d.item_type='resource' and p.item_id is null)
  into total_rows,bound_rows,products,resources
  from drafts d
  left join core.spill_item_identity_registry r
    on r.item_id=d.id and r.owner_id=d.owner_id and r.item_type=d.item_type
  left join core.spill_item_publications p
    on p.item_id=r.item_id and p.owner_id=r.owner_id and p.item_type=r.item_type and p.spill_reference=r.spill_reference;
  if total_rows<>bound_rows or products>9007199254740991 or resources>9007199254740991 then
    return jsonb_build_object('status','unavailable');
  end if;
  return context || jsonb_build_object('product_drafts',products,'resource_drafts',resources);
end;
$$;
revoke all on function api.resolve_current_owner_home_drafts() from public, anon, authenticated, service_role;
comment on function api.resolve_current_owner_home_drafts() is
  'Staged current-Owner never-published Draft counts. All publication lifecycles excluded; no public/Working readiness inference or grants.';
commit;

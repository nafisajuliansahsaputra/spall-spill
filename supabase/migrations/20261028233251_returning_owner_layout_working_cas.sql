begin;
create function api.save_current_owner_layout_working(input_working jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  current_owner uuid;
  bound_owner uuid;
  account core.owner_account_state;
  completed timestamptz;
  base_revision numeric;
  saved_revision bigint;
  saved_key core.identity_starter_key;
  next_key core.identity_starter_key;
  changed boolean;
begin
  if actor is null then return jsonb_build_object('status','unauthenticated'); end if;
  select o.id,o.account_state,o.onboarding_completed_at into current_owner,account,completed
    from core.owner_auth_bindings b join core.owners o on o.id=b.owner_id
    where b.auth_user_id=actor for update of o;
  if not found then return jsonb_build_object('status','owner_missing'); end if;
  select b.owner_id into bound_owner from core.owner_auth_bindings b where b.auth_user_id=actor for update;
  if not found or bound_owner is distinct from current_owner then return jsonb_build_object('status','unavailable'); end if;
  if account<>'active' or completed is null then return jsonb_build_object('status','owner_not_eligible'); end if;
  if api.resolve_current_owner_home_context()->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable'); end if;
  if jsonb_typeof(input_working) is distinct from 'object' then return jsonb_build_object('status','invalid_layout_working'); end if;
  if not (input_working ?& array['action','base_layout_revision','starter_key'])
    or exists(select 1 from jsonb_object_keys(input_working) k where k not in ('action','base_layout_revision','starter_key'))
    or input_working->>'action' is distinct from 'save_layout_working'
    or jsonb_typeof(input_working->'action') is distinct from 'string'
    or jsonb_typeof(input_working->'base_layout_revision') is distinct from 'number'
    or jsonb_typeof(input_working->'starter_key') is distinct from 'string'
    or input_working->>'starter_key' not in ('clean','social_focus','featured','business')
  then return jsonb_build_object('status','invalid_layout_working'); end if;
  base_revision := (input_working->>'base_layout_revision')::numeric;
  if base_revision not between 1 and 9007199254740991 or trunc(base_revision)<>base_revision then
    return jsonb_build_object('status','invalid_layout_working'); end if;
  select l.revision,l.starter_key into saved_revision,saved_key
    from core.identity_layout_working l where l.owner_id=current_owner for update;
  if not found or saved_revision not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable'); end if;
  if saved_revision<>base_revision then return jsonb_build_object('status','stale_write'); end if;
  next_key := (input_working->>'starter_key')::core.identity_starter_key;
  changed := next_key<>saved_key;
  if changed then
    if saved_revision=9007199254740991 then return jsonb_build_object('status','revision_exhausted'); end if;
    update core.identity_layout_working set starter_key=next_key,revision=saved_revision+1,updated_at=now() where owner_id=current_owner;
    saved_revision := saved_revision+1;
  end if;
  return jsonb_build_object('status','success','changed',changed,'layout_working',jsonb_build_object('starter_key',next_key,'revision',saved_revision));
end;
$$;
revoke all on function api.save_current_owner_layout_working(jsonb) from public,anon,authenticated,service_role;
comment on function api.save_current_owner_layout_working(jsonb) is
  'Private returning-Owner existing layout CAS. Exact curated key, same-key no-op, no content/onboarding/Published mutation or initialization. All execution withheld.';
commit;

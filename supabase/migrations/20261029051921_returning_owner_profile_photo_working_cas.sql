begin;
create function api.save_current_owner_profile_photo_working(input_working jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid := auth.uid(); current_owner uuid; bound_owner uuid;
  account core.owner_account_state; completed timestamptz;
  source_base numeric; text_base numeric;
  source_revision bigint; text_revision bigint; text_source bigint;
  existing_key text; selected_key text; exists_text boolean; changed boolean;
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
  if jsonb_typeof(input_working) is distinct from 'object' then return jsonb_build_object('status','invalid_profile_photo_working'); end if;
  if not(input_working ?& array['action','base_profile_revision','base_text_revision','profile_asset_key'])
    or exists(select 1 from jsonb_object_keys(input_working) k where k not in ('action','base_profile_revision','base_text_revision','profile_asset_key'))
    or input_working->>'action' is distinct from 'save_profile_photo_working'
    or jsonb_typeof(input_working->'action') is distinct from 'string'
    or jsonb_typeof(input_working->'base_profile_revision') is distinct from 'number'
    or jsonb_typeof(input_working->'base_text_revision') not in ('number','null')
    or jsonb_typeof(input_working->'profile_asset_key') not in ('string','null')
    or (input_working->>'profile_asset_key' is not null and input_working->>'profile_asset_key' !~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$')
  then return jsonb_build_object('status','invalid_profile_photo_working'); end if;
  source_base := (input_working->>'base_profile_revision')::numeric;
  text_base := (input_working->>'base_text_revision')::numeric;
  if source_base not between 1 and 9007199254740991 or trunc(source_base)<>source_base
    or(text_base is not null and(text_base not between 1 and 9007199254740991 or trunc(text_base)<>text_base))
  then return jsonb_build_object('status','invalid_profile_photo_working'); end if;
  select p.revision,p.profile_asset_key into source_revision,existing_key from core.identity_working p where p.owner_id=current_owner for update;
  if not found or source_revision not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable'); end if;
  if source_revision<>source_base then return jsonb_build_object('status','stale_source'); end if;
  select p.revision,p.source_profile_revision into text_revision,text_source from core.identity_profile_text_working p where p.owner_id=current_owner for update;
  exists_text := found;
  if(exists_text and(text_base is null or text_base<>text_revision)) or(not exists_text and text_base is not null) then
    return jsonb_build_object('status','stale_write'); end if;
  if exists_text and text_source<>source_revision then return jsonb_build_object('status','stale_source'); end if;
  selected_key := input_working->>'profile_asset_key';
  if selected_key is not null then
    perform 1 from core.profile_media_assets a
      join core.profile_media_upload_intents i on i.id=a.source_upload_intent_id and i.owner_id=a.owner_id
      where a.owner_id=current_owner and a.asset_key=selected_key
        and i.status='consumed' and a.object_key='working/profile/'||a.asset_key||'.webp'
        and a.stored_content_type='image/webp' and a.byte_size between 12 and 3145728
        and a.width between 1 and 2048 and a.height between 1 and 2048
        and a.width::bigint*a.height::bigint<=4194304
      for share of a,i;
    if not found then return jsonb_build_object('status','invalid_asset'); end if;
  end if;
  changed := selected_key is distinct from existing_key;
  if changed then
    if source_revision=9007199254740991 or(exists_text and text_revision=9007199254740991) then
      return jsonb_build_object('status','revision_exhausted'); end if;
    source_revision := source_revision+1;
    update core.identity_working set profile_asset_key=selected_key,revision=source_revision,updated_at=now() where owner_id=current_owner;
    if exists_text then
      text_revision := text_revision+1;
      update core.identity_profile_text_working set revision=text_revision,source_profile_revision=source_revision,updated_at=now() where owner_id=current_owner;
    end if;
  end if;
  return jsonb_build_object('status','success','changed',changed,'profile_revision',source_revision,'text_revision',text_revision,'profile_asset_key',selected_key);
end;
$$;
revoke all on function api.save_current_owner_profile_photo_working(jsonb) from public,anon,authenticated,service_role;
comment on function api.save_current_owner_profile_photo_working(jsonb) is
  'Dormant current-Owner profile photo selection/removal. Consumed same-Owner canonical asset, source/text CAS, atomic binding advance without raw text loss. No upload/deletion/publication/grants.';
commit;

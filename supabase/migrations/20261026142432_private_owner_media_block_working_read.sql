begin;
create function api.resolve_current_owner_media_block_working(input_block_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  context jsonb;
  current_owner uuid;
  working record;
begin
  context := api.resolve_current_owner_home_context();
  if context->>'status' is distinct from 'success' or input_block_id is null then
    return jsonb_build_object('status','unavailable');
  end if;
  current_owner := (api.resolve_current_owner_state()->>'owner_id')::uuid;
  select b.block_id,b.kind,b.is_visible,b.position,c.revision,m.block_id payload_id,m.asset_key,m.alt_text,
    exists(select 1 from core.profile_media_assets a
      join core.profile_media_upload_intents i on i.id=a.source_upload_intent_id and i.owner_id=a.owner_id and i.status='consumed'
      where a.owner_id=b.owner_id and a.asset_key=m.asset_key
        and a.object_key='working/profile/'||a.asset_key||'.webp'
        and a.stored_content_type='image/webp' and a.byte_size between 12 and 3145728
        and a.width between 1 and 2048 and a.height between 1 and 2048
        and a.width::bigint*a.height::bigint<=4194304) asset_registered
    into working
  from core.identity_blocks_working b
  join core.identity_block_collections_working c on c.owner_id=b.owner_id
  left join core.identity_block_media_working m on m.block_id=b.block_id and m.owner_id=b.owner_id and m.kind=b.kind
  where b.block_id=input_block_id and b.owner_id=current_owner and b.kind='media';
  if not found or working.revision not between 1 and 9007199254740991 then
    return jsonb_build_object('status','unavailable');
  end if;
  return context || jsonb_build_object('collection_revision',working.revision,
    'block',jsonb_build_object('block_id',working.block_id,'kind',working.kind,
      'is_visible',working.is_visible,'position',working.position,
      'payload_state',case when working.payload_id is null then 'missing' else 'present' end,
      'media_working',case when working.payload_id is null then null
        else jsonb_build_object('asset_key',working.asset_key,'alt_text',working.alt_text) end,
      'asset_state',case when working.asset_key is null then 'not_selected'
        when working.asset_registered then 'registered' else 'unavailable' end));
end;
$$;
revoke all on function api.resolve_current_owner_media_block_working(uuid) from public,anon,authenticated,service_role;
comment on function api.resolve_current_owner_media_block_working(uuid) is
  'Staged private active/completed current-Owner selected Media Working read. Raw recovery and registry observation only; registered is not blob availability, accessibility, Published or session-final proof. No writes, delivery or publication; all execution withheld.';
commit;

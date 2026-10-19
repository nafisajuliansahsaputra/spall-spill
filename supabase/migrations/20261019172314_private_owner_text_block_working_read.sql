begin;
create function api.resolve_current_owner_text_block_working(input_block_id uuid)
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
  select b.block_id,b.kind,b.is_visible,b.position,c.revision,t.block_id payload_id,t.text_content
    into working
  from core.identity_blocks_working b
  join core.identity_block_collections_working c on c.owner_id=b.owner_id
  left join core.identity_block_texts_working t on t.block_id=b.block_id and t.owner_id=b.owner_id and t.kind=b.kind
  where b.block_id=input_block_id and b.owner_id=current_owner and b.kind='text';
  if not found or working.revision not between 1 and 9007199254740991 then
    return jsonb_build_object('status','unavailable');
  end if;
  return context || jsonb_build_object('collection_revision',working.revision,
    'block',jsonb_build_object('block_id',working.block_id,'kind',working.kind,
      'is_visible',working.is_visible,'position',working.position,
      'payload_state',case when working.payload_id is null then 'missing' else 'present' end,
      'text_working',case when working.payload_id is null then null
        else jsonb_build_object('text',working.text_content) end));
end;
$$;
revoke all on function api.resolve_current_owner_text_block_working(uuid) from public,anon,authenticated,service_role;
comment on function api.resolve_current_owner_text_block_working(uuid) is
  'Staged private stable active/completed current-Owner selected Text Working read. One bound membership/payload only, missing versus all-null-present preserved. Not whole Identity, current-session final proof, mutation or publication authority; all execution withheld.';
commit;

begin;
create function api.resolve_current_owner_blocks_working()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  context jsonb;
  current_owner uuid;
  collection_revision bigint;
  blocks jsonb;
  block_count bigint;
  positions bigint;
begin
  context := api.resolve_current_owner_home_context();
  if context->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable'); end if;
  current_owner := (api.resolve_current_owner_state()->>'owner_id')::uuid;
  select c.revision into collection_revision from core.identity_block_collections_working c where c.owner_id=current_owner;
  if not found then return context || jsonb_build_object('collection',null); end if;
  if collection_revision not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable'); end if;
  select jsonb_agg(jsonb_build_object('block_id',b.block_id,'kind',b.kind,'is_visible',b.is_visible,
    'position',b.position,'payload_state',case when b.kind not in ('social','generic_link') then 'not_implemented'
      when l.block_id is null then 'missing' else 'present' end,
    'link_working',case when l.block_id is null then null else jsonb_build_object(
      'title',l.title,'social_platform',l.social_platform,'destination_url',l.destination_url) end) order by b.position),
    count(*),count(distinct b.position) into blocks,block_count,positions
  from (select * from core.identity_blocks_working where owner_id=current_owner order by position limit 501) b
  left join core.identity_block_links_working l on l.block_id=b.block_id and l.owner_id=b.owner_id and l.kind=b.kind;
  if block_count>500 or block_count<>positions then return jsonb_build_object('status','unavailable'); end if;
  return context || jsonb_build_object('collection',jsonb_build_object('revision',collection_revision,'blocks',coalesce(blocks,'[]'::jsonb)));
end;
$$;
revoke all on function api.resolve_current_owner_blocks_working() from public,anon,authenticated,service_role;
comment on function api.resolve_current_owner_blocks_working() is
  'Staged private Owner block/link Working read. Null collection and missing/nonimplemented payloads explicit; bounded complete response, no writes/default creation/grants/public or whole Identity comparison authority.';
commit;

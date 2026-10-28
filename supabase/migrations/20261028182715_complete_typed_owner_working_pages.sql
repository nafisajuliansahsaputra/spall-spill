begin;
create function api.resolve_current_owner_typed_blocks_working_page(input_request jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  context jsonb;
  current_owner uuid;
  collection_revision bigint;
  expected_revision numeric;
  cursor_position numeric;
  blocks jsonb;
  result jsonb;
  candidate_count bigint;
  positions bigint;
  last_position integer;
begin
  context := api.resolve_current_owner_home_context();
  if context->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable'); end if;
  current_owner := (api.resolve_current_owner_state()->>'owner_id')::uuid;
  if jsonb_typeof(input_request) is distinct from 'object' then return jsonb_build_object('status','invalid_page_request'); end if;
  if not (input_request ?& array['expected_collection_revision','after_position'])
    or exists(select 1 from jsonb_object_keys(input_request) k where k not in ('expected_collection_revision','after_position'))
    or jsonb_typeof(input_request->'expected_collection_revision') not in ('number','null')
    or jsonb_typeof(input_request->'after_position') not in ('number','null')
    or ((input_request->'expected_collection_revision'='null'::jsonb) is distinct from (input_request->'after_position'='null'::jsonb))
  then return jsonb_build_object('status','invalid_page_request'); end if;
  if input_request->'expected_collection_revision'<>'null'::jsonb then
    expected_revision := (input_request->>'expected_collection_revision')::numeric;
    cursor_position := (input_request->>'after_position')::numeric;
    if expected_revision not between 1 and 9007199254740991 or trunc(expected_revision)<>expected_revision
      or cursor_position not between 1 and 2147483647 or trunc(cursor_position)<>cursor_position then
      return jsonb_build_object('status','invalid_page_request'); end if;
  end if;
  select c.revision into collection_revision from core.identity_block_collections_working c where c.owner_id=current_owner;
  if not found then
    if expected_revision is not null then return jsonb_build_object('status','stale_read'); end if;
    return context || jsonb_build_object('collection',null);
  end if;
  if collection_revision not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable'); end if;
  if expected_revision is not null then
    if expected_revision<>collection_revision then return jsonb_build_object('status','stale_read'); end if;
    if not exists(select 1 from core.identity_blocks_working b where b.owner_id=current_owner and b.position=cursor_position::integer) then
      return jsonb_build_object('status','invalid_page_request'); end if;
  end if;
  with candidates as materialized (
    select b.* from core.identity_blocks_working b where b.owner_id=current_owner
      and b.position>coalesce(cursor_position,0)::integer order by b.position limit 101
  ), ranked as (
    select b.*,row_number() over(order by b.position) ordinal from candidates b
  ), projected as (
    select b.*,
      coalesce(l.block_id,t.block_id,ct.block_id,m.block_id,cta.block_id) payload_id,
      case b.kind
        when 'social' then jsonb_build_object('kind',b.kind,'title',l.title,'social_platform',l.social_platform,'destination_url',l.destination_url)
        when 'generic_link' then jsonb_build_object('kind',b.kind,'title',l.title,'social_platform',l.social_platform,'destination_url',l.destination_url)
        when 'text' then jsonb_build_object('kind',b.kind,'text',t.text_content)
        when 'contact' then jsonb_build_object('kind',b.kind,'contact_type',ct.contact_type,'label',ct.label,'value',ct.contact_value)
        when 'media' then jsonb_build_object('kind',b.kind,'asset_key',m.asset_key,'alt_text',m.alt_text)
        when 'spill_cta' then jsonb_build_object('kind',b.kind,'target','owner_spill') end raw_working,
      case when b.kind<>'media' then null when m.asset_key is null then 'not_selected'
        when exists(select 1 from core.profile_media_assets a
          join core.profile_media_upload_intents i on i.id=a.source_upload_intent_id and i.owner_id=a.owner_id and i.status='consumed'
          where a.owner_id=b.owner_id and a.asset_key=m.asset_key
            and a.object_key='working/profile/'||a.asset_key||'.webp'
            and a.stored_content_type='image/webp' and a.byte_size between 12 and 3145728
            and a.width between 1 and 2048 and a.height between 1 and 2048
            and a.width::bigint*a.height::bigint<=4194304) then 'registered' else 'unavailable' end media_asset_state
    from ranked b
    left join core.identity_block_links_working l on l.block_id=b.block_id and l.owner_id=b.owner_id and l.kind=b.kind
    left join core.identity_block_texts_working t on t.block_id=b.block_id and t.owner_id=b.owner_id and t.kind=b.kind
    left join core.identity_block_contacts_working ct on ct.block_id=b.block_id and ct.owner_id=b.owner_id and ct.kind=b.kind
    left join core.identity_block_media_working m on m.block_id=b.block_id and m.owner_id=b.owner_id and m.kind=b.kind
    left join core.identity_block_spill_cta_working cta on cta.block_id=b.block_id and cta.owner_id=b.owner_id and cta.kind=b.kind
  )
  select jsonb_agg(jsonb_build_object('block_id',b.block_id,'kind',b.kind,'is_visible',b.is_visible,
    'position',b.position,'payload_state',case when b.payload_id is null then 'missing' else 'present' end,
    'working',case when b.payload_id is null then null else b.raw_working end,
    'media_asset_state',b.media_asset_state) order by b.position) filter(where b.ordinal<=100),
    count(*),count(distinct b.position),max(b.position) filter(where b.ordinal<=100)
    into blocks,candidate_count,positions,last_position from projected b;
  if candidate_count<>positions then return jsonb_build_object('status','unavailable'); end if;
  result := context || jsonb_build_object('collection',jsonb_build_object('revision',collection_revision,
    'blocks',coalesce(blocks,'[]'::jsonb),'has_more',candidate_count>100,
    'next_after_position',case when candidate_count>100 then last_position else null end));
  if octet_length(result::text)>8388608 then return jsonb_build_object('status','unavailable'); end if;
  return result;
end;
$$;
revoke all on function api.resolve_current_owner_typed_blocks_working_page(jsonb) from public,anon,authenticated,service_role;
comment on function api.resolve_current_owner_typed_blocks_working_page(jsonb) is
  'Staged private six-kind typed Working page from one statement. Same-Owner/kind payload joins, raw recovery/marker/registry states, 100+1 rows and8MiB. No full Identity/public eligibility; grants withheld, old readers unchanged.';
commit;

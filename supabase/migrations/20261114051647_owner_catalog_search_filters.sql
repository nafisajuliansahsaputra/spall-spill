begin;
create function api.resolve_current_owner_spill_manager_filtered(input_filter jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context jsonb; actor_owner uuid; records jsonb; result jsonb; more boolean;
 q text; filter_kind text; filter_lifecycle text; before_value numeric; exact_reference numeric; reference_like boolean;
begin
 if jsonb_typeof(input_filter) is distinct from 'object'
 or not(input_filter ?& array['q','kind','lifecycle','before'])
 or (input_filter-array['q','kind','lifecycle','before'])<>'{}'::jsonb
 or jsonb_typeof(input_filter->'q') is distinct from 'string'
 or jsonb_typeof(input_filter->'kind') is distinct from 'string'
 or jsonb_typeof(input_filter->'lifecycle') is distinct from 'string' then return jsonb_build_object('status','unavailable');end if;
 q:=input_filter->>'q';filter_kind:=input_filter->>'kind';filter_lifecycle:=input_filter->>'lifecycle';
 if char_length(q)>80 or q~'[[:cntrl:]]' or q<>btrim(regexp_replace(q,'[[:space:]]+',' ','g'))
 or filter_kind not in('all','product','resource') or filter_lifecycle not in('all','draft','published','hidden','archived') then return jsonb_build_object('status','unavailable');end if;
 if jsonb_typeof(input_filter->'before')='number' then
  before_value:=(input_filter->>'before')::numeric;
  if before_value not between 1 and 9007199254740991 or trunc(before_value)<>before_value then return jsonb_build_object('status','unavailable');end if;
 elsif jsonb_typeof(input_filter->'before') is distinct from 'null' then return jsonb_build_object('status','unavailable');end if;
 context:=api.resolve_current_owner_home_context();
 if context->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable');end if;
 actor_owner:=(api.resolve_current_owner_state()->>'owner_id')::uuid;
 reference_like:=q~'^#' or q~'^[0-9]+$';
 if q~'^#?[1-9][0-9]{0,15}$' then
  exact_reference:=ltrim(q,'#')::numeric;
  if exact_reference>9007199254740991 then exact_reference:=null;end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('reference',r.spill_reference,'kind',r.kind,
  'title_preview',left(r.title,160),'resource_type',r.resource_type,'working_revision',r.working_revision,
  'source_changed',r.source_changed,'published_lifecycle',r.published_lifecycle) order by r.spill_reference desc),'[]'::jsonb)
 into records from (
  select identity.spill_reference,s.kind,
   case when w.item_id is null then s.title else w.title end title,
   case when w.item_id is null then s.resource_type else w.resource_type end resource_type,
   w.revision working_revision,coalesce(w.source_revision<>s.revision,false) source_changed,p.lifecycle_state published_lifecycle
  from core.workspace_item_sources s
  join core.spill_item_identity_registry identity on identity.item_id=s.id and identity.owner_id=s.owner_id and identity.item_type=s.kind
  left join core.starter_item_working w on w.item_id=s.id and w.owner_id=s.owner_id
  left join core.spill_item_publications p on p.item_id=s.id and p.owner_id=s.owner_id
  where s.owner_id=actor_owner and (before_value is null or identity.spill_reference<before_value)
   and (filter_kind='all' or s.kind=filter_kind)
   and (filter_lifecycle='all' or (filter_lifecycle='draft' and p.item_id is null) or p.lifecycle_state=filter_lifecycle)
   and (q='' or (reference_like and identity.spill_reference=exact_reference)
    or (not reference_like and strpos(lower(case when w.item_id is null then coalesce(s.title,'') else coalesce(w.title,'') end),lower(q))>0))
  order by identity.spill_reference desc limit 21
 ) r;
 more:=jsonb_array_length(records)>20;if more then records:=records-20;end if;
 result:=context||jsonb_build_object('filter',input_filter,'items',records,'has_more',more,
  'next_before_reference',case when more then (records->19->>'reference')::bigint else null end);
 if octet_length(result::text)>1048576 then return jsonb_build_object('status','unavailable');end if;
 return result;
end;$$;
revoke all on function api.resolve_current_owner_spill_manager_filtered(jsonb) from public,anon,authenticated,service_role;
create function api.execute_owner_catalog_search_server(input_subject uuid,input_operation text,input_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare previous_claims text:=current_setting('request.jwt.claims',true);previous_sub text:=current_setting('request.jwt.claim.sub',true);result jsonb;
begin
 if input_subject is null or input_operation is distinct from 'resolve_current_owner_spill_manager_filtered'
 or jsonb_typeof(input_payload) is distinct from 'object' or not(input_payload?'input_filter')
 or (input_payload-'input_filter')<>'{}'::jsonb then return jsonb_build_object('status','unavailable');end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',input_subject,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',input_subject::text,true);
 result:=api.resolve_current_owner_spill_manager_filtered(input_payload->'input_filter');
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);return result;
exception when others then
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);raise;
end;$$;
revoke all on function api.execute_owner_catalog_search_server(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function api.execute_owner_catalog_search_server(uuid,text,jsonb) to service_role;
commit;

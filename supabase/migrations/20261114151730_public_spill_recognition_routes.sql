begin;
create index spill_public_browse_owner_time_idx on core.spill_item_publications(owner_id,published_at desc,spill_reference desc) where lifecycle_state='published';
create function core.public_spill_recognition(input_handle text,input_reference bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare raw jsonb; detail jsonb; destinations jsonb;
begin
 raw:=api.resolve_public_spill_item(input_handle,input_reference);
 if raw->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable');end if;
 detail:=raw->'detail';
 if jsonb_typeof(detail->'title') is distinct from 'string' or char_length(btrim(detail->>'title')) not between 1 and 160 or (detail->>'title')~'[[:cntrl:]]'
 or jsonb_typeof(detail->'display_name') is distinct from 'string' or char_length(btrim(detail->>'display_name')) not between 1 and 80 or (detail->>'display_name')~'[[:cntrl:]]' then return jsonb_build_object('status','unavailable');end if;
 if raw->>'item_type'='product' then
  select jsonb_agg(jsonb_build_object('provider_key',d.value->'provider_key','available',d.value->'available') order by d.ordinality) into destinations
   from jsonb_array_elements(detail->'destinations') with ordinality d(value,ordinality);
  detail:=(detail-'destinations')||jsonb_build_object('destinations',destinations);
 else detail:=detail-'source_url';end if;
 return raw||jsonb_build_object('detail',detail);
end;$$;
revoke all on function core.public_spill_recognition(text,bigint) from public,anon,authenticated,service_role;
create function api.execute_public_spill_server(input_operation text,input_handle text,input_query jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare parent jsonb; after_parent jsonb; actor_owner uuid; selected jsonb; records jsonb; row_record record; summary jsonb;
 q text; normalized_q text; selected_kind text; before_rank integer; before_time timestamptz; before_reference bigint;
 cursor_value jsonb; numeric_value numeric; more boolean; products boolean; resources boolean;
begin
 if input_operation is null or input_operation not in('browse','detail') or jsonb_typeof(input_query) is distinct from 'object'
 or input_handle is null or input_handle<>btrim(input_handle) or char_length(input_handle) not between 3 and 30
 or lower(input_handle)!~'^[a-z0-9][a-z0-9._-]*[a-z0-9]$' then return jsonb_build_object('status','unavailable');end if;
 if input_operation='detail' then
  if not(input_query?'reference') or (input_query-'reference')<>'{}'::jsonb or jsonb_typeof(input_query->'reference') is distinct from 'number' then return jsonb_build_object('status','unavailable');end if;
  numeric_value:=(input_query->>'reference')::numeric;
  if numeric_value not between 1 and 9007199254740991 or trunc(numeric_value)<>numeric_value then return jsonb_build_object('status','unavailable');end if;
 else
  if not(input_query?&array['q','kind','cursor']) or (input_query-array['q','kind','cursor'])<>'{}'::jsonb
   or jsonb_typeof(input_query->'q') is distinct from 'string' or jsonb_typeof(input_query->'kind') is distinct from 'string'
   or char_length(input_query->>'q')>80 or (input_query->>'q')~'[[:cntrl:]]'
   or (input_query->>'q')<>btrim(regexp_replace(input_query->>'q','[[:space:]]+',' ','g'))
   or (input_query->>'kind') not in('all','product','resource') then return jsonb_build_object('status','unavailable');end if;
  q:=input_query->>'q';
  if q~'^#?[+-]?[0-9٠-٩۰-۹０-９]+([.,eE][0-9+-]+)?$' then return jsonb_build_object('status','unavailable');end if;
  normalized_q:=lower(q);selected_kind:=input_query->>'kind';cursor_value:=input_query->'cursor';
  if jsonb_typeof(cursor_value)='object' then
   if not(cursor_value?&array['q','kind','rank','published_at','reference']) or (cursor_value-array['q','kind','rank','published_at','reference'])<>'{}'::jsonb
    or cursor_value->'q' is distinct from input_query->'q' or cursor_value->'kind' is distinct from input_query->'kind'
    or jsonb_typeof(cursor_value->'rank') is distinct from 'number' or (cursor_value->>'rank') not in('0','1','2','3')
    or jsonb_typeof(cursor_value->'published_at') is distinct from 'string' or char_length(cursor_value->>'published_at')>40
    or (cursor_value->>'published_at')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
    or jsonb_typeof(cursor_value->'reference') is distinct from 'number' then return jsonb_build_object('status','unavailable');end if;
   numeric_value:=(cursor_value->>'reference')::numeric;
   if numeric_value not between 1 and 9007199254740991 or trunc(numeric_value)<>numeric_value then return jsonb_build_object('status','unavailable');end if;
   before_reference:=numeric_value::bigint;before_rank:=(cursor_value->>'rank')::integer;before_time:=(cursor_value->>'published_at')::timestamptz;
  elsif jsonb_typeof(cursor_value) is distinct from 'null' then return jsonb_build_object('status','unavailable');end if;
 end if;
 parent:=api.resolve_public_identity(input_handle);
 if parent->>'status' is distinct from 'success' or jsonb_typeof(parent->'display_name') is distinct from 'string' or char_length(btrim(parent->>'display_name')) not between 1 and 80 or (parent->>'display_name')~'[[:cntrl:]]' or (parent->>'starter_key') is null or (parent->>'starter_key') not in('clean','social_focus','featured','business') or (parent->'bio'<>'null'::jsonb and (jsonb_typeof(parent->'bio') is distinct from 'string' or char_length(parent->>'bio')>300)) then return jsonb_build_object('status','unavailable');end if;
 if input_operation='detail' then selected:=core.public_spill_recognition(input_handle,numeric_value::bigint);
 else
  select n.owner_id into actor_owner from core.owner_handle_namespaces n where n.normalized_handle=parent->>'current_handle' and n.namespace_kind='current';
  select exists(select 1 from core.spill_item_publications p where p.owner_id=actor_owner and p.lifecycle_state='published' and p.item_type='product' and core.public_spill_recognition(input_handle,p.spill_reference)->>'status'='success'),
   exists(select 1 from core.spill_item_publications p where p.owner_id=actor_owner and p.lifecycle_state='published' and p.item_type='resource' and core.public_spill_recognition(input_handle,p.spill_reference)->>'status'='success') into products,resources;
  if not(products or resources) then return jsonb_build_object('status','unavailable');end if;
  records:='[]'::jsonb;
  for row_record in
   select bounded.* from (
    select p.spill_reference,p.published_at,recognition.payload,
     case when q='' then 0 when lower(regexp_replace(btrim(p.snapshot->>'title'),'[[:space:]]+',' ','g'))=normalized_q then 3 when strpos(lower(regexp_replace(btrim(p.snapshot->>'title'),'[[:space:]]+',' ','g')),normalized_q)>0 then 2 else 1 end score
    from core.spill_item_publications p
    cross join lateral (select core.public_spill_recognition(input_handle,p.spill_reference) payload offset 0) recognition
    where p.owner_id=actor_owner and p.lifecycle_state='published' and (selected_kind='all' or p.item_type=selected_kind)
     and recognition.payload->>'status'='success'
     and (q='' or not exists(select 1 from unnest(string_to_array(normalized_q,' ')) token where strpos(lower(regexp_replace(btrim(p.snapshot->>'title'),'[[:space:]]+',' ','g')),token)=0))
   ) bounded where before_rank is null or (bounded.score,bounded.published_at,bounded.spill_reference)<(before_rank,before_time,before_reference)
   order by bounded.score desc,bounded.published_at desc,bounded.spill_reference desc limit 21
  loop
   if row_record.payload->>'item_type'='product' then
    summary:=jsonb_build_object('resource_type',null,'primary_image_path',row_record.payload->'detail'->'primary_image_path',
      'available',exists(select 1 from jsonb_array_elements(row_record.payload->'detail'->'destinations') d where d->>'available'='true'));
   else summary:=jsonb_build_object('resource_type',row_record.payload->'detail'->'resource_type','primary_image_path',null,'available',row_record.payload->'detail'->'available');end if;
   records:=records||jsonb_build_array(summary||jsonb_build_object('reference',row_record.spill_reference,'kind',row_record.payload->'item_type','title',row_record.payload->'detail'->'title','rank',row_record.score,'published_at',to_char(row_record.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'cursor',jsonb_build_object('q',q,'kind',selected_kind,'rank',row_record.score,'published_at',to_char(row_record.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'reference',row_record.spill_reference)));
  end loop;
  more:=jsonb_array_length(records)>20;if more then records:=records-20;end if;
  cursor_value:=case when more then records->19->'cursor' else 'null'::jsonb end;
  select coalesce(jsonb_agg(v-'cursor' order by ordinality),'[]'::jsonb) into records from jsonb_array_elements(records) with ordinality a(v,ordinality);
  selected:=jsonb_build_object('status','success','current_handle',parent->'current_handle','display_name',parent->'display_name','q',q,'kind',selected_kind,'has_products',products,'has_resources',resources,'items',records,'has_more',more,'next_cursor',cursor_value);
 end if;
 after_parent:=api.resolve_public_identity(input_handle);
 if after_parent is distinct from parent or octet_length(selected::text)>131072 then return jsonb_build_object('status','unavailable');end if;
 return selected;
exception when invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return jsonb_build_object('status','unavailable');
end;$$;
revoke all on function api.execute_public_spill_server(text,text,jsonb) from public,anon,authenticated;
grant execute on function api.execute_public_spill_server(text,text,jsonb) to service_role;
commit;

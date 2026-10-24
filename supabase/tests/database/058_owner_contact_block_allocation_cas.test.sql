begin;
select no_plan();
select ok((select prosecdef and provolatile='v' from pg_proc where oid='api.add_current_owner_contact_block_working(jsonb)'::regprocedure),'Hardened volatile CAS definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.add_current_owner_contact_block_working(jsonb)'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.add_current_owner_contact_block_working(jsonb)','EXECUTE'),'anon execution withheld');
select ok(not has_function_privilege('authenticated','api.add_current_owner_contact_block_working(jsonb)','EXECUTE'),'authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.add_current_owner_contact_block_working(jsonb)','EXECUTE'),'service execution withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='add_current_owner_contact_block_working' and grantee='PUBLIC'),'PUBLIC execution withheld');
set local role authenticated;
select throws_ok($$select api.add_current_owner_contact_block_working('{}')$$,'42501',null,'Actual authenticated execution denied');
reset role;
set local role anon;
select throws_ok($$select api.add_current_owner_contact_block_working('{}')$$,'42501',null,'Actual anon execution denied');
reset role;
set local role service_role;
select throws_ok($$select api.add_current_owner_contact_block_working('{}')$$,'42501',null,'Actual service execution denied');
reset role;
set local request.jwt.claims='{}';
select is(api.add_current_owner_contact_block_working('{}'),'{"status":"unauthenticated"}'::jsonb,'No actor denies');
set local request.jwt.claims='{"sub":"c9000000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"forged"}}';
select is(api.add_current_owner_contact_block_working('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata cannot invent Owner');
insert into auth.users(id,email) values
 ('c9000000-0000-4000-8000-000000000001','add-one@example.test'),
 ('c9000000-0000-4000-8000-000000000002','add-two@example.test'),
 ('c9000000-0000-4000-8000-000000000003','add-empty@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('c9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000002','c9000000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'contact-add-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"c9000000-0000-4000-8000-000000000001"}';
select is(api.add_current_owner_contact_block_working('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner denies');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id<>'c9000000-0000-4000-8000-000000000003';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select 'c9000000-0000-4000-8000-000000000011',owner_id,'generic_link',1,false from actors where auth_user_id='c9000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'c9000000-0000-4000-8000-000000000012',owner_id,'social',2 from actors where auth_user_id='c9000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'c9000000-0000-4000-8000-000000000013',owner_id,'contact',3 from actors where auth_user_id='c9000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'c9000000-0000-4000-8000-000000000014',owner_id,'generic_link',1 from actors where auth_user_id='c9000000-0000-4000-8000-000000000002';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url,created_at)
 select block_id,owner_id,kind,'original',null,'https://original.example.test','2000-01-01'::timestamptz
 from core.identity_blocks_working where block_id in ('c9000000-0000-4000-8000-000000000011','c9000000-0000-4000-8000-000000000014');
insert into core.identity_connection_working(owner_id,connection_kind,destination_url,revision)
 select owner_id,'generic_link','https://source.example.test',3 from actors where auth_user_id='c9000000-0000-4000-8000-000000000001';
insert into core.identity_block_initialization_provenance(owner_id,initial_block_id,source_connection_revision,source_connection_kind,source_destination_url,initial_title)
 select owner_id,'c9000000-0000-4000-8000-000000000011',3,'generic_link','https://source.example.test','original' from actors where auth_user_id='c9000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'c9000000-0000-4000-8000-000000000015',owner_id,'contact',4 from actors where auth_user_id='c9000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'c9000000-0000-4000-8000-000000000016',owner_id,'media',5 from actors where auth_user_id='c9000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'c9000000-0000-4000-8000-000000000017',owner_id,'spill_cta',6 from actors where auth_user_id='c9000000-0000-4000-8000-000000000001';
update core.identity_blocks_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_block_collections_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_blocks_working set position=case right(block_id::text,2)
 when '11' then 1 when '12' then 7 when '13' then 42 when '15' then 100 when '16' then 500 when '17' then 1000 else position end
 where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000001');
update core.identity_blocks_working set position=7 where block_id='c9000000-0000-4000-8000-000000000014';
-- Contact allocation CAS race fixtures end here.
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'c9000000-0000-4000-8000-000000000019',owner_id,'text',4 from actors where auth_user_id='c9000000-0000-4000-8000-000000000001';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,'Sibling Text' from core.identity_blocks_working where block_id='c9000000-0000-4000-8000-000000000019';
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_value)
 select block_id,owner_id,kind,'Existing own Contact' from core.identity_blocks_working where block_id='c9000000-0000-4000-8000-000000000013';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select 'c9000000-0000-4000-8000-000000000018',owner_id,'contact',11,false from actors where auth_user_id='c9000000-0000-4000-8000-000000000002';
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_value)
 select block_id,owner_id,kind,'Foreign Contact' from core.identity_blocks_working where block_id='c9000000-0000-4000-8000-000000000018';
create function pg_temp.contact_intent(base numeric default 1, content text default ' <script>raw</script> ' || chr(1), visible boolean default false, subtype text default 'email', caption text default null)
returns jsonb language sql as $$select jsonb_build_object('action','add_contact_block','base_collection_revision',base,'is_visible',visible,'contact_working',jsonb_build_object('kind','contact','contact_type',subtype,'label',caption,'value',content))$$;
create temporary table original_members as select * from core.identity_blocks_working;
create temporary table original_links as select * from core.identity_block_links_working;
create temporary table original_contacts as select * from core.identity_block_contacts_working;
create temporary table original_collections as select * from core.identity_block_collections_working;
create temporary table purity(table_name text,value jsonb);
do $$declare name text; val jsonb; begin
 foreach name in array array['owners','identity_block_texts_working','identity_connection_working','identity_block_initialization_provenance','identity_working','identity_layout_working','identity_publications','onboarding_preview_receipts','owner_auth_bindings','owner_handle_namespaces','owner_onboarding_progress'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',name) into val;
  insert into purity values(name,val);
 end loop;
end; $$;
select is(api.add_current_owner_contact_block_working('null'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('[]'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('"add_contact_block"'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":null,"base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":true,"base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_link_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"initialize_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block ","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":null,"is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":0,"is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":-1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1.5,"is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":"1","is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":9007199254740992,"is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":null,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":0,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":"false","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":null}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":[]}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":"text"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","is_visible":false,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"owner_id":"forged","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"block_id":"forged","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"position":"forged","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"source_revision":"forged","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"provenance":"forged","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"collection_revision":"forged","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"operation_id":"forged","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"safe":"forged","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"published":"forged","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"issues":"forged","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"html":"forged","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","owner_id":"forged","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","block_id":"forged","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","html":"forged","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","format":"forged","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","safe":"forged","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","published":"forged","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","destination_url":"forged","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":"private","issues":"forged","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"value":null,"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"generic_link","value":null,"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":null,"value":null,"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":42,"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":false,"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working('{"action":"add_contact_block","base_collection_revision":1,"is_visible":false,"contact_working":{"kind":"contact","value":[],"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Contact envelope');
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent(1,repeat('🙂',2049))),'{"status":"invalid_add_intent"}'::jsonb,'Over code-point envelope denied');
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent(1,'raw',false,'Email')),'{"status":"invalid_add_intent"}'::jsonb,'Unsupported subtype is not normalized');
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent(1,'raw',false,'phone',repeat('🙂',513))),' {"status":"invalid_add_intent"}'::jsonb,'Over label code-point bound denied');
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent()-'is_visible'),' {"status":"invalid_add_intent"}'::jsonb,'No implicit visibility');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working}',(pg_temp.contact_intent()->'contact_working')-'contact_type')),'{"status":"invalid_add_intent"}'::jsonb,'Missing contact_type never defaults');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working,contact_type}','true'::jsonb)),'{"status":"invalid_add_intent"}'::jsonb,'Wrong contact_type storage type rejected');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working,contact_type}','42'::jsonb)),'{"status":"invalid_add_intent"}'::jsonb,'Wrong contact_type storage type rejected');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working,contact_type}','[]'::jsonb)),'{"status":"invalid_add_intent"}'::jsonb,'Wrong contact_type storage type rejected');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working,contact_type}','{}'::jsonb)),'{"status":"invalid_add_intent"}'::jsonb,'Wrong contact_type storage type rejected');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working}',(pg_temp.contact_intent()->'contact_working')-'label')),'{"status":"invalid_add_intent"}'::jsonb,'Missing label never defaults');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working,label}','true'::jsonb)),'{"status":"invalid_add_intent"}'::jsonb,'Wrong label storage type rejected');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working,label}','42'::jsonb)),'{"status":"invalid_add_intent"}'::jsonb,'Wrong label storage type rejected');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working,label}','[]'::jsonb)),'{"status":"invalid_add_intent"}'::jsonb,'Wrong label storage type rejected');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working,label}','{}'::jsonb)),'{"status":"invalid_add_intent"}'::jsonb,'Wrong label storage type rejected');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working}',(pg_temp.contact_intent()->'contact_working')-'value')),'{"status":"invalid_add_intent"}'::jsonb,'Missing value never defaults');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working,value}','true'::jsonb)),'{"status":"invalid_add_intent"}'::jsonb,'Wrong value storage type rejected');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working,value}','42'::jsonb)),'{"status":"invalid_add_intent"}'::jsonb,'Wrong value storage type rejected');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working,value}','[]'::jsonb)),'{"status":"invalid_add_intent"}'::jsonb,'Wrong value storage type rejected');
select is(api.add_current_owner_contact_block_working(jsonb_set(pg_temp.contact_intent(),'{contact_working,value}','{}'::jsonb)),'{"status":"invalid_add_intent"}'::jsonb,'Wrong value storage type rejected');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000001');
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent()),'{"status":"owner_not_eligible"}'::jsonb,'Restricted Owner denied');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000001');
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent()),'{"status":"owner_not_eligible"}'::jsonb,'Suspended Owner denied');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000001');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000001');
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent()),'{"status":"unavailable"}'::jsonb,'Missing canonical context denied');
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000001');
select ok(not exists((select * from core.identity_blocks_working except select * from original_members) union all(select * from original_members except select * from core.identity_blocks_working)),'Denials preserve membership');
select ok(not exists((select * from core.identity_block_collections_working except select * from original_collections) union all(select * from original_collections except select * from core.identity_block_collections_working)),'Denials preserve collection');
-- Fail specifically between membership insertion and revision update.
create function pg_temp.reject_contact_payload() returns trigger language plpgsql as $$begin raise exception 'fixture blocked Contact payload'; end;$$;
create trigger reject_contact_fixture before insert on core.identity_block_contacts_working for each row execute function pg_temp.reject_contact_payload();
select throws_ok('select api.add_current_owner_contact_block_working(pg_temp.contact_intent())','P0001','fixture blocked Contact payload','Partial failure propagates');
drop trigger reject_contact_fixture on core.identity_block_contacts_working;
select ok(not exists((select * from core.identity_blocks_working except select * from original_members) union all(select * from original_members except select * from core.identity_blocks_working)),'Payload failure rolls back allocated membership');
select ok(not exists((select * from core.identity_block_collections_working except select * from original_collections) union all(select * from original_collections except select * from core.identity_block_collections_working)),'Payload failure no revision bump');
select ok(not exists((select * from core.identity_block_contacts_working except select * from original_contacts) union all(select * from original_contacts except select * from core.identity_block_contacts_working)),'Payload failure no partial row');
create temporary table replies(value jsonb);
insert into replies values(api.add_current_owner_contact_block_working(pg_temp.contact_intent()));
select is((select array_agg(k order by k) from replies,jsonb_object_keys(value) k),array['block_id','collection_revision','status'],'Minimal exact acknowledgment');
select is((select value->>'status' from replies),'success','Explicit Contact allocation succeeds');
select matches((select value->>'block_id' from replies),'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$','Server UUID');
select is((select value->>'collection_revision' from replies),'2','Exactly one revision bump');
select ok((select b.kind='contact' and not b.is_visible and b.position=1001 and b.owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000001') from core.identity_blocks_working b where b.block_id=(select (value->>'block_id')::uuid from replies)),'Appends after own hidden/all-kind maximum with actual binding');
select is((select t.contact_value from core.identity_block_contacts_working t where t.block_id=(select (value->>'block_id')::uuid from replies)),pg_temp.contact_intent()->'contact_working'->>'value','Exact invalid raw content retained');
select is((select api.resolve_current_owner_contact_block_working((value->>'block_id')::uuid)->'block'->'contact_working' from replies),(pg_temp.contact_intent()->'contact_working')-'kind','Selected read sees exact committed raw payload');
select is((select created_at from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000001')),'2000-01-01'::timestamptz,'Collection created_at retained');
select ok(not exists(select * from original_members except select * from core.identity_blocks_working),'All previous member columns retained');
select ok(not exists((select * from core.identity_block_links_working except select * from original_links) union all(select * from original_links except select * from core.identity_block_links_working)),'All Link payloads unchanged');
select ok(not exists(select * from original_contacts except select * from core.identity_block_contacts_working),'Existing own and foreign Contact payload columns retained');
select ok(not exists(select * from original_collections where owner_id<>(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000001') except select * from core.identity_block_collections_working),'Other Owner collection columns retained');
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent()),'{"status":"stale_write"}'::jsonb,'Old base replay cannot duplicate');
insert into replies values(api.add_current_owner_contact_block_working(pg_temp.contact_intent(2)));
select is((select count(distinct value->>'block_id') from replies),2::bigint,'Deliberate fresh intent gets distinct ID for same content');
-- Null/blank/CRLF/Unicode remain persistable even when hidden or incomplete.
insert into replies values(api.add_current_owner_contact_block_working(pg_temp.contact_intent(3,null,true,null,null)));
select is((select contact_value from core.identity_block_contacts_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='4')),null::text,'Null is present raw payload');
select ok((select is_visible from core.identity_blocks_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='4')),'Explicit visible retained');
insert into replies values(api.add_current_owner_contact_block_working(pg_temp.contact_intent(4,E'  \r\n\t  ',false,'phone',E' Raw\tlabel ')));
select is((select contact_value from core.identity_block_contacts_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='5')),E'  \r\n\t  ','Blank raw CRLF retained');
insert into replies values(api.add_current_owner_contact_block_working(pg_temp.contact_intent(5,repeat('🙂',2048),false,'whatsapp',repeat('🙂',512))));
select is((select char_length(contact_value) from core.identity_block_contacts_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='6')),2048,'Code points not UTF16 units');
select is((select api.resolve_current_owner_contact_block_working((value->>'block_id')::uuid)->'block'->'contact_working' from replies where value->>'collection_revision'='4'),'{"contact_type":null,"label":null,"value":null}'::jsonb,'Present all-null Contact retained');
select is((select contact_type from core.identity_block_contacts_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='5')),'phone','Phone subtype retained');
select is((select label from core.identity_block_contacts_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='5')),E' Raw\tlabel ','Raw label preserved');
select is((select contact_type from core.identity_block_contacts_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='6')),'whatsapp','WhatsApp subtype retained');
select is((select char_length(label) from core.identity_block_contacts_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='6')),512,'Full label code-point bound preserved');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000001')),6::bigint,'Each committed add bumps once');
update core.identity_blocks_working set position=2147483647 where block_id='c9000000-0000-4000-8000-000000000017';
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent(6)),'{"status":"position_exhausted"}'::jsonb,'No int32 overflow or gap reuse');
update core.identity_block_collections_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000001');
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent(6)),'{"status":"stale_write"}'::jsonb,'Stale before exhausted revision');
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent(9007199254740991)),'{"status":"revision_exhausted"}'::jsonb,'No unsafe next revision');
select is((select count(*) from core.identity_block_contacts_working),(select count(*)+5 from original_contacts),'All denials no extra Contact payload');
set local request.jwt.claims='{"sub":"c9000000-0000-4000-8000-000000000002"}';
delete from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000002');
insert into replies values(api.add_current_owner_contact_block_working(pg_temp.contact_intent(1,'')));
select is((select position from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000002')),1,'Initialized-empty appends at1 independently of foreign max');
select is((select contact_value from core.identity_block_contacts_working where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000002')),'','Empty content retained');
insert into core.identity_blocks_working(owner_id,kind,position,is_visible) select (select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000002'),'contact',g,false from generate_series(2,999) g;
insert into replies values(api.add_current_owner_contact_block_working(pg_temp.contact_intent(2,'capacity')));
select is((select count(*) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000002')),1000::bigint,'999 to1000 succeeds');
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent(2)),'{"status":"stale_write"}'::jsonb,'Old base stale before capacity');
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent(3)),'{"status":"unavailable"}'::jsonb,'Fresh base at capacity denied');
insert into core.identity_blocks_working(owner_id,kind,position,is_visible) select (select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000002'),'media',1001,false;
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent(3)),'{"status":"unavailable"}'::jsonb,'Over-bound unavailable without truncation');
select is((select count(*) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000002')),1001::bigint,'Existing over-bound content retained');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000002')),3::bigint,'Capacity denial no bump');
set local request.jwt.claims='{"sub":"c9000000-0000-4000-8000-000000000003"}';
select is(api.add_current_owner_contact_block_working(pg_temp.contact_intent()),'{"status":"unavailable"}'::jsonb,'Missing collection never inferred empty');
select is((select count(*) from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='c9000000-0000-4000-8000-000000000003')),0::bigint,'No implicit initialization');
create function pg_temp.check_purity() returns setof text language plpgsql as $$declare item record; val jsonb; begin
 for item in select * from purity loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',item.table_name) into val;
  return next is(val,item.value,item.table_name || ' unchanged');
 end loop;
end;$$;
select * from pg_temp.check_purity();
select * from finish();
rollback;

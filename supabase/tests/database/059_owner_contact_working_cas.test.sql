begin;
select no_plan();
select ok((select prosecdef and provolatile='v' from pg_proc where oid='api.save_current_owner_block_contact_working(jsonb)'::regprocedure),'Hardened volatile CAS definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.save_current_owner_block_contact_working(jsonb)'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.save_current_owner_block_contact_working(jsonb)','EXECUTE'),'anon execution withheld');
select ok(not has_function_privilege('authenticated','api.save_current_owner_block_contact_working(jsonb)','EXECUTE'),'authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.save_current_owner_block_contact_working(jsonb)','EXECUTE'),'service execution withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='save_current_owner_block_contact_working' and grantee='PUBLIC'),'PUBLIC execution withheld');
set local role authenticated;
select throws_ok($$select api.save_current_owner_block_contact_working('{}')$$,'42501',null,'Actual authenticated execution denied');
reset role;
set local role anon;
select throws_ok($$select api.save_current_owner_block_contact_working('{}')$$,'42501',null,'Actual anon execution denied');
reset role;
set local role service_role;
select throws_ok($$select api.save_current_owner_block_contact_working('{}')$$,'42501',null,'Actual service execution denied');
reset role;
set local request.jwt.claims='{}';
select is(api.save_current_owner_block_contact_working('{}'),'{"status":"unauthenticated"}'::jsonb,'No actor denies');
set local request.jwt.claims='{"sub":"ca000000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"forged"}}';
select is(api.save_current_owner_block_contact_working('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata cannot invent Owner');
insert into auth.users(id,email) values
 ('ca000000-0000-4000-8000-000000000001','save-one@example.test'),
 ('ca000000-0000-4000-8000-000000000002','save-two@example.test'),
 ('ca000000-0000-4000-8000-000000000003','save-empty@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('ca000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000002','ca000000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'contact-save-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"ca000000-0000-4000-8000-000000000001"}';
select is(api.save_current_owner_block_contact_working('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner denies');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id<>'ca000000-0000-4000-8000-000000000003';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select 'ca000000-0000-4000-8000-000000000011',owner_id,'generic_link',1,false from actors where auth_user_id='ca000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'ca000000-0000-4000-8000-000000000012',owner_id,'social',2 from actors where auth_user_id='ca000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'ca000000-0000-4000-8000-000000000013',owner_id,'contact',3 from actors where auth_user_id='ca000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'ca000000-0000-4000-8000-000000000014',owner_id,'generic_link',1 from actors where auth_user_id='ca000000-0000-4000-8000-000000000002';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url,created_at)
 select block_id,owner_id,kind,'original',null,'https://original.example.test','2000-01-01'::timestamptz
 from core.identity_blocks_working where block_id in ('ca000000-0000-4000-8000-000000000011','ca000000-0000-4000-8000-000000000014');
insert into core.identity_connection_working(owner_id,connection_kind,destination_url,revision)
 select owner_id,'generic_link','https://source.example.test',3 from actors where auth_user_id='ca000000-0000-4000-8000-000000000001';
insert into core.identity_block_initialization_provenance(owner_id,initial_block_id,source_connection_revision,source_connection_kind,source_destination_url,initial_title)
 select owner_id,'ca000000-0000-4000-8000-000000000011',3,'generic_link','https://source.example.test','original' from actors where auth_user_id='ca000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'ca000000-0000-4000-8000-000000000015',owner_id,'text',4 from actors where auth_user_id='ca000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'ca000000-0000-4000-8000-000000000016',owner_id,'media',5 from actors where auth_user_id='ca000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select 'ca000000-0000-4000-8000-000000000017',owner_id,'spill_cta',6 from actors where auth_user_id='ca000000-0000-4000-8000-000000000001';
update core.identity_blocks_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_block_collections_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_blocks_working set position=case right(block_id::text,2)
 when '11' then 1 when '12' then 7 when '13' then 42 when '15' then 100 when '16' then 500 when '17' then 1000 else position end
 where owner_id=(select owner_id from actors where auth_user_id='ca000000-0000-4000-8000-000000000001');
update core.identity_blocks_working set position=7 where block_id='ca000000-0000-4000-8000-000000000014';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select 'ca000000-0000-4000-8000-000000000019',owner_id,'contact',1100,false from actors where auth_user_id='ca000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select 'ca000000-0000-4000-8000-000000000018',owner_id,'contact',11,false from actors where auth_user_id='ca000000-0000-4000-8000-000000000002';
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_value,created_at)
 select block_id,owner_id,kind,'original','2000-01-01'::timestamptz from core.identity_blocks_working
 where block_id in ('ca000000-0000-4000-8000-000000000013','ca000000-0000-4000-8000-000000000018');
-- Contact save CAS race fixtures end here.
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content) select block_id,owner_id,kind,'Sibling Text' from core.identity_blocks_working where block_id='ca000000-0000-4000-8000-000000000015';
create function pg_temp.contact_save(content text default ' <script>raw</script> ' || chr(1), base numeric default 1, target uuid default 'ca000000-0000-4000-8000-000000000013', subtype text default 'email', caption text default null)
returns jsonb language sql as $$select jsonb_build_object('block_id',target,'base_collection_revision',base,'contact_working',jsonb_build_object('kind','contact','contact_type',subtype,'label',caption,'value',content))$$;
create temporary table original_members as select * from core.identity_blocks_working;
create temporary table original_links as select * from core.identity_block_links_working;
create temporary table original_foreign as select * from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000018';
create temporary table purity(table_name text,value jsonb);
do $$declare name text; val jsonb; begin
 foreach name in array array['owners','identity_block_texts_working','identity_connection_working','identity_block_initialization_provenance','identity_working','identity_layout_working','identity_publications','onboarding_preview_receipts','owner_auth_bindings','owner_handle_namespaces','owner_onboarding_progress'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',name) into val;
  insert into purity values(name,val);
 end loop;
end; $$;
select is(api.save_current_owner_block_contact_working('null'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('[]'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('true'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('"save_text_block"'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"base_collection_revision":1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":null,"base_collection_revision":1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":true,"base_collection_revision":1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"forged","base_collection_revision":1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"CA000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":null,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":0,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":-1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1.5,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":"1","contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":true,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":9007199254740992,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id": "ca000000-0000-4000-8000-000000000013", "base_collection_revision": 1}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":null}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":[]}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":true}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null},"owner_id":"forged"}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null},"action":"save_text_block"}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null},"is_visible":false}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null},"position":1}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null},"collection_revision":2}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","value":"private","contact_type":"email","label":null},"published":true}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"value":null,"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"social","value":null,"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":null,"value":null,"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","value":5,"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","value":[],"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","value":{},"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","value":false,"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working('{"block_id":"ca000000-0000-4000-8000-000000000013","base_collection_revision":1,"contact_working":{"kind":"contact","issues":[],"value":null,"contact_type":"email","label":null}}'::jsonb),'{"status":"invalid_contact_working"}'::jsonb,'Strict explicit existing Contact save envelope');
select is(api.save_current_owner_block_contact_working(null),'{"status":"invalid_contact_working"}'::jsonb,'SQL null denied');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save(repeat('🐈',2049))),'{"status":"invalid_contact_working"}'::jsonb,'Unicode code-point ceiling');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working}',(pg_temp.contact_save()->'contact_working')-'contact_type')),'{"status":"invalid_contact_working"}'::jsonb,'Missing contact_type never defaults');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working,contact_type}','true'::jsonb)),'{"status":"invalid_contact_working"}'::jsonb,'Wrong contact_type storage type rejected');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working,contact_type}','42'::jsonb)),'{"status":"invalid_contact_working"}'::jsonb,'Wrong contact_type storage type rejected');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working,contact_type}','[]'::jsonb)),'{"status":"invalid_contact_working"}'::jsonb,'Wrong contact_type storage type rejected');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working,contact_type}','{}'::jsonb)),'{"status":"invalid_contact_working"}'::jsonb,'Wrong contact_type storage type rejected');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working}',(pg_temp.contact_save()->'contact_working')-'label')),'{"status":"invalid_contact_working"}'::jsonb,'Missing label never defaults');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working,label}','true'::jsonb)),'{"status":"invalid_contact_working"}'::jsonb,'Wrong label storage type rejected');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working,label}','42'::jsonb)),'{"status":"invalid_contact_working"}'::jsonb,'Wrong label storage type rejected');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working,label}','[]'::jsonb)),'{"status":"invalid_contact_working"}'::jsonb,'Wrong label storage type rejected');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working,label}','{}'::jsonb)),'{"status":"invalid_contact_working"}'::jsonb,'Wrong label storage type rejected');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working}',(pg_temp.contact_save()->'contact_working')-'value')),'{"status":"invalid_contact_working"}'::jsonb,'Missing value never defaults');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working,value}','true'::jsonb)),'{"status":"invalid_contact_working"}'::jsonb,'Wrong value storage type rejected');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working,value}','42'::jsonb)),'{"status":"invalid_contact_working"}'::jsonb,'Wrong value storage type rejected');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working,value}','[]'::jsonb)),'{"status":"invalid_contact_working"}'::jsonb,'Wrong value storage type rejected');
select is(api.save_current_owner_block_contact_working(jsonb_set(pg_temp.contact_save(),'{contact_working,value}','{}'::jsonb)),'{"status":"invalid_contact_working"}'::jsonb,'Wrong value storage type rejected');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('raw',1,'ca000000-0000-4000-8000-000000000013','Email')),'{"status":"invalid_contact_working"}'::jsonb,'No subtype normalization');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('raw',1,'ca000000-0000-4000-8000-000000000013','phone',repeat('🐈',513))),'{"status":"invalid_contact_working"}'::jsonb,'Label code-point ceiling');
select throws_ok($$select '"\u0000"'::jsonb$$,'22P05',null,'NUL cannot enter PostgreSQL JSON');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('denied',1,'ca000000-0000-4000-8000-000000000018')),'{"status": "block_not_found"}'::jsonb,'Foreign and absent UUID share denial');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('denied',1,'ca000000-0000-4000-8000-000000000098')),'{"status": "block_not_found"}'::jsonb,'Foreign and absent UUID share denial');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('denied',1,'ca000000-0000-4000-8000-000000000011')),'{"status": "unsupported_block_kind"}'::jsonb,'Own other kinds are not converted');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('denied',1,'ca000000-0000-4000-8000-000000000012')),'{"status": "unsupported_block_kind"}'::jsonb,'Own other kinds are not converted');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('denied',1,'ca000000-0000-4000-8000-000000000015')),'{"status": "unsupported_block_kind"}'::jsonb,'Own other kinds are not converted');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('denied',1,'ca000000-0000-4000-8000-000000000016')),'{"status": "unsupported_block_kind"}'::jsonb,'Own other kinds are not converted');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('denied',1,'ca000000-0000-4000-8000-000000000017')),'{"status": "unsupported_block_kind"}'::jsonb,'Own other kinds are not converted');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('stale',2)),'{"status": "stale_write"}'::jsonb,'Wrong base cannot write');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='ca000000-0000-4000-8000-000000000001')),1::bigint,'All input/target denials preserve revision');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='ca000000-0000-4000-8000-000000000001');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save()),'{"status": "owner_not_eligible"}'::jsonb,'Nonactive Owner denied');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='ca000000-0000-4000-8000-000000000001');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save()),'{"status": "owner_not_eligible"}'::jsonb,'Nonactive Owner denied');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='ca000000-0000-4000-8000-000000000001');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('null'::jsonb#>>'{}',1)),'{"status": "success", "block_id": "ca000000-0000-4000-8000-000000000013", "collection_revision": 2}'::jsonb,'Raw content save one aggregate bump');
select is((select to_jsonb(contact_value) from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000013'),null::jsonb,'Exact raw nullable content retained');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('""'::jsonb#>>'{}',2)),'{"status": "success", "block_id": "ca000000-0000-4000-8000-000000000013", "collection_revision": 3}'::jsonb,'Raw content save one aggregate bump');
select is((select to_jsonb(contact_value) from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000013'),'""'::jsonb,'Exact raw nullable content retained');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('"  "'::jsonb#>>'{}',3)),'{"status": "success", "block_id": "ca000000-0000-4000-8000-000000000013", "collection_revision": 4}'::jsonb,'Raw content save one aggregate bump');
select is((select to_jsonb(contact_value) from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000013'),'"  "'::jsonb,'Exact raw nullable content retained');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('"\t\r\n"'::jsonb#>>'{}',4)),'{"status": "success", "block_id": "ca000000-0000-4000-8000-000000000013", "collection_revision": 5}'::jsonb,'Raw content save one aggregate bump');
select is((select to_jsonb(contact_value) from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000013'),'"\t\r\n"'::jsonb,'Exact raw nullable content retained');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('"x\u0001"'::jsonb#>>'{}',5)),'{"status": "success", "block_id": "ca000000-0000-4000-8000-000000000013", "collection_revision": 6}'::jsonb,'Raw content save one aggregate bump');
select is((select to_jsonb(contact_value) from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000013'),'"x\u0001"'::jsonb,'Exact raw nullable content retained');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('"<script>private()</script>"'::jsonb#>>'{}',6)),'{"status": "success", "block_id": "ca000000-0000-4000-8000-000000000013", "collection_revision": 7}'::jsonb,'Raw content save one aggregate bump');
select is((select to_jsonb(contact_value) from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000013'),'"<script>private()</script>"'::jsonb,'Exact raw nullable content retained');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('"é🐈"'::jsonb#>>'{}',7)),'{"status": "success", "block_id": "ca000000-0000-4000-8000-000000000013", "collection_revision": 8}'::jsonb,'Raw content save one aggregate bump');
select is((select to_jsonb(contact_value) from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000013'),'"é🐈"'::jsonb,'Exact raw nullable content retained');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save(repeat('🐈',2048),8))->'collection_revision','9'::jsonb,'Max Unicode code-point content succeeds');
select is((select created_at from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000013'),'2000-01-01'::timestamptz,'Existing payload created_at retained');
select ok((select updated_at>created_at from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000013'),'Payload timestamp updates');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save(null,9,'ca000000-0000-4000-8000-000000000019')),'{"status": "success", "block_id": "ca000000-0000-4000-8000-000000000019", "collection_revision": 10}'::jsonb,'Explicit save creates missing payload only for existing Contact');
select is(api.resolve_current_owner_contact_block_working('ca000000-0000-4000-8000-000000000019')->'block'->>'payload_state','present','Explicit null is present payload');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save(null,10,'ca000000-0000-4000-8000-000000000019'))->'collection_revision','11'::jsonb,'Identical save still bumps once');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('old',1)),'{"status": "stale_write"}'::jsonb,'Acknowledged old base cannot overwrite');
create temporary table before_failed_update as select * from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000013';
create function pg_temp.fail_revision() returns trigger language plpgsql as $$begin raise exception 'fixture after payload' using errcode='P0001'; end;$$;
create trigger contact_save_fail_revision before update on core.identity_block_collections_working for each row execute function pg_temp.fail_revision();
select throws_ok($$select api.save_current_owner_block_contact_working(pg_temp.contact_save('rollback',11,'ca000000-0000-4000-8000-000000000013','phone','rollback label'))$$,'P0001','fixture after payload','Failure between payload and revision rolls back payload');
delete from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000019';
select throws_ok($$select api.save_current_owner_block_contact_working(pg_temp.contact_save('rollback insert',11,'ca000000-0000-4000-8000-000000000019'))$$,'P0001','fixture after payload','Failure rolls back newly inserted missing payload');
select is((select count(*) from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000019'),0::bigint,'Rolled back insert stays missing');
drop trigger contact_save_fail_revision on core.identity_block_collections_working;
select is((select to_jsonb(t) from core.identity_block_contacts_working t where block_id='ca000000-0000-4000-8000-000000000013'),(select to_jsonb(t) from before_failed_update t),'Injected failure retains every prior payload field/timestamp');
select is((select contact_value from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000013'),repeat('🐈',2048),'Injected rollback retains previous raw text');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='ca000000-0000-4000-8000-000000000001')),11::bigint,'Injected rollback retains revision');
update core.identity_block_collections_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='ca000000-0000-4000-8000-000000000001');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('no write',9007199254740991)),'{"status": "revision_exhausted"}'::jsonb,'Maximum/unsafe authoritative revision denies');
-- Corrupt unsafe revisions are unrepresentable under the unchanged storage constraint.
select throws_ok($$update core.identity_block_collections_working set revision=9007199254740992 where owner_id=(select owner_id from actors where auth_user_id='ca000000-0000-4000-8000-000000000001')$$,'23514',null,'Storage rejects unsafe revision without weakening its constraint');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('no write',9007199254740991)),'{"status": "revision_exhausted"}'::jsonb,'Rejected unsafe fixture leaves prior maximum revision intact');
select is((select contact_value from core.identity_block_contacts_working where block_id='ca000000-0000-4000-8000-000000000013'),repeat('🐈',2048),'Revision exhaustion/unsafe denial retained content');
select is((select jsonb_agg(to_jsonb(t) order by block_id) from core.identity_blocks_working t),(select jsonb_agg(to_jsonb(t) order by block_id) from original_members t),'All member IDs/Owner/kinds/order/visibility/timestamps unchanged');
select is((select jsonb_agg(to_jsonb(t) order by block_id) from core.identity_block_links_working t),(select jsonb_agg(to_jsonb(t) order by block_id) from original_links t),'All Link payloads untouched');
select is((select to_jsonb(t) from core.identity_block_contacts_working t where block_id='ca000000-0000-4000-8000-000000000018'),(select to_jsonb(t) from original_foreign t),'Foreign Contact untouched');
-- Explicit structured field updates are raw; all-null is present, never inferred missing.
update core.identity_block_collections_working set revision=11 where owner_id=(select owner_id from actors where auth_user_id='ca000000-0000-4000-8000-000000000001');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save(E' Invalid +62\r\n é ',11,'ca000000-0000-4000-8000-000000000013','phone',E' Raw\tlabel '))->'collection_revision','12'::jsonb,'Raw Phone fields commit once');
select is(api.resolve_current_owner_contact_block_working('ca000000-0000-4000-8000-000000000013')->'block'->'contact_working',jsonb_build_object('contact_type','phone','label',E' Raw\tlabel ','value',E' Invalid +62\r\n é '),'Phone type/label/value preserved verbatim');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save(repeat('🐈',2048),12,'ca000000-0000-4000-8000-000000000013','whatsapp',repeat('🐈',512)))->'collection_revision','13'::jsonb,'Full structured Unicode envelopes commit once');
select is(api.resolve_current_owner_contact_block_working('ca000000-0000-4000-8000-000000000013')->'block'->'contact_working',jsonb_build_object('contact_type','whatsapp','label',repeat('🐈',512),'value',repeat('🐈',2048)),'WhatsApp subtype and full raw Unicode fields retained');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save(null,13,'ca000000-0000-4000-8000-000000000019',null,null))->'collection_revision','14'::jsonb,'Explicit all-null fills existing missing Contact payload');
select is(api.resolve_current_owner_contact_block_working('ca000000-0000-4000-8000-000000000019')->'block'->'contact_working','{"contact_type":null,"label":null,"value":null}'::jsonb,'Present all-null differs from missing');
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save(null,14,'ca000000-0000-4000-8000-000000000019',null,null))->'collection_revision','15'::jsonb,'Identical all-null still one aggregate bump');
insert into core.identity_blocks_working(owner_id,kind,position,is_visible) select (select owner_id from actors where auth_user_id='ca000000-0000-4000-8000-000000000001'),'media',g,false from generate_series(2000,3000) g;
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save('existing over-bound save',15))->'collection_revision','16'::jsonb,'Existing payload save has no allocation membership quota');
select is((select count(*) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='ca000000-0000-4000-8000-000000000001')),1008::bigint,'Over-bound save creates or removes no members');
set local request.jwt.claims='{"sub":"ca000000-0000-4000-8000-000000000003"}';
select is(api.save_current_owner_block_contact_working(pg_temp.contact_save()),'{"status": "unavailable"}'::jsonb,'Missing collection never fabricated');
create function pg_temp.check_purity() returns setof text language plpgsql as $$declare item record; val jsonb; begin
 for item in select * from purity loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',item.table_name) into val;
  return next is(val,item.value,item.table_name || ' unchanged');
 end loop;
end;$$;
select * from pg_temp.check_purity();
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='ca000000-0000-4000-8000-000000000003');
select is(api.save_current_owner_block_contact_working('{}'),'{"status":"unavailable"}'::jsonb,'Missing canonical context denies');
select * from finish();
rollback;

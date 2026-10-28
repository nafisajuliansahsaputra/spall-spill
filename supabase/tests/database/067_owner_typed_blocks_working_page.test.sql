begin;
select no_plan();
select ok((select prosecdef and provolatile='s' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) from pg_proc where oid='api.resolve_current_owner_typed_blocks_working_page(jsonb)'::regprocedure),'Stable hardened typed page');
select ok(not has_function_privilege('anon','api.resolve_current_owner_typed_blocks_working_page(jsonb)','EXECUTE'),'Execution withheld anon');
set local role anon;
select throws_ok($$select api.resolve_current_owner_typed_blocks_working_page('{}')$$,'42501',null,'Actual role denied');
reset role;
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_typed_blocks_working_page(jsonb)','EXECUTE'),'Execution withheld authenticated');
set local role authenticated;
select throws_ok($$select api.resolve_current_owner_typed_blocks_working_page('{}')$$,'42501',null,'Actual role denied');
reset role;
select ok(not has_function_privilege('service_role','api.resolve_current_owner_typed_blocks_working_page(jsonb)','EXECUTE'),'Execution withheld service_role');
set local role service_role;
select throws_ok($$select api.resolve_current_owner_typed_blocks_working_page('{}')$$,'42501',null,'Actual role denied');
reset role;
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='resolve_current_owner_typed_blocks_working_page' and grantee='PUBLIC'),'No PUBLIC grant');
set local request.jwt.claims='{}';
select is(api.resolve_current_owner_typed_blocks_working_page('{}'),'{"status":"unavailable"}'::jsonb,'No actor uniform denial');
insert into auth.users(id,email) values ('24400000-0000-4000-8000-000000000001','typed-one@example.test'),('24400000-0000-4000-8000-000000000002','typed-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in ('24400000-0000-4000-8000-000000000001','24400000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind) select 'typed-'||right(auth_user_id::text,6),owner_id,'current' from actors;
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select ('24400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,owner_id,kind::core.identity_block_kind,n,false
 from actors cross join(values(1,'social'),(2,'generic_link'),(3,'contact'),(4,'text'),(5,'media'),(6,'spill_cta')) kinds(n,kind)
 where auth_user_id='24400000-0000-4000-8000-000000000001';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
 select block_id,owner_id,kind,' <Raw> ',case when kind='social' then 'raw_platform' else null end,'javascript:raw()' from core.identity_blocks_working where block_id in('24400000-0000-4000-8000-000000000001','24400000-0000-4000-8000-000000000002');
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_type,label,contact_value)
 select block_id,owner_id,kind,null,' <Label> ',E' Raw\n Value ' from core.identity_blocks_working where block_id='24400000-0000-4000-8000-000000000003';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,E' <Text>\n ' from core.identity_blocks_working where block_id='24400000-0000-4000-8000-000000000004';
insert into core.identity_block_media_working(block_id,owner_id,kind,asset_key,alt_text)
 select block_id,owner_id,kind,null,' <Alt> ' from core.identity_blocks_working where block_id='24400000-0000-4000-8000-000000000005';
insert into core.identity_block_spill_cta_working(block_id,owner_id,kind)
 select block_id,owner_id,kind from core.identity_blocks_working where block_id='24400000-0000-4000-8000-000000000006';
set local request.jwt.claims='{"sub":"24400000-0000-4000-8000-000000000001"}';
-- Typed page snapshot race fixtures end here.
create temporary table snapshot as select api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":null,"after_position":null}') value;
select is((select value->>'status' from snapshot),'success','Six kinds loaded');
select is((select jsonb_array_length(value#>'{collection,blocks}') from snapshot),6,'All six preserved');
select is((select value#>>'{collection,blocks,0,working,destination_url}' from snapshot),'javascript:raw()','Raw invalid link remains recoverable');
select is((select value#>>'{collection,blocks,2,working,value}' from snapshot),E' Raw\n Value ','Raw Contact retained');
select is((select value#>>'{collection,blocks,3,working,text}' from snapshot),E' <Text>\n ','Raw Text retained');
select is((select value#>>'{collection,blocks,4,media_asset_state}' from snapshot),'not_selected','Null Media asset observation');
select is((select value#>>'{collection,blocks,5,working,target}' from snapshot),'owner_spill','Semantic own CTA retained');
select ok((select bool_and(row->>'payload_state'='present' and (row->>'is_visible')::boolean=false and row->>'kind'=row#>>'{working,kind}') from snapshot,jsonb_array_elements(value#>'{collection,blocks}') row),'Kind pairing/hidden/present retained');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}')#>>'{collection,blocks,3,payload_state}','not_implemented','Old contract unchanged');
select is(api.resolve_current_owner_typed_blocks_working_page('null')->>'status','invalid_page_request','Strict page input');
select is(api.resolve_current_owner_typed_blocks_working_page('{}')->>'status','invalid_page_request','Strict page input');
select is(api.resolve_current_owner_typed_blocks_working_page('[]')->>'status','invalid_page_request','Strict page input');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision": 1, "after_position": null}')->>'status','invalid_page_request','Strict page input');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision": null, "after_position": 1}')->>'status','invalid_page_request','Strict page input');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision": 0, "after_position": 1}')->>'status','invalid_page_request','Strict page input');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision": 1.5, "after_position": 1}')->>'status','invalid_page_request','Strict page input');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision": 1, "after_position": 0}')->>'status','invalid_page_request','Strict page input');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision": 1, "after_position": 2147483648}')->>'status','invalid_page_request','Strict page input');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision": 1, "after_position": 1, "owner_id": "forged"}')->>'status','invalid_page_request','Strict page input');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":2,"after_position":1}'),'{"status":"stale_read"}'::jsonb,'Stale continuation denied');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":1,"after_position":99}'),'{"status":"invalid_page_request"}'::jsonb,'Unknown cursor denied');
select is(jsonb_array_length(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":1,"after_position":3}')#>'{collection,blocks}'),3,'Seek excludes preceding rows');
select is(jsonb_array_length(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":1,"after_position":6}')#>'{collection,blocks}'),0,'Empty terminal valid');
set local request.jwt.claims='{"sub":"24400000-0000-4000-8000-000000000002"}';
select is(jsonb_array_length(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":null,"after_position":null}')#>'{collection,blocks}'),0,'Cross Owner payloads never returned');
delete from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='24400000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":null,"after_position":null}')->'collection','null'::jsonb,'Missing distinct from empty');
set local request.jwt.claims='{"sub":"24400000-0000-4000-8000-000000000001"}';
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select auth_user_id,owner_id,'image/png',12,'staging/profile/'||owner_id||'/'||auth_user_id,'consumed',now()+interval '10 minutes',now() from actors where auth_user_id='24400000-0000-4000-8000-000000000001';
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select '24400000-0000-4000-8000-000000000050',owner_id,'working/profile/24400000-0000-4000-8000-000000000050.webp','image/webp',12,1,1,auth_user_id from actors where auth_user_id='24400000-0000-4000-8000-000000000001';
update core.identity_block_media_working set asset_key='24400000-0000-4000-8000-000000000050' where block_id='24400000-0000-4000-8000-000000000005';
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":null,"after_position":null}')#>>'{collection,blocks,4,media_asset_state}','registered','Canonical same-Owner consumed registry observed');
update core.profile_media_assets set byte_size=11 where asset_key='24400000-0000-4000-8000-000000000050';
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":null,"after_position":null}')#>>'{collection,blocks,4,media_asset_state}','unavailable','Registry predicate degradation is observed without hiding raw work');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":null,"after_position":null}')#>>'{collection,blocks,4,working,asset_key}','24400000-0000-4000-8000-000000000050','Unavailable asset reference remains recoverable');
delete from core.identity_block_links_working where block_id in('24400000-0000-4000-8000-000000000001','24400000-0000-4000-8000-000000000002');
delete from core.identity_block_contacts_working where block_id='24400000-0000-4000-8000-000000000003';
delete from core.identity_block_texts_working where block_id='24400000-0000-4000-8000-000000000004';
delete from core.identity_block_media_working where block_id='24400000-0000-4000-8000-000000000005';
delete from core.identity_block_spill_cta_working where block_id='24400000-0000-4000-8000-000000000006';
select ok((select bool_and(row->>'payload_state'='missing' and row->'working'='null'::jsonb) from jsonb_array_elements(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":null,"after_position":null}')#>'{collection,blocks}') row),'No type inferred from bare membership');
insert into core.identity_blocks_working(owner_id,kind,position) select owner_id,'text',n from actors cross join generate_series(7,101) n where auth_user_id='24400000-0000-4000-8000-000000000001';
select is(jsonb_array_length(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":null,"after_position":null}')#>'{collection,blocks}'),100,'100 row page bound');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":null,"after_position":null}')#>'{collection,next_after_position}','100'::jsonb,'Exact cursor from 100th');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":null,"after_position":null}')#>'{collection,has_more}','true'::jsonb,'Lookahead retained');
select is(jsonb_array_length(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":1,"after_position":100}')#>'{collection,blocks}'),1,'Continuation returns remaining member');
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content) select block_id,owner_id,kind,repeat(chr(1),16384) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='24400000-0000-4000-8000-000000000001') and kind='text';
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'),'{"status":"unavailable"}'::jsonb,'8MiB escaped raw page bound fails closed without partial result');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='24400000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_typed_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'),'{"status":"unavailable"}'::jsonb,'Restriction never leaks typed data');
select * from finish();
rollback;

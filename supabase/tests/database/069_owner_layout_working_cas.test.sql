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
insert into auth.users(id,email) values ('24700000-0000-4000-8000-000000000001','persisted-one@example.test'),('24700000-0000-4000-8000-000000000002','persisted-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in ('24700000-0000-4000-8000-000000000001','24700000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind) select 'layout247-'||right(auth_user_id::text,6),owner_id,'current' from actors;
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select ('24700000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,owner_id,kind::core.identity_block_kind,n,false
 from actors cross join(values(1,'social'),(2,'generic_link'),(3,'contact'),(4,'text'),(5,'media'),(6,'spill_cta')) kinds(n,kind)
 where auth_user_id='24700000-0000-4000-8000-000000000001';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
 select block_id,owner_id,kind,' <Raw> ',case when kind='social' then 'raw_platform' else null end,'javascript:raw()' from core.identity_blocks_working where block_id in('24700000-0000-4000-8000-000000000001','24700000-0000-4000-8000-000000000002');
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_type,label,contact_value)
 select block_id,owner_id,kind,null,' <Label> ',E' Raw\n Value ' from core.identity_blocks_working where block_id='24700000-0000-4000-8000-000000000003';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,E' <Text>\n ' from core.identity_blocks_working where block_id='24700000-0000-4000-8000-000000000004';
insert into core.identity_block_media_working(block_id,owner_id,kind,asset_key,alt_text)
 select block_id,owner_id,kind,null,' <Alt> ' from core.identity_blocks_working where block_id='24700000-0000-4000-8000-000000000005';
insert into core.identity_block_spill_cta_working(block_id,owner_id,kind)
 select block_id,owner_id,kind from core.identity_blocks_working where block_id='24700000-0000-4000-8000-000000000006';
set local request.jwt.claims='{"sub":"24700000-0000-4000-8000-000000000001"}';
insert into core.identity_working(owner_id,display_name,bio,revision)
 select owner_id,case when auth_user_id='24700000-0000-4000-8000-000000000001' then 'Private Identity' else 'Foreign Identity' end,E'Private\nBio',2 from actors;
insert into core.identity_layout_working(owner_id,starter_key,revision) select owner_id,'clean',7 from actors;
insert into core.identity_connection_working(owner_id,connection_kind,social_platform,destination_url,revision)
 select owner_id,'generic_link',null,'HTTPS://Private.example.test/Keep?X=1#Exact',3 from actors where auth_user_id='24700000-0000-4000-8000-000000000001';
-- Layout CAS fixtures end here.
select ok((select prosecdef and provolatile='v' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) from pg_proc where oid='api.save_current_owner_layout_working(jsonb)'::regprocedure),'Layout mutation hardened');
select ok(not has_function_privilege('anon','api.save_current_owner_layout_working(jsonb)','EXECUTE'),'No anon execution');
set local role anon;
select throws_ok($$select api.save_current_owner_layout_working('{}')$$,'42501',null,'Actual anon denied');
reset role;
select ok(not has_function_privilege('authenticated','api.save_current_owner_layout_working(jsonb)','EXECUTE'),'No authenticated execution');
set local role authenticated;
select throws_ok($$select api.save_current_owner_layout_working('{}')$$,'42501',null,'Actual authenticated denied');
reset role;
select ok(not has_function_privilege('service_role','api.save_current_owner_layout_working(jsonb)','EXECUTE'),'No service_role execution');
set local role service_role;
select throws_ok($$select api.save_current_owner_layout_working('{}')$$,'42501',null,'Actual service_role denied');
reset role;
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='save_current_owner_layout_working' and grantee='PUBLIC'),'No PUBLIC grant');
create function pg_temp.save_layout(key text,rev numeric default 7) returns jsonb language sql as $$
 select api.save_current_owner_layout_working(jsonb_build_object('action','save_layout_working','starter_key',key,'base_layout_revision',rev));
$$;
create temporary table preserved as select
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x where owner_id in(select owner_id from actors)) profile,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x where owner_id in(select owner_id from actors)) progress,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_connection_working x where owner_id in(select owner_id from actors)) source,
 api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}')#>'{collection}' blocks;
insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,connection_revision,published_at)
 select owner_id,'{"legacy":true}',2,7,3,now() from actors where auth_user_id='24700000-0000-4000-8000-000000000001';
select is(pg_temp.save_layout('featured'),'{"status":"success","changed":true,"layout_working":{"starter_key":"featured","revision":8}}'::jsonb,'Changed key bumps own layout once');
select is(pg_temp.save_layout('featured',8),'{"status":"success","changed":false,"layout_working":{"starter_key":"featured","revision":8}}'::jsonb,'Same-key exact-base no-op');
select is(pg_temp.save_layout('featured',7),'{"status":"stale_write"}'::jsonb,'Replay stale even if key matches');
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}')#>'{layout_working}','{"starter_key":"featured","revision":8}'::jsonb,'Integrated full handoff reads saved layout');
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}')#>>'{revision_vector,layout}','8','Full handoff vector updated');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x where owner_id in(select owner_id from actors)),(select profile from preserved),'Profile unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x where owner_id in(select owner_id from actors)),(select progress from preserved),'No onboarding replay/regression');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_connection_working x where owner_id in(select owner_id from actors)),(select source from preserved),'Source untouched');
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}')#>'{collection}',(select blocks from preserved),'All six block payloads/membership/revision untouched');
select is((select snapshot from core.identity_publications where owner_id=(select owner_id from actors where auth_user_id='24700000-0000-4000-8000-000000000001')),'{"legacy":true}'::jsonb,'Previous Published unchanged');
select is(pg_temp.save_layout('business',8)->>'status','success','All keys allowed for personal Owner');
select is(pg_temp.save_layout('social_focus',9)->>'status','success','Social starter allowed');
select is(pg_temp.save_layout('clean',10)->>'status','success','Clean starter allowed');
select is(api.save_current_owner_layout_working('null'::jsonb),'{"status":"invalid_layout_working"}'::jsonb,'Malformed/authority input denied');
select is(api.save_current_owner_layout_working('{}'::jsonb),'{"status":"invalid_layout_working"}'::jsonb,'Malformed/authority input denied');
select is(api.save_current_owner_layout_working('[]'::jsonb),'{"status":"invalid_layout_working"}'::jsonb,'Malformed/authority input denied');
select is(api.save_current_owner_layout_working('{"action":"publish","base_layout_revision":11,"starter_key":"clean"}'::jsonb),'{"status":"invalid_layout_working"}'::jsonb,'Malformed/authority input denied');
select is(api.save_current_owner_layout_working('{"action":"save_layout_working","base_layout_revision":11,"starter_key":"custom_css"}'::jsonb),'{"status":"invalid_layout_working"}'::jsonb,'Malformed/authority input denied');
select is(api.save_current_owner_layout_working('{"action":"save_layout_working","base_layout_revision":11,"starter_key":"clean","owner_id":"foreign"}'::jsonb),'{"status":"invalid_layout_working"}'::jsonb,'Malformed/authority input denied');
select is(pg_temp.save_layout('clean',-1),'{"status":"invalid_layout_working"}'::jsonb,'Unsafe base denied');
select is(pg_temp.save_layout('clean',0),'{"status":"invalid_layout_working"}'::jsonb,'Unsafe base denied');
select is(pg_temp.save_layout('clean',1.5),'{"status":"invalid_layout_working"}'::jsonb,'Unsafe base denied');
select is(pg_temp.save_layout('clean',9007199254740992),'{"status":"invalid_layout_working"}'::jsonb,'Unsafe base denied');
set local request.jwt.claims='{"sub":"24700000-0000-4000-8000-000000000002"}';
select is(pg_temp.save_layout('clean',11),'{"status":"stale_write"}'::jsonb,'Foreign revision never selects foreign record');
select is(pg_temp.save_layout('business')->>'status','success','Second Owner updates only own layout');
select is((select starter_key::text from core.identity_layout_working where owner_id=(select owner_id from actors where auth_user_id='24700000-0000-4000-8000-000000000001')),'clean','First Owner remains isolated');
update core.identity_layout_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='24700000-0000-4000-8000-000000000002');
select is(pg_temp.save_layout('business',9007199254740991)->>'changed','false','Max safe no-op remains valid');
select is(pg_temp.save_layout('featured',9007199254740991),'{"status":"revision_exhausted"}'::jsonb,'Max safe changed save denied');
delete from core.identity_layout_working where owner_id=(select owner_id from actors where auth_user_id='24700000-0000-4000-8000-000000000002');
select is(pg_temp.save_layout('clean'),'{"status":"unavailable"}'::jsonb,'Missing layout never silently created');
set local request.jwt.claims='{"sub":"24700000-0000-4000-8000-000000000001"}';
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='24700000-0000-4000-8000-000000000001');
select is(pg_temp.save_layout('featured',11),'{"status":"owner_not_eligible"}'::jsonb,'Restricted cannot mutate');
update core.owners set account_state='active',onboarding_completed_at=null where id=(select owner_id from actors where auth_user_id='24700000-0000-4000-8000-000000000001');
select is(pg_temp.save_layout('featured',11),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete cannot use returning mutation');
set local request.jwt.claims='{}';
select is(pg_temp.save_layout('featured',11),'{"status":"unauthenticated"}'::jsonb,'Anonymous no private data');
select * from finish();
rollback;

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
insert into auth.users(id,email) values ('24500000-0000-4000-8000-000000000001','persisted-one@example.test'),('24500000-0000-4000-8000-000000000002','persisted-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in ('24500000-0000-4000-8000-000000000001','24500000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind) select 'persisted-'||right(auth_user_id::text,6),owner_id,'current' from actors;
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select ('24500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,owner_id,kind::core.identity_block_kind,n,false
 from actors cross join(values(1,'social'),(2,'generic_link'),(3,'contact'),(4,'text'),(5,'media'),(6,'spill_cta')) kinds(n,kind)
 where auth_user_id='24500000-0000-4000-8000-000000000001';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
 select block_id,owner_id,kind,' <Raw> ',case when kind='social' then 'raw_platform' else null end,'javascript:raw()' from core.identity_blocks_working where block_id in('24500000-0000-4000-8000-000000000001','24500000-0000-4000-8000-000000000002');
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_type,label,contact_value)
 select block_id,owner_id,kind,null,' <Label> ',E' Raw\n Value ' from core.identity_blocks_working where block_id='24500000-0000-4000-8000-000000000003';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,E' <Text>\n ' from core.identity_blocks_working where block_id='24500000-0000-4000-8000-000000000004';
insert into core.identity_block_media_working(block_id,owner_id,kind,asset_key,alt_text)
 select block_id,owner_id,kind,null,' <Alt> ' from core.identity_blocks_working where block_id='24500000-0000-4000-8000-000000000005';
insert into core.identity_block_spill_cta_working(block_id,owner_id,kind)
 select block_id,owner_id,kind from core.identity_blocks_working where block_id='24500000-0000-4000-8000-000000000006';
set local request.jwt.claims='{"sub":"24500000-0000-4000-8000-000000000001"}';
insert into core.identity_working(owner_id,display_name,bio,revision)
 select owner_id,case when auth_user_id='24500000-0000-4000-8000-000000000001' then 'Private Identity' else 'Foreign Identity' end,E'Private\nBio',2 from actors;
insert into core.identity_layout_working(owner_id,starter_key,revision) select owner_id,'clean',7 from actors;
insert into core.identity_connection_working(owner_id,connection_kind,social_platform,destination_url,revision)
 select owner_id,'generic_link',null,'HTTPS://Private.example.test/Keep?X=1#Exact',3 from actors where auth_user_id='24500000-0000-4000-8000-000000000001';
-- Persisted Identity snapshot race fixtures end here.
select ok((select prosecdef and provolatile='s' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) from pg_proc where oid='api.resolve_current_owner_identity_working_page(jsonb)'::regprocedure),'Stable hardened whole handoff');
select ok(not has_function_privilege('anon','api.resolve_current_owner_identity_working_page(jsonb)','EXECUTE'),'Whole handoff execution withheld anon');
set local role anon;
select throws_ok($$select api.resolve_current_owner_identity_working_page('{}')$$,'42501',null,'Actual role handoff denied');
reset role;
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_identity_working_page(jsonb)','EXECUTE'),'Whole handoff execution withheld authenticated');
set local role authenticated;
select throws_ok($$select api.resolve_current_owner_identity_working_page('{}')$$,'42501',null,'Actual role handoff denied');
reset role;
select ok(not has_function_privilege('service_role','api.resolve_current_owner_identity_working_page(jsonb)','EXECUTE'),'Whole handoff execution withheld service_role');
set local role service_role;
select throws_ok($$select api.resolve_current_owner_identity_working_page('{}')$$,'42501',null,'Actual role handoff denied');
reset role;
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='resolve_current_owner_identity_working_page' and grantee='PUBLIC'),'No PUBLIC handoff grant');
create temporary table snapshot as select api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}') value;
select is((select value->>'status' from snapshot),'success','Persisted handoff succeeds');
select is((select value#>>'{profile_working,display_name}' from snapshot),'Private Identity','Only own profile');
select is((select value#>>'{layout_working,starter_key}' from snapshot),'clean','Saved layout retained');
select is((select value#>>'{connection_source_working,destination_url}' from snapshot),'HTTPS://Private.example.test/Keep?X=1#Exact','Source slot exact, no URL rewriting');
select is((select value->'revision_vector' from snapshot),'{"profile":2,"layout":7,"connection":3,"blocks":1}'::jsonb,'Vector binds every returned part');
select is((select jsonb_array_length(value#>'{collection,blocks}') from snapshot),6,'Source slot does not fabricate another block');
select is((select value->>'publication_comparison' from snapshot),'not_assessed','Whole publication comparison never inferred');
select ok(not(select value ? 'identity_work' from snapshot),'No ambiguous global identity_work field');
select is(api.resolve_current_owner_identity_working_page('{}'),'{"status":"invalid_page_request"}'::jsonb,'Invalid input denial retains page semantics');
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":2,"after_position":1}'),'{"status":"stale_read"}'::jsonb,'Stale continuation preserved');
set local request.jwt.claims='{"sub":"24500000-0000-4000-8000-000000000002"}';
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}')#>>'{profile_working,display_name}','Foreign Identity','Second Owner sees its own profile');
select is(jsonb_array_length(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}')#>'{collection,blocks}'),0,'Second Owner cannot see foreign typed blocks');
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}')#>'{revision_vector,connection}','null'::jsonb,'Absent optional source vector null');
delete from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='24500000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}')#>'{revision_vector,blocks}','null'::jsonb,'Missing collection vector null, never zero');
delete from core.identity_working where owner_id=(select owner_id from actors where auth_user_id='24500000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}'),'{"status":"unavailable"}'::jsonb,'Missing required profile cannot produce partial handoff');
set local request.jwt.claims='{"sub":"24500000-0000-4000-8000-000000000001"}';
delete from core.identity_connection_working where owner_id=(select owner_id from actors where auth_user_id='24500000-0000-4000-8000-000000000001');
insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,connection_revision,published_at)
 select owner_id,'{"legacy":true}',2,7,null,now() from actors where auth_user_id='24500000-0000-4000-8000-000000000001';
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}')->>'legacy_identity_work','unchanged','Legacy comparison retained only under scoped name');
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}')->>'publication_comparison','not_assessed','Legacy unchanged does not imply modular document up-to-date');
select is((select snapshot from core.identity_publications where owner_id=(select owner_id from actors where auth_user_id='24500000-0000-4000-8000-000000000001')),'{"legacy":true}'::jsonb,'Read never changes prior Published');
update core.identity_working set revision=9007199254740992 where owner_id=(select owner_id from actors where auth_user_id='24500000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}'),'{"status":"unavailable"}'::jsonb,'Unsafe profile revision denies whole handoff');
update core.identity_working set revision=2 where owner_id=(select owner_id from actors where auth_user_id='24500000-0000-4000-8000-000000000001');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='24500000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}'),'{"status":"unavailable"}'::jsonb,'Restriction denies all private parts');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='24500000-0000-4000-8000-000000000001');
delete from core.identity_layout_working where owner_id=(select owner_id from actors where auth_user_id='24500000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}'),'{"status":"unavailable"}'::jsonb,'Missing layout is not a fabricated default');
set local request.jwt.claims='{}';
select is(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}'),'{"status":"unavailable"}'::jsonb,'Anonymous cannot read profile or blocks');
select * from finish();
rollback;

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
insert into auth.users(id,email) values ('24800000-0000-4000-8000-000000000001','persisted-one@example.test'),('24800000-0000-4000-8000-000000000002','persisted-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in ('24800000-0000-4000-8000-000000000001','24800000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind) select 'profile248-'||right(auth_user_id::text,6),owner_id,'current' from actors;
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select ('24800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,owner_id,kind::core.identity_block_kind,n,false
 from actors cross join(values(1,'social'),(2,'generic_link'),(3,'contact'),(4,'text'),(5,'media'),(6,'spill_cta')) kinds(n,kind)
 where auth_user_id='24800000-0000-4000-8000-000000000001';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
 select block_id,owner_id,kind,' <Raw> ',case when kind='social' then 'raw_platform' else null end,'javascript:raw()' from core.identity_blocks_working where block_id in('24800000-0000-4000-8000-000000000001','24800000-0000-4000-8000-000000000002');
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_type,label,contact_value)
 select block_id,owner_id,kind,null,' <Label> ',E' Raw\n Value ' from core.identity_blocks_working where block_id='24800000-0000-4000-8000-000000000003';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,E' <Text>\n ' from core.identity_blocks_working where block_id='24800000-0000-4000-8000-000000000004';
insert into core.identity_block_media_working(block_id,owner_id,kind,asset_key,alt_text)
 select block_id,owner_id,kind,null,' <Alt> ' from core.identity_blocks_working where block_id='24800000-0000-4000-8000-000000000005';
insert into core.identity_block_spill_cta_working(block_id,owner_id,kind)
 select block_id,owner_id,kind from core.identity_blocks_working where block_id='24800000-0000-4000-8000-000000000006';
set local request.jwt.claims='{"sub":"24800000-0000-4000-8000-000000000001"}';
insert into core.identity_working(owner_id,display_name,bio,revision)
 select owner_id,case when auth_user_id='24800000-0000-4000-8000-000000000001' then 'Private Identity' else 'Foreign Identity' end,E'Private\nBio',2 from actors;
insert into core.identity_layout_working(owner_id,starter_key,revision) select owner_id,'clean',7 from actors;
insert into core.identity_connection_working(owner_id,connection_kind,social_platform,destination_url,revision)
 select owner_id,'generic_link',null,'HTTPS://Private.example.test/Keep?X=1#Exact',3 from actors where auth_user_id='24800000-0000-4000-8000-000000000001';
-- Recoverable profile text fixtures end here.
select ok((select relrowsecurity from pg_class where oid='core.identity_profile_text_working'::regclass),'Recovery table RLS enabled');
select is((select count(*) from pg_policy where polrelid='core.identity_profile_text_working'::regclass),0::bigint,'No permissive recovery policy');
select ok(not has_table_privilege('anon','core.identity_profile_text_working','SELECT,INSERT,UPDATE,DELETE'),'No anon table access');
set local role anon;
select throws_ok($$select * from core.identity_profile_text_working$$,'42501',null,'Actual anon table denied');
reset role;
select ok(not has_function_privilege('anon','api.save_current_owner_profile_text_working(jsonb)','EXECUTE'),'No anon save_current_owner_profile_text_working grant');
set local role anon;
select throws_ok($$select api.save_current_owner_profile_text_working('{}')$$,'42501',null,'Actual anon RPC denied');
reset role;
select ok(not has_function_privilege('anon','api.resolve_current_owner_editable_identity_working_page(jsonb)','EXECUTE'),'No anon resolve_current_owner_editable_identity_working_page grant');
set local role anon;
select throws_ok($$select api.resolve_current_owner_editable_identity_working_page('{}')$$,'42501',null,'Actual anon RPC denied');
reset role;
select ok(not has_table_privilege('authenticated','core.identity_profile_text_working','SELECT,INSERT,UPDATE,DELETE'),'No authenticated table access');
set local role authenticated;
select throws_ok($$select * from core.identity_profile_text_working$$,'42501',null,'Actual authenticated table denied');
reset role;
select ok(not has_function_privilege('authenticated','api.save_current_owner_profile_text_working(jsonb)','EXECUTE'),'No authenticated save_current_owner_profile_text_working grant');
set local role authenticated;
select throws_ok($$select api.save_current_owner_profile_text_working('{}')$$,'42501',null,'Actual authenticated RPC denied');
reset role;
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_editable_identity_working_page(jsonb)','EXECUTE'),'No authenticated resolve_current_owner_editable_identity_working_page grant');
set local role authenticated;
select throws_ok($$select api.resolve_current_owner_editable_identity_working_page('{}')$$,'42501',null,'Actual authenticated RPC denied');
reset role;
select ok(not has_table_privilege('service_role','core.identity_profile_text_working','SELECT,INSERT,UPDATE,DELETE'),'No service_role table access');
set local role service_role;
select throws_ok($$select * from core.identity_profile_text_working$$,'42501',null,'Actual service_role table denied');
reset role;
select ok(not has_function_privilege('service_role','api.save_current_owner_profile_text_working(jsonb)','EXECUTE'),'No service_role save_current_owner_profile_text_working grant');
set local role service_role;
select throws_ok($$select api.save_current_owner_profile_text_working('{}')$$,'42501',null,'Actual service_role RPC denied');
reset role;
select ok(not has_function_privilege('service_role','api.resolve_current_owner_editable_identity_working_page(jsonb)','EXECUTE'),'No service_role resolve_current_owner_editable_identity_working_page grant');
set local role service_role;
select throws_ok($$select api.resolve_current_owner_editable_identity_working_page('{}')$$,'42501',null,'Actual service_role RPC denied');
reset role;
select ok((select prosecdef and provolatile='v' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) from pg_proc where oid='api.save_current_owner_profile_text_working(jsonb)'::regprocedure),'Hardened save_current_owner_profile_text_working');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='save_current_owner_profile_text_working' and grantee='PUBLIC'),'No PUBLIC RPC grant');
select ok((select prosecdef and provolatile='s' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) from pg_proc where oid='api.resolve_current_owner_editable_identity_working_page(jsonb)'::regprocedure),'Hardened resolve_current_owner_editable_identity_working_page');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='resolve_current_owner_editable_identity_working_page' and grantee='PUBLIC'),'No PUBLIC RPC grant');
create function pg_temp.save_text(source_base numeric,text_base numeric,name text,bio text) returns jsonb language sql as $$
 select api.save_current_owner_profile_text_working(jsonb_build_object('action','save_profile_text_working','base_profile_revision',source_base,'base_text_revision',text_base,
   'profile_text_working',jsonb_build_object('display_name',name,'bio',bio)));
$$;
create function pg_temp.read_edit() returns jsonb language sql stable as $$
 select api.resolve_current_owner_editable_identity_working_page('{"expected_collection_revision":null,"after_position":null}');
$$;
create temporary table preserved as select to_jsonb(p) profile,to_jsonb(l) layout,to_jsonb(g) progress,to_jsonb(c) source,
 api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}')#>'{collection}' blocks
 from core.identity_working p join core.identity_layout_working l using(owner_id) join core.owner_onboarding_progress g using(owner_id)
 join core.identity_connection_working c using(owner_id) where p.owner_id=(select owner_id from actors where auth_user_id='24800000-0000-4000-8000-000000000001');
insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,connection_revision,published_at)
 select owner_id,'{"legacy":true}',2,7,3,now() from actors where auth_user_id='24800000-0000-4000-8000-000000000001';
select is(pg_temp.read_edit()->>'profile_text_state','source','Absent overlay uses explicit source state');
select is(pg_temp.read_edit()#>'{revision_vector,profile_text}','null'::jsonb,'Absent overlay vector null');
select is((select count(*) from core.identity_profile_text_working),0::bigint,'Read never creates recovery state');
select is(pg_temp.save_text(2,null,null,E' Raw\r\nBio '),'{"status":"success","text_revision":1,"source_profile_revision":2}'::jsonb,'Invalid intermediate name is safely recoverable');
select is(pg_temp.read_edit()->'profile_text_working',jsonb_build_object('display_name',null,'bio',E' Raw\r\nBio ','revision',1,'source_profile_revision',2),'Exact raw text and source revision readback');
select is(pg_temp.read_edit()->>'profile_text_state','saved','Current-source recovery state explicit');
select is(pg_temp.read_edit()#>>'{revision_vector,profile_text}','1','Recovery revision participates in handoff vector');
select is(api.resolve_current_owner_profile_working()#>>'{profile_working,display_name}','Private Identity','Old valid-only profile unchanged');
select ok(not(api.resolve_current_owner_identity_working_page('{"expected_collection_revision":null,"after_position":null}') ? 'profile_text_working'),'Old245 DTO unchanged');
select is(pg_temp.save_text(2,null,'overwritten',null),'{"status":"stale_write"}'::jsonb,'Creation replay cannot overwrite');
select is(pg_temp.save_text(1,1,'overwritten',null),'{"status":"stale_source"}'::jsonb,'Stale source cannot overwrite');
select is(pg_temp.read_edit()#>'{profile_text_working,display_name}','null'::jsonb,'Denied replay retains recovery');
select is(pg_temp.save_text(2,1,repeat('🙂',81),E' invalid\001bio ')->>'status','success','Long/control text remains private recoverable data');
select is(pg_temp.read_edit()#>>'{profile_text_working,bio}',E' invalid\001bio ','Control raw value exact');
select is((select to_jsonb(p) from core.identity_working p where owner_id=(select owner_id from actors where auth_user_id='24800000-0000-4000-8000-000000000001')),(select profile from preserved),'Canonical profile unchanged');
select is((select to_jsonb(l) from core.identity_layout_working l where owner_id=(select owner_id from actors where auth_user_id='24800000-0000-4000-8000-000000000001')),(select layout from preserved),'Layout unchanged');
select is((select to_jsonb(g) from core.owner_onboarding_progress g where owner_id=(select owner_id from actors where auth_user_id='24800000-0000-4000-8000-000000000001')),(select progress from preserved),'Onboarding untouched');
select is((select to_jsonb(c) from core.identity_connection_working c where owner_id=(select owner_id from actors where auth_user_id='24800000-0000-4000-8000-000000000001')),(select source from preserved),'Source connection untouched');
select is(pg_temp.read_edit()#>'{collection}',(select blocks from preserved),'Six block payloads and aggregate unchanged');
select is((select snapshot from core.identity_publications where owner_id=(select owner_id from actors where auth_user_id='24800000-0000-4000-8000-000000000001')),'{"legacy":true}'::jsonb,'Published unchanged');
update core.identity_working set display_name='New source',revision=3 where owner_id=(select owner_id from actors where auth_user_id='24800000-0000-4000-8000-000000000001');
select is(pg_temp.read_edit()->>'profile_text_state','source_changed','Source drift explicit');
select is(pg_temp.read_edit()#>>'{profile_text_working,revision}','2','Source drift preserves recoverable row');
select is(pg_temp.save_text(2,2,'old source',null),'{"status":"stale_source"}'::jsonb,'Source stale even with exact text revision');
select is(pg_temp.save_text(3,2,' Rebased ',null),'{"status":"success","text_revision":3,"source_profile_revision":3}'::jsonb,'Full supplied text explicitly rebases onto reviewed source');
select is(pg_temp.read_edit()->>'profile_text_state','saved','Explicit rebase restores matching source');
select is(pg_temp.read_edit()#>>'{profile_text_working,display_name}',' Rebased ','Save never trims raw name');
select is(pg_temp.save_text(3,3,repeat('🙂',16384),repeat('x',16384))->>'status','success','Unicode engineering envelope accepted');
select is(pg_temp.save_text(3,4,repeat('x',16385),null),'{"status":"invalid_profile_text_working"}'::jsonb,'Overbound name denied before persistence');
select is(pg_temp.save_text(3,4,null,repeat('x',16385)),'{"status":"invalid_profile_text_working"}'::jsonb,'Overbound bio denied');
select is(pg_temp.save_text(3,4,null,null)->>'text_revision','5','Nullable empty fields can be acknowledged');
select is(pg_temp.save_text(3,5,null,null)->>'text_revision','6','Explicit same raw save bumps once');
select is(pg_temp.save_text(3,5,null,null),'{"status":"stale_write"}'::jsonb,'Same-raw replay remains stale');
select is(api.save_current_owner_profile_text_working('null'::jsonb),'{"status":"invalid_profile_text_working"}'::jsonb,'Invalid shape/media/authority denied');
select is(api.save_current_owner_profile_text_working('{}'::jsonb),'{"status":"invalid_profile_text_working"}'::jsonb,'Invalid shape/media/authority denied');
select is(api.save_current_owner_profile_text_working('[]'::jsonb),'{"status":"invalid_profile_text_working"}'::jsonb,'Invalid shape/media/authority denied');
select is(api.save_current_owner_profile_text_working('{"action":"publish","base_profile_revision":3,"base_text_revision":6,"profile_text_working":{"display_name":"x","bio":null}}'::jsonb),'{"status":"invalid_profile_text_working"}'::jsonb,'Invalid shape/media/authority denied');
select is(api.save_current_owner_profile_text_working('{"action":"save_profile_text_working","base_profile_revision":3,"base_text_revision":6,"profile_text_working":{"display_name":null,"bio":null,"profile_asset_key":"foreign"}}'::jsonb),'{"status":"invalid_profile_text_working"}'::jsonb,'Invalid shape/media/authority denied');
select is(api.save_current_owner_profile_text_working('{"action":"save_profile_text_working","base_profile_revision":3,"base_text_revision":6,"profile_text_working":{"display_name":null,"bio":null},"owner_id":"foreign"}'::jsonb),'{"status":"invalid_profile_text_working"}'::jsonb,'Invalid shape/media/authority denied');
select is(pg_temp.save_text(0,6,null,null),'{"status":"invalid_profile_text_working"}'::jsonb,'Unsafe source/text base denied');
select is(pg_temp.save_text(3,0,null,null),'{"status":"invalid_profile_text_working"}'::jsonb,'Unsafe source/text base denied');
select is(pg_temp.save_text(3,1.5,null,null),'{"status":"invalid_profile_text_working"}'::jsonb,'Unsafe source/text base denied');
select is(pg_temp.save_text(9007199254740992,6,null,null),'{"status":"invalid_profile_text_working"}'::jsonb,'Unsafe source/text base denied');
select is(pg_temp.save_text(3,9007199254740992,null,null),'{"status":"invalid_profile_text_working"}'::jsonb,'Unsafe source/text base denied');
grant usage on schema core to authenticated;
grant select on core.identity_profile_text_working to authenticated;
set local role authenticated;
select is((select count(*) from core.identity_profile_text_working),0::bigint,'RLS default deny even with temporary test SELECT grant');
reset role;
revoke all on core.identity_profile_text_working from authenticated;
set local request.jwt.claims='{"sub":"24800000-0000-4000-8000-000000000002"}';
select is(pg_temp.read_edit()->>'profile_text_state','source','Second Owner cannot see foreign recovery');
select is(pg_temp.save_text(2,6,'foreign overwrite',null),'{"status":"stale_write"}'::jsonb,'Foreign revision cannot select foreign row');
select is(pg_temp.save_text(2,null,'Second Owner',null)->>'text_revision','1','Second Owner creates only own row');
select is(pg_temp.read_edit()#>>'{profile_text_working,display_name}','Second Owner','Read only own recovery');
select is((select revision::text from core.identity_profile_text_working where owner_id=(select owner_id from actors where auth_user_id='24800000-0000-4000-8000-000000000001')),'6','Foreign write did not change first Owner');
delete from core.identity_working where owner_id=(select owner_id from actors where auth_user_id='24800000-0000-4000-8000-000000000002');
select is(pg_temp.save_text(2,null,null,null),'{"status":"unavailable"}'::jsonb,'Missing source never fabricated');
select is(pg_temp.read_edit(),'{"status":"unavailable"}'::jsonb,'Missing source prevents partial handoff');
set local request.jwt.claims='{"sub":"24800000-0000-4000-8000-000000000001"}';
update core.identity_profile_text_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='24800000-0000-4000-8000-000000000001');
select is(pg_temp.save_text(3,9007199254740991,null,null),'{"status":"revision_exhausted"}'::jsonb,'Safe text revision exhaustion');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='24800000-0000-4000-8000-000000000001');
select is(pg_temp.save_text(3,9007199254740991,null,null),'{"status":"owner_not_eligible"}'::jsonb,'Restricted Owner denied');
select is(pg_temp.read_edit(),'{"status":"unavailable"}'::jsonb,'Restriction returns no private source or recovery');
update core.owners set account_state='active',onboarding_completed_at=null where id=(select owner_id from actors where auth_user_id='24800000-0000-4000-8000-000000000001');
select is(pg_temp.save_text(3,9007199254740991,null,null),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner denied');
set local request.jwt.claims='{}';
select is(pg_temp.save_text(3,null,null,null),'{"status":"unauthenticated"}'::jsonb,'Anonymous mutation denied');
select is(pg_temp.read_edit(),'{"status":"unavailable"}'::jsonb,'Anonymous read denied');
select * from finish();
rollback;

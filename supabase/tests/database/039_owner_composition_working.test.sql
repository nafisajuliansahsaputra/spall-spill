begin;
select no_plan();
select ok(to_regprocedure('api.resolve_current_owner_composition_working()') is not null,'Composition reader exists');
select ok((select pronargs=0 and prosecdef and provolatile='s' from pg_proc where oid='api.resolve_current_owner_composition_working()'::regprocedure),'Zero-target stable definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.resolve_current_owner_composition_working()'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.resolve_current_owner_composition_working()','EXECUTE'),'anon withheld');
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_composition_working()','EXECUTE'),'authenticated withheld');
select ok(not has_function_privilege('service_role','api.resolve_current_owner_composition_working()','EXECUTE'),'service_role withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='resolve_current_owner_composition_working' and grantee='PUBLIC' and privilege_type='EXECUTE'),'PUBLIC withheld');
set local request.jwt.claims='{}';
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Unauthenticated denies');
set local request.jwt.claims='{"sub":"81000000-0000-4000-8000-000000000099","role":"authenticated"}';
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Unbound actor denies');
insert into auth.users(id,email) values
 ('81000000-0000-4000-8000-000000000001','composition-one@example.test'),
 ('81000000-0000-4000-8000-000000000002','composition-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='business' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select case auth_user_id when '81000000-0000-4000-8000-000000000001' then 'composition-one' else 'composition-two' end,owner_id,'current' from actors;
insert into core.identity_working(owner_id,display_name,revision)
 select owner_id,'Private Owner',3 from actors where auth_user_id='81000000-0000-4000-8000-000000000001';
insert into core.identity_layout_working(owner_id,starter_key,revision)
 select owner_id,'clean',2 from actors where auth_user_id='81000000-0000-4000-8000-000000000001';
set local request.jwt.claims='{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Incomplete Owner denies');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
select is(api.resolve_current_owner_composition_working(),'{"status":"success","current_handle":"composition-one","primary_use_case":"business","profile_revision":3,"layout_working":{"starter_key":"clean","revision":2},"connection_working":null,"identity_work":"never_published"}'::jsonb,'Own required layout with explicit absent optional slot and private comparison');
select is(api.resolve_current_owner_composition_working()->>'profile_revision',api.resolve_current_owner_profile_working()->'profile_working'->>'revision','Profile revision pairs with separate Core Profile reader');
update core.identity_layout_working set starter_key='social_focus' where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working()->'layout_working'->>'starter_key','social_focus','Existing social starter retained');
update core.identity_layout_working set starter_key='featured' where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working()->'layout_working'->>'starter_key','featured','Existing featured starter retained');
update core.identity_layout_working set starter_key='business' where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working()->'layout_working'->>'starter_key','business','Personalization does not filter business starter');
insert into core.identity_connection_working(owner_id,connection_kind,social_platform,destination_url,revision)
 select owner_id,'generic_link',null,'HTTPS://Private.example.test/Exact?x=1#Saved',4 from actors where auth_user_id='81000000-0000-4000-8000-000000000001';
select is(api.resolve_current_owner_composition_working()->'connection_working','{"connection_kind":"generic_link","social_platform":null,"destination_url":"HTTPS://Private.example.test/Exact?x=1#Saved","revision":4}'::jsonb,'Exact private generic slot, no normalized/open/public URL');
update core.identity_connection_working set connection_kind='social',social_platform='custom_platform-1' where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working()->'connection_working'->>'social_platform','custom_platform-1','Stored platform syntax without fabricated supported-provider list');
set local request.jwt.claims='{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"owner_id":"forged","handle":"composition-one"}}';
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Metadata cannot target other Owner required rows');
insert into core.identity_working(owner_id,display_name) select owner_id,'Second Owner' from actors where auth_user_id='81000000-0000-4000-8000-000000000002';
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Missing own layout cannot borrow other Owner layout');
insert into core.identity_layout_working(owner_id,starter_key) select owner_id,'clean' from actors where auth_user_id='81000000-0000-4000-8000-000000000002';
select is(api.resolve_current_owner_composition_working()->'connection_working','null'::jsonb,'Other Owner connection never borrowed');
set local request.jwt.claims='{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,connection_revision,published_at)
 select owner_id,'{"historical":true}',3,2,4,now() from actors where auth_user_id='81000000-0000-4000-8000-000000000001';
select is(api.resolve_current_owner_composition_working()->>'identity_work','unchanged','Same snapshot bindings match publication history');
update core.identity_publications set lifecycle_state='hidden' where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working()->>'identity_work','unchanged','Hidden publication remains comparison history, not public readiness');
update core.identity_publications set lifecycle_state='archived' where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working()->>'identity_work','unchanged','Archived publication remains comparison history');
update core.identity_layout_working set revision=3 where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working()->>'identity_work','unpublished_changes','Layout change is private unpublished comparison');
update core.identity_layout_working set revision=2 where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
update core.identity_connection_working set revision=5 where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working()->>'identity_work','unpublished_changes','Connection change is private unpublished comparison');
update core.identity_connection_working set revision=4 where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
update core.identity_working set revision=4 where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working()->>'identity_work','unpublished_changes','Profile change is private unpublished comparison');
update core.identity_working set revision=3 where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
update core.identity_publications set identity_revision=4 where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Publication ahead of Working denies composition');
update core.identity_publications set identity_revision=3 where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
delete from core.identity_connection_working where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Missing published-bound slot is inconsistent, not inferred removal');
update core.identity_publications set connection_revision=null where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working()->>'identity_work','unchanged','Both absent slot bindings match history');
update core.identity_working set revision=9007199254740992 where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Unsafe profile revision denies');
update core.identity_working set revision=3 where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
update core.identity_layout_working set revision=9007199254740992 where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Unsafe layout revision denies');
update core.identity_layout_working set revision=2 where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
insert into core.identity_connection_working(owner_id,connection_kind,destination_url,revision)
 select owner_id,'generic_link','https://private.example.test',9007199254740992 from actors where auth_user_id='81000000-0000-4000-8000-000000000001';
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Unsafe connection revision denies');
delete from core.identity_connection_working where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
create temporary table before_read as select
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_working x) profiles,
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_layout_working x) layouts,
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_connection_working x) connections,
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_publications x) publications,
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.owner_onboarding_progress x) progress;
select is(api.resolve_current_owner_composition_working()->>'status','success','Recovered consistent state read without mutation');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_working x),(select profiles from before_read),'Profiles unchanged');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_layout_working x),(select layouts from before_read),'Layouts unchanged');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_connection_working x),(select connections from before_read),'Connections unchanged');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_publications x),(select publications from before_read),'Publications unchanged');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.owner_onboarding_progress x),(select progress from before_read),'Onboarding unchanged');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Restricted Owner denies');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Suspended Owner denies');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Missing personalization context denies');
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from actors where auth_user_id='81000000-0000-4000-8000-000000000001');
delete from core.owner_handle_namespaces where normalized_handle='composition-one';
select is(api.resolve_current_owner_composition_working(),'{"status":"unavailable"}'::jsonb,'Missing current Handle denies');
set local role authenticated;
select throws_ok('select api.resolve_current_owner_composition_working()','42501',null,'Actual authenticated execution withheld');
reset role;
select * from finish();
rollback;

begin;
select no_plan();
select ok(to_regprocedure('api.resolve_current_owner_home_identity_work()') is not null,'Identity work summary exists');
select ok((select pronargs=0 and prosecdef and provolatile='s' from pg_proc where oid='api.resolve_current_owner_home_identity_work()'::regprocedure),'Zero-target stable hardened reader');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.resolve_current_owner_home_identity_work()'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.resolve_current_owner_home_identity_work()','EXECUTE'),'anon withheld');
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_home_identity_work()','EXECUTE'),'authenticated withheld');
select ok(not has_function_privilege('service_role','api.resolve_current_owner_home_identity_work()','EXECUTE'),'service_role withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='resolve_current_owner_home_identity_work' and grantee='PUBLIC' and privilege_type='EXECUTE'),'PUBLIC withheld');
set local request.jwt.claims='{}';
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Unauthenticated denies');
insert into auth.users(id,email) values
 ('77000000-0000-4000-8000-000000000001','identity-summary-one@example.test'),
 ('77000000-0000-4000-8000-000000000002','identity-summary-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('77000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='business' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select case auth_user_id when '77000000-0000-4000-8000-000000000001' then 'identity-owner-one' else 'identity-owner-two' end,owner_id,'current' from actors;
insert into core.identity_working(owner_id,display_name) select owner_id,'Private identity fixture' from actors;
insert into core.identity_layout_working(owner_id,starter_key) select owner_id,'clean' from actors;
set local request.jwt.claims='{"sub":"77000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Incomplete Owner denies despite Working');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
select is(api.resolve_current_owner_home_identity_work(),'{"status":"success","current_handle":"identity-owner-one","primary_use_case":"business","identity_work":"never_published"}'::jsonb,'No publication record is private never-published work');
insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,published_at)
 select owner_id,'{"display_name":"Private publication fixture"}',1,1,now() from actors where auth_user_id='77000000-0000-4000-8000-000000000001';
select is(api.resolve_current_owner_home_identity_work()->>'identity_work','unchanged','Matching content/layout and null connection bindings');
set local request.jwt.claims='{"sub":"77000000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"owner_id":"forged","handle":"identity-owner-one"}}';
select is(api.resolve_current_owner_home_identity_work(),'{"status":"success","current_handle":"identity-owner-two","primary_use_case":"business","identity_work":"never_published"}'::jsonb,'Second actor does not read first publication through metadata');
set local request.jwt.claims='{"sub":"77000000-0000-4000-8000-000000000001","role":"authenticated"}';
update core.identity_working set revision=2 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work()->>'identity_work','unpublished_changes','Content revision independently signals unpublished work');
update core.identity_publications set identity_revision=2 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
update core.identity_layout_working set revision=2 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work()->>'identity_work','unpublished_changes','Layout revision independently signals unpublished work');
update core.identity_publications set layout_revision=2 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
insert into core.identity_connection_working(owner_id,connection_kind,destination_url)
 select owner_id,'generic_link','https://connection.example.test/owner' from actors where auth_user_id='77000000-0000-4000-8000-000000000001';
select is(api.resolve_current_owner_home_identity_work()->>'identity_work','unpublished_changes','First connection after null publication binding is unpublished work');
update core.identity_publications set connection_revision=1 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work()->>'identity_work','unchanged','All three exact bindings match');
update core.identity_connection_working set revision=2 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work()->>'identity_work','unpublished_changes','Connection revision independently signals unpublished work');
update core.identity_publications set connection_revision=2,lifecycle_state='hidden' where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work()->>'identity_work','unchanged','Hidden publication history is not Draft or proof of live state');
update core.identity_publications set lifecycle_state='archived' where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work()->>'identity_work','unchanged','Archived publication history retains revision bindings');
update core.identity_layout_working set revision=3 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work()->>'identity_work','unpublished_changes','Archived record still distinguishes newer saved Working');
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work()->>'identity_work','unpublished_changes','Personalization does not hide saved work');
update core.identity_publications set identity_revision=3 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Content binding ahead of Working fails unavailable');
update core.identity_publications set identity_revision=2,layout_revision=4 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Layout binding ahead of Working fails unavailable');
update core.identity_publications set layout_revision=3,connection_revision=3 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Connection binding ahead of Working fails unavailable');
update core.identity_publications set connection_revision=2 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
update core.identity_working set revision=9007199254740992 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Unsafe content revision fails unavailable');
update core.identity_working set revision=2 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
update core.identity_layout_working set revision=9007199254740992 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Unsafe layout revision fails unavailable');
update core.identity_layout_working set revision=3 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
update core.identity_connection_working set revision=9007199254740992 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Unsafe connection revision fails unavailable');
update core.identity_connection_working set revision=2 where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
create temporary table before_read as select
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_working x) as content,
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_layout_working x) as layout,
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_connection_working x) as connection,
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_publications x) as publication;
select is(api.resolve_current_owner_home_identity_work()->>'identity_work','unchanged','Valid state recovers without read-side changes');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_working x),(select content from before_read),'Content not mutated');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_layout_working x),(select layout from before_read),'Layout not mutated');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_connection_working x),(select connection from before_read),'Connection not mutated');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_publications x),(select publication from before_read),'Publication not mutated');
delete from core.identity_connection_working where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Missing saved connection is not inferred intentional removal');
set local request.jwt.claims='{"sub":"77000000-0000-4000-8000-000000000002","role":"authenticated"}';
delete from core.identity_layout_working where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Missing layout is not fabricated empty work');
insert into core.identity_layout_working(owner_id,starter_key) select owner_id,'clean' from actors where auth_user_id='77000000-0000-4000-8000-000000000002';
delete from core.identity_working where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Missing content is not fabricated empty work');
insert into core.identity_working(owner_id,display_name) select owner_id,'Recovered fixture' from actors where auth_user_id='77000000-0000-4000-8000-000000000002';
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Restricted Owner denies');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Suspended Owner denies');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='77000000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_home_identity_work(),'{"status":"unavailable"}'::jsonb,'Missing current context denies');
set local role authenticated;
select throws_ok('select api.resolve_current_owner_home_identity_work()','42501',null,'Actual authenticated execution withheld');
reset role;
select * from finish();
rollback;

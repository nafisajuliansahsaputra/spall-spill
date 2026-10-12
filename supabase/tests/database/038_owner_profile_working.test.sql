begin;
select no_plan();
select ok(to_regprocedure('api.resolve_current_owner_profile_working()') is not null,'Profile bootstrap exists');
select ok((select pronargs=0 and prosecdef and provolatile='s' from pg_proc where oid='api.resolve_current_owner_profile_working()'::regprocedure),'Zero-target stable hardened reader');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.resolve_current_owner_profile_working()'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.resolve_current_owner_profile_working()','EXECUTE'),'anon withheld');
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_profile_working()','EXECUTE'),'authenticated withheld');
select ok(not has_function_privilege('service_role','api.resolve_current_owner_profile_working()','EXECUTE'),'service_role withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='resolve_current_owner_profile_working' and grantee='PUBLIC' and privilege_type='EXECUTE'),'PUBLIC withheld');
set local request.jwt.claims='{}';
select is(api.resolve_current_owner_profile_working(),'{"status":"unavailable"}'::jsonb,'Unauthenticated denies');
set local request.jwt.claims='{"sub":"80000000-0000-4000-8000-000000000099","role":"authenticated"}';
select is(api.resolve_current_owner_profile_working(),'{"status":"unavailable"}'::jsonb,'Unbound actor denies');
insert into auth.users(id,email) values
 ('80000000-0000-4000-8000-000000000001','profile-working-one@example.test'),
 ('80000000-0000-4000-8000-000000000002','profile-working-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='business' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select case auth_user_id when '80000000-0000-4000-8000-000000000001' then 'profile-owner-one' else 'profile-owner-two' end,owner_id,'current' from actors;
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'profile-owner-old',owner_id,'alias' from actors where auth_user_id='80000000-0000-4000-8000-000000000001';
insert into core.identity_working(owner_id,display_name,bio,profile_asset_key,revision)
 select owner_id,'Private Saved Owner','Working Bio',' opaque-key ',3 from actors where auth_user_id='80000000-0000-4000-8000-000000000001';
set local request.jwt.claims='{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(api.resolve_current_owner_profile_working(),'{"status":"unavailable"}'::jsonb,'Incomplete Owner cannot use returning-Owner reader');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
select is(api.resolve_current_owner_profile_working(),'{"status":"success","current_handle":"profile-owner-one","primary_use_case":"business","profile_working":{"display_name":"Private Saved Owner","bio":"Working Bio","profile_asset_key":" opaque-key ","revision":3}}'::jsonb,'Exact private profile and current Handle, no media URL or alias');
select is(api.resolve_current_basic_identity_state()->>'status','onboarding_complete','Onboarding resolver still excludes completed Owner');
select is(api.save_current_owner_basic_identity('Changed Name',null,3,1)->>'status','owner_not_eligible','Onboarding save still excludes completed Owner');
set local request.jwt.claims='{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"owner_id":"forged","handle":"profile-owner-one"}}';
select is(api.resolve_current_owner_profile_working(),'{"status":"unavailable"}'::jsonb,'Missing own Working never reads other Owner through metadata or creates default');
insert into core.identity_working(owner_id,display_name) select owner_id,'Second Owner' from actors where auth_user_id='80000000-0000-4000-8000-000000000002';
select is(api.resolve_current_owner_profile_working(),'{"status":"success","current_handle":"profile-owner-two","primary_use_case":"business","profile_working":{"display_name":"Second Owner","bio":null,"profile_asset_key":null,"revision":1}}'::jsonb,'Optional Bio/photo nulls are valid isolated private profile');
set local request.jwt.claims='{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}';
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from actors where auth_user_id='80000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_profile_working()->'profile_working'->>'display_name','Private Saved Owner','Personalization does not filter own Core Profile');
insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,published_at)
 select owner_id,'{"display_name":"Previous Public Owner"}',1,1,now() from actors where auth_user_id='80000000-0000-4000-8000-000000000001';
select is(api.resolve_current_owner_profile_working()->'profile_working'->>'display_name','Private Saved Owner','Reader returns Working rather than previous publication snapshot');
update core.identity_working set display_name=repeat('🙂',80),bio=repeat('🙂',300),profile_asset_key=repeat('🙂',512)
 where owner_id=(select owner_id from actors where auth_user_id='80000000-0000-4000-8000-000000000001');
select is(char_length(api.resolve_current_owner_profile_working()->'profile_working'->>'display_name'),80,'PostgreSQL Display Name code-point boundary preserved');
select is(char_length(api.resolve_current_owner_profile_working()->'profile_working'->>'bio'),300,'PostgreSQL Bio code-point boundary preserved');
select is(char_length(api.resolve_current_owner_profile_working()->'profile_working'->>'profile_asset_key'),512,'Opaque asset reference code-point boundary preserved');
update core.identity_working set revision=9007199254740992 where owner_id=(select owner_id from actors where auth_user_id='80000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_profile_working(),'{"status":"unavailable"}'::jsonb,'Unsafe revision denies without truncation');
update core.identity_working set revision=3 where owner_id=(select owner_id from actors where auth_user_id='80000000-0000-4000-8000-000000000001');
create temporary table before_read as select
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_working x) as profiles,
 (select jsonb_agg(to_jsonb(x) order by x.id) from core.owners x) as owners,
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.owner_onboarding_progress x) as progress,
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_publications x) as publications;
select is(api.resolve_current_owner_profile_working()->>'status','success','Valid saved profile recovered without reader write');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_working x),(select profiles from before_read),'Profiles unchanged by reads');
select is((select jsonb_agg(to_jsonb(x) order by x.id) from core.owners x),(select owners from before_read),'Owner completion unchanged');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.owner_onboarding_progress x),(select progress from before_read),'Onboarding revision/frontier unchanged');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.identity_publications x),(select publications from before_read),'Published state unchanged');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='80000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_profile_working(),'{"status":"unavailable"}'::jsonb,'Restricted Owner denies');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='80000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_profile_working(),'{"status":"unavailable"}'::jsonb,'Suspended Owner denies');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='80000000-0000-4000-8000-000000000001');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='80000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_profile_working(),'{"status":"unavailable"}'::jsonb,'Missing context denies');
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from actors where auth_user_id='80000000-0000-4000-8000-000000000001');
delete from core.owner_handle_namespaces where normalized_handle='profile-owner-one';
select is(api.resolve_current_owner_profile_working(),'{"status":"unavailable"}'::jsonb,'Alias cannot replace missing current context');
select ok(has_function_privilege('authenticated','api.resolve_current_owner_state()','EXECUTE'),'Existing Owner-state grant retained');
set local role authenticated;
select throws_ok('select api.resolve_current_owner_profile_working()','42501',null,'Actual authenticated execution withheld');
reset role;
select * from finish();
rollback;

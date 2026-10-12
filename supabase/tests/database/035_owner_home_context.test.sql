begin;
select no_plan();
select ok(to_regprocedure('api.resolve_current_owner_home_context()') is not null,'Home context exists');
select ok((select pronargs=0 and prosecdef and provolatile='s' and prorettype='jsonb'::regtype
  from pg_proc where oid='api.resolve_current_owner_home_context()'::regprocedure),'Zero-argument stable hardened JSON reader');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig)
  from pg_proc where oid='api.resolve_current_owner_home_context()'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.resolve_current_owner_home_context()','EXECUTE'),'anon withheld');
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_home_context()','EXECUTE'),'authenticated withheld');
select ok(not has_function_privilege('service_role','api.resolve_current_owner_home_context()','EXECUTE'),'service_role withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api'
  and routine_name='resolve_current_owner_home_context' and grantee='PUBLIC' and privilege_type='EXECUTE'),'PUBLIC withheld');
select ok(has_function_privilege('authenticated','api.resolve_current_owner_state()','EXECUTE'),'Existing Owner-state grant retained');
select ok(not has_schema_privilege('authenticated','core','USAGE'),'Private core remains inaccessible');
set local request.jwt.claims='{}';
select is(api.resolve_current_owner_home_context(),'{"status":"unavailable"}'::jsonb,'No authenticated principal denies');
set local request.jwt.claims='{"sub":"75000000-0000-4000-8000-000000000099","role":"authenticated"}';
select is(api.resolve_current_owner_home_context(),'{"status":"unavailable"}'::jsonb,'Unbound principal denies');
insert into auth.users(id,email) values
 ('75000000-0000-4000-8000-000000000001','home-one@example.test'),
 ('75000000-0000-4000-8000-000000000002','home-two@example.test');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='business'
 where owner_id in (select owner_id from core.owner_auth_bindings
 where auth_user_id in ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002'));
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select case auth_user_id when '75000000-0000-4000-8000-000000000001' then 'home-one' else 'home-two' end,
 owner_id,'current' from core.owner_auth_bindings
 where auth_user_id in ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002');
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'home-alias',owner_id,'alias' from core.owner_auth_bindings where auth_user_id='75000000-0000-4000-8000-000000000001';
set local request.jwt.claims='{"sub":"75000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(api.resolve_current_owner_home_context(),'{"status":"unavailable"}'::jsonb,'Incomplete onboarding denies despite stored context');
update core.owners set onboarding_completed_at=now() where id in
 (select owner_id from core.owner_auth_bindings where auth_user_id in ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002'));
create temporary table home_before as select
 (select jsonb_agg(to_jsonb(x) order by x.id) from core.owners x) as owners,
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.owner_onboarding_progress x) as progress,
 (select jsonb_agg(to_jsonb(x) order by x.normalized_handle) from core.owner_handle_namespaces x) as handles;
select is(api.resolve_current_owner_home_context(),'{"status":"success","current_handle":"home-one","primary_use_case":"business"}'::jsonb,'Current handle only; alias not selected');
set local request.jwt.claims='{"sub":"75000000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"owner_id":"forged","handle":"home-one"}}';
select is(api.resolve_current_owner_home_context()->>'current_handle','home-two','Second actor cannot select first Owner via metadata');
select is((select jsonb_agg(to_jsonb(x) order by x.id) from core.owners x),(select owners from home_before),'Reads preserve Owner state');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.owner_onboarding_progress x),(select progress from home_before),'Reads preserve onboarding revision');
select is((select jsonb_agg(to_jsonb(x) order by x.normalized_handle) from core.owner_handle_namespaces x),(select handles from home_before),'Reads preserve handle reservations');
update core.owners set account_state='restricted' where id=(select owner_id from core.owner_auth_bindings where auth_user_id='75000000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_home_context(),'{"status":"unavailable"}'::jsonb,'Restricted active-complete Owner denies');
update core.owners set account_state='suspended' where id=(select owner_id from core.owner_auth_bindings where auth_user_id='75000000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_home_context(),'{"status":"unavailable"}'::jsonb,'Suspended Owner denies');
update core.owners set account_state='active' where id=(select owner_id from core.owner_auth_bindings where auth_user_id='75000000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from core.owner_auth_bindings where auth_user_id='75000000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_home_context(),'{"status":"unavailable"}'::jsonb,'Missing stored personalization denies');
set local request.jwt.claims='{"sub":"75000000-0000-4000-8000-000000000001","role":"authenticated"}';
delete from core.owner_handle_namespaces where normalized_handle='home-one';
select is(api.resolve_current_owner_home_context(),'{"status":"unavailable"}'::jsonb,'Alias cannot substitute for absent current handle');
set local role authenticated;
select throws_ok('select api.resolve_current_owner_home_context()','42501',null,'Actual authenticated execution remains denied');
reset role;
select * from finish();
rollback;

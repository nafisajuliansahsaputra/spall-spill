begin;
select no_plan();
select ok(to_regprocedure('api.resolve_current_owner_home_drafts()') is not null,'Draft summary exists');
select ok((select pronargs=0 and prosecdef and provolatile='s' from pg_proc
 where oid='api.resolve_current_owner_home_drafts()'::regprocedure),'Zero-target stable hardened reader');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc
 where oid='api.resolve_current_owner_home_drafts()'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.resolve_current_owner_home_drafts()','EXECUTE'),'anon withheld');
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_home_drafts()','EXECUTE'),'authenticated withheld');
select ok(not has_function_privilege('service_role','api.resolve_current_owner_home_drafts()','EXECUTE'),'service_role withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api'
 and routine_name='resolve_current_owner_home_drafts' and grantee='PUBLIC' and privilege_type='EXECUTE'),'PUBLIC withheld');
set local request.jwt.claims='{}';
select is(api.resolve_current_owner_home_drafts(),'{"status":"unavailable"}'::jsonb,'Unauthenticated denies');
insert into auth.users(id,email) values
 ('76000000-0000-4000-8000-000000000001','draft-summary-one@example.test'),
 ('76000000-0000-4000-8000-000000000002','draft-summary-two@example.test');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='business'
 where owner_id in (select owner_id from core.owner_auth_bindings where auth_user_id in
 ('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002'));
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select case auth_user_id when '76000000-0000-4000-8000-000000000001' then 'draft-owner-one' else 'draft-owner-two' end,
 owner_id,'current' from core.owner_auth_bindings where auth_user_id in
 ('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002');
insert into core.product_drafts(owner_id,source_url,title)
 select owner_id,'https://products.example.test/item','Product Draft' from core.owner_auth_bindings
 where auth_user_id='76000000-0000-4000-8000-000000000001';
insert into core.resource_drafts(owner_id,resource_type,title)
 select owner_id,'document','Resource Draft' from core.owner_auth_bindings
 where auth_user_id='76000000-0000-4000-8000-000000000001';
set local request.jwt.claims='{"sub":"76000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(api.resolve_current_owner_home_drafts(),'{"status":"unavailable"}'::jsonb,'Incomplete Owner denies despite Drafts');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from core.owner_auth_bindings
 where auth_user_id in ('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002'));
select is(api.resolve_current_owner_home_drafts(),'{"status":"success","current_handle":"draft-owner-one","primary_use_case":"business","product_drafts":1,"resource_drafts":1}'::jsonb,'Persisted never-published Drafts remain separate kinds');
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from core.owner_auth_bindings where auth_user_id='76000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_drafts()->>'product_drafts','1','Personalization does not remove Product capability');
select is(api.resolve_current_owner_home_drafts()->>'resource_drafts','1','Personalization does not remove Resource capability');
set local request.jwt.claims='{"sub":"76000000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"handle":"draft-owner-one","owner_id":"forged"}}';
select is(api.resolve_current_owner_home_drafts(),'{"status":"success","current_handle":"draft-owner-two","primary_use_case":"business","product_drafts":0,"resource_drafts":0}'::jsonb,'Second actor cannot read first Drafts through metadata');
set local request.jwt.claims='{"sub":"76000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,published_at)
 select r.item_id,r.owner_id,r.item_type,r.spill_reference,1,'{"title":"Published snapshot"}',now()
 from core.spill_item_identity_registry r where r.owner_id=(select owner_id from core.owner_auth_bindings
 where auth_user_id='76000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_drafts()->>'product_drafts','0','Published Product persisted Working row is not Draft');
select is(api.resolve_current_owner_home_drafts()->>'resource_drafts','0','Published Resource persisted Working row is not Draft');
update core.spill_item_publications set lifecycle_state='hidden' where owner_id=(select owner_id from core.owner_auth_bindings where auth_user_id='76000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_drafts()->>'product_drafts','0','Hidden Product is not Draft');
select is(api.resolve_current_owner_home_drafts()->>'resource_drafts','0','Hidden Resource is not Draft');
update core.spill_item_publications set lifecycle_state='archived' where owner_id=(select owner_id from core.owner_auth_bindings where auth_user_id='76000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_drafts()->>'product_drafts','0','Archived Product is not Draft');
select is(api.resolve_current_owner_home_drafts()->>'resource_drafts','0','Archived Resource is not Draft');
create temporary table drafts_before as select
 (select jsonb_agg(to_jsonb(x) order by x.id) from core.product_drafts x) as products,
 (select jsonb_agg(to_jsonb(x) order by x.id) from core.resource_drafts x) as resources,
 (select jsonb_agg(to_jsonb(x) order by x.item_id) from core.spill_item_publications x) as publications,
 (select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.spill_reference_counters x) as counters;
select ok(api.resolve_current_owner_home_drafts()->>'status'='success','Read has no lifecycle action');
select is((select jsonb_agg(to_jsonb(x) order by x.id) from core.product_drafts x),(select products from drafts_before),'Product saved content unchanged');
select is((select jsonb_agg(to_jsonb(x) order by x.id) from core.resource_drafts x),(select resources from drafts_before),'Resource saved content unchanged');
select is((select jsonb_agg(to_jsonb(x) order by x.item_id) from core.spill_item_publications x),(select publications from drafts_before),'Publication history unchanged');
select is((select jsonb_agg(to_jsonb(x) order by x.owner_id) from core.spill_reference_counters x),(select counters from drafts_before),'References not allocated by reads');
update core.owners set account_state='restricted' where id=(select owner_id from core.owner_auth_bindings where auth_user_id='76000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_drafts(),'{"status":"unavailable"}'::jsonb,'Restricted Owner denies');
update core.owners set account_state='suspended' where id=(select owner_id from core.owner_auth_bindings where auth_user_id='76000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_home_drafts(),'{"status":"unavailable"}'::jsonb,'Suspended Owner denies');
set local role authenticated;
select throws_ok('select api.resolve_current_owner_home_drafts()','42501',null,'Actual authenticated execution withheld');
reset role;
select * from finish();
rollback;

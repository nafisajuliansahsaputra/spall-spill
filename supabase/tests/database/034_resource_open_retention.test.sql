begin;
select no_plan();
select ok(not has_function_privilege('anon','api.resolve_published_resource_context_server(text,bigint)','EXECUTE'),'Private Resource context anon execution withheld');
select ok(not has_function_privilege('authenticated','api.resolve_published_resource_context_server(text,bigint)','EXECUTE'),'Private Resource context authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.resolve_published_resource_context_server(text,bigint)','EXECUTE'),'Private Resource context service_role execution withheld');

select ok(not has_function_privilege('anon','api.resolve_published_resource_source_server(text,bigint,text,text)','EXECUTE'),'Resource source anon execution withheld');
select ok(not has_function_privilege('authenticated','api.resolve_published_resource_source_server(text,bigint,text,text)','EXECUTE'),'Resource source authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.resolve_published_resource_source_server(text,bigint,text,text)','EXECUTE'),'Resource source service_role execution withheld');

select ok(not has_function_privilege('anon','api.resolve_public_resource_context(text,bigint)','EXECUTE'),'New anonymous reader withheld');
select ok(not has_function_privilege('authenticated','api.resolve_public_resource_context(text,bigint)','EXECUTE'),'New authenticated reader withheld');
select ok(not has_function_privilege('service_role','api.resolve_public_resource_context(text,bigint)','EXECUTE'),'New service reader withheld');
select ok(not has_function_privilege('anon','api.resolve_public_resource(text,bigint)','EXECUTE'),'Existing safe-source reader remains withheld');
select ok(not has_function_privilege('authenticated','api.publish_current_onboarding(uuid,text,text)','EXECUTE'),'First Publish remains withheld');
select ok(not has_table_privilege('anon','core.spill_item_publications','SELECT'),'No raw public Item reads');
select ok(not has_table_privilege('authenticated','core.identity_publications','SELECT'),'No raw signed-in Identity reads');
insert into auth.users(id,email) values
 ('94000000-0000-4000-8000-000000000001','resource-context-one@example.test'),
 ('94000000-0000-4000-8000-000000000002','resource-context-two@example.test');
create temporary table resource_context_owners as select * from core.owner_auth_bindings
 where auth_user_id in ('94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}';
select is(api.claim_current_owner_handle('resource-context-one',1)->>'status','success','First Handle');
select is(api.set_current_owner_primary_use_case('business',2)->>'status','success','First guidance');
select is(api.save_current_owner_basic_identity('Private Owner',null,null,3)->>'status','success','First Working Identity');
select is(api.save_current_owner_starter_composition('business',null,4)->>'status','success','First layout');
select is(api.claim_current_owner_handle('resource-context-renamed',5)->>'status','success','Protected alias');
select is(api.save_current_owner_resource_draft('portfolio','https://portfolio.example.test/works?creator=original&campaign=A%2FB','Private Portfolio',null)->>'status','success','Private Resource reference');
select is(api.save_current_owner_product_draft('https://store.example.test/item','Private Product',null)->>'status','success','Different Item type reserves second reference');
set local request.jwt.claims='{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000002"}';
select is(api.claim_current_owner_handle('resource-context-two',1)->>'status','success','Other Owner Handle');
select is(api.set_current_owner_primary_use_case('personal',2)->>'status','success','Other guidance');
select is(api.save_current_owner_basic_identity('Other Private Owner',null,null,3)->>'status','success','Other Working Identity');
select is(api.save_current_owner_starter_composition('clean',null,4)->>'status','success','Other layout');
select is(api.save_current_owner_resource_draft('menu','https://menu.example.test/','Other Private Menu',null)->>'status','success','Other Owner has same reference');
reset role;
-- Privileged publication fixtures and all reader grants roll back together.

insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,published_at)
 select owner_id,'{"display_name":"Published Resource Owner","profile_asset_key":null}',1,1,now()
 from resource_context_owners where auth_user_id='94000000-0000-4000-8000-000000000001';
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,published_at)
 select item_id,owner_id,item_type,spill_reference,1,
 case when item_type='resource' then '{"resource_type":"portfolio","title":"Published Portfolio","source_url":"https://portfolio.example.test/works?creator=original&campaign=A%2FB"}'::jsonb
 else '{"title":"Published Product"}'::jsonb end,now()
 from core.spill_item_identity_registry where owner_id=(select owner_id from resource_context_owners where auth_user_id='94000000-0000-4000-8000-000000000001');
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Incomplete onboarding denies Published fixtures');
update core.owners set onboarding_completed_at=now() where id=(select owner_id from resource_context_owners where auth_user_id='94000000-0000-4000-8000-000000000001');
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at) values
 ('https://portfolio.example.test/works?creator=original&campaign=A%2FB',encode(extensions.digest('https://portfolio.example.test/works?creator=original&campaign=A%2FB','sha256'),'hex'),'safe','resource-intent-fixture',now(),now()+interval '1 hour');

create function pg_temp.resource_private_state()
returns jsonb language sql as $$
 select jsonb_build_array(
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.identity_working x),
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.resource_drafts x),
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.spill_item_identity_registry x),
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.spill_item_publications x),
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.identity_publications x),
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.owners x));
$$;
-- A real expired Product capability must remain untouched by Resource retention.
insert into core.product_click_intents(token_hash,record)
 select repeat('e',64),jsonb_build_object('purpose','published-product-click-v1','confirmation_hash',repeat('a',64),
 'binding',jsonb_build_object('handle','retention-fixture','spill_reference',1,'provider_key','shopee',
 'publication_token',repeat('a',64),'destination_hash',repeat('b',64)), 'issued_at',ms,'expires_at',ms+120000)
 from (select floor(extract(epoch from clock_timestamp())*1000)::bigint-130000 as ms) t;
create temporary table retention_state_before as select pg_temp.resource_private_state() as state,
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.external_destination_safety x) as safety,
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.product_click_intents x) as product,
 (select to_jsonb(x) from cron.job x where jobname='spall-product-click-retention-v1') as product_job;

select is((select count(*) from cron.job where jobname='spall-resource-open-retention-v1'),1::bigint,'Exactly one reserved retention job');
select ok(not active,'Retention job committed inactive') from cron.job where jobname='spall-resource-open-retention-v1';
select is(schedule,'* * * * *','Minute cadence') from cron.job where jobname='spall-resource-open-retention-v1';
select is(username,'postgres','Privileged database owner only') from cron.job where jobname='spall-resource-open-retention-v1';
select is(command,'set statement_timeout = ''5s''; set lock_timeout = ''1s''; select core.run_resource_open_retention_tick();','Fixed bounded SQL with no HTTP') from cron.job where jobname='spall-resource-open-retention-v1';
select ok(not has_function_privilege(r,'core.run_resource_open_retention_tick()','EXECUTE'),'Tick withheld: '||r) from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_schema_privilege(r,'cron','USAGE'),'Cron schema withheld: '||r) from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_function_privilege(r,'api.cleanup_resource_open_intents_server(integer)','EXECUTE'),'Cleanup stays withheld: '||r) from unnest(array['anon','authenticated','service_role']) r;
select ok((select relrowsecurity from pg_class where oid='core.resource_open_intents'::regclass),'Private Resource intent RLS remains enabled');
select ok(not has_table_privilege(r,'core.resource_open_intents','SELECT,INSERT,UPDATE,DELETE'),'Intent table remains withheld: '||r) from unnest(array['anon','authenticated','service_role']) r;
create function pg_temp.retention_record(ms bigint) returns jsonb language sql as $$
 select jsonb_build_object('purpose','published-resource-open-v1','recognition_hash',repeat('a',64),
 'binding',jsonb_build_object('handle','retention-fixture','spill_reference',1,
 'publication_token',repeat('a',64),'source_hash',repeat('b',64)), 'issued_at',ms,'expires_at',ms+120000);
$$;
insert into core.resource_open_intents(token_hash,record)
 select encode(extensions.digest('retention-fixture-'||n,'sha256'),'hex'),
 pg_temp.retention_record(floor(extract(epoch from clock_timestamp())*1000)::bigint-130000) from generate_series(1,550) n;
insert into core.resource_open_intents(token_hash,record) values
 (repeat('f',64),pg_temp.retention_record(floor(extract(epoch from clock_timestamp())*1000)::bigint));
insert into cron.job_run_details(jobid,runid,job_pid,database,username,command,status,start_time,end_time)
 select jobid,900000+n,0,current_database(),'postgres',command,case when n%2=0 then 'failed' else 'succeeded' end,now()-interval '9 days',now()-interval '8 days'
 from cron.job cross join generate_series(1,550) n where jobname='spall-resource-open-retention-v1';
insert into cron.job_run_details(jobid,runid,job_pid,database,username,command,status,start_time,end_time)
 select jobid,900600+n,0,current_database(),'postgres',command,
 case n when 1 then 'succeeded' when 2 then 'running' else 'failed' end,now()-interval '8 days',
 case n when 1 then now() when 2 then now()-interval '8 days' else null end
 from cron.job cross join generate_series(1,3) n where jobname='spall-resource-open-retention-v1';
insert into cron.job_run_details(jobid,runid,job_pid,database,username,command,status,start_time,end_time)
 values (900999,900999,0,current_database(),'postgres','select 1','failed',now()-interval '9 days',now()-interval '8 days');
create temporary table retention_first as select core.run_resource_open_retention_tick() as value;
select is((select value from retention_first),'{"status":"success","intents_deleted":500,"history_deleted":500}'::jsonb,'Tick bounded to 500 intents and own old terminal history');
select is((select count(*) from core.resource_open_intents),51::bigint,'Remainder and unexpired survive');
select ok(exists(select 1 from core.resource_open_intents where token_hash=repeat('f',64)),'Unexpired capability survives');
select is((select count(*) from cron.job_run_details where runid in (900601,900602,900603,900999)),4::bigint,'Recent running null-end-time and unrelated cron history preserved');
select is(core.run_resource_open_retention_tick(),'{"status":"success","intents_deleted":50,"history_deleted":50}'::jsonb,'Next bounded tick clears only expired remainder');
select is(core.run_resource_open_retention_tick(),'{"status":"success","intents_deleted":0,"history_deleted":0}'::jsonb,'Empty tick idempotent');
select ok(not active,'Direct ticks never activate cron job') from cron.job where jobname='spall-resource-open-retention-v1';
select is(pg_temp.resource_private_state(),(select state from retention_state_before),'Retention leaves Owner/Working/Draft/Published/reference state unchanged');
select is((select jsonb_agg(to_jsonb(x) order by x::text) from core.external_destination_safety x),(select safety from retention_state_before),'Safety state unchanged');
select is((select jsonb_agg(to_jsonb(x) order by x::text) from core.product_click_intents x),(select product from retention_state_before),'Product intents unchanged');
select is((select to_jsonb(x) from cron.job x where jobname='spall-product-click-retention-v1'),(select product_job from retention_state_before),'Product retention job unchanged');
select * from finish();
rollback;

begin;
select no_plan();
select is((select count(*) from cron.job where jobname='spall-product-click-retention-v1'),1::bigint,'Exactly one reserved retention job');
select ok(not active,'Retention job committed inactive') from cron.job where jobname='spall-product-click-retention-v1';
select is(schedule,'* * * * *','Minute cadence') from cron.job where jobname='spall-product-click-retention-v1';
select is(username,'postgres','Privileged database owner only') from cron.job where jobname='spall-product-click-retention-v1';
select is(command,'set statement_timeout = ''5s''; set lock_timeout = ''1s''; select core.run_product_click_retention_tick();','Fixed bounded SQL with no HTTP') from cron.job where jobname='spall-product-click-retention-v1';
select ok(not has_function_privilege(r,'core.run_product_click_retention_tick()','EXECUTE'),'Tick withheld: '||r) from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_schema_privilege(r,'cron','USAGE'),'Cron schema withheld: '||r) from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_function_privilege(r,'api.cleanup_product_click_intents_server(integer)','EXECUTE'),'Cleanup stays withheld: '||r) from unnest(array['anon','authenticated','service_role']) r;
create function pg_temp.retention_record(ms bigint) returns jsonb language sql as $$
 select jsonb_build_object('purpose','published-product-click-v1','confirmation_hash',repeat('a',64),
 'binding',jsonb_build_object('handle','retention-fixture','spill_reference',1,'provider_key','shopee',
 'publication_token',repeat('a',64),'destination_hash',repeat('b',64)), 'issued_at',ms,'expires_at',ms+120000);
$$;
insert into core.product_click_intents(token_hash,record)
 select encode(extensions.digest('retention-fixture-'||n,'sha256'),'hex'),
 pg_temp.retention_record(floor(extract(epoch from clock_timestamp())*1000)::bigint-130000) from generate_series(1,550) n;
insert into core.product_click_intents(token_hash,record) values
 (repeat('f',64),pg_temp.retention_record(floor(extract(epoch from clock_timestamp())*1000)::bigint));
insert into cron.job_run_details(jobid,runid,job_pid,database,username,command,status,start_time,end_time)
 select jobid,900000+n,0,current_database(),'postgres',command,case when n%2=0 then 'failed' else 'succeeded' end,now()-interval '9 days',now()-interval '8 days'
 from cron.job cross join generate_series(1,550) n where jobname='spall-product-click-retention-v1';
insert into cron.job_run_details(jobid,runid,job_pid,database,username,command,status,start_time,end_time)
 select jobid,900600+n,0,current_database(),'postgres',command,
 case n when 1 then 'succeeded' when 2 then 'running' else 'failed' end,now()-interval '8 days',
 case n when 1 then now() when 2 then now()-interval '8 days' else null end
 from cron.job cross join generate_series(1,3) n where jobname='spall-product-click-retention-v1';
insert into cron.job_run_details(jobid,runid,job_pid,database,username,command,status,start_time,end_time)
 values (900999,900999,0,current_database(),'postgres','select 1','failed',now()-interval '9 days',now()-interval '8 days');
create temporary table retention_first as select core.run_product_click_retention_tick() as value;
select is((select value from retention_first),'{"status":"success","intents_deleted":500,"history_deleted":500}'::jsonb,'Tick bounded to 500 intents and own old terminal history');
select is((select count(*) from core.product_click_intents),51::bigint,'Remainder and unexpired survive');
select ok(exists(select 1 from core.product_click_intents where token_hash=repeat('f',64)),'Unexpired capability survives');
select is((select count(*) from cron.job_run_details where runid in (900601,900602,900603,900999)),4::bigint,'Recent running null-end-time and unrelated cron history preserved');
select is(core.run_product_click_retention_tick(),'{"status":"success","intents_deleted":50,"history_deleted":50}'::jsonb,'Next bounded tick clears only expired remainder');
select is(core.run_product_click_retention_tick(),'{"status":"success","intents_deleted":0,"history_deleted":0}'::jsonb,'Empty tick idempotent');
select ok(not active,'Direct ticks never activate cron job') from cron.job where jobname='spall-product-click-retention-v1';
select * from finish();
rollback;

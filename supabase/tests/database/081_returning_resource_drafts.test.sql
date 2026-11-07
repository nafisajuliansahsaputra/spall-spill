begin;
select no_plan();
select ok((select relrowsecurity from pg_class where oid='core.workspace_resource_drafts'::regclass),'New Resource source RLS');
select ok(not has_table_privilege('service_role','core.workspace_resource_drafts','SELECT'),'Raw service table denied');
select ok(not has_table_privilege('authenticated','core.workspace_item_sources','SELECT'),'Projection view denied');
select ok(not has_function_privilege('anon','api.execute_owner_resource_catalog_server(uuid,text,jsonb)','EXECUTE'),'Anonymous gateway denied');
select ok(not has_function_privilege('authenticated','api.execute_owner_resource_catalog_server(uuid,text,jsonb)','EXECUTE'),'Authenticated gateway denied');
select ok(not has_function_privilege('service_role','api.create_current_owner_resource_draft(jsonb)','EXECUTE'),'Original create closed');
set local role authenticated;
select throws_ok($q$select api.execute_owner_resource_catalog_server('26700000-0000-4000-8000-000000000001','resolve_current_owner_spill_manager','{"input_reference":null}')$q$,'42501',null,'Actual gateway actor spoof denied');
reset role;
insert into auth.users(id,email) values('26700000-0000-4000-8000-000000000001','starter-one@example.test'),('26700000-0000-4000-8000-000000000002','starter-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in('26700000-0000-4000-8000-000000000001','26700000-0000-4000-8000-000000000002');
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind) select 'catalog267-'||right(auth_user_id::text,6),owner_id,'current' from actors;
insert into core.identity_working(owner_id,display_name,revision) select owner_id,'Identity',1 from actors;
insert into core.identity_layout_working(owner_id,starter_key,revision) select owner_id,'clean',1 from actors;
insert into core.product_drafts(owner_id,source_url,title,revision) select owner_id,'https://shop.example.test/product',case when right(auth_user_id::text,1)='1' then 'First product' else 'Foreign product' end,2 from actors;
insert into core.resource_drafts(owner_id,resource_type,source_url,title,revision) select owner_id,'document','https://resource.example.test/document','Original resource',2 from actors;
insert into core.product_preparations(product_id,owner_id,destinations,revision) select id,owner_id,'[{"provider_key":"external:shop.example.test","destination_url":"https://shop.example.test/product"}]',4 from core.product_drafts where owner_id in(select owner_id from actors);
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,lifecycle_state,published_at)
 select item_id,owner_id,item_type,spill_reference,2,'{"original":true}','hidden',now() from core.spill_item_identity_registry where owner_id in(select owner_id from actors) and item_type='resource';

create function pg_temp.create_resource(subject uuid,key text,title text,source text default null,meaning text default 'document') returns jsonb language sql as $$
 select api.execute_owner_resource_catalog_server(subject,'create_current_owner_resource_draft',jsonb_build_object('input_draft',jsonb_build_object('creation_id',key,'resource_type',meaning,'title',title,'source_url',source)))
$$;
create function pg_temp.catalog(subject uuid,cursor bigint default null) returns jsonb language sql as $$
 select api.execute_owner_resource_catalog_server(subject,'resolve_current_owner_spill_manager',jsonb_build_object('input_reference',cursor))
$$;
create function pg_temp.item(subject uuid,ref bigint) returns jsonb language sql as $$
 select api.execute_owner_resource_catalog_server(subject,'resolve_current_owner_item_recovery',jsonb_build_object('input_reference',ref))
$$;
create temporary table saved_public as select to_jsonb(p) snapshot from core.spill_item_publications p where owner_id in(select owner_id from actors);
set local request.jwt.claims='{"role":"service_role","sub":"26700000-0000-4000-8000-000000000002"}';
set local request.jwt.claim.sub='26700000-0000-4000-8000-000000000002';
set local role service_role;
select is(jsonb_array_length(pg_temp.catalog('26700000-0000-4000-8000-000000000001')->'items'),2,'Legacy items appear without allocating anything');
select is(pg_temp.create_resource('26700000-0000-4000-8000-000000000001','26700000-0000-4000-8000-000000000010',null)->>'status','invalid_draft','Type only allocates nothing');
select is(api.execute_owner_resource_catalog_server('26700000-0000-4000-8000-000000000001','create_current_owner_resource_draft','{"input_draft":"scalar"}')->>'status','invalid_draft','Scalar rejected safely');
select is(api.execute_owner_resource_catalog_server('26700000-0000-4000-8000-000000000001','create_current_owner_resource_draft','{"input_draft":{"owner_id":"foreign"}}')->>'status','invalid_draft','Caller Owner body denied');
select is(pg_temp.create_resource('26700000-0000-4000-8000-000000000001','26700000-0000-4000-8000-000000000010','First new',null,'portfolio')->>'reference','3','Meaningful new Resource reserves next shared reference');
select is(pg_temp.create_resource('26700000-0000-4000-8000-000000000001','26700000-0000-4000-8000-000000000010','First new',null,'portfolio')->>'reference','3','Exact replay uses same identity');
select is(pg_temp.create_resource('26700000-0000-4000-8000-000000000001','26700000-0000-4000-8000-000000000010','Changed',null,'portfolio')->>'status','conflicting_intent','Changed body cannot allocate via old key');
select is(pg_temp.create_resource('26700000-0000-4000-8000-000000000001','26700000-0000-4000-8000-000000000011',null,'https://example.test/source','menu')->>'reference','4','Second Resource is independent');
select is(pg_temp.item('26700000-0000-4000-8000-000000000001',3)#>>'{item,resource_type}','portfolio','Explicit meaning retained');
select is(pg_temp.item('26700000-0000-4000-8000-000000000002',3)->'item','null'::jsonb,'Other Owner cannot read new reference');
select is(pg_temp.item('26700000-0000-4000-8000-000000000001',999)->'item','null'::jsonb,'Unknown reference same unavailable');
select is(pg_temp.create_resource('26700000-0000-4000-8000-000000000002','26700000-0000-4000-8000-000000000010','Other Owner Resource')->>'reference','3','Same creation key belongs only to its own Owner');
select is(pg_temp.catalog('26700000-0000-4000-8000-000000000001')#>>'{items,0,reference}','4','Manager newest reference first');
select ok(not(pg_temp.catalog('26700000-0000-4000-8000-000000000001')#>'{items,0}' ?| array['source_url','owner_id','id','creation_id']),'Manager excludes raw source and private identities');
select is(api.execute_owner_starter_recovery_server('26700000-0000-4000-8000-000000000001','save_current_owner_starter_item_working','{"input_working":{"reference":3,"base_source_revision":1,"base_working_revision":null,"working":{"title":" <raw> ","source_url":"javascript:unfinished","resource_type":"media_kit"}}}')->>'status','success','New Resource uses existing recoverable raw Working path');
select is(pg_temp.item('26700000-0000-4000-8000-000000000001',3)#>>'{item,source_url}','javascript:unfinished','Raw source retained as private text');
select is(pg_temp.item('26700000-0000-4000-8000-000000000001',3)#>>'{item,resource_type}','media_kit','Changing meaning retains Resource identity');
select is(pg_temp.create_resource('26700000-0000-4000-8000-000000000001','26700000-0000-4000-8000-000000000010','First new',null,'portfolio')->>'reference','3','Original creation replay after Working edits cannot allocate or overwrite');
select is(api.execute_owner_starter_recovery_server('26700000-0000-4000-8000-000000000001','save_current_owner_starter_item_working','{"input_working":{"reference":3,"base_source_revision":1,"base_working_revision":null,"working":{"title":"Replay","source_url":null,"resource_type":"document"}}}')->>'status','stale_write','New Resource raw CAS replay denied');
select is(jsonb_array_length(api.execute_owner_starter_recovery_server('26700000-0000-4000-8000-000000000001','resolve_current_owner_starter_recovery','{}')->'items'),2,'Setup Home resolver still returns original sources only');
select is(current_setting('request.jwt.claim.sub'),'26700000-0000-4000-8000-000000000002','Gateway restores legacy subject');
select is(current_setting('request.jwt.claims')::jsonb,'{"role":"service_role","sub":"26700000-0000-4000-8000-000000000002"}'::jsonb,'Gateway restores claims');
reset role;
select is((select count(*)::integer from core.spill_item_identity_registry where owner_id=(select owner_id from actors where auth_user_id='26700000-0000-4000-8000-000000000001')),4,'Only two extra reservations');
select is((select title from core.workspace_resource_drafts where spill_reference=3 and owner_id=(select owner_id from actors where auth_user_id='26700000-0000-4000-8000-000000000001')),'First new','Initial source immutable after Working change');
select is((select jsonb_agg(to_jsonb(p) order by p.item_id) from core.spill_item_publications p where owner_id in(select owner_id from actors)),(select jsonb_agg(snapshot order by snapshot->>'item_id') from saved_public),'Published rows unchanged');
select throws_ok($q$update core.workspace_resource_drafts set title='Overwrite'$q$,'23514','Resource creation source is immutable; use Working.','No source overwrite');
select throws_ok($q$delete from core.workspace_resource_drafts$q$,'23514','Resource creation source is immutable; use Working.','No ordinary delete');
create function pg_temp.reject_new_resource() returns trigger language plpgsql as $$begin raise exception 'fixture resource failure';end;$$;
create trigger resource_fixture_failure after insert on core.workspace_resource_drafts for each row execute function pg_temp.reject_new_resource();
set local role service_role;
select throws_ok($q$select pg_temp.create_resource('26700000-0000-4000-8000-000000000001','26700000-0000-4000-8000-000000000099','Failure')$q$,'P0001','fixture resource failure','Failed source insertion rolls back whole allocation');
select is(current_setting('request.jwt.claim.sub'),'26700000-0000-4000-8000-000000000002','Exception restores actor');
reset role;
drop trigger resource_fixture_failure on core.workspace_resource_drafts;
select is((select next_reference from core.spill_reference_counters where owner_id=(select owner_id from actors where auth_user_id='26700000-0000-4000-8000-000000000001')),5::bigint,'Failed transaction consumes no reference');
-- Page more than twenty rows without changing the original setup sources.
select pg_temp.create_resource('26700000-0000-4000-8000-000000000001',('26700000-0000-4000-8000-'||lpad(n::text,12,'0')),'Resource '||n) from generate_series(100,120) n;
set local role service_role;
select is(jsonb_array_length(pg_temp.catalog('26700000-0000-4000-8000-000000000001')->'items'),20,'Manager bounded page');
select is(pg_temp.catalog('26700000-0000-4000-8000-000000000001')->>'has_more','true','Continuation visible');
select is(pg_temp.catalog('26700000-0000-4000-8000-000000000001')->>'next_before_reference','6','Stable descending cursor');
select is(jsonb_array_length(pg_temp.catalog('26700000-0000-4000-8000-000000000001',6)->'items'),5,'Older records reachable without duplicates');
select is(pg_temp.catalog('26700000-0000-4000-8000-000000000001',6)->>'has_more','false','Final page no continuation');
reset role;
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='26700000-0000-4000-8000-000000000001');
set local role service_role;
select is(pg_temp.catalog('26700000-0000-4000-8000-000000000001')->>'status','unavailable','Restricted read denied');
select is(pg_temp.create_resource('26700000-0000-4000-8000-000000000001','26700000-0000-4000-8000-000000000020','Denied')->>'status','owner_not_eligible','Restricted creation denied');
reset role;
select * from finish();
rollback;

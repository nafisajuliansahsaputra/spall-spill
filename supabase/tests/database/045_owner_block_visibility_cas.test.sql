begin;
select no_plan();
select ok((select prosecdef and provolatile='v' from pg_proc where oid='api.save_current_owner_block_visibility_working(jsonb)'::regprocedure),'Hardened volatile CAS definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.save_current_owner_block_visibility_working(jsonb)'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.save_current_owner_block_visibility_working(jsonb)','EXECUTE'),'anon execution withheld');
select ok(not has_function_privilege('authenticated','api.save_current_owner_block_visibility_working(jsonb)','EXECUTE'),'authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.save_current_owner_block_visibility_working(jsonb)','EXECUTE'),'service execution withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='save_current_owner_block_visibility_working' and grantee='PUBLIC'),'PUBLIC execution withheld');
set local role authenticated;
select throws_ok($$select api.save_current_owner_block_visibility_working('{}')$$,'42501',null,'Actual authenticated execution denied');
reset role;
set local role anon;
select throws_ok($$select api.save_current_owner_block_visibility_working('{}')$$,'42501',null,'Actual anon execution denied');
reset role;
set local role service_role;
select throws_ok($$select api.save_current_owner_block_visibility_working('{}')$$,'42501',null,'Actual service execution denied');
reset role;
set local request.jwt.claims='{}';
select is(api.save_current_owner_block_visibility_working('{}'),'{"status":"unauthenticated"}'::jsonb,'No actor denies');
set local request.jwt.claims='{"sub":"93000000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"forged"}}';
select is(api.save_current_owner_block_visibility_working('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata cannot invent Owner');
insert into auth.users(id,email) values
 ('93000000-0000-4000-8000-000000000001','visibility-one@example.test'),
 ('93000000-0000-4000-8000-000000000002','visibility-two@example.test'),
 ('93000000-0000-4000-8000-000000000003','visibility-empty@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'visibility-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"93000000-0000-4000-8000-000000000001"}';
select is(api.save_current_owner_block_visibility_working('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner denies');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id<>'93000000-0000-4000-8000-000000000003';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select '93000000-0000-4000-8000-000000000011',owner_id,'generic_link',1,false from actors where auth_user_id='93000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '93000000-0000-4000-8000-000000000012',owner_id,'social',2 from actors where auth_user_id='93000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '93000000-0000-4000-8000-000000000013',owner_id,'text',3 from actors where auth_user_id='93000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '93000000-0000-4000-8000-000000000014',owner_id,'generic_link',1 from actors where auth_user_id='93000000-0000-4000-8000-000000000002';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url,created_at)
 select block_id,owner_id,kind,'original',null,'https://original.example.test','2000-01-01'::timestamptz
 from core.identity_blocks_working where block_id in ('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000014');
insert into core.identity_connection_working(owner_id,connection_kind,destination_url,revision)
 select owner_id,'generic_link','https://source.example.test',3 from actors where auth_user_id='93000000-0000-4000-8000-000000000001';
insert into core.identity_block_initialization_provenance(owner_id,initial_block_id,source_connection_revision,source_connection_kind,source_destination_url,initial_title)
 select owner_id,'93000000-0000-4000-8000-000000000011',3,'generic_link','https://source.example.test','original' from actors where auth_user_id='93000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '93000000-0000-4000-8000-000000000015',owner_id,'contact',4 from actors where auth_user_id='93000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '93000000-0000-4000-8000-000000000016',owner_id,'media',5 from actors where auth_user_id='93000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '93000000-0000-4000-8000-000000000017',owner_id,'spill_cta',6 from actors where auth_user_id='93000000-0000-4000-8000-000000000001';
update core.identity_blocks_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_block_collections_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
-- Visibility CAS race fixtures end here.
create function pg_temp.visibility(input_id uuid,input_base bigint,input_visible boolean) returns jsonb language sql as $$
 select api.save_current_owner_block_visibility_working(jsonb_build_object('block_id',input_id,'base_collection_revision',input_base,'is_visible',input_visible)); $$;
create temporary table original_members as select * from core.identity_blocks_working where owner_id in (select owner_id from actors);
create temporary table original_payload as select * from core.identity_block_links_working where owner_id in (select owner_id from actors);
create temporary table original_source as select * from core.identity_connection_working where owner_id in (select owner_id from actors);
create temporary table original_provenance as select * from core.identity_block_initialization_provenance where owner_id in (select owner_id from actors);
create temporary table original_profile as select * from core.identity_working;
create temporary table original_layout as select * from core.identity_layout_working;
create temporary table original_publications as select * from core.identity_publications;
create temporary table original_receipts as select * from core.onboarding_preview_receipts;
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000011',2,true),'{"status":"stale_write"}'::jsonb,'Wrong base denies');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000014',1,true),'{"status":"block_not_found"}'::jsonb,'Foreign target same missing denial');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000099',1,true),'{"status":"block_not_found"}'::jsonb,'Absent block cannot be fabricated');
select is(api.save_current_owner_block_visibility_working(null),'{"status":"invalid_visibility_working"}'::jsonb,'SQL null');
select is(api.save_current_owner_block_visibility_working('[]'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Array');
select is(api.save_current_owner_block_visibility_working('{}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Missing fields');
select is(api.save_current_owner_block_visibility_working('{"block_id": null, "base_collection_revision": 1, "is_visible": true}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid block_id None');
select is(api.save_current_owner_block_visibility_working('{"block_id": 2, "base_collection_revision": 1, "is_visible": true}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid block_id 2');
select is(api.save_current_owner_block_visibility_working('{"block_id": "forged", "base_collection_revision": 1, "is_visible": true}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid block_id ''forged''');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-00000000001A", "base_collection_revision": 1, "is_visible": true}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid block_id ''93000000-0000-4000-8000-00000000001A''');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": null, "is_visible": true}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid base_collection_revision None');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 0, "is_visible": true}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid base_collection_revision 0');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": -1, "is_visible": true}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid base_collection_revision -1');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1.5, "is_visible": true}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid base_collection_revision 1.5');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": "1", "is_visible": true}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid base_collection_revision ''1''');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 9007199254740992, "is_visible": true}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid base_collection_revision 9007199254740992');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "is_visible": null}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid is_visible None');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "is_visible": 0}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid is_visible 0');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "is_visible": 1}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid is_visible 1');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "is_visible": "true"}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid is_visible ''true''');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "is_visible": "false"}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid is_visible ''false''');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "is_visible": {}}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid is_visible {}');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "is_visible": []}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Invalid is_visible []');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "is_visible": true, "owner_id": "forged"}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Unknown owner_id cannot grant authority');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "is_visible": true, "kind": "forged"}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Unknown kind cannot grant authority');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "is_visible": true, "position": "forged"}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Unknown position cannot grant authority');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "is_visible": true, "link_working": "forged"}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Unknown link_working cannot grant authority');
select is(api.save_current_owner_block_visibility_working('{"block_id": "93000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "is_visible": true, "published": "forged"}'::jsonb),'{"status":"invalid_visibility_working"}'::jsonb,'Unknown published cannot grant authority');
select is((select jsonb_agg(to_jsonb(b) order by block_id) from core.identity_blocks_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by block_id) from original_members b),'All rejected requests preserve memberships');
select is((select revision::integer from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='93000000-0000-4000-8000-000000000001')),1,'All denied requests preserve revision');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='93000000-0000-4000-8000-000000000001');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000011',1,true),'{"status":"owner_not_eligible"}'::jsonb,'Restricted denies');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='93000000-0000-4000-8000-000000000001');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000011',1,true),'{"status":"owner_not_eligible"}'::jsonb,'Suspended denies');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='93000000-0000-4000-8000-000000000001');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000011',1,true),'{"status":"success","block_id":"93000000-0000-4000-8000-000000000011","is_visible":true,"collection_revision":2}'::jsonb,'Restore Working visibility minimal next revision acknowledgment');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000011',1,false),'{"status":"stale_write"}'::jsonb,'Old tab cannot undo visibility');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000011',2,false),'{"status":"success","block_id":"93000000-0000-4000-8000-000000000011","is_visible":false,"collection_revision":3}'::jsonb,'Hide Working only at acknowledged base');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000011',3,false)->'collection_revision','4'::jsonb,'Identical explicit save increments once');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000012',4,false),'{"status":"success","block_id":"93000000-0000-4000-8000-000000000012","is_visible":false,"collection_revision":5}'::jsonb,'social visibility independent of unimplemented or missing payload');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000013',5,false),'{"status":"success","block_id":"93000000-0000-4000-8000-000000000013","is_visible":false,"collection_revision":6}'::jsonb,'text visibility independent of unimplemented or missing payload');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000015',6,false),'{"status":"success","block_id":"93000000-0000-4000-8000-000000000015","is_visible":false,"collection_revision":7}'::jsonb,'contact visibility independent of unimplemented or missing payload');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000016',7,false),'{"status":"success","block_id":"93000000-0000-4000-8000-000000000016","is_visible":false,"collection_revision":8}'::jsonb,'media visibility independent of unimplemented or missing payload');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000017',8,false),'{"status":"success","block_id":"93000000-0000-4000-8000-000000000017","is_visible":false,"collection_revision":9}'::jsonb,'spill_cta visibility independent of unimplemented or missing payload');
select ok((select bool_and(not is_visible and updated_at>created_at) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='93000000-0000-4000-8000-000000000001')),'All six actual Working memberships hidden and timestamped');
select is((select jsonb_agg(to_jsonb(b)-'is_visible'-'updated_at' order by block_id) from core.identity_blocks_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b)-'is_visible'-'updated_at' order by block_id) from original_members b),'Stable IDs, Owners, kinds, positions and creation identity');
select is((select to_jsonb(b) from core.identity_blocks_working b where block_id='93000000-0000-4000-8000-000000000014'),(select to_jsonb(b) from original_members b where block_id='93000000-0000-4000-8000-000000000014'),'Foreign membership fully untouched');
select ok((select updated_at>created_at and revision=9 from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='93000000-0000-4000-8000-000000000001')),'Own aggregate bumped exactly once per success');
select is((select revision::integer from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='93000000-0000-4000-8000-000000000002')),1,'Foreign aggregate untouched');
select is((select jsonb_agg(to_jsonb(b) order by block_id) from core.identity_block_links_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by block_id) from original_payload b),'All typed payloads preserved without fabrication');
select is((select jsonb_agg(to_jsonb(b) order by owner_id) from core.identity_connection_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by owner_id) from original_source b),'Source unchanged');
select is((select jsonb_agg(to_jsonb(b) order by owner_id) from core.identity_block_initialization_provenance b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by owner_id) from original_provenance b),'Provenance unchanged');
select ok(not exists((select * from core.identity_working except select * from original_profile) union all (select * from original_profile except select * from core.identity_working)),'core.identity_working completely unchanged');
select ok(not exists((select * from core.identity_layout_working except select * from original_layout) union all (select * from original_layout except select * from core.identity_layout_working)),'core.identity_layout_working completely unchanged');
select ok(not exists((select * from core.identity_publications except select * from original_publications) union all (select * from original_publications except select * from core.identity_publications)),'core.identity_publications completely unchanged');
select ok(not exists((select * from core.onboarding_preview_receipts except select * from original_receipts) union all (select * from original_receipts except select * from core.onboarding_preview_receipts)),'Preview receipts unchanged');
create function pg_temp.abort_visibility() returns void language plpgsql as $$ begin
 if pg_temp.visibility('93000000-0000-4000-8000-000000000011',9,true)->>'status'<>'success' then raise exception 'fixture save failed'; end if;
 raise exception 'fixture rollback' using errcode='P0001'; end $$;
select throws_ok($$select pg_temp.abort_visibility()$$,'P0001','fixture rollback','Error rolls back membership and collection atomically');
select is((select revision::integer from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='93000000-0000-4000-8000-000000000001')),9,'Rollback preserves aggregate');
select is((select is_visible from core.identity_blocks_working where block_id='93000000-0000-4000-8000-000000000011'),false,'Rollback preserves prior visibility');
update core.identity_block_collections_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='93000000-0000-4000-8000-000000000001');
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000011',9007199254740991,true),'{"status":"revision_exhausted"}'::jsonb,'Maximum safe revision prevents writes/overflow');
select is((select is_visible from core.identity_blocks_working where block_id='93000000-0000-4000-8000-000000000011'),false,'Exhaustion preserves member');
set local request.jwt.claims='{"sub":"93000000-0000-4000-8000-000000000003"}';
select is(pg_temp.visibility('93000000-0000-4000-8000-000000000011',1,true),'{"status":"unavailable"}'::jsonb,'Missing own collection not fabricated');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='93000000-0000-4000-8000-000000000003');
select is(api.save_current_owner_block_visibility_working('{}'),'{"status":"unavailable"}'::jsonb,'Missing canonical context denies');
select * from finish();
rollback;

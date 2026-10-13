begin;
select no_plan();
select ok((select prosecdef and provolatile='v' from pg_proc where oid='api.move_current_owner_block_working(jsonb)'::regprocedure),'Hardened volatile CAS definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.move_current_owner_block_working(jsonb)'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.move_current_owner_block_working(jsonb)','EXECUTE'),'anon execution withheld');
select ok(not has_function_privilege('authenticated','api.move_current_owner_block_working(jsonb)','EXECUTE'),'authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.move_current_owner_block_working(jsonb)','EXECUTE'),'service execution withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='move_current_owner_block_working' and grantee='PUBLIC'),'PUBLIC execution withheld');
set local role authenticated;
select throws_ok($$select api.move_current_owner_block_working('{}')$$,'42501',null,'Actual authenticated execution denied');
reset role;
set local role anon;
select throws_ok($$select api.move_current_owner_block_working('{}')$$,'42501',null,'Actual anon execution denied');
reset role;
set local role service_role;
select throws_ok($$select api.move_current_owner_block_working('{}')$$,'42501',null,'Actual service execution denied');
reset role;
set local request.jwt.claims='{}';
select is(api.move_current_owner_block_working('{}'),'{"status":"unauthenticated"}'::jsonb,'No actor denies');
set local request.jwt.claims='{"sub":"95000000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"forged"}}';
select is(api.move_current_owner_block_working('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata cannot invent Owner');
insert into auth.users(id,email) values
 ('95000000-0000-4000-8000-000000000001','reorder-one@example.test'),
 ('95000000-0000-4000-8000-000000000002','reorder-two@example.test'),
 ('95000000-0000-4000-8000-000000000003','reorder-empty@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'reorder-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"95000000-0000-4000-8000-000000000001"}';
select is(api.move_current_owner_block_working('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner denies');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id<>'95000000-0000-4000-8000-000000000003';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select '95000000-0000-4000-8000-000000000011',owner_id,'generic_link',1,false from actors where auth_user_id='95000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '95000000-0000-4000-8000-000000000012',owner_id,'social',2 from actors where auth_user_id='95000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '95000000-0000-4000-8000-000000000013',owner_id,'text',3 from actors where auth_user_id='95000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '95000000-0000-4000-8000-000000000014',owner_id,'generic_link',1 from actors where auth_user_id='95000000-0000-4000-8000-000000000002';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url,created_at)
 select block_id,owner_id,kind,'original',null,'https://original.example.test','2000-01-01'::timestamptz
 from core.identity_blocks_working where block_id in ('95000000-0000-4000-8000-000000000011','95000000-0000-4000-8000-000000000014');
insert into core.identity_connection_working(owner_id,connection_kind,destination_url,revision)
 select owner_id,'generic_link','https://source.example.test',3 from actors where auth_user_id='95000000-0000-4000-8000-000000000001';
insert into core.identity_block_initialization_provenance(owner_id,initial_block_id,source_connection_revision,source_connection_kind,source_destination_url,initial_title)
 select owner_id,'95000000-0000-4000-8000-000000000011',3,'generic_link','https://source.example.test','original' from actors where auth_user_id='95000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '95000000-0000-4000-8000-000000000015',owner_id,'contact',4 from actors where auth_user_id='95000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '95000000-0000-4000-8000-000000000016',owner_id,'media',5 from actors where auth_user_id='95000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '95000000-0000-4000-8000-000000000017',owner_id,'spill_cta',6 from actors where auth_user_id='95000000-0000-4000-8000-000000000001';
update core.identity_blocks_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_block_collections_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_blocks_working set position=case right(block_id::text,2)
 when '11' then 1 when '12' then 7 when '13' then 42 when '15' then 100 when '16' then 500 when '17' then 2147483647 else position end
 where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000001');
update core.identity_blocks_working set position=7 where block_id='95000000-0000-4000-8000-000000000014';
-- Reorder CAS race fixtures end here.
create function pg_temp.move(input_id uuid,input_base bigint,input_direction text) returns jsonb language sql as $$
 select api.move_current_owner_block_working(jsonb_build_object('block_id',input_id,'base_collection_revision',input_base,'direction',input_direction)); $$;
create temporary table original_members as select * from core.identity_blocks_working where owner_id in (select owner_id from actors);
create temporary table original_collections as select * from core.identity_block_collections_working where owner_id in (select owner_id from actors);
create temporary table original_payload as select * from core.identity_block_links_working where owner_id in (select owner_id from actors);
create temporary table original_source as select * from core.identity_connection_working where owner_id in (select owner_id from actors);
create temporary table original_provenance as select * from core.identity_block_initialization_provenance where owner_id in (select owner_id from actors);
create temporary table original_profile as select * from core.identity_working;
create temporary table original_layout as select * from core.identity_layout_working;
create temporary table original_publications as select * from core.identity_publications;
create temporary table original_receipts as select * from core.onboarding_preview_receipts;
select is(pg_temp.move('95000000-0000-4000-8000-000000000011',2,'down'),'{"status":"stale_write"}'::jsonb,'Wrong base denies');
select is(pg_temp.move('95000000-0000-4000-8000-000000000014',1,'up'),'{"status":"block_not_found"}'::jsonb,'Foreign target same missing denial');
select is(pg_temp.move('95000000-0000-4000-8000-000000000099',1,'up'),'{"status":"block_not_found"}'::jsonb,'Absent block cannot be fabricated');
select is(api.move_current_owner_block_working(null),'{"status":"invalid_block_move"}'::jsonb,'SQL null');
select is(api.move_current_owner_block_working('[]'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Array');
select is(api.move_current_owner_block_working('{}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Missing fields');
select is(api.move_current_owner_block_working('{"block_id": null, "base_collection_revision": 1, "direction": "down"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid block_id None');
select is(api.move_current_owner_block_working('{"block_id": 2, "base_collection_revision": 1, "direction": "down"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid block_id 2');
select is(api.move_current_owner_block_working('{"block_id": "forged", "base_collection_revision": 1, "direction": "down"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid block_id ''forged''');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-00000000001A", "base_collection_revision": 1, "direction": "down"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid block_id ''95000000-0000-4000-8000-00000000001A''');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": null, "direction": "down"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid base_collection_revision None');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 0, "direction": "down"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid base_collection_revision 0');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": -1, "direction": "down"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid base_collection_revision -1');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1.5, "direction": "down"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid base_collection_revision 1.5');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": "1", "direction": "down"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid base_collection_revision ''1''');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 9007199254740992, "direction": "down"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid base_collection_revision 9007199254740992');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": null}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid direction None');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": true}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid direction True');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": 0}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid direction 0');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": 1}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid direction 1');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": ""}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid direction ''''');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": "UP"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid direction ''UP''');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": "left"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid direction ''left''');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": {}}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid direction {}');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": []}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Invalid direction []');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": "down", "owner_id": "forged"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Unknown owner_id cannot grant authority');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": "down", "kind": "forged"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Unknown kind cannot grant authority');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": "down", "position": "forged"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Unknown position cannot grant authority');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": "down", "neighbor_block_id": "forged"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Unknown neighbor_block_id cannot grant authority');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": "down", "is_visible": "forged"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Unknown is_visible cannot grant authority');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": "down", "link_working": "forged"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Unknown link_working cannot grant authority');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": "down", "published": "forged"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Unknown published cannot grant authority');
select is(api.move_current_owner_block_working('{"block_id": "95000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "direction": "down", "block_ids": "forged"}'::jsonb),'{"status":"invalid_block_move"}'::jsonb,'Unknown block_ids cannot grant authority');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000001');
select is(pg_temp.move('95000000-0000-4000-8000-000000000011',1,'down'),'{"status":"owner_not_eligible"}'::jsonb,'Restricted denies');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000001');
select is(pg_temp.move('95000000-0000-4000-8000-000000000011',1,'down'),'{"status":"owner_not_eligible"}'::jsonb,'Suspended denies');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000001');
select is(pg_temp.move('95000000-0000-4000-8000-000000000011',1,'up'),'{"status":"move_not_available"}'::jsonb,'First up boundary is known no-write');
select is(pg_temp.move('95000000-0000-4000-8000-000000000017',1,'down'),'{"status":"move_not_available"}'::jsonb,'Last down boundary is known no-write');
select is((select jsonb_agg(to_jsonb(b) order by block_id) from core.identity_blocks_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by block_id) from original_members b),'All denials/boundaries preserve full memberships/timestamps');
select is((select jsonb_agg(to_jsonb(b) order by owner_id) from core.identity_block_collections_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by owner_id) from original_collections b),'All denials/boundaries preserve full collections/timestamps');
select is(pg_temp.move('95000000-0000-4000-8000-000000000011',1,'down'),'{"status":"success","block_id":"95000000-0000-4000-8000-000000000011","direction":"down","collection_revision":2}'::jsonb,'Hidden Generic moves down via one statement with minimal ack');
select is((select array_agg(right(block_id::text,2) order by position) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000001')),array['12','11','13','15','16','17'],'Nearest own neighbor swapped, no foreign position interference');
select is((select count(*)::integer from core.identity_blocks_working b join original_members o using(block_id) where b.updated_at<>o.updated_at),2,'Exactly two member timestamps touched');
select is((select count(*)::integer from core.identity_blocks_working b join original_members o using(block_id) where to_jsonb(b)<>to_jsonb(o)),2,'Exactly target and neighbor changed');
select is(pg_temp.move('95000000-0000-4000-8000-000000000011',1,'up'),'{"status":"stale_write"}'::jsonb,'Old tab cannot reverse successful move');
select is((select position from core.identity_blocks_working where block_id='95000000-0000-4000-8000-000000000011'),7,'Stale reverse leaves acknowledged position');
select is(pg_temp.move('95000000-0000-4000-8000-000000000011',2,'up'),'{"status":"success","block_id":"95000000-0000-4000-8000-000000000011","direction":"up","collection_revision":3}'::jsonb,'Acknowledged up swaps back without temporary sentinel or constraint mode change');
select is((select array_agg(right(block_id::text,2) order by position) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000001')),array['11','12','13','15','16','17'],'Reverse actual move restores original order');
select is(pg_temp.move('95000000-0000-4000-8000-000000000012',3,'up'),'{"status":"success","block_id":"95000000-0000-4000-8000-000000000012","direction":"up","collection_revision":4}'::jsonb,'social moves independently of absent/unimplemented payload');
select is(pg_temp.move('95000000-0000-4000-8000-000000000013',4,'up'),'{"status":"success","block_id":"95000000-0000-4000-8000-000000000013","direction":"up","collection_revision":5}'::jsonb,'text moves independently of absent/unimplemented payload');
select is(pg_temp.move('95000000-0000-4000-8000-000000000015',5,'up'),'{"status":"success","block_id":"95000000-0000-4000-8000-000000000015","direction":"up","collection_revision":6}'::jsonb,'contact moves independently of absent/unimplemented payload');
select is(pg_temp.move('95000000-0000-4000-8000-000000000016',6,'up'),'{"status":"success","block_id":"95000000-0000-4000-8000-000000000016","direction":"up","collection_revision":7}'::jsonb,'media moves independently of absent/unimplemented payload');
select is(pg_temp.move('95000000-0000-4000-8000-000000000017',7,'up'),'{"status":"success","block_id":"95000000-0000-4000-8000-000000000017","direction":"up","collection_revision":8}'::jsonb,'spill_cta moves independently of absent/unimplemented payload');
select is((select array_agg(right(block_id::text,2) order by position) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000001')),array['12','13','15','16','17','11'],'All six kinds have moved preserving server adjacency');
select is((select array_agg(position order by position) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000001')),array[1,7,42,100,500,2147483647],'Exact gapped position set/int32 max preserved, no renumber/overflow');
select is((select jsonb_agg(to_jsonb(b)-'position'-'updated_at' order by block_id) from core.identity_blocks_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b)-'position'-'updated_at' order by block_id) from original_members b),'Stable ID/Owner/kind/visibility/creation retained');
select is((select to_jsonb(b) from core.identity_blocks_working b where block_id='95000000-0000-4000-8000-000000000014'),(select to_jsonb(b) from original_members b where block_id='95000000-0000-4000-8000-000000000014'),'Foreign member unchanged');
select ok((select updated_at>created_at and revision=8 from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000001')),'Own aggregate bumped once per actual swap');
select is((select to_jsonb(b) from core.identity_block_collections_working b where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000002')),(select to_jsonb(b) from original_collections b where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000002')),'Foreign collection unchanged');
select is((select jsonb_agg(to_jsonb(b) order by block_id) from core.identity_block_links_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by block_id) from original_payload b),'Payload retained');
select is((select jsonb_agg(to_jsonb(b) order by owner_id) from core.identity_connection_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by owner_id) from original_source b),'Source retained');
select is((select jsonb_agg(to_jsonb(b) order by owner_id) from core.identity_block_initialization_provenance b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by owner_id) from original_provenance b),'Provenance retained');
select ok(not exists((select * from core.identity_working except select * from original_profile) union all (select * from original_profile except select * from core.identity_working)),'core.identity_working unchanged');
select ok(not exists((select * from core.identity_layout_working except select * from original_layout) union all (select * from original_layout except select * from core.identity_layout_working)),'core.identity_layout_working unchanged');
select ok(not exists((select * from core.identity_publications except select * from original_publications) union all (select * from original_publications except select * from core.identity_publications)),'core.identity_publications unchanged');
select ok(not exists((select * from core.onboarding_preview_receipts except select * from original_receipts) union all (select * from original_receipts except select * from core.onboarding_preview_receipts)),'core.onboarding_preview_receipts unchanged');
select throws_ok($$update core.identity_blocks_working set position=1 where block_id='95000000-0000-4000-8000-000000000011'$$,'23505',null,'Immediate uniqueness remains enforced after swap, no leaked deferred mode');
create function pg_temp.abort_move() returns void language plpgsql as $$ begin
 if pg_temp.move('95000000-0000-4000-8000-000000000011',8,'up')->>'status'<>'success' then raise exception 'fixture move failed'; end if;
 raise exception 'fixture rollback' using errcode='P0001'; end $$;
select throws_ok($$select pg_temp.abort_move()$$,'P0001','fixture rollback','Failure rolls back both members and aggregate');
select is((select revision::integer from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000001')),8,'Rollback preserves revision');
select is((select array_agg(right(block_id::text,2) order by position) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000001')),array['12','13','15','16','17','11'],'Rollback preserves both members order');
update core.identity_block_collections_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000001');
select is(pg_temp.move('95000000-0000-4000-8000-000000000011',9007199254740991,'up'),'{"status":"revision_exhausted"}'::jsonb,'Max revision denies before writes');
select is((select position from core.identity_blocks_working where block_id='95000000-0000-4000-8000-000000000011'),2147483647,'Exhaustion preserves position');
set local request.jwt.claims='{"sub":"95000000-0000-4000-8000-000000000002"}';
select is(pg_temp.move('95000000-0000-4000-8000-000000000014',1,'up'),'{"status":"move_not_available"}'::jsonb,'Singleton up has no own neighbor');
select is(pg_temp.move('95000000-0000-4000-8000-000000000014',1,'down'),'{"status":"move_not_available"}'::jsonb,'Singleton down cannot use foreign neighbor');
select is((select to_jsonb(b) from core.identity_block_collections_working b where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000002')),(select to_jsonb(b) from original_collections b where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000002')),'Singleton boundaries never bump/timestamp');
set local request.jwt.claims='{"sub":"95000000-0000-4000-8000-000000000003"}';
select is(pg_temp.move('95000000-0000-4000-8000-000000000011',1,'down'),'{"status":"unavailable"}'::jsonb,'Missing own collection not fabricated');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='95000000-0000-4000-8000-000000000003');
select is(api.move_current_owner_block_working('{}'),'{"status":"unavailable"}'::jsonb,'Missing canonical context denied');
select * from finish();
rollback;

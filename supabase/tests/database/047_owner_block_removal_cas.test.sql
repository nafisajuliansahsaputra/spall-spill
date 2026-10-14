begin;
select no_plan();
select ok((select prosecdef and provolatile='v' from pg_proc where oid='api.remove_current_owner_block_working(jsonb)'::regprocedure),'Hardened volatile CAS definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.remove_current_owner_block_working(jsonb)'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.remove_current_owner_block_working(jsonb)','EXECUTE'),'anon execution withheld');
select ok(not has_function_privilege('authenticated','api.remove_current_owner_block_working(jsonb)','EXECUTE'),'authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.remove_current_owner_block_working(jsonb)','EXECUTE'),'service execution withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='remove_current_owner_block_working' and grantee='PUBLIC'),'PUBLIC execution withheld');
set local role authenticated;
select throws_ok($$select api.remove_current_owner_block_working('{}')$$,'42501',null,'Actual authenticated execution denied');
reset role;
set local role anon;
select throws_ok($$select api.remove_current_owner_block_working('{}')$$,'42501',null,'Actual anon execution denied');
reset role;
set local role service_role;
select throws_ok($$select api.remove_current_owner_block_working('{}')$$,'42501',null,'Actual service execution denied');
reset role;
set local request.jwt.claims='{}';
select is(api.remove_current_owner_block_working('{}'),'{"status":"unauthenticated"}'::jsonb,'No actor denies');
set local request.jwt.claims='{"sub":"98000000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"forged"}}';
select is(api.remove_current_owner_block_working('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata cannot invent Owner');
insert into auth.users(id,email) values
 ('98000000-0000-4000-8000-000000000001','remove-one@example.test'),
 ('98000000-0000-4000-8000-000000000002','remove-two@example.test'),
 ('98000000-0000-4000-8000-000000000003','remove-empty@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'remove-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"98000000-0000-4000-8000-000000000001"}';
select is(api.remove_current_owner_block_working('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner denies');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id<>'98000000-0000-4000-8000-000000000003';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select '98000000-0000-4000-8000-000000000011',owner_id,'generic_link',1,false from actors where auth_user_id='98000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '98000000-0000-4000-8000-000000000012',owner_id,'social',2 from actors where auth_user_id='98000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '98000000-0000-4000-8000-000000000013',owner_id,'text',3 from actors where auth_user_id='98000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '98000000-0000-4000-8000-000000000014',owner_id,'generic_link',1 from actors where auth_user_id='98000000-0000-4000-8000-000000000002';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url,created_at)
 select block_id,owner_id,kind,'original',null,'https://original.example.test','2000-01-01'::timestamptz
 from core.identity_blocks_working where block_id in ('98000000-0000-4000-8000-000000000011','98000000-0000-4000-8000-000000000014');
insert into core.identity_connection_working(owner_id,connection_kind,destination_url,revision)
 select owner_id,'generic_link','https://source.example.test',3 from actors where auth_user_id='98000000-0000-4000-8000-000000000001';
insert into core.identity_block_initialization_provenance(owner_id,initial_block_id,source_connection_revision,source_connection_kind,source_destination_url,initial_title)
 select owner_id,'98000000-0000-4000-8000-000000000011',3,'generic_link','https://source.example.test','original' from actors where auth_user_id='98000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '98000000-0000-4000-8000-000000000015',owner_id,'contact',4 from actors where auth_user_id='98000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '98000000-0000-4000-8000-000000000016',owner_id,'media',5 from actors where auth_user_id='98000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '98000000-0000-4000-8000-000000000017',owner_id,'spill_cta',6 from actors where auth_user_id='98000000-0000-4000-8000-000000000001';
update core.identity_blocks_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_block_collections_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_blocks_working set position=case right(block_id::text,2)
 when '11' then 1 when '12' then 7 when '13' then 42 when '15' then 100 when '16' then 500 when '17' then 2147483647 else position end
 where owner_id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000001');
update core.identity_blocks_working set position=7 where block_id='98000000-0000-4000-8000-000000000014';
-- Removal CAS race fixtures end here.
create function pg_temp.remove_block(input_id uuid,input_base bigint) returns jsonb language sql as $$
 select api.remove_current_owner_block_working(jsonb_build_object('block_id',input_id,'base_collection_revision',input_base,'confirm_removal',true)); $$;
create temporary table original_members as select * from core.identity_blocks_working where owner_id in (select owner_id from actors);
create temporary table original_collections as select * from core.identity_block_collections_working where owner_id in (select owner_id from actors);
create temporary table original_payload as select * from core.identity_block_links_working where owner_id in (select owner_id from actors);
create temporary table original_source as select * from core.identity_connection_working where owner_id in (select owner_id from actors);
create temporary table original_provenance as select * from core.identity_block_initialization_provenance where owner_id in (select owner_id from actors);
create temporary table original_profile as select * from core.identity_working;
create temporary table original_layout as select * from core.identity_layout_working;
create temporary table original_publications as select * from core.identity_publications;
create temporary table original_receipts as select * from core.onboarding_preview_receipts;
create temporary table original_bindings as select * from core.owner_auth_bindings;
create temporary table original_namespaces as select * from core.owner_handle_namespaces;
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000011',2),'{"status":"stale_write"}'::jsonb,'Wrong base denies');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000014',1),'{"status":"block_not_found"}'::jsonb,'Confirmation never grants foreign ownership');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000099',1),'{"status":"block_not_found"}'::jsonb,'Unknown block same foreign denial');
select is(pg_temp.remove_block((select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000001'),1),'{"status":"block_not_found"}'::jsonb,'Owner/Core Profile UUID is not a removable block');
select is(api.remove_current_owner_block_working(null),'{"status":"invalid_block_removal"}'::jsonb,'SQL null');
select is(api.remove_current_owner_block_working('[]'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Array');
select is(api.remove_current_owner_block_working('{}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Missing fields');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Confirmation explicitly required');
select is(api.remove_current_owner_block_working('{"block_id": null, "base_collection_revision": 1, "confirm_removal": true}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid block_id None');
select is(api.remove_current_owner_block_working('{"block_id": 2, "base_collection_revision": 1, "confirm_removal": true}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid block_id 2');
select is(api.remove_current_owner_block_working('{"block_id": "forged", "base_collection_revision": 1, "confirm_removal": true}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid block_id ''forged''');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-00000000001A", "base_collection_revision": 1, "confirm_removal": true}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid block_id ''98000000-0000-4000-8000-00000000001A''');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": null, "confirm_removal": true}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid base_collection_revision None');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 0, "confirm_removal": true}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid base_collection_revision 0');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": -1, "confirm_removal": true}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid base_collection_revision -1');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1.5, "confirm_removal": true}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid base_collection_revision 1.5');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": "1", "confirm_removal": true}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid base_collection_revision ''1''');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 9007199254740992, "confirm_removal": true}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid base_collection_revision 9007199254740992');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": null}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid confirm_removal None');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": false}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid confirm_removal False');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": 0}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid confirm_removal 0');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": 1}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid confirm_removal 1');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": "true"}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid confirm_removal ''true''');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": "false"}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid confirm_removal ''false''');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": {}}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid confirm_removal {}');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": []}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Invalid confirm_removal []');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": true, "owner_id": "forged"}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Unknown owner_id cannot grant authority');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": true, "kind": "forged"}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Unknown kind cannot grant authority');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": true, "position": "forged"}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Unknown position cannot grant authority');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": true, "is_visible": "forged"}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Unknown is_visible cannot grant authority');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": true, "link_working": "forged"}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Unknown link_working cannot grant authority');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": true, "published": "forged"}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Unknown published cannot grant authority');
select is(api.remove_current_owner_block_working('{"block_id": "98000000-0000-4000-8000-000000000011", "base_collection_revision": 1, "confirm_removal": true, "block_ids": "forged"}'::jsonb),'{"status":"invalid_block_removal"}'::jsonb,'Unknown block_ids cannot grant authority');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000001');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000011',1),'{"status":"owner_not_eligible"}'::jsonb,'Restricted denies');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000001');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000011',1),'{"status":"owner_not_eligible"}'::jsonb,'Suspended denies');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000001');
select is((select jsonb_agg(to_jsonb(b) order by block_id) from core.identity_blocks_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by block_id) from original_members b),'All denied removals preserve members/timestamps');
select is((select jsonb_agg(to_jsonb(b) order by owner_id) from core.identity_block_collections_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by owner_id) from original_collections b),'All denials preserve collection revision/timestamps');
create function pg_temp.abort_removal() returns void language plpgsql as $$ begin
 if pg_temp.remove_block('98000000-0000-4000-8000-000000000011',1)->>'status'<>'success' then raise exception 'fixture removal failed'; end if;
 raise exception 'fixture rollback' using errcode='P0001'; end $$;
select throws_ok($$select pg_temp.abort_removal()$$,'P0001','fixture rollback','Failure rolls back membership/payload/collection atomically');
select is((select jsonb_agg(to_jsonb(b) order by block_id) from core.identity_blocks_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by block_id) from original_members b),'Rollback restores exact membership');
select is((select jsonb_agg(to_jsonb(b) order by block_id) from core.identity_block_links_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by block_id) from original_payload b),'Rollback restores exact cascaded payload');
select is((select revision::integer from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000001')),1,'Rollback restores revision');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000011',1),'{"status":"success","block_id":"98000000-0000-4000-8000-000000000011","collection_revision":2}'::jsonb,'Confirmed hidden Generic removal has minimal next revision ack');
select is((select count(*)::integer from core.identity_blocks_working where block_id='98000000-0000-4000-8000-000000000011'),0,'Only target membership removed');
select is((select count(*)::integer from core.identity_block_links_working where block_id='98000000-0000-4000-8000-000000000011'),0,'Only bound target payload cascades');
select is((select jsonb_agg(to_jsonb(b) order by block_id) from core.identity_blocks_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by block_id) from original_members b where block_id<>'98000000-0000-4000-8000-000000000011'),'Every other member ID/order/visibility/timestamp retained');
select is((select jsonb_agg(to_jsonb(b) order by block_id) from core.identity_block_links_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by block_id) from original_payload b where block_id<>'98000000-0000-4000-8000-000000000011'),'Foreign/other payloads retained');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000011',1),'{"status":"stale_write"}'::jsonb,'Repeated old base is stale, not idempotent success');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000011',2),'{"status":"block_not_found"}'::jsonb,'Repeated new base sees missing block, no fabricated success');
select is((select revision::integer from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000001')),2,'Repeated denials never bump');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000012',2),'{"status":"success","block_id":"98000000-0000-4000-8000-000000000012","collection_revision":3}'::jsonb,'Confirmed social removal independent of absent/unimplemented payload');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000013',3),'{"status":"success","block_id":"98000000-0000-4000-8000-000000000013","collection_revision":4}'::jsonb,'Confirmed text removal independent of absent/unimplemented payload');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000015',4),'{"status":"success","block_id":"98000000-0000-4000-8000-000000000015","collection_revision":5}'::jsonb,'Confirmed contact removal independent of absent/unimplemented payload');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000016',5),'{"status":"success","block_id":"98000000-0000-4000-8000-000000000016","collection_revision":6}'::jsonb,'Confirmed media removal independent of absent/unimplemented payload');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000017',6),'{"status":"success","block_id":"98000000-0000-4000-8000-000000000017","collection_revision":7}'::jsonb,'Confirmed spill_cta removal independent of absent/unimplemented payload');
select is((select count(*)::integer from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000001')),0,'Last removal retains explicit empty collection');
select ok((select revision=7 and created_at='2000-01-01'::timestamptz and updated_at>created_at from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000001')),'Collection identity retained and bumped exactly once per removal');
select is(api.resolve_current_owner_blocks_working()->'collection','{"revision":7,"blocks":[]}'::jsonb,'Authoritative reader reports explicit empty, never missing');
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":3,"title":"must not resurrect","base_collection_revision":null}'),'{"status":"already_initialized"}'::jsonb,'Empty collection does not reimport onboarding source');
select is((select count(*)::integer from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000001')),0,'No implicit resurrection after empty collection');
select is((select initial_block_id::text from core.identity_block_initialization_provenance where owner_id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000001')),'98000000-0000-4000-8000-000000000011','Historical retired initial block pointer retained, not current membership authority');
select is((select jsonb_agg(to_jsonb(b) order by owner_id) from core.identity_connection_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by owner_id) from original_source b),'Original first slot retained');
select is((select jsonb_agg(to_jsonb(b) order by owner_id) from core.identity_block_initialization_provenance b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by owner_id) from original_provenance b),'Original provenance fully retained');
select ok(not exists((select * from core.identity_working except select * from original_profile) union all (select * from original_profile except select * from core.identity_working)),'core.identity_working unchanged');
select ok(not exists((select * from core.identity_layout_working except select * from original_layout) union all (select * from original_layout except select * from core.identity_layout_working)),'core.identity_layout_working unchanged');
select ok(not exists((select * from core.identity_publications except select * from original_publications) union all (select * from original_publications except select * from core.identity_publications)),'core.identity_publications unchanged');
select ok(not exists((select * from core.onboarding_preview_receipts except select * from original_receipts) union all (select * from original_receipts except select * from core.onboarding_preview_receipts)),'core.onboarding_preview_receipts unchanged');
select ok(not exists((select * from core.owner_auth_bindings except select * from original_bindings) union all (select * from original_bindings except select * from core.owner_auth_bindings)),'core.owner_auth_bindings unchanged');
select ok(not exists((select * from core.owner_handle_namespaces except select * from original_namespaces) union all (select * from original_namespaces except select * from core.owner_handle_namespaces)),'core.owner_handle_namespaces unchanged');
select is((select count(*)::integer from core.owners where id in (select owner_id from actors)),3,'No permanent Owner identity removed');
select is((select to_jsonb(b) from core.identity_blocks_working b where block_id='98000000-0000-4000-8000-000000000014'),(select to_jsonb(b) from original_members b where block_id='98000000-0000-4000-8000-000000000014'),'Foreign membership fully unchanged');
select is((select to_jsonb(b) from core.identity_block_collections_working b where owner_id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000002')),(select to_jsonb(b) from original_collections b where owner_id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000002')),'Foreign collection fully unchanged');
set local request.jwt.claims='{"sub":"98000000-0000-4000-8000-000000000002"}';
update core.identity_block_collections_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000002');
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000014',9007199254740991),'{"status":"revision_exhausted"}'::jsonb,'Maximum safe revision denies before removal');
select is((select count(*)::integer from core.identity_blocks_working where block_id='98000000-0000-4000-8000-000000000014'),1,'Exhaustion preserves membership');
select is((select title from core.identity_block_links_working where block_id='98000000-0000-4000-8000-000000000014'),'original','Exhaustion preserves payload');
set local request.jwt.claims='{"sub":"98000000-0000-4000-8000-000000000003"}';
select is(pg_temp.remove_block('98000000-0000-4000-8000-000000000011',1),'{"status":"unavailable"}'::jsonb,'Missing own collection not fabricated');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='98000000-0000-4000-8000-000000000003');
select is(api.remove_current_owner_block_working('{}'),'{"status":"unavailable"}'::jsonb,'Missing canonical context denied');
select * from finish();
rollback;

begin;
select no_plan();
select ok((select prosecdef and provolatile='v' from pg_proc where oid='api.save_current_owner_block_link_working(jsonb)'::regprocedure),'Hardened volatile CAS definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.save_current_owner_block_link_working(jsonb)'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.save_current_owner_block_link_working(jsonb)','EXECUTE'),'anon execution withheld');
select ok(not has_function_privilege('authenticated','api.save_current_owner_block_link_working(jsonb)','EXECUTE'),'authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.save_current_owner_block_link_working(jsonb)','EXECUTE'),'service execution withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='save_current_owner_block_link_working' and grantee='PUBLIC'),'PUBLIC execution withheld');
set local role authenticated;
select throws_ok($$select api.save_current_owner_block_link_working('{}')$$,'42501',null,'Actual authenticated execution denied');
reset role;
set local role anon;
select throws_ok($$select api.save_current_owner_block_link_working('{}')$$,'42501',null,'Actual anon execution denied');
reset role;
set local role service_role;
select throws_ok($$select api.save_current_owner_block_link_working('{}')$$,'42501',null,'Actual service execution denied');
reset role;
set local request.jwt.claims='{}';
select is(api.save_current_owner_block_link_working('{}'),'{"status":"unauthenticated"}'::jsonb,'No actor denies');
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"forged"}}';
select is(api.save_current_owner_block_link_working('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata cannot invent Owner');
insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','cas-one@example.test'),
 ('91000000-0000-4000-8000-000000000002','cas-two@example.test'),
 ('91000000-0000-4000-8000-000000000003','cas-empty@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'cas-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000001"}';
select is(api.save_current_owner_block_link_working('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner denies');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id<>'91000000-0000-4000-8000-000000000003';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select '91000000-0000-4000-8000-000000000011',owner_id,'generic_link',1,false from actors where auth_user_id='91000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '91000000-0000-4000-8000-000000000012',owner_id,'social',2 from actors where auth_user_id='91000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '91000000-0000-4000-8000-000000000013',owner_id,'text',3 from actors where auth_user_id='91000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '91000000-0000-4000-8000-000000000014',owner_id,'generic_link',1 from actors where auth_user_id='91000000-0000-4000-8000-000000000002';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url,created_at)
 select block_id,owner_id,kind,'original',null,'https://original.example.test','2000-01-01'::timestamptz
 from core.identity_blocks_working where block_id in ('91000000-0000-4000-8000-000000000011','91000000-0000-4000-8000-000000000014');
insert into core.identity_connection_working(owner_id,connection_kind,destination_url,revision)
 select owner_id,'generic_link','https://source.example.test',3 from actors where auth_user_id='91000000-0000-4000-8000-000000000001';
insert into core.identity_block_initialization_provenance(owner_id,initial_block_id,source_connection_revision,source_connection_kind,source_destination_url,initial_title)
 select owner_id,'91000000-0000-4000-8000-000000000011',3,'generic_link','https://source.example.test','original' from actors where auth_user_id='91000000-0000-4000-8000-000000000001';
-- Link CAS race fixtures end here.
create function pg_temp.save_link(input_id uuid,input_base bigint,input_link jsonb) returns jsonb language sql as $$
 select api.save_current_owner_block_link_working(jsonb_build_object('block_id',input_id,'base_collection_revision',input_base,'link_working',input_link)); $$;
create temporary table original_members as select * from core.identity_blocks_working where owner_id in (select owner_id from actors);
create temporary table original_source as select * from core.identity_connection_working where owner_id in (select owner_id from actors);
create temporary table original_provenance as select * from core.identity_block_initialization_provenance where owner_id in (select owner_id from actors);
create temporary table foreign_payload as select * from core.identity_block_links_working where block_id='91000000-0000-4000-8000-000000000014';
create temporary table old_counts as select (select count(*) from core.identity_working) profile,(select count(*) from core.identity_layout_working) layout,(select count(*) from core.identity_publications) published;
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000011',2,'{"kind":"generic_link","title":null,"social_platform":null,"destination_url":null}'),'{"status":"stale_write"}'::jsonb,'Wrong acknowledged collection base denies');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000014',1,'{"kind":"generic_link","title":null,"social_platform":null,"destination_url":null}'),'{"status":"block_not_found"}'::jsonb,'Cross-Owner block denied without foreign oracle');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000099',1,'{"kind":"generic_link","title":null,"social_platform":null,"destination_url":null}'),'{"status":"block_not_found"}'::jsonb,'Unknown UUID same denial');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000013',1,'{"kind":"generic_link","title":null,"social_platform":null,"destination_url":null}'),'{"status":"unsupported_block_kind"}'::jsonb,'Own Text is unimplemented payload scope, no guessed conversion');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000011',1,'{"kind":"social","title":null,"social_platform":null,"destination_url":null}'),'{"status":"invalid_link_working"}'::jsonb,'Existing Generic kind cannot silently convert');
select is(api.save_current_owner_block_link_working('[]'),'{"status":"invalid_link_working"}'::jsonb,'Nonobject denied');
select is(api.save_current_owner_block_link_working(null),'{"status":"invalid_link_working"}'::jsonb,'SQL null denied');
select is(api.save_current_owner_block_link_working('{"block_id":"forged","base_collection_revision":1,"link_working":{}}'),'{"status":"invalid_link_working"}'::jsonb,'Invalid UUID denied');
select is(api.save_current_owner_block_link_working('{"block_id":"91000000-0000-4000-8000-000000000011","base_collection_revision":1.5,"link_working":{}}'),'{"status":"invalid_link_working"}'::jsonb,'Fractional base denied');
select is(api.save_current_owner_block_link_working('{"block_id":"91000000-0000-4000-8000-000000000011","base_collection_revision":9007199254740992,"link_working":{}}'),'{"status":"invalid_link_working"}'::jsonb,'Unsafe base denied');
select is(api.save_current_owner_block_link_working('{"block_id":"91000000-0000-4000-8000-000000000011","base_collection_revision":0,"link_working":{}}'),'{"status":"invalid_link_working"}'::jsonb,'Zero base denied');
select is(api.save_current_owner_block_link_working('{"block_id":"91000000-0000-4000-8000-000000000011","base_collection_revision":"1","link_working":{}}'),'{"status":"invalid_link_working"}'::jsonb,'String base denied');
select is(api.save_current_owner_block_link_working('{"block_id":"91000000-0000-4000-8000-000000000011","base_collection_revision":1,"link_working":{},"owner_id":"forged"}'),'{"status":"invalid_link_working"}'::jsonb,'Owner selector denied');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000011',1,'{"kind":"generic_link","title":null,"social_platform":null}'),'{"status":"invalid_link_working"}'::jsonb,'Every nullable field explicitly required');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000011',1,'{"kind":"generic_link","title":5,"social_platform":null,"destination_url":null}'),'{"status":"invalid_link_working"}'::jsonb,'Wrong nested field type denied');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000011',1,'{"kind":"generic_link","title":null,"social_platform":null,"destination_url":null,"issues":[]}'),'{"status":"invalid_link_working"}'::jsonb,'Caller issues cannot claim authority');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000011',1,jsonb_build_object('kind','generic_link','title',repeat('😀',513),'social_platform',null,'destination_url',null)),'{"status":"invalid_link_working"}'::jsonb,'Title Unicode transport budget');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000011',1,jsonb_build_object('kind','generic_link','title',null,'social_platform',repeat('x',41),'destination_url',null)),'{"status":"invalid_link_working"}'::jsonb,'Platform transport budget');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000011',1,jsonb_build_object('kind','generic_link','title',null,'social_platform',null,'destination_url',repeat('x',2049))),' {"status":"invalid_link_working"}'::jsonb,'Destination transport budget');
select is((select revision::integer from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='91000000-0000-4000-8000-000000000001')),1,'All denied writes preserve revision');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='91000000-0000-4000-8000-000000000001');
select is(api.save_current_owner_block_link_working('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Restricted Owner denied');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='91000000-0000-4000-8000-000000000001');
select is(api.save_current_owner_block_link_working('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Suspended Owner denied');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='91000000-0000-4000-8000-000000000001');
create temporary table reply as select pg_temp.save_link('91000000-0000-4000-8000-000000000011',1,jsonb_build_object('kind','generic_link','title',' raw'||chr(9),'social_platform','NotApplicable','destination_url','javascript:private()')) value;
select is((select value from reply),'{"status":"success","block_id":"91000000-0000-4000-8000-000000000011","collection_revision":2}'::jsonb,'Own raw invalid Working save bumps once, minimal acknowledgment');
select is((select jsonb_build_object('title',title,'social_platform',social_platform,'destination_url',destination_url) from core.identity_block_links_working where block_id='91000000-0000-4000-8000-000000000011'),jsonb_build_object('title',' raw'||chr(9),'social_platform','NotApplicable','destination_url','javascript:private()'),'Exact invalid raw fields preserved, not normalized/auto-cleared');
select is((select created_at from core.identity_block_links_working where block_id='91000000-0000-4000-8000-000000000011'),'2000-01-01'::timestamptz,'Payload creation identity retained');
select ok((select updated_at>created_at from core.identity_block_links_working where block_id='91000000-0000-4000-8000-000000000011'),'Payload update timestamp assigned');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000011',1,'{"kind":"generic_link","title":"stale overwrite","social_platform":null,"destination_url":null}'),'{"status":"stale_write"}'::jsonb,'Old base cannot overwrite acknowledged new Working');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000012',2,'{"kind":"social","title":null,"social_platform":null,"destination_url":null}'),'{"status":"success","block_id":"91000000-0000-4000-8000-000000000012","collection_revision":3}'::jsonb,'Explicit missing Social payload persistence, no block/collection fabrication');
select is((select jsonb_build_object('title',title,'social_platform',social_platform,'destination_url',destination_url) from core.identity_block_links_working where block_id='91000000-0000-4000-8000-000000000012'),'{"title":null,"social_platform":null,"destination_url":null}'::jsonb,'All-null payload present, not missing');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000012',3,'{"kind":"social","title":null,"social_platform":null,"destination_url":null}')->'collection_revision','4'::jsonb,'Identical successful save bumps once, no idempotency claim');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000011',4,jsonb_build_object('kind','generic_link','title',repeat('😀',512),'social_platform',repeat('x',40),'destination_url',repeat('😀',2048)))->'collection_revision','5'::jsonb,'Code-point budget boundaries remain recoverable');
select is((select jsonb_agg(to_jsonb(b) order by block_id) from core.identity_blocks_working b where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(b) order by block_id) from original_members b),'Membership IDs/kinds/order/visibility/Owner/timestamps unchanged');
select is((select to_jsonb(p) from core.identity_block_links_working p where block_id='91000000-0000-4000-8000-000000000014'),(select to_jsonb(p) from foreign_payload p),'Foreign payload untouched');
select is((select jsonb_agg(to_jsonb(s) order by owner_id) from core.identity_connection_working s where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(s) order by owner_id) from original_source s),'First-slot source untouched');
select is((select jsonb_agg(to_jsonb(s) order by owner_id) from core.identity_block_initialization_provenance s where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(s) order by owner_id) from original_provenance s),'Original provenance snapshot unchanged');
select ok((select profile=(select count(*) from core.identity_working) and layout=(select count(*) from core.identity_layout_working) and published=(select count(*) from core.identity_publications) from old_counts),'Profile/layout/Published not mutated');
create function pg_temp.abort_save() returns void language plpgsql as $$ begin
 if pg_temp.save_link('91000000-0000-4000-8000-000000000011',5,'{"kind":"generic_link","title":"rollback","social_platform":null,"destination_url":null}')->>'status'<>'success' then raise exception 'fixture save failed'; end if;
 raise exception 'fixture rollback' using errcode='P0001'; end $$;
select throws_ok($$select pg_temp.abort_save()$$,'P0001','fixture rollback','Error rolls back payload and collection atomically');
select is((select revision::integer from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='91000000-0000-4000-8000-000000000001')),5,'Rollback preserves collection revision');
select is((select title from core.identity_block_links_working where block_id='91000000-0000-4000-8000-000000000011'),repeat('😀',512),'Rollback preserves previous payload');
update core.identity_block_collections_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='91000000-0000-4000-8000-000000000001');
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000011',9007199254740991,'{"kind":"generic_link","title":null,"social_platform":null,"destination_url":null}'),'{"status":"revision_exhausted"}'::jsonb,'Safe maximum denies before overflow or writes');
select is((select title from core.identity_block_links_working where block_id='91000000-0000-4000-8000-000000000011'),repeat('😀',512),'Exhaustion leaves payload intact');
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000003"}';
select is(pg_temp.save_link('91000000-0000-4000-8000-000000000011',1,'{"kind":"generic_link","title":null,"social_platform":null,"destination_url":null}'),'{"status":"unavailable"}'::jsonb,'Missing own collection never fabricated');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='91000000-0000-4000-8000-000000000003');
select is(api.save_current_owner_block_link_working('{}'),'{"status":"unavailable"}'::jsonb,'Missing canonical context denies');
select * from finish();
rollback;

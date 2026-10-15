begin;
select no_plan();
select ok((select pronargs=1 and prosecdef and provolatile='s' from pg_proc where oid='api.resolve_current_owner_blocks_working_page(jsonb)'::regprocedure),'Stable current-Owner page definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.resolve_current_owner_blocks_working_page(jsonb)'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.resolve_current_owner_blocks_working_page(jsonb)','EXECUTE'),'anon execution withheld');
set local role anon;
select throws_ok($$select api.resolve_current_owner_blocks_working_page('{}')$$,'42501',null,'Actual anon denied');
reset role;
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_blocks_working_page(jsonb)','EXECUTE'),'authenticated execution withheld');
set local role authenticated;
select throws_ok($$select api.resolve_current_owner_blocks_working_page('{}')$$,'42501',null,'Actual authenticated denied');
reset role;
select ok(not has_function_privilege('service_role','api.resolve_current_owner_blocks_working_page(jsonb)','EXECUTE'),'service_role execution withheld');
set local role service_role;
select throws_ok($$select api.resolve_current_owner_blocks_working_page('{}')$$,'42501',null,'Actual service_role denied');
reset role;
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='resolve_current_owner_blocks_working_page' and grantee='PUBLIC'),'PUBLIC execution withheld');
set local request.jwt.claims='{}';
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb),'{"status":"unavailable"}'::jsonb,'Unauthenticated denies');
set local request.jwt.claims='{"sub":"b7000000-0000-4000-8000-000000000099","role":"authenticated"}';
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb),'{"status":"unavailable"}'::jsonb,'Unbound actor denies');
insert into auth.users(id,email) values
 ('b7000000-0000-4000-8000-000000000001','page-read-one@example.test'),
 ('b7000000-0000-4000-8000-000000000002','page-read-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('b7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='business' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select case auth_user_id when 'b7000000-0000-4000-8000-000000000001' then 'page-owner-one' else 'page-owner-two' end,owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"b7000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb),'{"status":"unavailable"}'::jsonb,'Incomplete Owner denies');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb),'{"status":"success","current_handle":"page-owner-one","primary_use_case":"business","collection":null}'::jsonb,'Missing collection is explicit, never guessed empty canvas');
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000001';
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection','{"revision":1,"blocks":[],"has_more":false,"next_after_position":null}'::jsonb,'Initialized empty collection is distinct');
insert into core.identity_blocks_working(owner_id,kind,position)
 select a.owner_id,k.kind,k.position::integer from actors a
 cross join unnest(enum_range(null::core.identity_block_kind)) with ordinality as k(kind,position)
 where a.auth_user_id='b7000000-0000-4000-8000-000000000001';
select is(jsonb_array_length(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'blocks'),6,'All six kinds retained in order');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'blocks'->0->>'payload_state','missing','Absent Social payload explicit');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'blocks'->2->>'payload_state','not_implemented','Contact payload technical scope explicit');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'blocks'->3->'link_working','null'::jsonb,'Media payload not fabricated');
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
 select block_id,owner_id,kind,' raw'||chr(9),'NotNormalized','javascript:private' from core.identity_blocks_working where kind='social';
update core.identity_blocks_working set is_visible=false where kind='social';
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'blocks'->0->'link_working',jsonb_build_object('title',' raw'||chr(9),'social_platform','NotNormalized','destination_url','javascript:private'),'Exact invalid raw Working retained privately, no safety/URL rewrite');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'blocks'->0->'is_visible','false'::jsonb,'Hidden block retained in Owner Working order');
insert into core.identity_block_links_working(block_id,owner_id,kind) select block_id,owner_id,kind from core.identity_blocks_working where kind='generic_link';
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'blocks'->1->>'payload_state','present','All-null present payload is distinct from missing');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'blocks'->1->'link_working','{"title":null,"social_platform":null,"destination_url":null}'::jsonb,'No guessed label/URL in incomplete payload');
set local request.jwt.claims='{"sub":"b7000000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"owner_id":"forged","handle":"page-owner-one"}}';
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb),'{"status":"success","current_handle":"page-owner-two","primary_use_case":"business","collection":null}'::jsonb,'Metadata cannot borrow other Owner collection/payload');
set local request.jwt.claims='{"sub":"b7000000-0000-4000-8000-000000000001","role":"authenticated"}';
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000001');
select is(jsonb_array_length(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'blocks'),6,'Personalization never filters any kind');
-- Page snapshot race fixtures end here.
create temporary table before_read as select
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_block_collections_working x) collections,
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_blocks_working x) memberships,
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_links_working x) payloads,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x) progress,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x) publications;
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->>'status','success','Read remains usable without mutation');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_block_collections_working x),(select collections from before_read),'Collection/revision unchanged');
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_blocks_working x),(select memberships from before_read),'Membership/IDs/order unchanged');
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_links_working x),(select payloads from before_read),'Raw payload unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x),(select progress from before_read),'Onboarding unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x),(select publications from before_read),'Published unchanged');
set constraints core.identity_blocks_working_owner_position_unique deferred;
update core.identity_blocks_working set position=1 where kind='generic_link';
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb),'{"status":"unavailable"}'::jsonb,'Inconsistent deferred order denied, not guessed/truncated');
update core.identity_blocks_working set position=2 where kind='generic_link';
set constraints core.identity_blocks_working_owner_position_unique immediate;

select is(api.resolve_current_owner_blocks_working_page('null'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('[]'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('"page"'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('true'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": null}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"after_position": null}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": null, "after_position": 1}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": null}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 0, "after_position": 1}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": -1, "after_position": 1}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1.5, "after_position": 1}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": "1", "after_position": 1}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": "null", "after_position": 1}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": false, "after_position": 1}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": [], "after_position": 1}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": {}, "after_position": 1}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 9007199254740992, "after_position": 1}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": 0}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": -1}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": 1.5}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": "1"}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": "null"}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": false}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": []}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": {}}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": 9007199254740992}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": 2147483648}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": null, "after_position": null, "owner_id": "forged"}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": null, "after_position": null, "block_id": "forged"}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": null, "after_position": null, "limit": "forged"}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": null, "after_position": null, "offset": "forged"}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": null, "after_position": null, "kind": "forged"}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": null, "after_position": null, "is_visible": "forged"}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": null, "after_position": null, "sort": "forged"}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": null, "after_position": null, "cursor": "forged"}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": null, "after_position": null, "source": "forged"}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": null, "after_position": null, "published": "forged"}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Strict page envelope');
select is(api.resolve_current_owner_blocks_working_page(null),'{"status": "invalid_page_request"}'::jsonb,'SQL null invalid');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 2, "after_position": 1}'::jsonb),'{"status": "stale_read"}'::jsonb,'Wrong revision never returns page');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": 42}'::jsonb),'{"status": "invalid_page_request"}'::jsonb,'Missing own cursor never guesses offset');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 9007199254740991, "after_position": 2147483647}'::jsonb),'{"status": "stale_read"}'::jsonb,'Safe extremes syntactic then stale');
delete from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000001');
insert into core.identity_blocks_working(owner_id,kind,position) select (select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000001'),'text',n from generate_series(1,100)n;
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'has_more','false'::jsonb,'Exactly100 terminal no phantom next');
select is(jsonb_array_length(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'blocks'),100,'Exactly100 complete page');
insert into core.identity_blocks_working(owner_id,kind,position) values((select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000001'),'text',101);
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'has_more','true'::jsonb,'101st lookahead has more');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'next_after_position','100'::jsonb,'Cursor last returned, not lookahead');
select is(jsonb_array_length(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'blocks'),100,'Lookahead not emitted');
insert into core.identity_blocks_working(owner_id,kind,position) select (select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000001'),'text',n from generate_series(102,501)n;
create temporary table pages as select n,api.resolve_current_owner_blocks_working_page(jsonb_build_object('expected_collection_revision',case when n=0 then null else 1 end,'after_position',case when n=0 then null else n*100 end)) reply from generate_series(0,5)n;
select is((select array_agg(jsonb_array_length(reply->'collection'->'blocks') order by n) from pages),array[100,100,100,100,100,1],'501 rows traverse six bounded pages');
select is((select count(distinct b->>'block_id')::integer from pages cross join lateral jsonb_array_elements(reply->'collection'->'blocks') b),501,'No duplicate or lost member across pages');
select is((select array_agg((b->>'position')::integer order by (b->>'position')::integer) from pages cross join lateral jsonb_array_elements(reply->'collection'->'blocks') b),array(select generate_series(1,501)),'Exact own order without omissions');
select is((select reply->'collection'->'next_after_position' from pages where n=5),'null'::jsonb,'Terminal cursor null');
select is(api.resolve_current_owner_blocks_working(),'{"status": "unavailable"}'::jsonb,'Old complete reader bound stays closed');
select is((select count(*)::integer from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000001')),501,'Pages never delete/truncate work');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": 501}') ->'collection','{"revision":1,"blocks":[],"has_more":false,"next_after_position":null}'::jsonb,'Last existing cursor is explicit terminal');
update core.identity_blocks_working set position=position*2 where owner_id=(select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": 200}')->'collection'->'blocks'->0->'position','202'::jsonb,'Seek preserves gaps, no renumber');
update core.identity_block_collections_working set revision=2 where owner_id=(select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": 200}'::jsonb),'{"status": "stale_read"}'::jsonb,'Advanced collection rejects old continuation');
update core.identity_block_collections_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb)->'collection'->'revision','9007199254740991'::jsonb,'Safe max revision read only, no increment');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb),'{"status": "unavailable"}'::jsonb,'Restricted Owner denies');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb),'{"status": "unavailable"}'::jsonb,'Suspended Owner denies');
set local request.jwt.claims='{"sub":"b7000000-0000-4000-8000-000000000002"}';
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision": 1, "after_position": 2}'::jsonb),'{"status": "stale_read"}'::jsonb,'Missing own collection continuation stale, no foreign oracle');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='b7000000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":null,"after_position":null}'::jsonb),'{"status": "unavailable"}'::jsonb,'Missing context denies');
select * from finish();
rollback;

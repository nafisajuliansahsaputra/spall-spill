begin;
select no_plan();
select ok(to_regprocedure('api.resolve_current_owner_blocks_working()') is not null,'Owner block reader exists');
select ok((select pronargs=0 and prosecdef and provolatile='s' from pg_proc where oid='api.resolve_current_owner_blocks_working()'::regprocedure),'Zero-target stable definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.resolve_current_owner_blocks_working()'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.resolve_current_owner_blocks_working()','EXECUTE'),'anon execution withheld');
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_blocks_working()','EXECUTE'),'authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.resolve_current_owner_blocks_working()','EXECUTE'),'service role execution withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='resolve_current_owner_blocks_working' and grantee='PUBLIC' and privilege_type='EXECUTE'),'PUBLIC execution withheld');
set local request.jwt.claims='{}';
select is(api.resolve_current_owner_blocks_working(),'{"status":"unavailable"}'::jsonb,'Unauthenticated denies');
set local request.jwt.claims='{"sub":"86000000-0000-4000-8000-000000000099","role":"authenticated"}';
select is(api.resolve_current_owner_blocks_working(),'{"status":"unavailable"}'::jsonb,'Unbound actor denies');
insert into auth.users(id,email) values
 ('86000000-0000-4000-8000-000000000001','blocks-read-one@example.test'),
 ('86000000-0000-4000-8000-000000000002','blocks-read-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('86000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='business' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select case auth_user_id when '86000000-0000-4000-8000-000000000001' then 'blocks-owner-one' else 'blocks-owner-two' end,owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(api.resolve_current_owner_blocks_working(),'{"status":"unavailable"}'::jsonb,'Incomplete Owner denies');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
select is(api.resolve_current_owner_blocks_working(),'{"status":"success","current_handle":"blocks-owner-one","primary_use_case":"business","collection":null}'::jsonb,'Missing collection is explicit, never guessed empty canvas');
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id='86000000-0000-4000-8000-000000000001';
select is(api.resolve_current_owner_blocks_working()->'collection','{"revision":1,"blocks":[]}'::jsonb,'Initialized empty collection is distinct');
insert into core.identity_blocks_working(owner_id,kind,position)
 select a.owner_id,k.kind,k.position::integer from actors a
 cross join unnest(enum_range(null::core.identity_block_kind)) with ordinality as k(kind,position)
 where a.auth_user_id='86000000-0000-4000-8000-000000000001';
select is(jsonb_array_length(api.resolve_current_owner_blocks_working()->'collection'->'blocks'),6,'All six kinds retained in order');
select is(api.resolve_current_owner_blocks_working()->'collection'->'blocks'->0->>'payload_state','missing','Absent Social payload explicit');
select is(api.resolve_current_owner_blocks_working()->'collection'->'blocks'->2->>'payload_state','not_implemented','Contact payload technical scope explicit');
select is(api.resolve_current_owner_blocks_working()->'collection'->'blocks'->3->'link_working','null'::jsonb,'Media payload not fabricated');
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
 select block_id,owner_id,kind,' raw'||chr(9),'NotNormalized','javascript:private' from core.identity_blocks_working where kind='social';
update core.identity_blocks_working set is_visible=false where kind='social';
select is(api.resolve_current_owner_blocks_working()->'collection'->'blocks'->0->'link_working',jsonb_build_object('title',' raw'||chr(9),'social_platform','NotNormalized','destination_url','javascript:private'),'Exact invalid raw Working retained privately, no safety/URL rewrite');
select is(api.resolve_current_owner_blocks_working()->'collection'->'blocks'->0->'is_visible','false'::jsonb,'Hidden block retained in Owner Working order');
insert into core.identity_block_links_working(block_id,owner_id,kind) select block_id,owner_id,kind from core.identity_blocks_working where kind='generic_link';
select is(api.resolve_current_owner_blocks_working()->'collection'->'blocks'->1->>'payload_state','present','All-null present payload is distinct from missing');
select is(api.resolve_current_owner_blocks_working()->'collection'->'blocks'->1->'link_working','{"title":null,"social_platform":null,"destination_url":null}'::jsonb,'No guessed label/URL in incomplete payload');
set local request.jwt.claims='{"sub":"86000000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"owner_id":"forged","handle":"blocks-owner-one"}}';
select is(api.resolve_current_owner_blocks_working(),'{"status":"success","current_handle":"blocks-owner-two","primary_use_case":"business","collection":null}'::jsonb,'Metadata cannot borrow other Owner collection/payload');
set local request.jwt.claims='{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated"}';
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from actors where auth_user_id='86000000-0000-4000-8000-000000000001');
select is(jsonb_array_length(api.resolve_current_owner_blocks_working()->'collection'->'blocks'),6,'Personalization never filters any kind');
create temporary table before_read as select
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_block_collections_working x) collections,
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_blocks_working x) memberships,
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_links_working x) payloads,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x) progress,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x) publications;
select is(api.resolve_current_owner_blocks_working()->>'status','success','Read remains usable without mutation');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_block_collections_working x),(select collections from before_read),'Collection/revision unchanged');
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_blocks_working x),(select memberships from before_read),'Membership/IDs/order unchanged');
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_links_working x),(select payloads from before_read),'Raw payload unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x),(select progress from before_read),'Onboarding unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x),(select publications from before_read),'Published unchanged');
set constraints core.identity_blocks_working_owner_position_unique deferred;
update core.identity_blocks_working set position=1 where kind='generic_link';
select is(api.resolve_current_owner_blocks_working(),'{"status":"unavailable"}'::jsonb,'Inconsistent deferred order denied, not guessed/truncated');
update core.identity_blocks_working set position=2 where kind='generic_link';
set constraints core.identity_blocks_working_owner_position_unique immediate;
delete from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='86000000-0000-4000-8000-000000000001');
insert into core.identity_blocks_working(owner_id,kind,position)
 select a.owner_id,'text',n from actors a cross join generate_series(1,500) n where a.auth_user_id='86000000-0000-4000-8000-000000000001';
select is(jsonb_array_length(api.resolve_current_owner_blocks_working()->'collection'->'blocks'),500,'Complete response at transport boundary');
insert into core.identity_blocks_working(owner_id,kind,position) select owner_id,'text',501 from actors where auth_user_id='86000000-0000-4000-8000-000000000001';
select is(api.resolve_current_owner_blocks_working(),'{"status":"unavailable"}'::jsonb,'Over transport boundary denied without silently truncating');
select is((select count(*)::integer from core.identity_blocks_working),501,'Read bound does not delete preserved Working');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='86000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_blocks_working(),'{"status":"unavailable"}'::jsonb,'Restricted Owner denies');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='86000000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_blocks_working(),'{"status":"unavailable"}'::jsonb,'Suspended Owner denies');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='86000000-0000-4000-8000-000000000001');
set local request.jwt.claims='{"sub":"86000000-0000-4000-8000-000000000002","role":"authenticated"}';
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='86000000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_blocks_working(),'{"status":"unavailable"}'::jsonb,'Missing context denies even absent collection');
set local role authenticated;
select throws_ok('select api.resolve_current_owner_blocks_working()','42501',null,'Actual authenticated execution withheld');
reset role;
select * from finish();
rollback;

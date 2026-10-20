begin;
select no_plan();
select ok((select prosecdef and provolatile='v' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) from pg_proc where oid='api.initialize_current_owner_blocks_from_text(jsonb)'::regprocedure),'Hardened volatile empty-path definer');
select ok(not has_function_privilege('anon','api.initialize_current_owner_blocks_from_text(jsonb)','EXECUTE'),'anon execution withheld');
set local role anon;
select throws_ok($$select api.initialize_current_owner_blocks_from_text('{}')$$,'42501',null,'Actual anon denied');
reset role;
select ok(not has_function_privilege('authenticated','api.initialize_current_owner_blocks_from_text(jsonb)','EXECUTE'),'authenticated execution withheld');
set local role authenticated;
select throws_ok($$select api.initialize_current_owner_blocks_from_text('{}')$$,'42501',null,'Actual authenticated denied');
reset role;
select ok(not has_function_privilege('service_role','api.initialize_current_owner_blocks_from_text(jsonb)','EXECUTE'),'service_role execution withheld');
set local role service_role;
select throws_ok($$select api.initialize_current_owner_blocks_from_text('{}')$$,'42501',null,'Actual service_role denied');
reset role;
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='initialize_current_owner_blocks_from_text' and grantee='PUBLIC'),'PUBLIC execution withheld');
set local request.jwt.claims='{}';
select is(api.initialize_current_owner_blocks_from_text('{}'),'{"status":"unauthenticated"}'::jsonb,'No actor');
set local request.jwt.claims='{"sub":"a5000000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"forged"}}';
select is(api.initialize_current_owner_blocks_from_text('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata not authority');
insert into auth.users(id,email) values
 ('a5000000-0000-4000-8000-000000000001','text-init-one@example.test'),
 ('a5000000-0000-4000-8000-000000000002','text-init-two@example.test'),
 ('a5000000-0000-4000-8000-000000000003','text-init-missing@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('a5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='business' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'text-init-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"a5000000-0000-4000-8000-000000000001"}';
select is(api.initialize_current_owner_blocks_from_text('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner cannot initialize');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
insert into core.identity_connection_working(owner_id,connection_kind,social_platform,destination_url,revision)
 select owner_id,case when auth_user_id='a5000000-0000-4000-8000-000000000001' then 'generic_link'::core.identity_connection_kind else 'social'::core.identity_connection_kind end,
 case when auth_user_id='a5000000-0000-4000-8000-000000000001' then null else 'custom_platform-1' end,
 'HTTPS://Private.example.test/Exact?X=1#Recoverable',3 from actors where auth_user_id<>'a5000000-0000-4000-8000-000000000003';

-- First Text initialization race fixtures end here.
-- Actual foreign Text/Link/provenance rows prove preservation beyond empty tables.
insert into auth.users(id,email) values('a5000000-0000-4000-8000-000000000004','text-init-foreign@example.test');
insert into core.identity_block_collections_working(owner_id) select owner_id from core.owner_auth_bindings where auth_user_id='a5000000-0000-4000-8000-000000000004';
insert into core.identity_blocks_working(block_id,owner_id,kind,position) select 'a5000000-0000-4000-8000-000000000014',owner_id,'text',1 from core.owner_auth_bindings where auth_user_id='a5000000-0000-4000-8000-000000000004';
insert into core.identity_blocks_working(block_id,owner_id,kind,position) select 'a5000000-0000-4000-8000-000000000015',owner_id,'generic_link',2 from core.owner_auth_bindings where auth_user_id='a5000000-0000-4000-8000-000000000004';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content) select block_id,owner_id,kind,'Foreign raw' from core.identity_blocks_working where block_id='a5000000-0000-4000-8000-000000000014';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,destination_url) select block_id,owner_id,kind,'Foreign link','https://foreign.example.test' from core.identity_blocks_working where block_id='a5000000-0000-4000-8000-000000000015';
insert into core.identity_block_initialization_provenance(owner_id,initial_block_id,source_connection_revision,source_connection_kind,source_destination_url) select owner_id,block_id,3,'generic_link','https://foreign.example.test' from core.identity_blocks_working where block_id='a5000000-0000-4000-8000-000000000015';
create function pg_temp.text_intent(content text default ' <script>raw</script> ' || chr(1), visible boolean default false)
returns jsonb language sql as $$select jsonb_build_object('action','initialize_text_block','base_collection_revision',null,'is_visible',visible,'text_working',jsonb_build_object('kind','text','text',content))$$;
create temporary table purity(table_name text,value jsonb);
do $$declare name text; val jsonb; begin
 foreach name in array array['identity_connection_working','identity_block_initialization_provenance','identity_working','identity_layout_working','identity_publications','onboarding_preview_receipts','owner_auth_bindings','owner_handle_namespaces','owner_onboarding_progress','owners','identity_block_links_working'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',name) into val;
  insert into purity values(name,val);
 end loop;
end;$$;
create temporary table foreign_collections as select * from core.identity_block_collections_working;
create temporary table foreign_members as select * from core.identity_blocks_working;
create temporary table foreign_texts as select * from core.identity_block_texts_working;
select is(api.initialize_current_owner_blocks_from_text('null'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('[]'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('"init"'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":null,"base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":true,"base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"add_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_link_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"import_onboarding_connection","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":0,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":9007199254740991,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":"null","is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":false,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":null,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":0,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":"true","text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":null}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":[]}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"},"owner_id":"forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"},"block_id":"forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"},"position":"forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"},"source_revision":"forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"},"provenance":"forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"},"published":"forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"},"next_revision":"forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private","owner_id":"forged"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private","block_id":"forged"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private","html":"forged"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private","format":"forged"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private","safe":"forged"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private","published":"forged"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private","destination_url":"forged"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private","issues":"forged"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"text":null}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"generic_link","text":null}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":null,"text":null}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":42}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":false}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":[]}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":{}}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict explicit expected-absence Text intent');
select is(api.initialize_current_owner_blocks_from_text(pg_temp.text_intent(repeat('🙂',16385))),'{"status":"invalid_initialization_intent"}'::jsonb,'No silent truncation beyond code-point budget');
select throws_ok($q$select api.initialize_current_owner_blocks_from_text('{"action":"initialize_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"\u0000"}}'::jsonb)$q$,'22P05',null,'PostgreSQL rejects NUL before invocation');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='a5000000-0000-4000-8000-000000000001');
select is(api.initialize_current_owner_blocks_from_text(pg_temp.text_intent()),'{"status":"owner_not_eligible"}'::jsonb,'restricted denied');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='a5000000-0000-4000-8000-000000000001');
select is(api.initialize_current_owner_blocks_from_text(pg_temp.text_intent()),'{"status":"owner_not_eligible"}'::jsonb,'suspended denied');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='a5000000-0000-4000-8000-000000000001');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='a5000000-0000-4000-8000-000000000001');
select is(api.initialize_current_owner_blocks_from_text(pg_temp.text_intent()),'{"status":"unavailable"}'::jsonb,'Canonical context required');
update core.owner_onboarding_progress set primary_use_case='business' where owner_id=(select owner_id from actors where auth_user_id='a5000000-0000-4000-8000-000000000001');
select is((select count(*) from core.identity_block_collections_working where owner_id in(select owner_id from actors)),0::bigint,'All denials no collection');
-- Fail at each insert boundary, including AFTER payload insertion: no partial state.
create function pg_temp.reject_text_init() returns trigger language plpgsql as $$begin raise exception 'fixture blocked first Text'; end;$$;
create trigger reject_text_init before insert on core.identity_blocks_working for each row execute function pg_temp.reject_text_init();
select throws_ok('select api.initialize_current_owner_blocks_from_text(pg_temp.text_intent())','P0001','fixture blocked first Text','before identity_blocks_working failure propagates');
drop trigger reject_text_init on core.identity_blocks_working;
select is((select count(*) from core.identity_block_collections_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no collection');
select is((select count(*) from core.identity_blocks_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no membership');
select is((select count(*) from core.identity_block_texts_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no payload');
create trigger reject_text_init before insert on core.identity_block_texts_working for each row execute function pg_temp.reject_text_init();
select throws_ok('select api.initialize_current_owner_blocks_from_text(pg_temp.text_intent())','P0001','fixture blocked first Text','before identity_block_texts_working failure propagates');
drop trigger reject_text_init on core.identity_block_texts_working;
select is((select count(*) from core.identity_block_collections_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no collection');
select is((select count(*) from core.identity_blocks_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no membership');
select is((select count(*) from core.identity_block_texts_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no payload');
create trigger reject_text_init after insert on core.identity_block_texts_working for each row execute function pg_temp.reject_text_init();
select throws_ok('select api.initialize_current_owner_blocks_from_text(pg_temp.text_intent())','P0001','fixture blocked first Text','after identity_block_texts_working failure propagates');
drop trigger reject_text_init on core.identity_block_texts_working;
select is((select count(*) from core.identity_block_collections_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no collection');
select is((select count(*) from core.identity_blocks_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no membership');
select is((select count(*) from core.identity_block_texts_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no payload');
create temporary table replies(value jsonb);
insert into replies values(api.initialize_current_owner_blocks_from_text(pg_temp.text_intent()));
select is((select array_agg(k order by k) from replies,jsonb_object_keys(value) k),array['block_id','collection_revision','status'],'Exact minimal acknowledgment');
select is((select value->>'status' from replies),'success','First Text initialized');
select is((select value->>'collection_revision' from replies),'1','Creation revision1');
select matches((select value->>'block_id' from replies),'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$','Server UUID');
select ok((select b.kind='text' and not b.is_visible and b.position=1 and b.owner_id=(select owner_id from actors where auth_user_id='a5000000-0000-4000-8000-000000000001') from core.identity_blocks_working b where b.block_id=(select (value->>'block_id')::uuid from replies)),'Actual own hidden first Text membership');
select is((select t.text_content from core.identity_block_texts_working t where t.block_id=(select (value->>'block_id')::uuid from replies)),pg_temp.text_intent()->'text_working'->>'text','Recoverable raw control and markup retained');
select is((select api.resolve_current_owner_text_block_working((value->>'block_id')::uuid)->'block'->'text_working' from replies),(pg_temp.text_intent()->'text_working')-'kind','Selected reader observes exact persisted raw Text');
create temporary table initial_collection as select * from core.identity_block_collections_working;
create temporary table initial_members as select * from core.identity_blocks_working;
create temporary table initial_payloads as select * from core.identity_block_texts_working;
select is(api.initialize_current_owner_blocks_from_text(pg_temp.text_intent()),'{"status":"already_initialized"}'::jsonb,'Replay is conflict, not success');
select ok(not exists((select * from core.identity_block_collections_working except select * from initial_collection) union all(select * from initial_collection except select * from core.identity_block_collections_working)),'Existing conflict retains every identity_block_collections_working column');
select ok(not exists((select * from core.identity_blocks_working except select * from initial_members) union all(select * from initial_members except select * from core.identity_blocks_working)),'Existing conflict retains every identity_blocks_working column');
select ok(not exists((select * from core.identity_block_texts_working except select * from initial_payloads) union all(select * from initial_payloads except select * from core.identity_block_texts_working)),'Existing conflict retains every identity_block_texts_working column');
delete from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='a5000000-0000-4000-8000-000000000001');
select is(api.initialize_current_owner_blocks_from_text(pg_temp.text_intent()),'{"status":"already_initialized"}'::jsonb,'Initialized-empty collection not replaced');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='a5000000-0000-4000-8000-000000000001')),1::bigint,'Empty conflict no revision bump');
set local request.jwt.claims='{"sub":"a5000000-0000-4000-8000-000000000003"}';
insert into replies values(api.initialize_current_owner_blocks_from_text(pg_temp.text_intent(null,true)));
select ok((select text_content is null and kind='text' from core.identity_block_texts_working where owner_id=(select owner_id from actors where auth_user_id='a5000000-0000-4000-8000-000000000003')),'No source needed; present nullable Text');
select ok((select is_visible and position=1 from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='a5000000-0000-4000-8000-000000000003')),'Explicit visible retained');
select is((select count(distinct value->>'block_id') from replies),2::bigint,'Distinct server IDs across Owners');
set local request.jwt.claims='{"sub":"a5000000-0000-4000-8000-000000000002"}';
create function pg_temp.check_raw_initialization() returns setof text language plpgsql as $$declare raw text; reply jsonb; begin
 foreach raw in array array['',E'  \r\n\t  ','é🐈',repeat('🙂',16384)] loop
  reply := api.initialize_current_owner_blocks_from_text(pg_temp.text_intent(raw));
  return next is(reply->>'status','success','Raw first Text accepted');
  return next is((select text_content from core.identity_block_texts_working where block_id=(reply->>'block_id')::uuid),raw,'Exact raw code points retained');
  delete from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='a5000000-0000-4000-8000-000000000002');
 end loop;
end;$$;
select * from pg_temp.check_raw_initialization();
select ok(not exists(select * from foreign_collections except select * from core.identity_block_collections_working),'All preexisting collections retained');
select ok(not exists(select * from foreign_members except select * from core.identity_blocks_working),'All preexisting memberships retained');
select ok(not exists(select * from foreign_texts except select * from core.identity_block_texts_working),'All preexisting Text payloads retained');
create function pg_temp.check_purity() returns setof text language plpgsql as $$declare item record; val jsonb; begin
 for item in select * from purity loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',item.table_name) into val;
  return next is(val,item.value,item.table_name || ' unchanged');
 end loop;
end;$$;
select * from pg_temp.check_purity();
select * from finish();
rollback;

begin;
select no_plan();
select ok((select prosecdef and provolatile='v' from pg_proc where oid='api.add_current_owner_text_block_working(jsonb)'::regprocedure),'Hardened volatile CAS definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.add_current_owner_text_block_working(jsonb)'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.add_current_owner_text_block_working(jsonb)','EXECUTE'),'anon execution withheld');
select ok(not has_function_privilege('authenticated','api.add_current_owner_text_block_working(jsonb)','EXECUTE'),'authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.add_current_owner_text_block_working(jsonb)','EXECUTE'),'service execution withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='add_current_owner_text_block_working' and grantee='PUBLIC'),'PUBLIC execution withheld');
set local role authenticated;
select throws_ok($$select api.add_current_owner_text_block_working('{}')$$,'42501',null,'Actual authenticated execution denied');
reset role;
set local role anon;
select throws_ok($$select api.add_current_owner_text_block_working('{}')$$,'42501',null,'Actual anon execution denied');
reset role;
set local role service_role;
select throws_ok($$select api.add_current_owner_text_block_working('{}')$$,'42501',null,'Actual service execution denied');
reset role;
set local request.jwt.claims='{}';
select is(api.add_current_owner_text_block_working('{}'),'{"status":"unauthenticated"}'::jsonb,'No actor denies');
set local request.jwt.claims='{"sub":"9e000000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"forged"}}';
select is(api.add_current_owner_text_block_working('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata cannot invent Owner');
insert into auth.users(id,email) values
 ('9e000000-0000-4000-8000-000000000001','add-one@example.test'),
 ('9e000000-0000-4000-8000-000000000002','add-two@example.test'),
 ('9e000000-0000-4000-8000-000000000003','add-empty@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('9e000000-0000-4000-8000-000000000001','9e000000-0000-4000-8000-000000000002','9e000000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'text-add-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"9e000000-0000-4000-8000-000000000001"}';
select is(api.add_current_owner_text_block_working('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner denies');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id<>'9e000000-0000-4000-8000-000000000003';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select '9e000000-0000-4000-8000-000000000011',owner_id,'generic_link',1,false from actors where auth_user_id='9e000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '9e000000-0000-4000-8000-000000000012',owner_id,'social',2 from actors where auth_user_id='9e000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '9e000000-0000-4000-8000-000000000013',owner_id,'text',3 from actors where auth_user_id='9e000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '9e000000-0000-4000-8000-000000000014',owner_id,'generic_link',1 from actors where auth_user_id='9e000000-0000-4000-8000-000000000002';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url,created_at)
 select block_id,owner_id,kind,'original',null,'https://original.example.test','2000-01-01'::timestamptz
 from core.identity_blocks_working where block_id in ('9e000000-0000-4000-8000-000000000011','9e000000-0000-4000-8000-000000000014');
insert into core.identity_connection_working(owner_id,connection_kind,destination_url,revision)
 select owner_id,'generic_link','https://source.example.test',3 from actors where auth_user_id='9e000000-0000-4000-8000-000000000001';
insert into core.identity_block_initialization_provenance(owner_id,initial_block_id,source_connection_revision,source_connection_kind,source_destination_url,initial_title)
 select owner_id,'9e000000-0000-4000-8000-000000000011',3,'generic_link','https://source.example.test','original' from actors where auth_user_id='9e000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '9e000000-0000-4000-8000-000000000015',owner_id,'contact',4 from actors where auth_user_id='9e000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '9e000000-0000-4000-8000-000000000016',owner_id,'media',5 from actors where auth_user_id='9e000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '9e000000-0000-4000-8000-000000000017',owner_id,'spill_cta',6 from actors where auth_user_id='9e000000-0000-4000-8000-000000000001';
update core.identity_blocks_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_block_collections_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_blocks_working set position=case right(block_id::text,2)
 when '11' then 1 when '12' then 7 when '13' then 42 when '15' then 100 when '16' then 500 when '17' then 1000 else position end
 where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000001');
update core.identity_blocks_working set position=7 where block_id='9e000000-0000-4000-8000-000000000014';
-- Text allocation CAS race fixtures end here.
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,'Existing own Text' from core.identity_blocks_working where block_id='9e000000-0000-4000-8000-000000000013';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select '9e000000-0000-4000-8000-000000000018',owner_id,'text',11,false from actors where auth_user_id='9e000000-0000-4000-8000-000000000002';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,'Foreign Text' from core.identity_blocks_working where block_id='9e000000-0000-4000-8000-000000000018';
create function pg_temp.text_intent(base numeric default 1, content text default ' <script>raw</script> ' || chr(1), visible boolean default false)
returns jsonb language sql as $$select jsonb_build_object('action','add_text_block','base_collection_revision',base,'is_visible',visible,'text_working',jsonb_build_object('kind','text','text',content))$$;
create temporary table original_members as select * from core.identity_blocks_working;
create temporary table original_links as select * from core.identity_block_links_working;
create temporary table original_texts as select * from core.identity_block_texts_working;
create temporary table original_collections as select * from core.identity_block_collections_working;
create temporary table purity(table_name text,value jsonb);
do $$declare name text; val jsonb; begin
 foreach name in array array['identity_connection_working','identity_block_initialization_provenance','identity_working','identity_layout_working','identity_publications','onboarding_preview_receipts','owner_auth_bindings','owner_handle_namespaces','owner_onboarding_progress'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',name) into val;
  insert into purity values(name,val);
 end loop;
end; $$;
select is(api.add_current_owner_text_block_working('null'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('[]'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('"add_text_block"'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":null,"base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":true,"base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_link_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"initialize_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block ","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":null,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":0,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":-1,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1.5,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":"1","is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":9007199254740992,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":null,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":0,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":"false","text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":null}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":[]}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":"text"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","is_visible":false,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"text_working":{"kind":"text","text":"private"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"},"owner_id":"forged"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"},"block_id":"forged"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"},"position":"forged"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"},"source_revision":"forged"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"},"provenance":"forged"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"},"collection_revision":"forged"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"},"operation_id":"forged"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"},"safe":"forged"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"},"published":"forged"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"},"issues":"forged"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private"},"html":"forged"}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private","owner_id":"forged"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private","block_id":"forged"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private","html":"forged"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private","format":"forged"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private","safe":"forged"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private","published":"forged"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private","destination_url":"forged"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":"private","issues":"forged"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text"}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"text":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"generic_link","text":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":null,"text":null}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":42}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":false}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working('{"action":"add_text_block","base_collection_revision":1,"is_visible":false,"text_working":{"kind":"text","text":[]}}'::jsonb),'{"status":"invalid_add_intent"}'::jsonb,'Strict explicit Text envelope');
select is(api.add_current_owner_text_block_working(pg_temp.text_intent(1,repeat('🙂',16385))),'{"status":"invalid_add_intent"}'::jsonb,'Over code-point envelope denied');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000001');
select is(api.add_current_owner_text_block_working(pg_temp.text_intent()),'{"status":"owner_not_eligible"}'::jsonb,'Restricted Owner denied');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000001');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000001');
select is(api.add_current_owner_text_block_working(pg_temp.text_intent()),'{"status":"unavailable"}'::jsonb,'Missing canonical context denied');
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000001');
select ok(not exists((select * from core.identity_blocks_working except select * from original_members) union all(select * from original_members except select * from core.identity_blocks_working)),'Denials preserve membership');
select ok(not exists((select * from core.identity_block_collections_working except select * from original_collections) union all(select * from original_collections except select * from core.identity_block_collections_working)),'Denials preserve collection');
-- Fail specifically between membership insertion and revision update.
create function pg_temp.reject_text_payload() returns trigger language plpgsql as $$begin raise exception 'fixture blocked Text payload'; end;$$;
create trigger reject_text_fixture before insert on core.identity_block_texts_working for each row execute function pg_temp.reject_text_payload();
select throws_ok('select api.add_current_owner_text_block_working(pg_temp.text_intent())','P0001','fixture blocked Text payload','Partial failure propagates');
drop trigger reject_text_fixture on core.identity_block_texts_working;
select ok(not exists((select * from core.identity_blocks_working except select * from original_members) union all(select * from original_members except select * from core.identity_blocks_working)),'Payload failure rolls back allocated membership');
select ok(not exists((select * from core.identity_block_collections_working except select * from original_collections) union all(select * from original_collections except select * from core.identity_block_collections_working)),'Payload failure no revision bump');
select ok(not exists((select * from core.identity_block_texts_working except select * from original_texts) union all(select * from original_texts except select * from core.identity_block_texts_working)),'Payload failure no partial row');
create temporary table replies(value jsonb);
insert into replies values(api.add_current_owner_text_block_working(pg_temp.text_intent()));
select is((select array_agg(k order by k) from replies,jsonb_object_keys(value) k),array['block_id','collection_revision','status'],'Minimal exact acknowledgment');
select is((select value->>'status' from replies),'success','Explicit Text allocation succeeds');
select matches((select value->>'block_id' from replies),'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$','Server UUID');
select is((select value->>'collection_revision' from replies),'2','Exactly one revision bump');
select ok((select b.kind='text' and not b.is_visible and b.position=1001 and b.owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000001') from core.identity_blocks_working b where b.block_id=(select (value->>'block_id')::uuid from replies)),'Appends after own hidden/all-kind maximum with actual binding');
select is((select t.text_content from core.identity_block_texts_working t where t.block_id=(select (value->>'block_id')::uuid from replies)),pg_temp.text_intent()->'text_working'->>'text','Exact invalid raw content retained');
select is((select api.resolve_current_owner_text_block_working((value->>'block_id')::uuid)->'block'->'text_working' from replies),(pg_temp.text_intent()->'text_working')-'kind','Selected read sees exact committed raw payload');
select is((select created_at from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000001')),'2000-01-01'::timestamptz,'Collection created_at retained');
select ok(not exists(select * from original_members except select * from core.identity_blocks_working),'All previous member columns retained');
select ok(not exists((select * from core.identity_block_links_working except select * from original_links) union all(select * from original_links except select * from core.identity_block_links_working)),'All Link payloads unchanged');
select ok(not exists(select * from original_texts except select * from core.identity_block_texts_working),'Existing own and foreign Text payload columns retained');
select ok(not exists(select * from original_collections where owner_id<>(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000001') except select * from core.identity_block_collections_working),'Other Owner collection columns retained');
select is(api.add_current_owner_text_block_working(pg_temp.text_intent()),'{"status":"stale_write"}'::jsonb,'Old base replay cannot duplicate');
insert into replies values(api.add_current_owner_text_block_working(pg_temp.text_intent(2)));
select is((select count(distinct value->>'block_id') from replies),2::bigint,'Deliberate fresh intent gets distinct ID for same content');
-- Null/blank/CRLF/Unicode remain persistable even when hidden or incomplete.
insert into replies values(api.add_current_owner_text_block_working(pg_temp.text_intent(3,null,true)));
select is((select text_content from core.identity_block_texts_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='4')),null::text,'Null is present raw payload');
select ok((select is_visible from core.identity_blocks_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='4')),'Explicit visible retained');
insert into replies values(api.add_current_owner_text_block_working(pg_temp.text_intent(4,E'  \r\n\t  ')));
select is((select text_content from core.identity_block_texts_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='5')),E'  \r\n\t  ','Blank raw CRLF retained');
insert into replies values(api.add_current_owner_text_block_working(pg_temp.text_intent(5,repeat('🙂',16384))));
select is((select char_length(text_content) from core.identity_block_texts_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='6')),16384,'Code points not UTF16 units');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000001')),6::bigint,'Each committed add bumps once');
update core.identity_blocks_working set position=2147483647 where block_id='9e000000-0000-4000-8000-000000000017';
select is(api.add_current_owner_text_block_working(pg_temp.text_intent(6)),'{"status":"position_exhausted"}'::jsonb,'No int32 overflow or gap reuse');
update core.identity_block_collections_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000001');
select is(api.add_current_owner_text_block_working(pg_temp.text_intent(6)),'{"status":"stale_write"}'::jsonb,'Stale before exhausted revision');
select is(api.add_current_owner_text_block_working(pg_temp.text_intent(9007199254740991)),'{"status":"revision_exhausted"}'::jsonb,'No unsafe next revision');
select is((select count(*) from core.identity_block_texts_working),(select count(*)+5 from original_texts),'All denials no extra Text payload');
set local request.jwt.claims='{"sub":"9e000000-0000-4000-8000-000000000002"}';
delete from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000002');
insert into replies values(api.add_current_owner_text_block_working(pg_temp.text_intent(1,'')));
select is((select position from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000002')),1,'Initialized-empty appends at1 independently of foreign max');
select is((select text_content from core.identity_block_texts_working where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000002')),'','Empty content retained');
insert into core.identity_blocks_working(owner_id,kind,position,is_visible) select (select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000002'),'contact',g,false from generate_series(2,999) g;
insert into replies values(api.add_current_owner_text_block_working(pg_temp.text_intent(2,'capacity')));
select is((select count(*) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000002')),1000::bigint,'999 to1000 succeeds');
select is(api.add_current_owner_text_block_working(pg_temp.text_intent(2)),'{"status":"stale_write"}'::jsonb,'Old base stale before capacity');
select is(api.add_current_owner_text_block_working(pg_temp.text_intent(3)),'{"status":"unavailable"}'::jsonb,'Fresh base at capacity denied');
insert into core.identity_blocks_working(owner_id,kind,position,is_visible) select (select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000002'),'media',1001,false;
select is(api.add_current_owner_text_block_working(pg_temp.text_intent(3)),'{"status":"unavailable"}'::jsonb,'Over-bound unavailable without truncation');
select is((select count(*) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000002')),1001::bigint,'Existing over-bound content retained');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000002')),3::bigint,'Capacity denial no bump');
set local request.jwt.claims='{"sub":"9e000000-0000-4000-8000-000000000003"}';
select is(api.add_current_owner_text_block_working(pg_temp.text_intent()),'{"status":"unavailable"}'::jsonb,'Missing collection never inferred empty');
select is((select count(*) from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='9e000000-0000-4000-8000-000000000003')),0::bigint,'No implicit initialization');
create function pg_temp.check_purity() returns setof text language plpgsql as $$declare item record; val jsonb; begin
 for item in select * from purity loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',item.table_name) into val;
  return next is(val,item.value,item.table_name || ' unchanged');
 end loop;
end;$$;
select * from pg_temp.check_purity();
select * from finish();
rollback;

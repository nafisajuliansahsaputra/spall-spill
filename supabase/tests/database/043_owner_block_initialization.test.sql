begin;
select no_plan();
select has_table('core','identity_block_initialization_provenance','Private initialization provenance exists');
select is((select count(*)::integer from core.identity_block_initialization_provenance),0,'No automatic initialization/backfill');
select ok((select relrowsecurity from pg_class where oid='core.identity_block_initialization_provenance'::regclass),'Provenance RLS enabled');
select is((select count(*)::integer from pg_policies where schemaname='core' and tablename='identity_block_initialization_provenance'),0,'No client policies');
select ok((select prosecdef and provolatile='v' from pg_proc where oid='api.initialize_current_owner_blocks_from_connection(jsonb)'::regprocedure),'Volatile hardened definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.initialize_current_owner_blocks_from_connection(jsonb)'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.initialize_current_owner_blocks_from_connection(jsonb)','EXECUTE'),'anon execution withheld');
select ok(not has_function_privilege('authenticated','api.initialize_current_owner_blocks_from_connection(jsonb)','EXECUTE'),'authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.initialize_current_owner_blocks_from_connection(jsonb)','EXECUTE'),'service execution withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='initialize_current_owner_blocks_from_connection' and grantee='PUBLIC'),'PUBLIC execution withheld');
select ok(not has_table_privilege('anon','core.identity_block_initialization_provenance','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'anon provenance withheld');
select ok(not has_table_privilege('authenticated','core.identity_block_initialization_provenance','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'authenticated provenance withheld');
select ok(not has_table_privilege('service_role','core.identity_block_initialization_provenance','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'service provenance withheld');
select ok(not exists(select 1 from information_schema.table_privileges where table_schema='core' and table_name='identity_block_initialization_provenance' and grantee='PUBLIC'),'PUBLIC provenance withheld');
set local role authenticated;
select throws_ok($$select api.initialize_current_owner_blocks_from_connection('{}')$$,'42501',null,'Actual authenticated execution denied');
reset role;
set local role anon;
select throws_ok($$select api.initialize_current_owner_blocks_from_connection('{}')$$,'42501',null,'Actual anon execution denied');
reset role;
set local role service_role;
select throws_ok($$select api.initialize_current_owner_blocks_from_connection('{}')$$,'42501',null,'Actual service execution denied');
reset role;
set local request.jwt.claims='{}';
select is(api.initialize_current_owner_blocks_from_connection('{}'),'{"status":"unauthenticated"}'::jsonb,'Missing actor denies without writes');
set local request.jwt.claims='{"sub":"89000000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"89000000-0000-4000-8000-000000000001"}}';
select is(api.initialize_current_owner_blocks_from_connection('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata cannot supply Owner authority');
insert into auth.users(id,email) values
 ('89000000-0000-4000-8000-000000000001','initialize-one@example.test'),
 ('89000000-0000-4000-8000-000000000002','initialize-two@example.test'),
 ('89000000-0000-4000-8000-000000000003','initialize-missing@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('89000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='business' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'init-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"89000000-0000-4000-8000-000000000001"}';
select is(api.initialize_current_owner_blocks_from_connection('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner cannot initialize');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
insert into core.identity_connection_working(owner_id,connection_kind,social_platform,destination_url,revision)
 select owner_id,case when auth_user_id='89000000-0000-4000-8000-000000000001' then 'generic_link'::core.identity_connection_kind else 'social'::core.identity_connection_kind end,
 case when auth_user_id='89000000-0000-4000-8000-000000000001' then null else 'custom_platform-1' end,
 'HTTPS://Private.example.test/Exact?X=1#Recoverable',3 from actors where auth_user_id<>'89000000-0000-4000-8000-000000000003';
-- Initialization race fixtures end here.
create temporary table original_sources as select * from core.identity_connection_working where owner_id in (select owner_id from actors);
create temporary table old_counts as select (select count(*) from core.identity_working) profile,(select count(*) from core.identity_layout_working) layout,(select count(*) from core.identity_publications) published;
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":2,"title":null,"base_collection_revision":null}'),'{"status":"stale_source"}'::jsonb,'Stale source acknowledgment has no candidate/partial writes');
select is((select count(*)::integer from core.identity_block_collections_working where owner_id in (select owner_id from actors)),0,'Stale import creates no collection');
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":3,"title":null,"base_collection_revision":1}'),'{"status":"invalid_import_intent"}'::jsonb,'Expected absence required');
select is(api.initialize_current_owner_blocks_from_connection('{"action":"auto_import","source_revision":3,"title":null,"base_collection_revision":null}'),'{"status":"invalid_import_intent"}'::jsonb,'Explicit action required');
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":3,"base_collection_revision":null}'),'{"status":"invalid_import_intent"}'::jsonb,'Explicit nullable title required');
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":3,"title":5,"base_collection_revision":null}'),'{"status":"invalid_import_intent"}'::jsonb,'Wrong title type denied');
select is(api.initialize_current_owner_blocks_from_connection(jsonb_build_object('action','import_onboarding_connection','source_revision',3,'title',repeat('😀',513),'base_collection_revision',null)),'{"status":"invalid_import_intent"}'::jsonb,'Unicode code-point title budget');
select is(api.initialize_current_owner_blocks_from_connection('[]'),'{"status":"invalid_import_intent"}'::jsonb,'Nonobject denied');
select is(api.initialize_current_owner_blocks_from_connection('null'),'{"status":"invalid_import_intent"}'::jsonb,'JSON null denied');
select is(api.initialize_current_owner_blocks_from_connection(null),'{"status":"invalid_import_intent"}'::jsonb,'SQL null denied');
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":3.5,"title":null,"base_collection_revision":null}'),'{"status":"invalid_import_intent"}'::jsonb,'Fractional revision denied');
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":9007199254740992,"title":null,"base_collection_revision":null}'),'{"status":"invalid_import_intent"}'::jsonb,'Unsafe revision denied');
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":0,"title":null,"base_collection_revision":null}'),'{"status":"invalid_import_intent"}'::jsonb,'Zero revision denied');
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":"3","title":null,"base_collection_revision":null}'),'{"status":"invalid_import_intent"}'::jsonb,'String revision denied');
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":3,"title":null,"base_collection_revision":null,"owner_id":"forged"}'),'{"status":"invalid_import_intent"}'::jsonb,'Caller Owner selector denied');
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":3,"title":null,"base_collection_revision":null,"destination_url":"https://forged.test"}'),'{"status":"invalid_import_intent"}'::jsonb,'Caller source rewrite denied');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000001');
select is(api.initialize_current_owner_blocks_from_connection('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Restricted Owner denies');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000001');
select is(api.initialize_current_owner_blocks_from_connection('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Suspended Owner denies');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000001');
create temporary table reply as select api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":3,"title":null,"base_collection_revision":null}') value;
select is((select value->>'status' from reply),'success','Explicit own Generic import succeeds');
select is((select value->'collection_revision' from reply),'1'::jsonb,'Initial collection revision one');
select ok((select value->>'block_id' ~ '^[a-f0-9-]{36}$' from reply),'Server allocates stable internal identity');
select is((select count(*)::integer from reply,jsonb_object_keys(value)),3,'Minimal success, no Owner or private content');
select is((select count(*)::integer from core.identity_blocks_working where owner_id in (select owner_id from actors)),1,'Only own source imported, other Owner untouched');
select is((select jsonb_build_object('kind',kind,'position',position,'visible',is_visible) from core.identity_blocks_working where block_id=(select (value->>'block_id')::uuid from reply)),'{"kind":"generic_link","position":1,"visible":true}'::jsonb,'Explicit first visible ordered membership');
select is((select jsonb_build_object('title',title,'platform',social_platform,'url',destination_url) from core.identity_block_links_working where block_id=(select (value->>'block_id')::uuid from reply)),'{"title":null,"platform":null,"url":"HTTPS://Private.example.test/Exact?X=1#Recoverable"}'::jsonb,'Missing Generic label/raw source retained, not fabricated validity');
select is((select initial_block_id::text from core.identity_block_initialization_provenance where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000001')),(select value->>'block_id' from reply),'Provenance links original allocated block');
select is((select source_connection_revision::integer from core.identity_block_initialization_provenance where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000001')),3,'Source revision retained');
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":3,"title":"replacement","base_collection_revision":null}'),'{"status":"already_initialized"}'::jsonb,'Duplicate import rejects without overwrite');
select is((select revision::integer from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000001')),1,'Duplicate does not bump collection');
select is((select title from core.identity_block_links_working where block_id=(select (value->>'block_id')::uuid from reply)),null::text,'Duplicate does not replace incomplete title');
set local request.jwt.claims='{"sub":"89000000-0000-4000-8000-000000000002","user_metadata":{"owner_id":"forged"}}';
select is(api.initialize_current_owner_blocks_from_connection(jsonb_build_object('action','import_onboarding_connection','source_revision',3,'title',' raw'||chr(9),'base_collection_revision',null))->>'status','success','Own Social import preserves owner input');
select is((select source_social_platform from core.identity_block_initialization_provenance where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000002')),'custom_platform-1','Exact Social source platform provenance');
select is((select title from core.identity_block_links_working where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000002')),' raw'||chr(9),'Control-bearing title recoverable Working');
set local request.jwt.claims='{"sub":"89000000-0000-4000-8000-000000000003"}';
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":3,"title":null,"base_collection_revision":null}'),'{"status":"no_source"}'::jsonb,'Missing source is not fabricated empty collection');
select is((select count(*)::integer from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000003')),0,'Missing source creates nothing');
select is((select jsonb_agg(to_jsonb(c) order by c.owner_id) from core.identity_connection_working c where owner_id in (select owner_id from actors)),(select jsonb_agg(to_jsonb(c) order by c.owner_id) from original_sources c),'Original first slots/revisions/timestamps untouched');
select ok((select profile=(select count(*) from core.identity_working) and layout=(select count(*) from core.identity_layout_working) and published=(select count(*) from core.identity_publications) from old_counts),'Old profile/layout/Published counts unchanged');
delete from core.identity_blocks_working where block_id=(select (value->>'block_id')::uuid from reply);
select is((select count(*)::integer from core.identity_block_initialization_provenance where initial_block_id=(select (value->>'block_id')::uuid from reply)),1,'Historical provenance retained after explicit fixture block retirement');
select is((select count(*)::integer from core.identity_block_links_working where block_id=(select (value->>'block_id')::uuid from reply)),0,'Payload referential cleanup does not erase provenance');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000003');
select is(api.initialize_current_owner_blocks_from_connection('{}'),'{"status":"unavailable"}'::jsonb,'Missing canonical context denies');
update core.owner_onboarding_progress set primary_use_case='business' where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000003');
insert into core.identity_connection_working(owner_id,connection_kind,destination_url,revision)
 select owner_id,'generic_link','https://source.example.test',9007199254740992 from actors where auth_user_id='89000000-0000-4000-8000-000000000003';
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":3,"title":null,"base_collection_revision":null}'),'{"status":"unavailable"}'::jsonb,'Unsafe actual source revision denies');
update core.identity_connection_working set revision=3 where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000003');
create function pg_temp.abort_import() returns void language plpgsql as $$ begin
  if api.initialize_current_owner_blocks_from_connection(jsonb_build_object('action','import_onboarding_connection','source_revision',3,'title',repeat('😀',512),'base_collection_revision',null))->>'status' <> 'success' then raise exception 'fixture initialization failed'; end if;
  raise exception 'fixture rollback' using errcode='P0001';
end $$;
select throws_ok($$select pg_temp.abort_import()$$,'P0001','fixture rollback','Error after import rolls back subtransaction');
select ok(not exists(select 1 from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000003'))
 and not exists(select 1 from core.identity_block_initialization_provenance where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000003'))
 and not exists(select 1 from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000003'))
 and not exists(select 1 from core.identity_block_links_working where owner_id=(select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000003')),'Rollback leaves no partial collection/member/link/provenance');
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id='89000000-0000-4000-8000-000000000003';
select is(api.initialize_current_owner_blocks_from_connection('{"action":"import_onboarding_connection","source_revision":3,"title":null,"base_collection_revision":null}'),'{"status":"already_initialized"}'::jsonb,'Existing empty collection cannot be reinitialized');
select * from finish();
rollback;

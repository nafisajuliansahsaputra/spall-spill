begin;
select no_plan();
select ok(not has_function_privilege('anon','api.resolve_published_resource_context_server(text,bigint)','EXECUTE'),'Private Resource context anon execution withheld');
select ok(not has_function_privilege('authenticated','api.resolve_published_resource_context_server(text,bigint)','EXECUTE'),'Private Resource context authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.resolve_published_resource_context_server(text,bigint)','EXECUTE'),'Private Resource context service_role execution withheld');

select ok(not has_function_privilege('anon','api.resolve_published_resource_source_server(text,bigint,text,text)','EXECUTE'),'Resource source anon execution withheld');
select ok(not has_function_privilege('authenticated','api.resolve_published_resource_source_server(text,bigint,text,text)','EXECUTE'),'Resource source authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.resolve_published_resource_source_server(text,bigint,text,text)','EXECUTE'),'Resource source service_role execution withheld');

select ok(not has_function_privilege('anon','api.resolve_public_resource_context(text,bigint)','EXECUTE'),'New anonymous reader withheld');
select ok(not has_function_privilege('authenticated','api.resolve_public_resource_context(text,bigint)','EXECUTE'),'New authenticated reader withheld');
select ok(not has_function_privilege('service_role','api.resolve_public_resource_context(text,bigint)','EXECUTE'),'New service reader withheld');
select ok(not has_function_privilege('anon','api.resolve_public_resource(text,bigint)','EXECUTE'),'Existing safe-source reader remains withheld');
select ok(not has_function_privilege('authenticated','api.publish_current_onboarding(uuid,text,text)','EXECUTE'),'First Publish remains withheld');
select ok(not has_table_privilege('anon','core.spill_item_publications','SELECT'),'No raw public Item reads');
select ok(not has_table_privilege('authenticated','core.identity_publications','SELECT'),'No raw signed-in Identity reads');
insert into auth.users(id,email) values
 ('94000000-0000-4000-8000-000000000001','resource-context-one@example.test'),
 ('94000000-0000-4000-8000-000000000002','resource-context-two@example.test');
create temporary table resource_context_owners as select * from core.owner_auth_bindings
 where auth_user_id in ('94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}';
select is(api.claim_current_owner_handle('resource-context-one',1)->>'status','success','First Handle');
select is(api.set_current_owner_primary_use_case('business',2)->>'status','success','First guidance');
select is(api.save_current_owner_basic_identity('Private Owner',null,null,3)->>'status','success','First Working Identity');
select is(api.save_current_owner_starter_composition('business',null,4)->>'status','success','First layout');
select is(api.claim_current_owner_handle('resource-context-renamed',5)->>'status','success','Protected alias');
select is(api.save_current_owner_resource_draft('portfolio','https://portfolio.example.test/works?creator=original&campaign=A%2FB','Private Portfolio',null)->>'status','success','Private Resource reference');
select is(api.save_current_owner_product_draft('https://store.example.test/item','Private Product',null)->>'status','success','Different Item type reserves second reference');
set local request.jwt.claims='{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000002"}';
select is(api.claim_current_owner_handle('resource-context-two',1)->>'status','success','Other Owner Handle');
select is(api.set_current_owner_primary_use_case('personal',2)->>'status','success','Other guidance');
select is(api.save_current_owner_basic_identity('Other Private Owner',null,null,3)->>'status','success','Other Working Identity');
select is(api.save_current_owner_starter_composition('clean',null,4)->>'status','success','Other layout');
select is(api.save_current_owner_resource_draft('menu','https://menu.example.test/','Other Private Menu',null)->>'status','success','Other Owner has same reference');
reset role;
-- Privileged publication fixtures and all reader grants roll back together.

insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,published_at)
 select owner_id,'{"display_name":"Published Resource Owner","profile_asset_key":null}',1,1,now()
 from resource_context_owners where auth_user_id='94000000-0000-4000-8000-000000000001';
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,published_at)
 select item_id,owner_id,item_type,spill_reference,1,
 case when item_type='resource' then '{"resource_type":"portfolio","title":"Published Portfolio","source_url":"https://portfolio.example.test/works?creator=original&campaign=A%2FB"}'::jsonb
 else '{"title":"Published Product"}'::jsonb end,now()
 from core.spill_item_identity_registry where owner_id=(select owner_id from resource_context_owners where auth_user_id='94000000-0000-4000-8000-000000000001');
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Incomplete onboarding denies Published fixtures');
update core.owners set onboarding_completed_at=now() where id=(select owner_id from resource_context_owners where auth_user_id='94000000-0000-4000-8000-000000000001');
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at) values
 ('https://portfolio.example.test/works?creator=original&campaign=A%2FB',encode(extensions.digest('https://portfolio.example.test/works?creator=original&campaign=A%2FB','sha256'),'hex'),'safe','resource-intent-fixture',now(),now()+interval '1 hour');

-- Resource intent store fixtures.
create function pg_temp.resource_private_state()
returns jsonb language sql as $$
 select jsonb_build_array(
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.identity_working x),
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.resource_drafts x),
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.spill_item_identity_registry x),
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.spill_item_publications x),
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.identity_publications x),
 (select jsonb_agg(to_jsonb(x) order by x::text) from core.owners x));
$$;
create temporary table resource_intent_state_before as select pg_temp.resource_private_state() as state;

select ok((select relrowsecurity from pg_class where oid='core.resource_open_intents'::regclass),'Intent RLS enabled');
select ok(not has_table_privilege(r,'core.resource_open_intents','SELECT,INSERT,UPDATE,DELETE'),'No intent table grant: '||r)
 from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_function_privilege(r,f,'EXECUTE'),'No RPC/helper execution: '||r||' '||f)
 from unnest(array['anon','authenticated','service_role']) r cross join unnest(array[
 'core.resource_open_intent_record_valid(jsonb)','api.create_resource_open_intent_server(text,jsonb)',
 'api.consume_resource_open_intent_server(text)','api.cleanup_resource_open_intents_server(integer)']) f;
create function pg_temp.intent_record(shift_ms bigint default -10)
returns jsonb language sql as $$
 select jsonb_build_object('purpose','published-resource-open-v1','recognition_hash',repeat('a',64),
 'binding',api.resolve_published_resource_context_server('resource-context-renamed',1)->'binding',
 'issued_at',ms,'expires_at',ms+120000)
 from (select floor(extract(epoch from clock_timestamp())*1000)::bigint+shift_ms as ms) t;
$$;
create temporary table intent_expected as select pg_temp.intent_record() as record;
select is(api.create_resource_open_intent_server(repeat('a',64),(select record from intent_expected)),true,'Create exact safe binding');
select is(api.create_resource_open_intent_server(repeat('a',64),jsonb_set((select record from intent_expected),'{recognition_hash}',to_jsonb(repeat('b',64)))),false,'No collision overwrite');
select is((select record from core.resource_open_intents where token_hash=repeat('a',64)),(select record from intent_expected),'Original record retained');
select is(api.consume_resource_open_intent_server(repeat('a',64)),(select record from intent_expected),'Consume returns exact server-only record once');
select is(api.consume_resource_open_intent_server(repeat('a',64)),null::jsonb,'Replay denied');
select is(api.create_resource_open_intent_server(h,pg_temp.intent_record()),false,'Malformed token hash denied')
 from (values(null::text),('short'),(repeat('A',64)),(repeat('a',43))) t(h);
select is(api.consume_resource_open_intent_server(h),null::jsonb,'Malformed token consume denied')
 from (values(null::text),('short'),(repeat('A',64))) t(h);
select is(api.create_resource_open_intent_server(repeat('a',64),r),false,'Malformed/private record denied')
 from (values(null::jsonb),('[]'::jsonb),('{}'::jsonb),
 ((select record from intent_expected)||'{"raw_token":"private"}'::jsonb),
 (jsonb_set((select record from intent_expected),'{purpose}','"wrong-purpose"')),
 (jsonb_set((select record from intent_expected),'{issued_at}','"1000"')),
 (jsonb_set((select record from intent_expected),'{issued_at}','-1')),
 (jsonb_set((select record from intent_expected),'{issued_at}','1.5')),
 (jsonb_set((select record from intent_expected),'{expires_at}','9007199254740992')),
 (jsonb_set((select record from intent_expected),'{recognition_hash}','"short"')),
 (jsonb_set((select record from intent_expected),'{binding,handle}','"CREATOR"')),
 ((select record from intent_expected)||'{"owner_id":"private"}'::jsonb),
 ((select record from intent_expected)||'{"source_url":"https://private.example.test/"}'::jsonb),
 (jsonb_set((select record from intent_expected),'{binding,source_hash}','"bad"')),
 (jsonb_set((select record from intent_expected),'{binding,spill_reference}','0')),
 (jsonb_set((select record from intent_expected),'{binding,spill_reference}','9007199254740992')),
 ((select record from intent_expected)#-'{binding,publication_token}')) t(r);
select is(core.resource_open_intent_record_valid(r),false,'Strict record rejects extra/null/private/cross-product keys')
 from (values
 ((select record from intent_expected)||'{"source_url":"https://private.example.test/"}'::jsonb),
 ((select record from intent_expected)||'{"raw_token":"secret"}'::jsonb),
 (jsonb_set((select record from intent_expected),'{binding}', 'null')),
 (jsonb_set((select record from intent_expected),'{binding,provider_key}', '"shopee"')),
 (jsonb_set((select record from intent_expected),'{binding,source_url}', '"https://private.example.test/"')),
 (jsonb_set((select record from intent_expected),'{binding,publication_token}', 'null')),
 (jsonb_set((select record from intent_expected),'{binding,source_hash}', to_jsonb(repeat('A',64)))),
 (jsonb_set((select record from intent_expected),'{recognition_hash}', to_jsonb(repeat('A',64)))),
 (jsonb_set((select record from intent_expected),'{issued_at}', '9007199254740992')),
 (jsonb_set((select record from intent_expected),'{binding,spill_reference}', '1.5')),
 (jsonb_set((select record from intent_expected),'{binding,spill_reference}', '"1"')),
 (jsonb_set((select record from intent_expected),'{binding,handle}', '" creator"')),
 (jsonb_set((select record from intent_expected),'{expires_at}', to_jsonb((select (record->>'issued_at')::bigint+120001 from intent_expected)))) t(r);
select is((select count(*) from pg_policy where polrelid='core.resource_open_intents'::regclass),0::bigint,'No intent access policy');
select is(api.create_resource_open_intent_server(repeat('b',64),pg_temp.intent_record(-130000)),false,'Expired record cannot issue');
select is(api.create_resource_open_intent_server(repeat('b',64),pg_temp.intent_record(3600000)),false,'Future-issued record denied');
select is(api.create_resource_open_intent_server(repeat('b',64),jsonb_set(pg_temp.intent_record(),'{binding,publication_token}',to_jsonb(repeat('0',64)))),false,'Stale publication binding denied');
select is(api.create_resource_open_intent_server(repeat('f',64),jsonb_set(pg_temp.intent_record(),'{binding,handle}','"resource-context-two"')),false,'Other Owner cannot borrow exact binding');
select is(api.create_resource_open_intent_server(repeat('f',64),jsonb_set(pg_temp.intent_record(),'{binding,spill_reference}','2')),false,'Product reference cannot borrow Resource binding');
select is(api.create_resource_open_intent_server(repeat('f',64),jsonb_set(pg_temp.intent_record(),'{binding,source_hash}',to_jsonb(repeat('0',64)))),false,'Stale original source hash denied');
update core.external_destination_safety set safety_status='blocked',reason_codes=array['malware'],revision=revision+1;
select is(api.create_resource_open_intent_server(repeat('b',64),(select record from intent_expected)),false,'Fresh binding cannot issue on unsafe source');
update core.external_destination_safety set safety_status='safe',reason_codes=array[]::text[],revision=revision+1;
insert into core.resource_open_intents(token_hash,record) values(repeat('b',64),pg_temp.intent_record(-130000));
select is(api.create_resource_open_intent_server(repeat('b',64),pg_temp.intent_record()),false,'Expired collision not overwritten');
select is(api.consume_resource_open_intent_server(repeat('b',64)),null::jsonb,'Expired intent burns without record');
select is((select count(*) from core.resource_open_intents),0::bigint,'Expired consume removed authority');
insert into core.resource_open_intents(token_hash,record) values(repeat('b',64),pg_temp.intent_record(3600000));
select is(api.consume_resource_open_intent_server(repeat('b',64)),null::jsonb,'Future record burns');
insert into core.resource_open_intents(token_hash,record) values
 (repeat('b',64),pg_temp.intent_record(-130000)),(repeat('c',64),pg_temp.intent_record(-140000)),
 (repeat('d',64),pg_temp.intent_record(-150000)),(repeat('e',64),pg_temp.intent_record());
select is(api.cleanup_resource_open_intents_server(l),0,'Invalid cleanup limit denied') from (values(null::integer),(0),(-1),(501)) t(l);
select is(api.cleanup_resource_open_intents_server(1),1,'Bounded cleanup one expired record');
select is((select count(*) from core.resource_open_intents),3::bigint,'Bound respected');
select is(api.cleanup_resource_open_intents_server(500),2,'Remaining expired records removed');
select is((select count(*) from core.resource_open_intents where token_hash=repeat('e',64)),1::bigint,'Current intent survives cleanup');
select is((select count(*) from core.spill_item_publications),2::bigint,'Store mutates no publication');
select is((select count(*) from core.spill_item_identity_registry),3::bigint,'Store allocates no reference');
select is((select count(*) from core.first_onboarding_publications),0::bigint,'Store completes no Publish');
select is(pg_temp.resource_private_state(),(select state from resource_intent_state_before),'Intent store leaves Working/Draft/Published/Owner/reference state unchanged');
select has_index('core','resource_open_intents','resource_open_intents_expiry_idx','Expiry cleanup index exists');
select * from finish();
rollback;

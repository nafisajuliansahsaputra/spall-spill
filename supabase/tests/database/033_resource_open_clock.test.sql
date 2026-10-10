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

create function pg_temp.intent_record(shift_ms bigint default -10)
returns jsonb language sql as $$
 select jsonb_build_object('purpose','published-resource-open-v1','recognition_hash',repeat('a',64),
 'binding',api.resolve_published_resource_context_server('resource-context-renamed',1)->'binding',
 'issued_at',ms,'expires_at',ms+120000)
 from (select floor(extract(epoch from clock_timestamp())*1000)::bigint+shift_ms as ms) t;
$$;
select ok(not has_function_privilege(r,f,'EXECUTE'),'Clock/deadline execution withheld: '||r||' '||f)
 from unnest(array['anon','authenticated','service_role']) r cross join unnest(array[
 'api.read_resource_open_clock_server()','api.resolve_resource_open_intent_source_server(jsonb)']) f;
create temporary table clock_range as select floor(extract(epoch from clock_timestamp())*1000)::bigint as before_ms;
select ok(api.read_resource_open_clock_server()>=(select before_ms from clock_range),'Clock reads database wall epoch after baseline');
select ok(api.read_resource_open_clock_server()<=floor(extract(epoch from clock_timestamp())*1000)::bigint+1000,'Clock sample is bounded by current database wall time');
select is(api.resolve_resource_open_intent_source_server(pg_temp.intent_record())->>'source_url','https://portfolio.example.test/works?creator=original&campaign=A%2FB','Fresh deadline resolution preserves attribution');
select is(api.resolve_resource_open_intent_source_server(pg_temp.intent_record(-120001)),'{"status":"unavailable"}'::jsonb,'Expired record denied');
select is(api.resolve_resource_open_intent_source_server(pg_temp.intent_record(60000)),'{"status":"unavailable"}'::jsonb,'Future record denied without grace');
select is(api.resolve_resource_open_intent_source_server(v),'{"status":"unavailable"}'::jsonb,'Strict malformed record denied')
 from (values (null::jsonb),('[]'::jsonb),('{}'::jsonb),
 (pg_temp.intent_record()||'{"purpose":"other"}'::jsonb),
 (pg_temp.intent_record()||'{"private":"unexpected"}'::jsonb),
 (jsonb_set(pg_temp.intent_record(),'{expires_at}','0')),
 (jsonb_set(pg_temp.intent_record(),'{binding,publication_token}',to_jsonb(repeat('a',64))))) records(v);
select is(api.resolve_resource_open_intent_source_server(jsonb_set(pg_temp.intent_record(),'{binding,source_hash}',to_jsonb(repeat('0',64)))),'{"status":"unavailable"}'::jsonb,'Wrong exact source hash denied');
create temporary table deadline_record as select pg_temp.intent_record() as value;
create temporary table clock_publications as select item_id,snapshot,working_revision from core.spill_item_publications;
update core.external_destination_safety set checked_at=now()-interval '1 hour',expires_at=now()-interval '1 second',revision=revision+1;
select is(api.resolve_resource_open_intent_source_server((select value from deadline_record)),'{"status":"unavailable"}'::jsonb,'Expired destination safety denied even with valid intent lifetime');
update core.external_destination_safety set checked_at=now(),expires_at=now()+interval '1 hour',revision=revision+1;
select is(api.resolve_resource_open_intent_source_server((select value from deadline_record))->>'status','success','Safety recovery permits current exact deadline-bound record');
update core.external_destination_safety set safety_status='blocked',reason_codes=array['malware'],revision=revision+1;
select is(api.resolve_resource_open_intent_source_server((select value from deadline_record)),'{"status":"unavailable"}'::jsonb,'Known unsafe source denied');
update core.external_destination_safety set safety_status='safe',reason_codes=array[]::text[],revision=revision+1;
select ok(not exists(select 1 from core.spill_item_publications p join clock_publications b using(item_id) where p.snapshot<>b.snapshot or p.working_revision<>b.working_revision),'Clock and deadline reads mutate no publication');
select is((select count(*) from core.resource_open_intents),0::bigint,'Deadline resolver does not create or consume authority');
update core.spill_item_publications set snapshot=jsonb_set(snapshot,'{title}','"Changed Published title"') where item_type='resource';
select is(api.resolve_resource_open_intent_source_server((select value from deadline_record)),'{"status":"unavailable"}'::jsonb,'Old record cannot inherit changed Published confirmation');
update core.spill_item_publications p set snapshot=b.snapshot from clock_publications b where p.item_id=b.item_id;
-- Controlled resolver latency inside this rolled-back test only proves the final
-- database expiry check. The real resolver and its grants are restored by rollback.
create temporary table deadline_probe(called boolean);
create or replace function api.resolve_published_resource_source_server(
 input_handle text,input_spill_reference bigint,input_publication_token text,input_source_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 insert into pg_temp.deadline_probe values(true);
 perform pg_sleep(2);
 return jsonb_build_object('status','success','source_url','https://portfolio.example.test/works?creator=original&campaign=A%2FB');
end;
$$;
select is(api.resolve_resource_open_intent_source_server(pg_temp.intent_record(-118500)),
 '{"status":"unavailable"}'::jsonb,'Record expiring during resolver cannot succeed after resolution');
select is((select count(*) from deadline_probe),1::bigint,'Delayed resolver was reached before final expiry denial');
select is(pg_temp.resource_private_state(),(select state from resource_intent_state_before),'Restore fixture changes before final private state assertion');
select * from finish();
rollback;

begin;
select no_plan();
select ok(not has_function_privilege('anon','api.resolve_public_product(text,bigint)','EXECUTE'),'Anonymous Product reader remains withheld');
select ok(not has_function_privilege('authenticated','api.resolve_public_product(text,bigint)','EXECUTE'),'Signed-in Product reader remains withheld');
select ok(not has_function_privilege('service_role','api.resolve_public_product(text,bigint)','EXECUTE'),'No service Product detail reader enabling');
select ok(not has_table_privilege('anon','core.spill_item_publications','SELECT'),'No public table grant');
select ok(not has_function_privilege('authenticated','api.publish_current_onboarding(uuid,text,text)','EXECUTE'),'Publish remains withheld');
insert into auth.users(id,email) values
 ('84000000-0000-4000-8000-000000000001','product-media-one@example.test'),
 ('84000000-0000-4000-8000-000000000002','product-media-two@example.test');
create temporary table product_media_owners as select * from core.owner_auth_bindings
 where auth_user_id in ('84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated","sub":"84000000-0000-4000-8000-000000000001"}';
select is(api.claim_current_owner_handle('product-media-one',1)->>'status','success','First Handle');
select is(api.set_current_owner_primary_use_case('affiliate',2)->>'status','success','First guidance');
select is(api.save_current_owner_basic_identity('Product Media Owner',null,null,3)->>'status','success','First Identity');
select is(api.save_current_owner_starter_composition('featured',null,4)->>'status','success','First layout');
select is(api.claim_current_owner_handle('product-media-renamed',5)->>'status','success','Protected alias');
select is(api.save_current_owner_product_draft('https://shopee.co.id/item','Private Product',null)->>'status','success','First private Product');
select is(api.save_current_owner_resource_draft('website','https://resource.example.test','Private Resource',null)->>'status','success','Resource reserves another type/reference');
set local request.jwt.claims='{"role":"authenticated","sub":"84000000-0000-4000-8000-000000000002"}';
select is(api.claim_current_owner_handle('product-media-two',1)->>'status','success','Other Handle');
select is(api.set_current_owner_primary_use_case('creator',2)->>'status','success','Other guidance');
select is(api.save_current_owner_basic_identity('Other Owner',null,null,3)->>'status','success','Other Identity');
select is(api.save_current_owner_starter_composition('clean',null,4)->>'status','success','Other layout');
select is(api.save_current_owner_product_draft('https://shopee.co.id/other','Other Product',null)->>'status','success','Other Product');
reset role;

-- Privileged, rolled-back fixtures test staged transport without activating Publish.
create temporary table product_media_assets(asset_key uuid,auth_id uuid,status core.profile_media_upload_status);
insert into product_media_assets values
 ('84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','consumed'),
 ('84000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000002','consumed'),
 ('84000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000001','consumed'),
 ('84000000-0000-4000-8000-000000000004','84000000-0000-4000-8000-000000000001','pending');
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select f.asset_key,o.owner_id,'image/png',100,'staging/profile/'||f.asset_key||'/'||f.asset_key,f.status,
 now()+interval '1 hour',case when f.status='consumed' then now() else null end
 from product_media_assets f join product_media_owners o on o.auth_user_id=f.auth_id;
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select f.asset_key::text,o.owner_id,'working/profile/'||f.asset_key||'.webp','image/webp',12,100,100,f.asset_key
 from product_media_assets f join product_media_owners o on o.auth_user_id=f.auth_id;
insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,published_at)
 select owner_id,'{"display_name":"Published Product Owner","profile_asset_key":null}',1,1,now()
 from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001';
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,published_at)
 select item_id,owner_id,item_type,spill_reference,1,
 case when item_type='product' then '{"title":"Published Product","preparation_revision":1,"primary_asset_key":"84000000-0000-4000-8000-000000000001","destinations":[{"provider_key":"shopee","destination_url":"https://shopee.co.id/item?affiliate=creator"}]}'::jsonb
 else '{"resource_type":"website","title":"Resource","source_url":"https://resource.example.test"}'::jsonb end,now()
 from core.spill_item_identity_registry where owner_id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');

update core.owners set onboarding_completed_at=now() where id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
update core.spill_item_publications set snapshot=jsonb_set(snapshot,'{destinations}',
 '[{"provider_key":"shopee","destination_url":"https://shopee.co.id/item?affiliate=creator"},{"provider_key":"external:store.example.test","destination_url":"https://store.example.test/item?creator=original"}]') where item_type='product';

insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at) values
 ('https://shopee.co.id/item?affiliate=creator',encode(extensions.digest('https://shopee.co.id/item?affiliate=creator','sha256'),'hex'),'safe','click-fixture',now(),now()+interval '1 hour'),
 ('https://store.example.test/item?creator=original',encode(extensions.digest('https://store.example.test/item?creator=original','sha256'),'hex'),'safe','click-fixture',now(),now()+interval '1 hour');

-- Intent store fixtures.
select ok((select relrowsecurity from pg_class where oid='core.product_click_intents'::regclass),'Intent RLS enabled');
select ok(not has_table_privilege(r,'core.product_click_intents','SELECT,INSERT,UPDATE,DELETE'),'No intent table grant: '||r)
 from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_function_privilege(r,f,'EXECUTE'),'No RPC/helper execution: '||r||' '||f)
 from unnest(array['anon','authenticated','service_role']) r cross join unnest(array[
 'core.product_click_intent_record_valid(jsonb)','api.create_product_click_intent_server(text,jsonb)',
 'api.consume_product_click_intent_server(text)','api.cleanup_product_click_intents_server(integer)']) f;
create function pg_temp.intent_record(shift_ms bigint default -10)
returns jsonb language sql as $$
 select jsonb_build_object('purpose','published-product-click-v1','confirmation_hash',repeat('a',64),
 'binding',jsonb_build_object('handle','product-media-renamed','spill_reference',1,'provider_key','shopee',
 'publication_token',api.resolve_published_product_media_server('product-media-renamed',1)->>'publication_token',
 'destination_hash',encode(extensions.digest('https://shopee.co.id/item?affiliate=creator','sha256'),'hex')),
 'issued_at',ms,'expires_at',ms+120000)
 from (select floor(extract(epoch from clock_timestamp())*1000)::bigint+shift_ms as ms) t;
$$;
create temporary table intent_expected as select pg_temp.intent_record() as record;
select is(api.create_product_click_intent_server(repeat('a',64),(select record from intent_expected)),true,'Create exact safe binding');
select is(api.create_product_click_intent_server(repeat('a',64),jsonb_set((select record from intent_expected),'{confirmation_hash}',to_jsonb(repeat('b',64)))),false,'No collision overwrite');
select is((select record from core.product_click_intents where token_hash=repeat('a',64)),(select record from intent_expected),'Original record retained');
select is(api.consume_product_click_intent_server(repeat('a',64)),(select record from intent_expected),'Consume returns exact server-only record once');
select is(api.consume_product_click_intent_server(repeat('a',64)),null::jsonb,'Replay denied');
select is(api.create_product_click_intent_server(h,pg_temp.intent_record()),false,'Malformed token hash denied')
 from (values(null::text),('short'),(repeat('A',64)),(repeat('a',43))) t(h);
select is(api.consume_product_click_intent_server(h),null::jsonb,'Malformed token consume denied')
 from (values(null::text),('short'),(repeat('A',64))) t(h);
select is(api.create_product_click_intent_server(repeat('a',64),r),false,'Malformed/private record denied')
 from (values(null::jsonb),('[]'::jsonb),('{}'::jsonb),
 ((select record from intent_expected)||'{"raw_token":"private"}'::jsonb),
 (jsonb_set((select record from intent_expected),'{purpose}','"wrong-purpose"')),
 (jsonb_set((select record from intent_expected),'{issued_at}','"1000"')),
 (jsonb_set((select record from intent_expected),'{issued_at}','-1')),
 (jsonb_set((select record from intent_expected),'{issued_at}','1.5')),
 (jsonb_set((select record from intent_expected),'{expires_at}','9007199254740992')),
 (jsonb_set((select record from intent_expected),'{confirmation_hash}','"short"')),
 (jsonb_set((select record from intent_expected),'{binding,handle}','"CREATOR"')),
 (jsonb_set((select record from intent_expected),'{binding,provider_key}','"external:127.0.0.1"')),
 (jsonb_set((select record from intent_expected),'{binding,spill_reference}','0')),
 (jsonb_set((select record from intent_expected),'{binding,spill_reference}','9007199254740992')),
 ((select record from intent_expected)#-'{binding,publication_token}')) t(r);
select is(api.create_product_click_intent_server(repeat('b',64),pg_temp.intent_record(-130000)),false,'Expired record cannot issue');
select is(api.create_product_click_intent_server(repeat('b',64),pg_temp.intent_record(3600000)),false,'Future-issued record denied');
select is(api.create_product_click_intent_server(repeat('b',64),jsonb_set(pg_temp.intent_record(),'{binding,publication_token}',to_jsonb(repeat('0',64)))),false,'Stale publication binding denied');
update core.external_destination_safety set safety_status='blocked',reason_codes=array['malware'],revision=revision+1;
select is(api.create_product_click_intent_server(repeat('b',64),pg_temp.intent_record()),false,'Fresh binding cannot issue on unsafe destination');
update core.external_destination_safety set safety_status='safe',reason_codes=array[]::text[],revision=revision+1;
insert into core.product_click_intents(token_hash,record) values(repeat('b',64),pg_temp.intent_record(-130000));
select is(api.create_product_click_intent_server(repeat('b',64),pg_temp.intent_record()),false,'Expired collision not overwritten');
select is(api.consume_product_click_intent_server(repeat('b',64)),null::jsonb,'Expired intent burns without record');
select is((select count(*) from core.product_click_intents),0::bigint,'Expired consume removed authority');
insert into core.product_click_intents(token_hash,record) values(repeat('b',64),pg_temp.intent_record(3600000));
select is(api.consume_product_click_intent_server(repeat('b',64)),null::jsonb,'Future record burns');
insert into core.product_click_intents(token_hash,record) values
 (repeat('b',64),pg_temp.intent_record(-130000)),(repeat('c',64),pg_temp.intent_record(-140000)),
 (repeat('d',64),pg_temp.intent_record(-150000)),(repeat('e',64),pg_temp.intent_record());
select is(api.cleanup_product_click_intents_server(l),0,'Invalid cleanup limit denied') from (values(null::integer),(0),(-1),(501)) t(l);
select is(api.cleanup_product_click_intents_server(1),1,'Bounded cleanup one expired record');
select is((select count(*) from core.product_click_intents),3::bigint,'Bound respected');
select is(api.cleanup_product_click_intents_server(500),2,'Remaining expired records removed');
select is((select count(*) from core.product_click_intents where token_hash=repeat('e',64)),1::bigint,'Current intent survives cleanup');
select is((select count(*) from core.spill_item_publications),2::bigint,'Store mutates no publication');
select is((select count(*) from core.spill_item_identity_registry),3::bigint,'Store allocates no reference');
select is((select count(*) from core.first_onboarding_publications),0::bigint,'Store completes no Publish');
select * from finish();
rollback;

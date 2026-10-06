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

create function pg_temp.intent_record(shift_ms bigint default -10)
returns jsonb language sql as $$
 select jsonb_build_object('purpose','published-product-click-v1','confirmation_hash',repeat('a',64),
 'binding',jsonb_build_object('handle','product-media-renamed','spill_reference',1,'provider_key','shopee',
 'publication_token',api.resolve_published_product_media_server('product-media-renamed',1)->>'publication_token',
 'destination_hash',encode(extensions.digest('https://shopee.co.id/item?affiliate=creator','sha256'),'hex')),
 'issued_at',ms,'expires_at',ms+120000)
 from (select floor(extract(epoch from clock_timestamp())*1000)::bigint+shift_ms as ms) t;
$$;
select ok(not has_function_privilege(r,f,'EXECUTE'),'Clock/deadline execution withheld: '||r||' '||f)
 from unnest(array['anon','authenticated','service_role']) r cross join unnest(array[
 'api.read_product_click_clock_server()','api.resolve_product_click_intent_destination_server(jsonb)']) f;
create temporary table clock_range as select floor(extract(epoch from clock_timestamp())*1000)::bigint as before_ms;
select ok(api.read_product_click_clock_server()>=(select before_ms from clock_range),'Clock reads database wall epoch after baseline');
select ok(api.read_product_click_clock_server()<=floor(extract(epoch from clock_timestamp())*1000)::bigint+1000,'Clock sample is bounded by current database wall time');
select is(api.resolve_product_click_intent_destination_server(pg_temp.intent_record())->>'destination_url','https://shopee.co.id/item?affiliate=creator','Fresh deadline resolution preserves attribution');
select is(api.resolve_product_click_intent_destination_server(pg_temp.intent_record(-120001)),'{"status":"unavailable"}'::jsonb,'Expired record denied');
select is(api.resolve_product_click_intent_destination_server(pg_temp.intent_record(60000)),'{"status":"unavailable"}'::jsonb,'Future record denied without grace');
select is(api.resolve_product_click_intent_destination_server(v),'{"status":"unavailable"}'::jsonb,'Strict malformed record denied')
 from (values (null::jsonb),('[]'::jsonb),('{}'::jsonb),
 (pg_temp.intent_record()||'{"purpose":"other"}'::jsonb),
 (pg_temp.intent_record()||'{"private":"unexpected"}'::jsonb),
 (jsonb_set(pg_temp.intent_record(),'{expires_at}','0')),
 (jsonb_set(pg_temp.intent_record(),'{binding,publication_token}',to_jsonb(repeat('a',64))))) records(v);
create temporary table deadline_record as select pg_temp.intent_record() as value;
create temporary table clock_publications as select item_id,snapshot,working_revision from core.spill_item_publications;
update core.external_destination_safety set checked_at=now()-interval '1 hour',expires_at=now()-interval '1 second',revision=revision+1;
select is(api.resolve_product_click_intent_destination_server((select value from deadline_record)),'{"status":"unavailable"}'::jsonb,'Expired destination safety denied even with valid intent lifetime');
update core.external_destination_safety set checked_at=now(),expires_at=now()+interval '1 hour',revision=revision+1;
select is(api.resolve_product_click_intent_destination_server((select value from deadline_record))->>'status','success','Safety recovery permits current exact deadline-bound record');
select ok(not exists(select 1 from core.spill_item_publications p join clock_publications b using(item_id) where p.snapshot<>b.snapshot or p.working_revision<>b.working_revision),'Clock and deadline reads mutate no publication');
select is((select count(*) from core.product_click_intents),0::bigint,'Deadline resolver does not create or consume authority');
update core.spill_item_publications set snapshot=jsonb_set(snapshot,'{title}','"Changed Published title"') where item_type='product';
select is(api.resolve_product_click_intent_destination_server((select value from deadline_record)),'{"status":"unavailable"}'::jsonb,'Old record cannot inherit changed Published confirmation');
-- Controlled resolver latency inside this rolled-back test only proves the final
-- database expiry check. The real resolver and its grants are restored by rollback.
create temporary table deadline_probe(called boolean);
create or replace function api.resolve_published_product_destination_server(
 input_handle text,input_spill_reference bigint,input_provider_key text,input_publication_token text,input_destination_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 insert into pg_temp.deadline_probe values(true);
 perform pg_sleep(2);
 return jsonb_build_object('status','success','destination_url','https://shopee.co.id/item?affiliate=creator');
end;
$$;
select is(api.resolve_product_click_intent_destination_server(pg_temp.intent_record(-118500)),
 '{"status":"unavailable"}'::jsonb,'Record expiring during resolver cannot succeed after resolution');
select is((select count(*) from deadline_probe),1::bigint,'Delayed resolver was reached before final expiry denial');
select * from finish();
rollback;

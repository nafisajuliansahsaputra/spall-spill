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

-- Withheld exact Published context.
select ok(not has_function_privilege(r,'api.resolve_published_product_click_context_server(text,bigint,text)','EXECUTE'),'Context execution withheld: '||r)
 from unnest(array['anon','authenticated','service_role']) r;
create temporary table click_context_baseline as select api.resolve_published_product_click_context_server('product-media-renamed',1,'shopee') as value;
select is((select value->>'status' from click_context_baseline),'success','Current usable selected context');
select is((select value->'confirmation' from click_context_baseline),api.resolve_public_product('product-media-renamed',1),'Confirmation equals exact public DTO');
select is((select value->'binding'->>'publication_token' from click_context_baseline),api.resolve_published_product_media_server('product-media-renamed',1)->>'publication_token','Binding uses exact selected Published digest');
select is((select value->'binding'->>'destination_hash' from click_context_baseline),encode(extensions.digest('https://shopee.co.id/item?affiliate=creator','sha256'),'hex'),'Original affiliate URL hash');
select is(api.resolve_published_product_click_context_server('PRODUCT-MEDIA-ONE',1,'shopee'),(select value from click_context_baseline),'Casefolded protected alias resolves same current context');
select is(api.resolve_published_product_click_context_server('product-media-renamed',1,'external:store.example.test')->'binding'->>'provider_key','external:store.example.test','Independent alternative provider');
select is((select array_agg(k order by k) from click_context_baseline,jsonb_object_keys(value) as keys(k)),array['binding','confirmation','status']::text[],'Server envelope has exact bounded keys');
select is(api.resolve_published_product_click_context_server(h,r,p),'{"status":"unavailable"}'::jsonb,'Uniform invalid/context denial')
 from (values ('unknown',1::bigint,'shopee'),(' product-media-renamed',1,'shopee'),('product-media-renamed',0,'shopee'),
 ('product-media-renamed',9007199254740992,'shopee'),('product-media-renamed',2,'shopee'),('product-media-two',1,'shopee'),
 ('product-media-renamed',1,'tokopedia'),('product-media-renamed',1,null),('product-media-renamed',1,repeat('x',263))) v(h,r,p);
create temporary table click_publication_baseline as select item_id,snapshot,working_revision from core.spill_item_publications;
update core.external_destination_safety set safety_status='blocked' where normalized_url='https://store.example.test/item?creator=original';
select is(api.resolve_published_product_click_context_server('product-media-renamed',1,'shopee')->'confirmation'->'destinations'->1->'destination_url','null'::jsonb,'Partial degradation masks only unsafe alternate URL');
select is(api.resolve_published_product_click_context_server('product-media-renamed',1,'external:store.example.test'),'{"status":"unavailable"}'::jsonb,'Unsafe alternate cannot issue');
update core.external_destination_safety set safety_status='blocked';
select is(api.resolve_published_product_click_context_server('product-media-renamed',1,'shopee'),'{"status":"unavailable"}'::jsonb,'All-unsafe intent denial');
select is(api.resolve_public_product('product-media-renamed',1)->>'status','success','All-unsafe Product confirmation remains Published');
update core.external_destination_safety set safety_status='safe',expires_at=now()+interval '1 hour';
select is(api.resolve_published_product_click_context_server('product-media-renamed',1,'shopee'),(select value from click_context_baseline),'Safety recovery retains exact original context');
select ok(not exists(select 1 from core.spill_item_publications p join click_publication_baseline b using(item_id) where p.snapshot<>b.snapshot or p.working_revision<>b.working_revision),'Context reads and safety degradation do not mutate publication');
update core.product_drafts set title='NEW PRIVATE TITLE';
select is(api.resolve_published_product_click_context_server('product-media-renamed',1,'shopee'),(select value from click_context_baseline),'Private Draft never supplies confirmation');
update core.spill_item_publications set snapshot=jsonb_set(snapshot,'{title}','"New Published title"') where item_type='product';
select isnt(api.resolve_published_product_click_context_server('product-media-renamed',1,'shopee')->'binding'->>'publication_token',(select value->'binding'->>'publication_token' from click_context_baseline),'Changed Published title has new digest');
select is(api.resolve_published_product_click_context_server('product-media-renamed',1,'shopee')->'confirmation'->>'title','New Published title','New binding accompanies new confirmation');
select is(api.resolve_published_product_destination_server('product-media-renamed',1,'shopee',
 (select value->'binding'->>'publication_token' from click_context_baseline),(select value->'binding'->>'destination_hash' from click_context_baseline)),
 '{"status":"unavailable"}'::jsonb,'Old confirmation binding cannot inherit new publication');
update core.profile_media_assets set stored_content_type='image/png' where asset_key='84000000-0000-4000-8000-000000000001';
select is(api.resolve_published_product_click_context_server('product-media-renamed',1,'shopee'),'{"status":"unavailable"}'::jsonb,'Invalid canonical media denies context');
update core.profile_media_assets set stored_content_type='image/webp';
update core.spill_item_publications set lifecycle_state='hidden' where item_type='product';
select is(api.resolve_published_product_click_context_server('product-media-renamed',1,'shopee'),'{"status":"unavailable"}'::jsonb,'Hidden Product denies context');
update core.spill_item_publications set lifecycle_state='published';
update core.identity_publications set lifecycle_state='hidden';
select is(api.resolve_published_product_click_context_server('product-media-renamed',1,'shopee'),'{"status":"unavailable"}'::jsonb,'Hidden Identity denies context');
update core.identity_publications set lifecycle_state='published';
update core.owners set account_state='restricted' where id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
select is(api.resolve_published_product_click_context_server('product-media-renamed',1,'shopee'),'{"status":"unavailable"}'::jsonb,'Restricted Owner denies context');
select * from finish();
rollback;

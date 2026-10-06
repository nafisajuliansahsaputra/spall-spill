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

select ok(not has_function_privilege('anon','api.resolve_published_product_destination_server(text,bigint,text,text,text)','EXECUTE'),'No browser click resolver grant');
select ok(not has_function_privilege('authenticated','api.resolve_published_product_destination_server(text,bigint,text,text,text)','EXECUTE'),'Signed-in role receives no click authority');
select ok(not has_function_privilege('service_role','api.resolve_published_product_destination_server(text,bigint,text,text,text)','EXECUTE'),'Service transport remains withheld');
create temporary table click_expected as select snapshot,
 api.resolve_published_product_media_server('product-media-one',1)->>'publication_token' as token
 from core.spill_item_publications where item_type='product';
create function pg_temp.product_click(provider text default 'shopee', handle text default 'product-media-one', ref bigint default 1)
returns jsonb language sql as $$
 select api.resolve_published_product_destination_server(handle,ref,provider,(select token from click_expected),
  (select encode(extensions.digest(d.value->>'destination_url','sha256'),'hex') from click_expected e,
   jsonb_array_elements(e.snapshot->'destinations') d(value) where d.value->>'provider_key'=provider));
$$;
select is(pg_temp.product_click(),'{"status":"unavailable"}'::jsonb,'Pending destination never authorizes action');
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at) values
 ('https://shopee.co.id/item?affiliate=creator',encode(extensions.digest('https://shopee.co.id/item?affiliate=creator','sha256'),'hex'),'safe','click-fixture',now(),now()+interval '1 hour'),
 ('https://store.example.test/item?creator=original',encode(extensions.digest('https://store.example.test/item?creator=original','sha256'),'hex'),'safe','click-fixture',now(),now()+interval '1 hour');
select is(pg_temp.product_click(),'{"status":"success","destination_url":"https://shopee.co.id/item?affiliate=creator"}'::jsonb,'Exact stored affiliate URL only');
select is(pg_temp.product_click('external:store.example.test'),'{"status":"success","destination_url":"https://store.example.test/item?creator=original"}'::jsonb,'Exact selected alternative and original attribution');
select is(pg_temp.product_click('shopee','PRODUCT-MEDIA-RENAMED'),pg_temp.product_click(),'Case/protected alias selects same canonical Product');
select is(pg_temp.product_click('shopee','product-media-two'),'{"status":"unavailable"}'::jsonb,'Other Owner cannot inherit same reference/token');
select is(pg_temp.product_click('shopee','unknown-owner'),'{"status":"unavailable"}'::jsonb,'Unknown Owner generic denial');
select is(pg_temp.product_click('shopee','product-media-one',2),'{"status":"unavailable"}'::jsonb,'Resource reference never becomes Product action');
select is(pg_temp.product_click('shopee','product-media-one',0),'{"status":"unavailable"}'::jsonb,'Invalid reference generic denial');
select is(api.resolve_published_product_destination_server('product-media-one',1,'unknown',(select token from click_expected),
 encode(extensions.digest('https://shopee.co.id/item?affiliate=creator','sha256'),'hex')),'{"status":"unavailable"}'::jsonb,'Provider cannot substitute arbitrary bound URL');
select is(api.resolve_published_product_destination_server('product-media-one',1,'shopee',v.token,v.hash),
 '{"status":"unavailable"}'::jsonb,v.label)
 from (values (null::text,repeat('a',64),'Null token'),(repeat('A',64),repeat('a',64),'Uppercase token'),
 (repeat('0',64),repeat('a',64),'Stale token'),((select token from click_expected),null::text,'Null URL hash'),
 ((select token from click_expected),'short','Malformed URL hash'),
 ((select token from click_expected),repeat('0',64),'Changed attribution/hash binding')) v(token,hash,label);
update core.product_drafts set title='New private title',revision=revision+1;
select is(pg_temp.product_click()->>'status','success','New private Working does not replace exact Published selection');
insert into core.product_preparations(product_id,owner_id,primary_asset_key,destinations,revision)
 select id,owner_id,'84000000-0000-4000-8000-000000000003','[]',2 from core.product_drafts
 where owner_id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
select is(pg_temp.product_click()->>'destination_url','https://shopee.co.id/item?affiliate=creator','Private preparation image/destinations cannot replace Published attribution');
update core.external_destination_safety set safety_status='blocked',reason_codes=array['malware'],revision=revision+1
 where normalized_url='https://store.example.test/item?creator=original';
select is(pg_temp.product_click('external:store.example.test'),'{"status":"unavailable"}'::jsonb,'Blocked selected alternative denied');
select is(pg_temp.product_click()->>'status','success','One blocked alternative retains safe selected action');
update core.external_destination_safety set safety_status='review',reason_codes=array['malware'],revision=revision+1
 where normalized_url='https://shopee.co.id/item?affiliate=creator';
select is(pg_temp.product_click(),'{"status":"unavailable"}'::jsonb,'Review denies even previously safe action');
select is((select lifecycle_state from core.spill_item_publications where item_type='product'),'published','All degraded actions never auto-Hide');
update core.external_destination_safety set safety_status='safe',reason_codes=array[]::text[],revision=revision+1;
select is(pg_temp.product_click()->>'status','success','Recovery restores exact action without publication');
select is((select snapshot from core.spill_item_publications where item_type='product'),(select snapshot from click_expected),'Safety changes never rewrite Product');
update core.external_destination_safety set checked_at=now()-interval '10 minutes',expires_at=now()-interval '1 second'
 where normalized_url='https://shopee.co.id/item?affiliate=creator';
select is(pg_temp.product_click(),'{"status":"unavailable"}'::jsonb,'Expired safe verdict denied at current validation time');
update core.external_destination_safety set expires_at=now()+interval '1 hour',url_hash=repeat('0',64)
 where normalized_url='https://shopee.co.id/item?affiliate=creator';
select is(pg_temp.product_click(),'{"status":"unavailable"}'::jsonb,'Safety URL hash mismatch denied');
update core.external_destination_safety set url_hash=encode(extensions.digest(normalized_url,'sha256'),'hex');
update core.spill_item_publications set snapshot=jsonb_set(snapshot,'{destinations,0,destination_url}',
 '"https://shopee.co.id/item?affiliate=replaced"') where item_type='product';
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at) values
 ('https://shopee.co.id/item?affiliate=replaced',encode(extensions.digest('https://shopee.co.id/item?affiliate=replaced','sha256'),'hex'),'safe','click-fixture',now(),now()+interval '1 hour');
update click_expected set token=api.resolve_published_product_media_server('product-media-one',1)->>'publication_token';
select is(pg_temp.product_click(),'{"status":"unavailable"}'::jsonb,'Old exact URL hash cannot inherit changed safe affiliate URL even with fresh publication token');
update core.spill_item_publications set snapshot=(select snapshot from click_expected) where item_type='product';
update click_expected set token=api.resolve_published_product_media_server('product-media-one',1)->>'publication_token';
update core.spill_item_publications set snapshot=jsonb_set(snapshot,'{title}','"Changed Published title"') where item_type='product';
select is(pg_temp.product_click(),'{"status":"unavailable"}'::jsonb,'Old rendered confirmation token cannot inherit changed Product context');
update core.spill_item_publications set snapshot=(select snapshot from click_expected) where item_type='product';
update click_expected set token=api.resolve_published_product_media_server('product-media-one',1)->>'publication_token';
update core.identity_publications set snapshot=jsonb_set(snapshot,'{display_name}','"Changed Published Owner"');
select is(pg_temp.product_click(),'{"status":"unavailable"}'::jsonb,'Old confirmation cannot inherit changed Published Identity');
update click_expected set token=api.resolve_published_product_media_server('product-media-one',1)->>'publication_token';
select is(pg_temp.product_click()->>'status','success','Fresh explicit Published binding can resolve current context');
update core.spill_item_publications set lifecycle_state='hidden' where item_type='product';
select is(pg_temp.product_click(),'{"status":"unavailable"}'::jsonb,'Hidden Product cannot redirect');
update core.spill_item_publications set lifecycle_state='archived' where item_type='product';
select is(pg_temp.product_click(),'{"status":"unavailable"}'::jsonb,'Archived Product cannot redirect');
update core.spill_item_publications set lifecycle_state='published' where item_type='product';
update click_expected set token=api.resolve_published_product_media_server('product-media-one',1)->>'publication_token';
update core.identity_publications set lifecycle_state='hidden';
select is(pg_temp.product_click(),'{"status":"unavailable"}'::jsonb,'Hidden Identity excludes action');
update core.identity_publications set lifecycle_state='published';
update click_expected set token=api.resolve_published_product_media_server('product-media-one',1)->>'publication_token';
update core.owners set account_state='restricted' where id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
select is(pg_temp.product_click(),'{"status":"unavailable"}'::jsonb,'Restricted Owner generic denial');
update core.owners set account_state='active' where id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
update core.spill_item_publications set snapshot=jsonb_set(snapshot,'{primary_asset_key}','"84000000-0000-4000-8000-000000000002"') where item_type='product';
select is(pg_temp.product_click(),'{"status":"unavailable"}'::jsonb,'Foreign canonical image never bypasses transport validity');
select is((select count(*) from core.spill_item_publications),2::bigint,'Read helper creates no publication');
select is((select count(*) from core.first_onboarding_publications),0::bigint,'Read helper completes no first-Publish intent');
select is((select count(*) from core.spill_item_identity_registry),3::bigint,'Read helper allocates no reference');
select * from finish();
rollback;

begin;
select no_plan();
select ok(has_function_privilege('service_role','api.resolve_published_product_media_server(text,bigint)','EXECUTE'),'Server-only Product descriptor');
select ok(not has_function_privilege('anon','api.resolve_published_product_media_server(text,bigint)','EXECUTE'),'No anonymous descriptor access');
select ok(not has_function_privilege('authenticated','api.resolve_published_product_media_server(text,bigint)','EXECUTE'),'No signed-in descriptor access');
select ok(not has_table_privilege('service_role','core.spill_item_publications','SELECT'),'No direct service publication reads');
select ok(not has_table_privilege('service_role','core.profile_media_assets','SELECT'),'No direct service asset reads');
select ok(not has_function_privilege('authenticated','api.publish_current_onboarding(uuid,text,text)','EXECUTE'),'Publish remains withheld');
select ok(not has_function_privilege('anon','api.resolve_public_identity(text)','EXECUTE'),'Public Identity reader remains withheld');
select ok(not has_function_privilege('anon','api.resolve_public_resource(text,bigint)','EXECUTE'),'Public Item reader remains withheld');
select ok((select prosecdef and proconfig @> array['search_path=""','TimeZone=UTC'] from pg_proc where oid='api.resolve_published_product_media_server(text,bigint)'::regprocedure),'Narrow definer has fixed search path/timezone');
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
set local role service_role;
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Draft/reservation/asset alone remain private');
reset role;
insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,published_at)
 select owner_id,'{"display_name":"Published Product Owner","profile_asset_key":null}',1,1,now()
 from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001';
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,published_at)
 select item_id,owner_id,item_type,spill_reference,1,
 case when item_type='product' then '{"title":"Published Product","preparation_revision":1,"primary_asset_key":"84000000-0000-4000-8000-000000000001","destinations":[{"provider_key":"shopee","destination_url":"https://shopee.co.id/item?affiliate=creator"}]}'::jsonb
 else '{"resource_type":"website","title":"Resource","source_url":"https://resource.example.test"}'::jsonb end,now()
 from core.spill_item_identity_registry where owner_id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
set local role service_role;
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Incomplete Owner unavailable despite fixture publications');
reset role;
update core.owners set onboarding_completed_at=now() where id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
set local role service_role;
select is(api.resolve_published_product_media_server('product-media-one',1)->>'status','success','Exact Published Product visual is available without outbound certification');
select is(api.resolve_published_product_media_server('PRODUCT-MEDIA-RENAMED',1),api.resolve_published_product_media_server('product-media-one',1),'Protected alias and case resolve same snapshot');
select is(api.resolve_published_product_media_server('product-media-one',1)->>'current_handle','product-media-renamed','Canonical Handle retained');
select is(api.resolve_published_product_media_server('product-media-one',1)->>'spill_reference','1','Exact reference retained');
select is(api.resolve_published_product_media_server('product-media-one',1)->>'object_key','working/profile/84000000-0000-4000-8000-000000000001.webp','Only Published image selected');
select ok(not(api.resolve_published_product_media_server('product-media-one',1) ?| array['owner_id','item_id','primary_asset_key','receipt_id','destinations','title','destination_url']),'Descriptor excludes private authority and outbound data');
select is(api.resolve_published_product_media_server('product-media-one',2),'{"status":"unavailable"}'::jsonb,'Resource never resolved as Product');
select is(api.resolve_published_product_media_server('product-media-one',3),'{"status":"unavailable"}'::jsonb,'Unknown exact reference never falls back');
select is(api.resolve_published_product_media_server('product-media-two',1),'{"status":"unavailable"}'::jsonb,'Same numeric reference on another Owner never leaks first Owner');
select is(api.resolve_published_product_media_server('unknown-owner',1),'{"status":"unavailable"}'::jsonb,'Unknown Owner uniform');
select is(api.resolve_published_product_media_server('../product-media-one',1),'{"status":"unavailable"}'::jsonb,'Path locator denied');
select is(api.resolve_published_product_media_server(' product-media-one',1),'{"status":"unavailable"}'::jsonb,'Whitespace denied');
select is(api.resolve_published_product_media_server(null,1),'{"status":"unavailable"}'::jsonb,'Null Handle denied');
select is(api.resolve_published_product_media_server('product-media-one',null),'{"status":"unavailable"}'::jsonb,'Null reference denied');
select is(api.resolve_published_product_media_server('product-media-one',0),'{"status":"unavailable"}'::jsonb,'Zero reference denied');
select is(api.resolve_published_product_media_server('product-media-one',9007199254740992),'{"status":"unavailable"}'::jsonb,'Non-safe-integer reference denied');
reset role;
create temporary table original_product_media as select p.snapshot,api.resolve_published_product_media_server('product-media-one',1) as descriptor
 from core.spill_item_publications p where p.item_type='product';
update core.product_drafts set title='New private title',revision=revision+1 where owner_id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
insert into core.product_preparations(product_id,owner_id,primary_asset_key,destinations,revision)
 select id,owner_id,'84000000-0000-4000-8000-000000000003','[]',2 from core.product_drafts
 where owner_id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
select is(api.resolve_published_product_media_server('product-media-one',1),(select descriptor from original_product_media),'Newer private title/image/preparation cannot change public image/token');
update core.spill_item_publications set snapshot=jsonb_set(snapshot,'{primary_asset_key}','"84000000-0000-4000-8000-000000000002"') where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Foreign asset denied');
update core.spill_item_publications set snapshot=jsonb_set(snapshot,'{primary_asset_key}','"84000000-0000-4000-8000-000000000004"') where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Unconsumed intent denied');
update core.spill_item_publications set snapshot=jsonb_set(snapshot,'{primary_asset_key}','"ffffffff-ffff-4fff-8fff-ffffffffffff"') where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Missing asset denied');
update core.spill_item_publications set snapshot=(select snapshot from original_product_media)-'primary_asset_key' where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Missing primary selection never uses Working fallback');
update core.spill_item_publications set snapshot=(select snapshot from original_product_media)-'preparation_revision' where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Missing preparation revision denied');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from original_product_media),'{preparation_revision}','9007199254740992') where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Exhausted preparation binding denied');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from original_product_media),'{preparation_revision}','"1"') where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Forged string revision denied without cast error');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from original_product_media),'{title}','" "') where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Unrecognizable title denied');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from original_product_media),'{destinations}','[]') where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Snapshot with no structured destination denied');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from original_product_media),'{destinations}','[{"provider_key":"shopee","destination_url":"https://foreign.example.test/item"}]') where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Provider spoofing denied');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from original_product_media),'{primary_asset_key}','"84000000-0000-4000-8000-000000000003"') where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1)->>'status','success','Explicit Published image replacement selected');
select isnt(api.resolve_published_product_media_server('product-media-one',1)->>'publication_token',(select descriptor->>'publication_token' from original_product_media),'Product replacement invalidates exact token');
update core.spill_item_publications set snapshot=(select snapshot from original_product_media) where item_type='product';
update core.identity_publications set snapshot=jsonb_set(snapshot,'{display_name}','"Changed Published Identity"');
select isnt(api.resolve_published_product_media_server('product-media-one',1)->>'publication_token',(select descriptor->>'publication_token' from original_product_media),'Identity publication replacement invalidates token');
update core.spill_item_publications set lifecycle_state='hidden' where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Hidden Product denied');
update core.spill_item_publications set lifecycle_state='archived' where item_type='product';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Archived Product denied');
update core.spill_item_publications set lifecycle_state='published' where item_type='product';
update core.identity_publications set lifecycle_state='hidden';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Hidden Identity denies Product image');
update core.identity_publications set lifecycle_state='archived';
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Archived Identity denies Product image');
update core.identity_publications set lifecycle_state='published';
update core.owners set account_state='restricted' where id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
select is(api.resolve_published_product_media_server('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Restricted Owner denied');
select is((select count(*) from core.spill_item_publications),2::bigint,'Reads create no Item publication');
select is((select count(*) from core.first_onboarding_publications),0::bigint,'Reads complete no publication intent');
select is((select count(*) from core.spill_item_identity_registry),3::bigint,'Reads allocate no reference');
select * from finish();
rollback;

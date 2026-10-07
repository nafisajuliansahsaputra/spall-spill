begin;
select no_plan();
select ok(not has_function_privilege('anon','api.resolve_public_product(text,bigint)','EXECUTE'),'Anonymous Product reader remains withheld');
select ok(not has_function_privilege('authenticated','api.resolve_public_product(text,bigint)','EXECUTE'),'Signed-in Product reader remains withheld');
select ok(not has_function_privilege('service_role','api.resolve_public_product(text,bigint)','EXECUTE'),'No service Product detail reader enabling');
select ok(not has_function_privilege('anon','api.resolve_public_spill_item(text,bigint)','EXECUTE'),'Exact Item anonymous execution withheld');
select ok(not has_function_privilege('authenticated','api.resolve_public_spill_item(text,bigint)','EXECUTE'),'Exact Item signed-in execution withheld');
select ok(not has_function_privilege('service_role','api.resolve_public_spill_item(text,bigint)','EXECUTE'),'Exact Item service execution withheld');
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
-- Test-only allow path; schema usage and RPC execution are rolled back together.
grant usage on schema api to anon;
grant execute on function api.resolve_public_product(text,bigint) to anon, authenticated;
grant execute on function api.resolve_public_spill_item(text,bigint) to anon, authenticated;
set local role anon;
select is(api.resolve_public_product('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Private Draft/asset/reservation never public');
select is(api.resolve_public_spill_item('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Exact dispatch cannot expose a private reservation');
reset role;
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

set local role anon;
select is(api.resolve_public_product('product-media-one',1)->>'status','success','Published context survives all destinations pending');
select is(api.resolve_public_spill_item('product-media-one',1)->>'item_type','product','Immutable Product binding selects only Product reader');
select is(api.resolve_public_spill_item('product-media-one',1)->'detail',api.resolve_public_product('product-media-one',1),'Exact wrapper retains complete degraded Product recognition');
select is(api.resolve_public_spill_item('PRODUCT-MEDIA-RENAMED',1),api.resolve_public_spill_item('product-media-one',1),'Exact Product aliases/case share canonical context');
select is(api.resolve_public_spill_item('product-media-one',2)->>'item_type','resource','Other exact reference resolves its own Resource type');
select is(api.resolve_public_spill_item('product-media-one',3),'{"status":"unavailable"}'::jsonb,'Missing Product reference never resolves a neighbor');
select is(api.resolve_public_spill_item('product-media-two',1),'{"status":"unavailable"}'::jsonb,'Other Owner reference never borrows Published Product');
select is(api.resolve_public_product('product-media-one',1)->>'title','Published Product','Published title only');
select is(api.resolve_public_product('product-media-one',1)->>'display_name','Published Product Owner','Published Owner context');
select is(api.resolve_public_product('product-media-one',1)->>'primary_image_path','/media/product/product-media-renamed/1','Same-origin canonical exact image path');
select is(api.resolve_public_product('product-media-one',1)->'destinations',
 '[{"provider_key":"shopee","available":false,"destination_url":null},{"provider_key":"external:store.example.test","available":false,"destination_url":null}]'::jsonb,'Pending URLs masked with stable neutral provider context/order');
select ok(not(api.resolve_public_product('product-media-one',1) ?| array['owner_id','item_id','primary_asset_key','preparation_revision','working_revision','publication_token','receipt_id','source_url']),'No private authority/Working/media fields');
select is(api.resolve_public_product('PRODUCT-MEDIA-RENAMED',1),api.resolve_public_product('product-media-one',1),'Protected alias and case yield same canonical DTO');
select is(api.resolve_public_product('product-media-one',2),'{"status":"unavailable"}'::jsonb,'Resource reference unavailable as Product');
select is(api.resolve_public_product('product-media-two',1),'{"status":"unavailable"}'::jsonb,'Other Owner same reference cannot leak Product');
select is(api.resolve_public_product('unknown-owner',1),'{"status":"unavailable"}'::jsonb,'Unknown Owner uniform unavailable');
select is(api.resolve_public_product('product-media-one',0),'{"status":"unavailable"}'::jsonb,'Invalid reference unavailable');
reset role;
create temporary table product_projection_snapshot as select snapshot,api.resolve_public_product('product-media-one',1) as payload
 from core.spill_item_publications where item_type='product';
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated","sub":"84000000-0000-4000-8000-000000000002"}';
select is(api.resolve_public_product('product-media-one',1)->>'status','success','Viewer authentication confers no different public authority');
select is(api.resolve_public_spill_item('product-media-one',1)->'detail',api.resolve_public_product('product-media-one',1),'Signed-in viewer gets identical Product context');
reset role;
select is(api.resolve_public_product('product-media-one',1),(select payload from product_projection_snapshot),'Viewer role preserves exact DTO');
update core.product_drafts set title='New private title',revision=revision+1 where owner_id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
insert into core.product_preparations(product_id,owner_id,primary_asset_key,destinations,revision)
 select id,owner_id,'84000000-0000-4000-8000-000000000003','[]',2 from core.product_drafts
 where owner_id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
select is(api.resolve_public_product('product-media-one',1),(select payload from product_projection_snapshot),'Newer private title/image/destinations never replace Published projection');
select is(api.resolve_public_spill_item('product-media-one',1)->'detail',(select payload from product_projection_snapshot),'Exact dispatch never fills from newer private preparation');
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at) values
 ('https://shopee.co.id/item?affiliate=creator',encode(extensions.digest('https://shopee.co.id/item?affiliate=creator','sha256'),'hex'),'safe','projection-fixture',now(),now()+interval '1 hour'),
 ('https://store.example.test/item?creator=original',encode(extensions.digest('https://store.example.test/item?creator=original','sha256'),'hex'),'safe','projection-fixture',now(),now()+interval '1 hour');
set local role anon;
select is(api.resolve_public_product('product-media-one',1)->'destinations'->0,
 '{"provider_key":"shopee","available":true,"destination_url":"https://shopee.co.id/item?affiliate=creator"}'::jsonb,'Safe exact creator attribution retained');
select is(api.resolve_public_spill_item('product-media-one',1)->'detail'->'destinations'->0->>'destination_url','https://shopee.co.id/item?affiliate=creator','Exact Product wrapper retains original safe attribution');
select is(api.resolve_public_product('product-media-one',1)->'destinations'->1,
 '{"provider_key":"external:store.example.test","available":true,"destination_url":"https://store.example.test/item?creator=original"}'::jsonb,'Safe neutral fallback remains ordered');
reset role;
update core.external_destination_safety set safety_status='blocked',reason_codes=array['malware'],revision=revision+1 where normalized_url='https://store.example.test/item?creator=original';
select is(api.resolve_public_product('product-media-one',1)->'destinations'->1,
 '{"provider_key":"external:store.example.test","available":false,"destination_url":null}'::jsonb,'Blocked alternative masks URL');
select is(api.resolve_public_product('product-media-one',1)->'destinations'->0->>'available','true','One blocked alternative never removes safe alternative');
update core.external_destination_safety set safety_status='review',reason_codes=array['malware'],revision=revision+1 where normalized_url='https://shopee.co.id/item?affiliate=creator';
select is(api.resolve_public_product('product-media-one',1)->>'status','success','All non-safe verdicts retain Product context');
select is(api.resolve_public_product('product-media-one',1)->'destinations'->0->'destination_url','null'::jsonb,'Review verdict never exposes URL');
select is((select lifecycle_state from core.spill_item_publications where item_type='product'),'published','Degradation never auto-Hides Product');
update core.external_destination_safety set safety_status='safe',reason_codes=array[]::text[],revision=revision+1;
select is(api.resolve_public_product('product-media-one',1)->'destinations'->0->>'available','true','Safety recovery restores same destination');
select is((select snapshot from core.spill_item_publications where item_type='product'),(select snapshot from product_projection_snapshot),'Verdict changes never rewrite Published Product');
update core.external_destination_safety set checked_at=now()-interval '10 minutes',expires_at=now()-interval '1 second' where normalized_url='https://store.example.test/item?creator=original';
select is(api.resolve_public_product('product-media-one',1)->'destinations'->1->'destination_url','null'::jsonb,'Expired safe verdict masks only exact expired URL');
update core.external_destination_safety set url_hash=repeat('0',64) where normalized_url='https://shopee.co.id/item?affiliate=creator';
select is(api.resolve_public_product('product-media-one',1)->'destinations'->0->'destination_url','null'::jsonb,'Mismatched safety hash never authorizes URL');
select is(api.resolve_public_product('product-media-one',1)->>'status','success','All unavailable destinations retain visual confirmation context');
update core.spill_item_publications set snapshot=jsonb_set(snapshot,'{primary_asset_key}','"84000000-0000-4000-8000-000000000002"') where item_type='product';
select is(api.resolve_public_product('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Foreign primary image invalidates projection');
select is(api.resolve_public_spill_item('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Invalid Product context never falls back to neighboring Resource');
update core.spill_item_publications set snapshot=(select snapshot from product_projection_snapshot)-'preparation_revision' where item_type='product';
select is(api.resolve_public_product('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Incomplete Published snapshot never fills from preparation');
update core.spill_item_publications set snapshot=(select snapshot from product_projection_snapshot),lifecycle_state='hidden' where item_type='product';
select is(api.resolve_public_product('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Hidden Product uniform unavailable');
select is(api.resolve_public_spill_item('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Hidden exact Product leaks no type or partial detail');
update core.spill_item_publications set lifecycle_state='archived' where item_type='product';
select is(api.resolve_public_product('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Archived Product not normal detail');
select is(api.resolve_public_spill_item('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Archived Product unavailable in normal exact lookup');
update core.spill_item_publications set lifecycle_state='published' where item_type='product';
update core.identity_publications set lifecycle_state='hidden';
select is(api.resolve_public_product('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Hidden Identity excludes Product context');
update core.identity_publications set lifecycle_state='published';
update core.owners set account_state='restricted' where id=(select owner_id from product_media_owners where auth_user_id='84000000-0000-4000-8000-000000000001');
select is(api.resolve_public_product('product-media-one',1),'{"status":"unavailable"}'::jsonb,'Restriction never exposes internal reasons');
select is((select count(*) from core.spill_item_publications),2::bigint,'Reads create no publication');
select is((select count(*) from core.first_onboarding_publications),0::bigint,'Reads complete no first-Publish intent');
select is((select count(*) from core.spill_item_identity_registry),3::bigint,'Reads allocate no reference');
select * from finish();
rollback;

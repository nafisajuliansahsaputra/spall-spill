begin;
select no_plan();
select ok((select relrowsecurity from pg_class where oid='core.workspace_product_preparations'::regclass),'Preparation RLS');
select ok(not has_table_privilege('service_role','core.workspace_product_preparations','SELECT'),'Raw service table denied');
select ok(not has_table_privilege('authenticated','core.workspace_product_preparation_sources','SELECT'),'Projection denied');
select ok(not has_function_privilege('service_role','api.save_current_owner_product_destinations(jsonb)','EXECUTE'),'Direct mutator closed');
select ok(not has_function_privilege('anon','api.execute_owner_product_destinations_server(uuid,text,jsonb)','EXECUTE'),'Anonymous gateway closed');
set local role authenticated;
select throws_ok($q$select api.execute_owner_product_destinations_server('26900000-0000-4000-8000-000000000001','resolve_current_owner_product_destinations','{"input_reference":1}')$q$,'42501',null,'Actual actor spoof denied');
reset role;
insert into auth.users(id,email) values('26900000-0000-4000-8000-000000000001','starter-one@example.test'),('26900000-0000-4000-8000-000000000002','starter-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in('26900000-0000-4000-8000-000000000001','26900000-0000-4000-8000-000000000002');
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind) select 'catalog269-'||right(auth_user_id::text,6),owner_id,'current' from actors;
insert into core.identity_working(owner_id,display_name,revision) select owner_id,'Identity',1 from actors;
insert into core.identity_layout_working(owner_id,starter_key,revision) select owner_id,'clean',1 from actors;
insert into core.product_drafts(owner_id,source_url,title,revision) select owner_id,'https://shop.example.test/product',case when right(auth_user_id::text,1)='1' then 'First product' else 'Foreign product' end,2 from actors;
insert into core.resource_drafts(owner_id,resource_type,source_url,title,revision) select owner_id,'document','https://resource.example.test/document','Original resource',2 from actors;
insert into core.product_preparations(product_id,owner_id,destinations,revision) select id,owner_id,'[{"provider_key":"external:shop.example.test","destination_url":"https://shop.example.test/product"}]',4 from core.product_drafts where owner_id in(select owner_id from actors);
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,lifecycle_state,published_at)
 select item_id,owner_id,item_type,spill_reference,2,'{"original":true}','hidden',now() from core.spill_item_identity_registry where owner_id in(select owner_id from actors) and item_type='resource';

create function pg_temp.create_product(subject uuid,key text,title text,source text default null) returns jsonb language sql as $$
 select api.execute_owner_product_creation_server(subject,'create_current_owner_product_draft',jsonb_build_object('input_draft',jsonb_build_object('creation_id',key,'title',title,'source_url',source)))
$$;
create function pg_temp.catalog(subject uuid,cursor bigint default null) returns jsonb language sql as $$
 select api.execute_owner_resource_catalog_server(subject,'resolve_current_owner_spill_manager',jsonb_build_object('input_reference',cursor))
$$;
create function pg_temp.item(subject uuid,ref bigint) returns jsonb language sql as $$
 select api.execute_owner_resource_catalog_server(subject,'resolve_current_owner_item_recovery',jsonb_build_object('input_reference',ref))
$$;
create temporary table saved_public as select to_jsonb(p) snapshot from core.spill_item_publications p where owner_id in(select owner_id from actors);

insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select auth_user_id,owner_id,'image/png',100,'staging/profile/'||owner_id||'/'||auth_user_id,'consumed',now()+interval '1 hour',now() from actors;
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select auth_user_id::text,owner_id,'working/profile/'||auth_user_id||'.webp','image/webp',100,100,100,auth_user_id from actors;
update core.product_preparations p set primary_asset_key=a.auth_user_id::text from actors a where p.owner_id=a.owner_id;
create function pg_temp.destinations(subject uuid,ref bigint) returns jsonb language sql as $$
 select api.execute_owner_product_destinations_server(subject,'resolve_current_owner_product_destinations',jsonb_build_object('input_reference',ref))$$;
create function pg_temp.save_destinations(subject uuid,ref bigint,source bigint,preparation bigint,links jsonb) returns jsonb language sql as $$
 select api.execute_owner_product_destinations_server(subject,'save_current_owner_product_destinations',jsonb_build_object('input_working',jsonb_build_object('reference',ref,'base_source_revision',source,'base_preparation_revision',preparation,'destinations',links)))$$;
create temporary table saved_sources as select to_jsonb(s) snapshot from core.workspace_item_sources s where owner_id in(select owner_id from actors);
set local request.jwt.claims='{"role":"service_role","sub":"26900000-0000-4000-8000-000000000002"}';
set local request.jwt.claim.sub='26900000-0000-4000-8000-000000000002';
set local role service_role;
select is(pg_temp.destinations('26900000-0000-4000-8000-000000000001',1)->>'preparation_revision','4','Reads legacy independent revision');
select is(pg_temp.destinations('26900000-0000-4000-8000-000000000001',1)->>'has_primary_image','true','Retained image recognition');
select is(pg_temp.destinations('26900000-0000-4000-8000-000000000001',2)->>'status','unavailable','Resource denied');
select is(pg_temp.destinations('26900000-0000-4000-8000-000000000001',999)->>'status','unavailable','Unknown same unavailable');
select is(pg_temp.create_product('26900000-0000-4000-8000-000000000001','26900000-0000-4000-8000-000000000010','General Product')->>'reference','3','Independent Product');
select is(pg_temp.destinations('26900000-0000-4000-8000-000000000001',3)->'preparation_revision','null'::jsonb,'Read creates no preparation');
select is(pg_temp.destinations('26900000-0000-4000-8000-000000000002',3)->>'status','unavailable','Foreign Product denied');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000002',3,1,null,'[]')->>'status','unavailable','Cross-owner save denied');
select is(api.execute_owner_product_destinations_server('26900000-0000-4000-8000-000000000001','resolve_current_owner_product_destinations','{"input_reference":1,"owner_id":"foreign"}')->>'status','unavailable','Extra selector denied');
select is(api.execute_owner_product_destinations_server('26900000-0000-4000-8000-000000000001','publish_current_onboarding','{}')->>'status','unavailable','Arbitrary operation denied');
select is(api.execute_owner_product_destinations_server('26900000-0000-4000-8000-000000000001','save_current_owner_product_destinations','{"input_working":{"reference":1,"base_source_revision":2,"base_preparation_revision":4,"destinations":[],"primary_asset_key":"26900000-0000-4000-8000-000000000002"}}')->>'status','invalid_working','Destination command cannot change any image selection');
select is(api.execute_owner_product_destinations_server('26900000-0000-4000-8000-000000000001','save_current_owner_product_destinations','{"input_working":[]}')->>'status','invalid_working','Scalar/array Working denied safely');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',3,1,null,'[{"provider_key":"shopee","destination_url":"https://shopee.co.id/item?affiliate=owner"}]')->>'preparation_revision','1','General Product first destination save');
select is(pg_temp.destinations('26900000-0000-4000-8000-000000000001',3)#>>'{destinations,0,destination_url}','https://shopee.co.id/item?affiliate=owner','Affiliate attribution retained');
select is(pg_temp.item('26900000-0000-4000-8000-000000000001',3)#>>'{item,destinations,0,provider_key}','shopee','Existing bounded editor projection sees new preparation');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',3,1,null,'[]')->>'status','stale_write','Old base cannot overwrite');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',3,2,1,'[]')->>'status','stale_source','Changed source base denied');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',2,2,null,'[]')->>'status','unavailable','Resource destination write denied');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',3,1,1,'[{"provider_key":"shopee","destination_url":"https://shopee.co.id/item"},{"provider_key":"shopee","destination_url":"https://shopee.co.id/other"}]')->>'status','invalid_destinations','Duplicate provider denied');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',3,1,1,'[{"provider_key":"external:127.0.0.1","destination_url":"http://127.0.0.1/private"}]')->>'status','invalid_destinations','Local URL denied');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',3,1,1,'[{"provider_key":"shopee","destination_url":"https://shopee.co.id.attacker.test/item"}]')->>'status','invalid_destinations','Provider spoof denied');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',1,2,4,'[{"provider_key":"tokopedia","destination_url":"https://tokopedia.com/item"}]')->>'preparation_revision','5','Legacy destination editor uses independent CAS');
select is(pg_temp.destinations('26900000-0000-4000-8000-000000000001',1)->>'has_primary_image','true','Destination save retains image');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',1,2,5,'[{"provider_key":"shopee","destination_url":"https://shopee.co.id/one"},{"provider_key":"tokopedia","destination_url":"https://tokopedia.com/two"}]')->>'preparation_revision','6','Additional marketplace saved in chosen order');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',1,2,6,'[{"provider_key":"tokopedia","destination_url":"https://tokopedia.com/two"},{"provider_key":"shopee","destination_url":"https://shopee.co.id/one"}]')#>>'{destinations,0,provider_key}','tokopedia','Explicit reordering is retained');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',3,1,1,'[]')->>'preparation_revision','2','Removing destinations is saved privately');
select is(current_setting('request.jwt.claim.sub'),'26900000-0000-4000-8000-000000000002','Gateway restores subject');
reset role;
select is((select count(*) from core.workspace_product_preparations),1::bigint,'One general preparation');
select is((select primary_asset_key from core.product_preparations where owner_id=(select owner_id from actors where auth_user_id='26900000-0000-4000-8000-000000000001')),'26900000-0000-4000-8000-000000000001','Exact original image retained');
update core.workspace_product_preparations set primary_asset_key='26900000-0000-4000-8000-000000000001';
select throws_ok($q$update core.workspace_product_preparations set primary_asset_key='26900000-0000-4000-8000-000000000002'$q$,'23503',null,'Foreign image FK denied');
set local role service_role;
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',3,1,2,'[{"provider_key":"external:shop.example.test","destination_url":"https://shop.example.test/new"}]')->>'preparation_revision','3','Replace after remove');
reset role;
select is((select primary_asset_key from core.workspace_product_preparations),'26900000-0000-4000-8000-000000000001','General destination save retains selected image');
select is((select jsonb_agg(to_jsonb(p) order by p.item_id) from core.spill_item_publications p where owner_id in(select owner_id from actors)),(select jsonb_agg(snapshot order by snapshot->>'item_id') from saved_public),'Published unchanged');
select is((select count(*) from core.product_drafts where owner_id in(select owner_id from actors)),2::bigint,'Setup sources retain uniqueness');
select ok(not exists(select 1 from saved_sources x join core.workspace_item_sources y on y.id=(x.snapshot->>'id')::uuid where to_jsonb(y) is distinct from x.snapshot),'Original Product and Resource sources unchanged');
select ok(not exists(select 1 from core.starter_item_working where owner_id in(select owner_id from actors)),'No raw Item Working changes');
create function pg_temp.reject_destination() returns trigger language plpgsql as $$begin raise exception 'fixture destination failure';end;$$;
create trigger destination_failure before update on core.workspace_product_preparations for each row execute function pg_temp.reject_destination();
set local role service_role;
select throws_ok($q$select pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',3,1,3,'[]')$q$,'P0001','fixture destination failure','Failure rolls back preparation');
select is(current_setting('request.jwt.claim.sub'),'26900000-0000-4000-8000-000000000002','Exception restores claims');
reset role;
drop trigger destination_failure on core.workspace_product_preparations;
select is((select revision from core.workspace_product_preparations),3::bigint,'Failed mutation leaves revision');
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,lifecycle_state,published_at)
 select item_id,owner_id,item_type,spill_reference,1,'{"fixture":true}','archived',now() from core.spill_item_identity_registry where owner_id=(select owner_id from actors where auth_user_id='26900000-0000-4000-8000-000000000001') and spill_reference=3;
set local role service_role;
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',3,1,3,'[]')->>'status','owner_not_eligible','Archived Product denied');
reset role;
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='26900000-0000-4000-8000-000000000001');
set local role service_role;
select is(pg_temp.destinations('26900000-0000-4000-8000-000000000001',1)->>'status','unavailable','Restricted read denied');
select is(pg_temp.save_destinations('26900000-0000-4000-8000-000000000001',1,2,5,'[]')->>'status','owner_not_eligible','Restricted mutation denied');
reset role;
select * from finish();
rollback;

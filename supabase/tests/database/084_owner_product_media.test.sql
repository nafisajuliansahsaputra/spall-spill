begin;
select no_plan();
select ok((select relrowsecurity from pg_class where oid='core.product_media_upload_bindings'::regclass),'Media binding RLS');
select ok(not has_table_privilege('service_role','core.product_media_upload_bindings','SELECT'),'Raw binding denied');
select ok(not has_function_privilege('authenticated','api.create_product_media_upload_intent_server(uuid,bigint,text,bigint)','EXECUTE'),'Owner cannot spoof service create');
select ok(not has_function_privilege('anon','api.resolve_product_media_upload_intent_server(uuid,bigint,uuid)','EXECUTE'),'Anonymous claim denied');
select ok(not has_function_privilege('service_role','api.save_current_owner_product_image(jsonb)','EXECUTE'),'Direct image mutator closed');
set local role authenticated;
select throws_ok($q$select api.create_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',1,'image/png',100)$q$,'42501',null,'Actual actor spoof denied');
reset role;
insert into auth.users(id,email) values('27000000-0000-4000-8000-000000000001','starter-one@example.test'),('27000000-0000-4000-8000-000000000002','starter-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in('27000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000002');
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind) select 'catalog270-'||right(auth_user_id::text,6),owner_id,'current' from actors;
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

create temporary table media270(subject uuid,intent uuid);
grant select,insert on media270 to service_role;
create function pg_temp.image_read(subject uuid,ref bigint) returns jsonb language sql as $$select api.execute_owner_product_image_server(subject,'resolve_current_owner_product_image',jsonb_build_object('input_reference',ref))$$;
create function pg_temp.image_save(subject uuid,ref bigint,source bigint,preparation bigint,asset text) returns jsonb language sql as $$select api.execute_owner_product_image_server(subject,'save_current_owner_product_image',jsonb_build_object('input_working',jsonb_build_object('reference',ref,'base_source_revision',source,'base_preparation_revision',preparation,'primary_asset_key',asset)))$$;
set local request.jwt.claims='{"role":"service_role","sub":"27000000-0000-4000-8000-000000000002"}';
set local request.jwt.claim.sub='27000000-0000-4000-8000-000000000002';
set local role service_role;
select is(pg_temp.create_product('27000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000010','General Product')->>'reference','3','General Product ready without re-onboarding');
select is(api.create_profile_media_upload_intent_server('27000000-0000-4000-8000-000000000001','image/png',100)->>'status','owner_not_eligible','Old onboarding upload remains closed for completed Owner');
select is(api.create_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',2,'image/png',100)->>'status','owner_not_eligible','Resource cannot use Product upload');
select is(api.create_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',999,'image/png',100)->>'status','owner_not_eligible','Unknown ref cannot allocate');
select is(api.create_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',1,'image/svg+xml',100)->>'status','invalid_content_type','Unsupported MIME denied');
select is(api.create_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',1,'image/png',5242881)->>'status','invalid_byte_size','Oversize source denied');
insert into media270 values('27000000-0000-4000-8000-000000000001',(api.create_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',1,'image/png',100)->>'upload_intent_id')::uuid);
select is(api.resolve_product_media_upload_intent_server('27000000-0000-4000-8000-000000000002',1,(select intent from media270))->>'status','intent_missing','Foreign Owner cannot claim intent');
select is(api.resolve_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',3,(select intent from media270))->>'status','intent_missing','Own other Product cannot claim intent');
select is(api.complete_product_media_upload_server('27000000-0000-4000-8000-000000000001',1,(select intent from media270),'27000000-0000-4000-8000-000000000011','working/profile/27000000-0000-4000-8000-000000000011.webp','image/webp',90,16,12)->>'status','rejected','Completion cannot bypass exclusive processing claim');
select is(api.resolve_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',1,(select intent from media270))->>'status','success','First claim owns processing');
select is(api.resolve_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',1,(select intent from media270))->>'status','processing','Duplicate cannot process twice');
select is(api.complete_product_media_upload_server('27000000-0000-4000-8000-000000000001',3,(select intent from media270),'27000000-0000-4000-8000-000000000011','working/profile/27000000-0000-4000-8000-000000000011.webp','image/webp',90,16,12)->>'status','intent_missing','Completion is also Product-bound');
select is(api.complete_product_media_upload_server('27000000-0000-4000-8000-000000000001',1,(select intent from media270),'27000000-0000-4000-8000-000000000011','working/profile/27000000-0000-4000-8000-000000000011.webp','image/webp',90,2049,12)->>'status','invalid_asset_metadata','Hostile canonical metadata denied');
select is(api.complete_product_media_upload_server('27000000-0000-4000-8000-000000000001',1,(select intent from media270),'27000000-0000-4000-8000-000000000011','working/profile/27000000-0000-4000-8000-000000000011.webp','image/webp',90,16,12)->>'status','success','Canonical registration consumes own intent');
select is(api.resolve_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',1,(select intent from media270))->>'status','consumed','Lost finalization reply recovers consumed asset');
select is(api.complete_product_media_upload_server('27000000-0000-4000-8000-000000000001',1,(select intent from media270),'27000000-0000-4000-8000-000000000012','working/profile/27000000-0000-4000-8000-000000000012.webp','image/webp',90,16,12)->>'asset_key','27000000-0000-4000-8000-000000000011','Duplicate completion returns original immutable asset');
select is(pg_temp.image_read('27000000-0000-4000-8000-000000000001',1)->'primary_asset_key','null'::jsonb,'Upload does not attach image');
select is(pg_temp.image_save('27000000-0000-4000-8000-000000000001',1,2,4,'27000000-0000-4000-8000-000000000011')->>'preparation_revision','5','Explicit image selection save');
select is(pg_temp.item('27000000-0000-4000-8000-000000000001',1)#>>'{item,has_primary_image}','true','Bounded Item reader recognizes image');
select is(pg_temp.image_save('27000000-0000-4000-8000-000000000001',1,2,4,null)->>'status','stale_write','Old preparation cannot overwrite image');
select is(pg_temp.image_save('27000000-0000-4000-8000-000000000001',1,1,5,null)->>'status','stale_source','Old source cannot overwrite image');
select is(pg_temp.image_save('27000000-0000-4000-8000-000000000002',1,2,4,'27000000-0000-4000-8000-000000000011')->>'status','invalid_image','Foreign canonical asset denied');
select is(pg_temp.image_save('27000000-0000-4000-8000-000000000001',3,1,null,'27000000-0000-4000-8000-000000000011')->>'preparation_revision','1','Same Owner canonical asset can be used by general Product');
select is(pg_temp.image_read('27000000-0000-4000-8000-000000000002',3)->>'status','unavailable','Foreign Product image read denied');
select is(api.execute_owner_product_image_server('27000000-0000-4000-8000-000000000001','save_current_owner_product_image','{"input_working":{"reference":1,"base_source_revision":2,"base_preparation_revision":5,"primary_asset_key":null,"destinations":[]}}')->>'status','invalid_working','Image save cannot change destinations');
select is(pg_temp.image_save('27000000-0000-4000-8000-000000000001',1,2,5,null)->>'preparation_revision','6','Explicit removal retained privately');
select is(pg_temp.item('27000000-0000-4000-8000-000000000001',1)#>>'{item,destinations,0,destination_url}','https://shop.example.test/product','Destination exactly preserved by image changes');
select is(current_setting('request.jwt.claim.sub'),'27000000-0000-4000-8000-000000000002','Image gateway restores subject');
reset role;
select is((select count(*) from core.profile_media_assets where owner_id in(select owner_id from actors)),1::bigint,'One canonical asset despite duplicate completion');
select is((select count(*) from core.product_media_upload_bindings),1::bigint,'Invalid attempts allocate no binding');
select throws_ok($q$delete from core.profile_media_assets where asset_key='27000000-0000-4000-8000-000000000011'$q$,'23503',null,'Referenced canonical asset still cannot be deleted ordinarily');
select throws_ok($q$update core.product_media_upload_bindings set spill_reference=3$q$,'23514','Product media binding is immutable.','Intent cannot be reparented');
select is((select jsonb_agg(to_jsonb(p) order by p.item_id) from core.spill_item_publications p where owner_id in(select owner_id from actors)),(select jsonb_agg(snapshot order by snapshot->>'item_id') from saved_public),'Published state unchanged');
select ok(not exists(select 1 from core.starter_item_working where owner_id in(select owner_id from actors)),'Raw Item Working unchanged');
create temporary table expired270 as select (api.create_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',1,'image/png',100)->>'upload_intent_id')::uuid intent;
grant select on expired270 to service_role;
update core.profile_media_upload_intents set created_at=now()-interval '10 minutes',expires_at=now()-interval '5 minutes' where id=(select intent from expired270);
set local role service_role;
select is(api.resolve_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',1,(select intent from expired270))->>'status','expired','Expired intent never creates a staging read capability');
select is(api.complete_product_media_upload_server('27000000-0000-4000-8000-000000000001',1,(select intent from expired270),'27000000-0000-4000-8000-000000000012','working/profile/27000000-0000-4000-8000-000000000012.webp','image/webp',90,16,12)->>'status','expired','Expired intent cannot register canonical media');
reset role;
create function pg_temp.reject_image() returns trigger language plpgsql as $$begin raise exception 'fixture image failure';end;$$;
create trigger image_failure before update on core.workspace_product_preparations for each row execute function pg_temp.reject_image();
set local role service_role;
select throws_ok($q$select pg_temp.image_save('27000000-0000-4000-8000-000000000001',3,1,1,null)$q$,'P0001','fixture image failure','Selection failure rolls back revision and image');
reset role;
drop trigger image_failure on core.workspace_product_preparations;
select is((select revision from core.workspace_product_preparations),1::bigint,'Failed selection leaves revision unchanged');
create function pg_temp.reject_owner_media_delete() returns trigger language plpgsql as $$begin raise exception 'fixture owner deletion blocked';end;$$;
create trigger zz_owner_media_delete_failure before delete on core.owners for each row execute function pg_temp.reject_owner_media_delete();
select throws_ok($q$delete from core.owners where id=(select owner_id from actors where auth_user_id='27000000-0000-4000-8000-000000000001')$q$,'P0001','fixture owner deletion blocked','Blocked Owner deletion rolls back preparation cleanup');
select is((select count(*) from core.workspace_product_preparation_sources where owner_id=(select owner_id from actors where auth_user_id='27000000-0000-4000-8000-000000000001')),2::bigint,'Both legacy and general preparation retained after rollback');
drop trigger zz_owner_media_delete_failure on core.owners;
select is(pg_temp.image_read('27000000-0000-4000-8000-000000000001',3)->>'primary_asset_key','27000000-0000-4000-8000-000000000011','Failed Owner deletion retains exact selected canonical asset');
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,lifecycle_state,published_at)
 select item_id,owner_id,item_type,spill_reference,1,'{"fixture":true}','archived',now() from core.spill_item_identity_registry where owner_id=(select owner_id from actors where auth_user_id='27000000-0000-4000-8000-000000000001') and spill_reference=3;
set local role service_role;
select is(api.create_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',3,'image/png',100)->>'status','owner_not_eligible','Archived Product cannot start upload');
select is(pg_temp.image_save('27000000-0000-4000-8000-000000000001',3,1,1,null)->>'status','owner_not_eligible','Archived Product cannot change image');
reset role;
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='27000000-0000-4000-8000-000000000001');
set local role service_role;
select is(api.resolve_product_media_upload_intent_server('27000000-0000-4000-8000-000000000001',1,(select intent from media270))->>'status','owner_not_eligible','Restricted Owner cannot recover even own asset capability');
select is(pg_temp.image_read('27000000-0000-4000-8000-000000000001',1)->>'status','unavailable','Restricted read denied');
reset role;
select * from finish();
rollback;

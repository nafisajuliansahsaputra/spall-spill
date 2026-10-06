begin;
select no_plan();
select ok(has_function_privilege('service_role','api.resolve_published_identity_media_server(text)','EXECUTE'),'Only server role may resolve private media metadata');
select ok(not has_function_privilege('anon','api.resolve_published_identity_media_server(text)','EXECUTE'),'Anonymous descriptor access denied');
select ok(not has_function_privilege('authenticated','api.resolve_published_identity_media_server(text)','EXECUTE'),'Authenticated descriptor access denied');
select ok(not has_table_privilege('service_role','core.profile_media_assets','SELECT'),'No direct service asset reads');
select ok(not has_table_privilege('service_role','core.identity_publications','SELECT'),'No direct service publication reads');
select ok(not has_function_privilege('authenticated','api.publish_current_onboarding(uuid,text,text)','EXECUTE'),'Publish remains withheld');
select ok(not has_function_privilege('anon','api.resolve_public_identity(text)','EXECUTE'),'Public readers remain withheld');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='api.resolve_published_identity_media_server(text)'::regprocedure),'Narrow definer uses empty search path');

insert into auth.users(id,email) values
 ('82000000-0000-4000-8000-000000000001','media-one@example.test'),
 ('82000000-0000-4000-8000-000000000002','media-two@example.test');
create temporary table media_owners as select * from core.owner_auth_bindings
 where auth_user_id in ('82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated","sub":"82000000-0000-4000-8000-000000000001"}';
select is(api.claim_current_owner_handle('media-one',1)->>'status','success','Current Handle');
select is(api.set_current_owner_primary_use_case('personal',2)->>'status','success','Universal guidance');
select is(api.save_current_owner_basic_identity('Media Owner',null,null,3)->>'status','success','Private Identity');
select is(api.save_current_owner_starter_composition('clean',null,4)->>'status','success','Private layout');
select is(api.claim_current_owner_handle('media-renamed',5)->>'status','success','Alias protected');
set local request.jwt.claims='{"role":"authenticated","sub":"82000000-0000-4000-8000-000000000002"}';
select is(api.claim_current_owner_handle('media-two',1)->>'status','success','Other private Handle');
reset role;

-- Isolated privileged fixtures exercise transport visibility. They do not enable
-- first Publish or claim actual provider image delivery.
create temporary table media_fixtures(asset_key uuid,auth_id uuid,status core.profile_media_upload_status);
insert into media_fixtures values
 ('82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','consumed'),
 ('82000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','consumed'),
 ('82000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001','consumed'),
 ('82000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000001','pending');
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select f.asset_key,o.owner_id,'image/png',100,'staging/profile/'||f.asset_key||'/'||f.asset_key,f.status,
 now()+interval '1 hour',case when f.status='consumed' then now() else null end
 from media_fixtures f join media_owners o on o.auth_user_id=f.auth_id;
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select f.asset_key::text,o.owner_id,'working/profile/'||f.asset_key||'.webp','image/webp',12,100,100,f.asset_key
 from media_fixtures f join media_owners o on o.auth_user_id=f.auth_id;
set local role service_role;
select is(api.resolve_published_identity_media_server('media-renamed'),' {"status":"unavailable"}'::jsonb,'Private assets alone never become public');
select is(api.resolve_published_identity_media_server('media-two'),api.resolve_published_identity_media_server('unknown-owner'),'Known private and unknown Owner uniformly unavailable');
reset role;
insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,published_at)
 select owner_id,'{"display_name":"Published Media","profile_asset_key":"82000000-0000-4000-8000-000000000001"}',1,1,now()
 from media_owners where auth_user_id='82000000-0000-4000-8000-000000000001';
set local role service_role;
select is(api.resolve_published_identity_media_server('media-renamed'),' {"status":"unavailable"}'::jsonb,'Incomplete onboarding remains unavailable even with a fixture publication');
reset role;
update core.owners set onboarding_completed_at=now() where id=(select owner_id from media_owners where auth_user_id='82000000-0000-4000-8000-000000000001');
set local role service_role;
select is(api.resolve_published_identity_media_server('media-renamed')->>'status','success','Published finalized same-Owner media resolved');
select is(api.resolve_published_identity_media_server('MEDIA-RENAMED'),api.resolve_published_identity_media_server('media-one'),'Case and protected alias resolve exact current publication');
select is(api.resolve_published_identity_media_server('media-one')->>'current_handle','media-renamed','Alias reports canonical Handle internally');
select is(api.resolve_published_identity_media_server('media-one')->>'object_key','working/profile/82000000-0000-4000-8000-000000000001.webp','Only exact Published object selected');
select ok(not(api.resolve_published_identity_media_server('media-one') ?| array['owner_id','auth_user_id','receipt_id','identity_revision','asset_key']),'Unneeded private authority fields excluded');
select is(api.resolve_published_identity_media_server('../media-one'),' {"status":"unavailable"}'::jsonb,'Path locator rejected');
select is(api.resolve_published_identity_media_server(' media-one'),' {"status":"unavailable"}'::jsonb,'Whitespace rejected');
select is(api.resolve_published_identity_media_server(null),' {"status":"unavailable"}'::jsonb,'Null rejected');
reset role;
create temporary table prior_media as select api.resolve_published_identity_media_server('media-one') as descriptor;
update core.identity_working set profile_asset_key='82000000-0000-4000-8000-000000000003',revision=revision+1
 where owner_id=(select owner_id from media_owners where auth_user_id='82000000-0000-4000-8000-000000000001');
select is(api.resolve_published_identity_media_server('media-one'),(select descriptor from prior_media),'New Working media cannot change Published image/token');
update core.identity_publications set snapshot=jsonb_set(snapshot,'{profile_asset_key}','"82000000-0000-4000-8000-000000000002"');
select is(api.resolve_published_identity_media_server('media-one'),' {"status":"unavailable"}'::jsonb,'Foreign Owner asset denied even in malformed fixture snapshot');
update core.identity_publications set snapshot=jsonb_set(snapshot,'{profile_asset_key}','"82000000-0000-4000-8000-000000000004"');
select is(api.resolve_published_identity_media_server('media-one'),' {"status":"unavailable"}'::jsonb,'Unfinalized intent never public');
update core.identity_publications set snapshot=jsonb_set(snapshot,'{profile_asset_key}','"ffffffff-ffff-4fff-8fff-ffffffffffff"');
select is(api.resolve_published_identity_media_server('media-one'),' {"status":"unavailable"}'::jsonb,'Missing asset unavailable');
update core.identity_publications set snapshot=jsonb_set(snapshot,'{profile_asset_key}','null');
select is(api.resolve_published_identity_media_server('media-one'),' {"status":"unavailable"}'::jsonb,'Optional absent image yields no media bytes');
update core.identity_publications set snapshot=jsonb_set(snapshot,'{profile_asset_key}','"82000000-0000-4000-8000-000000000003"');
select is(api.resolve_published_identity_media_server('media-one')->>'status','success','Explicit new Published selection changes media');
select isnt(api.resolve_published_identity_media_server('media-one')->>'publication_token',(select descriptor->>'publication_token' from prior_media),'Publication replacement invalidates exact token');
update core.identity_publications set lifecycle_state='hidden';
select is(api.resolve_published_identity_media_server('media-one'),' {"status":"unavailable"}'::jsonb,'Hidden Identity denies media');
update core.identity_publications set lifecycle_state='archived';
select is(api.resolve_published_identity_media_server('media-one'),' {"status":"unavailable"}'::jsonb,'Archived Identity denies media');
update core.identity_publications set lifecycle_state='published';
update core.owners set account_state='restricted' where id=(select owner_id from media_owners where auth_user_id='82000000-0000-4000-8000-000000000001');
select is(api.resolve_published_identity_media_server('media-one'),' {"status":"unavailable"}'::jsonb,'Restricted Owner denies media');
select is((select count(*) from core.identity_publications),1::bigint,'Reads create no publications');
select is((select count(*) from core.spill_item_publications),0::bigint,'Reads create no Product/Resource publication');
select * from finish();
rollback;

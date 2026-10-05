begin;
select no_plan();
select ok((select relrowsecurity from pg_class where oid='core.product_preparations'::regclass),'Private preparation has RLS');
select ok(not has_table_privilege('authenticated','core.product_preparations','SELECT'),'No direct Owner preparation reads');
select ok(not has_table_privilege('anon','core.product_preparations','SELECT'),'No anonymous preparation reads');
select ok(not has_table_privilege('service_role','core.product_preparations','INSERT'),'No service-role preparation writes');
select ok(not has_function_privilege('anon','api.save_current_product_preparation(text,jsonb,bigint,bigint)','EXECUTE'),'No anonymous preparation endpoint');
select ok(not has_function_privilege('service_role','api.save_current_product_preparation(text,jsonb,bigint,bigint)','EXECUTE'),'No service-role Owner endpoint');
select ok(not has_function_privilege('authenticated','core.product_marketplace_provider(text)','EXECUTE'),'Internal provider helper is private');
select ok(not has_function_privilege('authenticated','api.publish_current_onboarding(uuid,text,text)','EXECUTE'),'Publication remains withheld');
select ok(not has_function_privilege('anon','api.resolve_public_identity(text)','EXECUTE'),'Public readers remain withheld');
select ok((select prosecdef from pg_proc where oid='api.save_current_product_preparation(text,jsonb,bigint,bigint)'::regprocedure),'Narrow save is definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='api.save_current_product_preparation(text,jsonb,bigint,bigint)'::regprocedure),'Save uses empty search path');

insert into auth.users(id,email) values
 ('81000000-0000-4000-8000-000000000001','prep-one@example.test'),
 ('81000000-0000-4000-8000-000000000002','prep-two@example.test');
create temporary table prep_owners as select * from core.owner_auth_bindings
 where auth_user_id in ('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated"}';
select is(api.save_current_product_preparation(null,'[]',1,null)->>'status','unauthenticated','No authenticated subject denied');
set local request.jwt.claims='{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000001"}';
select is(api.save_current_product_preparation(null,'[]',1,null)->>'status','step_not_available','S1 cannot bypass prerequisites');
select is(api.claim_current_owner_handle('prep-one',1)->>'status','success','First Handle');
select is(api.set_current_owner_primary_use_case('affiliate',2)->>'status','success','First guidance');
select is(api.save_current_owner_basic_identity('Product Owner',null,null,3)->>'status','success','First Identity');
select is(api.save_current_owner_starter_composition('business',null,4)->>'status','success','First starter');
select is(api.resolve_current_product_preparation()->'preparation','null'::jsonb,'Read creates no preparation');
select is(api.save_current_product_preparation(null,'[]',1,null)->>'status','product_missing','No empty Product creation');
select is(api.save_current_owner_product_draft('https://shopee.co.id/item?affiliate=creator','Saved Product',null)->>'status','success','Durable Product');
select is(api.resolve_current_product_preparation()->>'product_revision','1','Resolver binds current Product revision');
select is(api.save_current_product_preparation(null,'[]',1,null)->'preparation'->>'revision','1','Incomplete private preparation may save');
reset role;
select is((select count(*) from core.product_preparations),1::bigint,'One private preparation only after explicit save');

-- Seed finalized same-Owner canonical media; byte processing is tested by sanitizer suites.
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
select auth_user_id,owner_id,'image/png',100,'staging/profile/'||owner_id||'/'||auth_user_id,'consumed',now()+interval '1 hour',now()
 from prep_owners;
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
select auth_user_id::text,owner_id,'working/profile/'||auth_user_id||'.webp','image/webp',100,100,100,auth_user_id from prep_owners;
set local role authenticated;
select is(api.save_current_product_preparation('81000000-0000-4000-8000-000000000002','[]',1,1)->>'status','invalid_image','Foreign Owner image denied');
select is(api.save_current_product_preparation('ffffffff-ffff-4fff-8fff-ffffffffffff','[]',1,1)->>'status','invalid_image','Missing/staging asset denied');
select is(api.save_current_product_preparation(null,'[{"provider_key":"shopee","destination_url":"https://evil.test/item"}]',1,1)->>'status','invalid_destinations','Provider spoofing denied');
select is(api.save_current_product_preparation(null,'[{"provider_key":"shopee","destination_url":"https://shopee.co.id/item"},{"provider_key":"shopee","destination_url":"https://shope.ee/other"}]',1,1)->>'status','invalid_destinations','Duplicate recognized providers denied');
select is(api.save_current_product_preparation(null,'[{"provider_key":"external:example.test","destination_url":"https://example.test/item","safe":true}]',1,1)->>'status','invalid_destinations','Caller cannot assert safety');
select is(api.save_current_product_preparation(null,'{}',1,1)->>'status','invalid_destinations','Non-array denied');
select is(api.save_current_product_preparation(null,'[null]',1,1)->>'status','invalid_destinations','Non-object entry denied');
select is(api.save_current_product_preparation(null,null,1,1)->>'status','invalid_destinations','Null array denied');
select is(api.save_current_product_preparation(null,'[{"provider_key":"external:127.0.0.1","destination_url":"http://127.0.0.1/item"}]',1,1)->>'status','invalid_destinations','IP rejected in SQL boundary');
select is(api.save_current_product_preparation(null,'[{"provider_key":"external:host.internal","destination_url":"https://host.internal/item"}]',1,1)->>'status','invalid_destinations','Local hostname rejected');
select is(api.save_current_product_preparation(null,'[{"provider_key":"external:example.test","destination_url":"https://example.test/item#fragment"}]',1,1)->>'status','invalid_destinations','Fragment rejected');
select is(api.save_current_product_preparation(null,'[{"provider_key":"external:example.test","destination_url":"https://user:password@example.test/item"}]',1,1)->>'status','invalid_destinations','Credentials rejected');
select is(api.save_current_product_preparation(null,'[{"provider_key":"external:example.test","destination_url":"https://example.test:3000/item"}]',1,1)->>'status','invalid_destinations','Nonstandard port rejected');
select is(api.resolve_current_product_preparation()->'preparation'->>'revision','1','Invalid saves retain prior revision');
select is(api.save_current_product_preparation('81000000-0000-4000-8000-000000000001',
 '[{"provider_key":"shopee","destination_url":"https://shopee.co.id/item?affiliate=creator&campaign=A%2FB"},{"provider_key":"external:store.example.test","destination_url":"https://store.example.test/item"}]',1,1)->'preparation'->>'revision','2','Same Owner image and ordered structured destinations save');
select is(api.resolve_current_product_preparation()->'preparation'->'destinations'->0->>'destination_url',
 'https://shopee.co.id/item?affiliate=creator&campaign=A%2FB','Creator attribution preserved');
select is(api.resolve_current_product_preparation()->'preparation'->'destinations'->1->>'provider_key','external:store.example.test','Unknown provider stays neutral hostname context');
select is(api.save_current_product_preparation(null,'[]',1,1)->>'status','stale_write','Stale preparation cannot replace saved image');
select ok(not(api.resolve_current_product_preparation() ?| array['owner_id','product_id','object_key']),'DTO excludes internal authority/storage keys');
select is(api.save_current_owner_product_draft('https://shopee.co.id/new','Changed title',1)->>'status','success','Product text edit');
select is(api.resolve_current_product_preparation()->'preparation'->>'revision','2','Product edit retains preparation');
select is(api.save_current_product_preparation(null,'[]',1,2)->>'status','stale_write','Stale Product revision cannot replace preparation');
select is(api.set_current_owner_primary_use_case('personal',5)->>'status','success','Guidance may change');
select is(api.resolve_current_product_preparation()->'preparation'->>'revision','2','Guidance change retains Product preparation');
select is(api.save_current_product_preparation(null,'[]',2,2)->'preparation'->>'revision','3','Explicit removal remains private');
select is(api.advance_current_owner_relevant_first_job(6)->>'status','success','Advance to preview normally');
select ok(api.resolve_current_onboarding_preview()->'product_draft'->'validation_issues' ? 'product_publication_preparation_pending','Private preparation never enables public Product readiness');
reset role;
select is((select revision from core.product_drafts where owner_id=(select owner_id from prep_owners where auth_user_id='81000000-0000-4000-8000-000000000001')),2::bigint,'Preparation saves alter no Product revision');
select is((select revision from core.identity_working where owner_id=(select owner_id from prep_owners where auth_user_id='81000000-0000-4000-8000-000000000001')),1::bigint,'Preparation alters no Identity revision');
select is((select profile_asset_key from core.identity_working where owner_id=(select owner_id from prep_owners where auth_user_id='81000000-0000-4000-8000-000000000001')),null::text,'Product image does not attach to Identity');
select is((select count(*) from core.spill_item_identity_registry where owner_id=(select owner_id from prep_owners where auth_user_id='81000000-0000-4000-8000-000000000001')),1::bigint,'Preparation allocates no new reference');
select is((select count(*) from core.profile_media_assets),2::bigint,'Removing selection deletes no assets');
select ok(not exists(select 1 from core.identity_publications),'Preparation creates no publication');
select ok(not exists(select 1 from core.external_destination_safety),'SQL never invents safety evidence');
select ok((select onboarding_completed_at is null from core.owners where id=(select owner_id from prep_owners where auth_user_id='81000000-0000-4000-8000-000000000001')),'Preparation never completes onboarding');
update core.owners set account_state='restricted' where id=(select owner_id from prep_owners where auth_user_id='81000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(api.save_current_product_preparation(null,'[]',2,3)->>'status','owner_not_eligible','Restricted Owner denied');
reset role;
update core.owners set account_state='active',onboarding_completed_at=now() where id=(select owner_id from prep_owners where auth_user_id='81000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(api.save_current_product_preparation(null,'[]',2,3)->>'status','owner_not_eligible','Completed Owner cannot use onboarding preparation');
reset role;
update core.owners set onboarding_completed_at=null where id=(select owner_id from prep_owners where auth_user_id='81000000-0000-4000-8000-000000000001');
update core.product_preparations set revision=9007199254740991;
set local role authenticated;
select is(api.save_current_product_preparation(null,'[]',2,9007199254740991)->>'status','revision_exhausted','Revision exhaustion fails closed');
set local request.jwt.claims='{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000002"}';
select is(api.claim_current_owner_handle('prep-two',1)->>'status','success','Second Handle');
select is(api.set_current_owner_primary_use_case('creator',2)->>'status','success','Second guidance');
select is(api.save_current_owner_basic_identity('Other Owner',null,null,3)->>'status','success','Second Identity');
select is(api.save_current_owner_starter_composition('clean',null,4)->>'status','success','Second starter');
select is(api.resolve_current_product_preparation()->'preparation','null'::jsonb,'Other Owner cannot read first preparation');
select is(api.save_current_product_preparation(null,'[]',2,3)->>'status','product_missing','Other Owner cannot target first Product');
reset role;
select * from finish();
rollback;

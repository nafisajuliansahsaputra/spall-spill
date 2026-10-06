begin;
select no_plan();
select ok(not has_function_privilege('anon','api.resolve_current_onboarding_preview()','EXECUTE'),'Private preview remains authenticated only');
select ok(not has_function_privilege('service_role','api.resolve_current_onboarding_preview()','EXECUTE'),'No service current-Owner preview bypass');
select ok(not has_function_privilege('authenticated','api.publish_current_onboarding(uuid,text,text)','EXECUTE'),'Publish still withheld');
select ok(not has_function_privilege('anon','api.resolve_public_identity(text)','EXECUTE'),'Public readers still withheld');
insert into auth.users(id,email) values
 ('83000000-0000-4000-8000-000000000001','preview-prep-one@example.test'),
 ('83000000-0000-4000-8000-000000000002','preview-prep-two@example.test');
create temporary table preview_prep_owners as select * from core.owner_auth_bindings
 where auth_user_id in ('83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated","sub":"83000000-0000-4000-8000-000000000001"}';
select is(api.claim_current_owner_handle('preview-prep-one',1)->>'status','success','First Handle');
select is(api.set_current_owner_primary_use_case('affiliate',2)->>'status','success','Guidance');
select is(api.save_current_owner_basic_identity('Prepared Product Owner',null,null,3)->>'status','success','Identity');
select is(api.save_current_owner_starter_composition('featured',null,4)->>'status','success','Layout');
select is(api.save_current_owner_product_draft('https://shopee.co.id/item?affiliate=creator&campaign=A%2FB','Saved Product',null)->>'status','success','Product Draft');
select is(api.resolve_current_onboarding_preview()->>'status','step_not_available','Preparation cannot skip S5');
select is(api.advance_current_owner_relevant_first_job(5)->>'status','success','Reach S6');
create temporary table prep_snapshots(stage text primary key,preview jsonb);
insert into prep_snapshots values('empty',api.resolve_current_onboarding_preview());
select is(api.resolve_current_onboarding_preview()->'product_draft'->'preparation','null'::jsonb,'Before explicit preparation save preview is null');
reset role;
select is((select count(*) from core.product_preparations),0::bigint,'Reads create no preparation');
select is((select count(*) from core.onboarding_preview_receipts),0::bigint,'Reads create no receipt');
set local role authenticated;
select is(api.save_current_product_preparation(null,
 '[{"provider_key":"shopee","destination_url":"https://shopee.co.id/item?affiliate=creator&campaign=A%2FB"},{"provider_key":"external:store.example.test","destination_url":"https://store.example.test/item"}]',1,null)->>'status','success','Private incomplete preparation save');
insert into prep_snapshots values('prepared',api.resolve_current_onboarding_preview());
select isnt((select preview->>'snapshot_hash' from prep_snapshots where stage='prepared'),(select preview->>'snapshot_hash' from prep_snapshots where stage='empty'),'Independent preparation save changes digest');
select is(api.resolve_current_onboarding_preview()->'product_draft'->'preparation'->>'revision','1','Preparation revision included');
select is(api.resolve_current_onboarding_preview()->'product_draft'->'preparation'->'primary_asset_key','null'::jsonb,'Incomplete image retained');
select is(api.resolve_current_onboarding_preview()->'product_draft'->'preparation'->'destinations'->0->>'destination_url','https://shopee.co.id/item?affiliate=creator&campaign=A%2FB','Exact attribution retained');
select is(api.resolve_current_onboarding_preview()->'product_draft'->'preparation'->'destinations'->1->>'provider_key','external:store.example.test','Unknown provider context retained');
select is(api.resolve_current_onboarding_preview()->'product_draft'->'preparation'->'destinations'->0->'safety'->>'status','pending','Unscanned destination is pending');
select is(api.confirm_current_onboarding_preview((select preview->>'snapshot_hash' from prep_snapshots where stage='empty'))->>'status','stale_preview','Old text-only review cannot confirm preparation');
create temporary table prep_receipts(stage text primary key,receipt jsonb);
insert into prep_receipts values('prepared',api.confirm_current_onboarding_preview(api.resolve_current_onboarding_preview()->>'snapshot_hash'));
select is((select receipt->>'status' from prep_receipts where stage='prepared'),'success','Preparation may be reviewed without publication authority');
reset role;
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select asset_id,owner_id,'image/png',100,'staging/profile/'||asset_id||'/'||asset_id,'consumed',now()+interval '1 hour',now()
 from preview_prep_owners cross join (values('83000000-0000-4000-8000-000000000003'::uuid),('83000000-0000-4000-8000-000000000004'::uuid)) as assets(asset_id)
 where auth_user_id='83000000-0000-4000-8000-000000000001';
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select id::text,owner_id,'working/profile/'||id||'.webp','image/webp',100,100,100,id from core.profile_media_upload_intents
 where id in ('83000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000004');
set local role authenticated;
select is(api.save_current_product_preparation('83000000-0000-4000-8000-000000000003',
 '[{"provider_key":"shopee","destination_url":"https://shopee.co.id/item?affiliate=creator&campaign=A%2FB"},{"provider_key":"external:store.example.test","destination_url":"https://store.example.test/item"}]',1,1)->>'status','success','Image selection save');
insert into prep_snapshots values('image',api.resolve_current_onboarding_preview());
select is(api.resolve_current_onboarding_preview()->'product_draft'->'preparation'->>'primary_asset_key','83000000-0000-4000-8000-000000000003','Exact selected image included');
select isnt((select preview->>'snapshot_hash' from prep_snapshots where stage='image'),(select preview->>'snapshot_hash' from prep_snapshots where stage='prepared'),'Image changes digest');
select is(api.confirm_current_onboarding_preview((select receipt->>'snapshot_hash' from prep_receipts where stage='prepared'))->>'status','stale_preview','Old receipt digest cannot re-confirm changed image');
reset role;
select is((select receipt_id::text from core.onboarding_preview_receipts),(select receipt->>'receipt_id' from prep_receipts where stage='prepared'),'Stale confirmation leaves existing receipt intact');
set local role authenticated;
insert into prep_receipts values('image',api.confirm_current_onboarding_preview(api.resolve_current_onboarding_preview()->>'snapshot_hash'));
select isnt((select receipt->>'receipt_id' from prep_receipts where stage='image'),(select receipt->>'receipt_id' from prep_receipts where stage='prepared'),'New digest rotates receipt');
select is(api.save_current_product_preparation('83000000-0000-4000-8000-000000000004',
 '[{"provider_key":"external:store.example.test","destination_url":"https://store.example.test/item"},{"provider_key":"shopee","destination_url":"https://shopee.co.id/item?affiliate=creator&campaign=A%2FB"}]',1,2)->>'status','success','Replacement image and explicit ordering save');
insert into prep_snapshots values('reordered',api.resolve_current_onboarding_preview());
select is(api.resolve_current_onboarding_preview()->'product_draft'->'preparation'->'destinations'->0->>'provider_key','external:store.example.test','Saved array order is authoritative');
select isnt((select preview->>'snapshot_hash' from prep_snapshots where stage='reordered'),(select preview->>'snapshot_hash' from prep_snapshots where stage='image'),'Replacement/order changes digest');
reset role;
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at) values
 ('https://shopee.co.id/item?affiliate=creator&campaign=A%2FB',encode(extensions.digest('https://shopee.co.id/item?affiliate=creator&campaign=A%2FB','sha256'),'hex'),'safe','preview-fixture',now(),now()+interval '1 hour'),
 ('https://store.example.test/item',encode(extensions.digest('https://store.example.test/item','sha256'),'hex'),'safe','preview-fixture',now(),now()+interval '1 hour');
set local role authenticated;
insert into prep_snapshots values('safe',api.resolve_current_onboarding_preview());
select is(api.resolve_current_onboarding_preview()->'product_draft'->'preparation'->'destinations'->0->'safety'->>'status','safe','Each exact destination carries current safety');
select ok(api.resolve_current_onboarding_preview()->'product_draft'->'validation_issues' ? 'product_publication_preparation_pending','Safe complete preparation never clears publication gate');
select isnt((select preview->>'snapshot_hash' from prep_snapshots where stage='safe'),(select preview->>'snapshot_hash' from prep_snapshots where stage='reordered'),'Safety evidence changes digest');
reset role;
update core.external_destination_safety set revision=revision+1 where normalized_url='https://store.example.test/item';
set local role authenticated;
insert into prep_snapshots values('verdict_revision',api.resolve_current_onboarding_preview());
select isnt((select preview->>'snapshot_hash' from prep_snapshots where stage='verdict_revision'),(select preview->>'snapshot_hash' from prep_snapshots where stage='safe'),'Verdict revision changes digest even with unchanged safe status');
reset role;
update core.external_destination_safety set checked_at=now()-interval '10 minutes',expires_at=now()-interval '1 second' where normalized_url='https://store.example.test/item';
set local role authenticated;
insert into prep_snapshots values('expired',api.resolve_current_onboarding_preview());
select is(api.resolve_current_onboarding_preview()->'product_draft'->'preparation'->'destinations'->0->'safety'->>'status','pending','Expired verdict is not currently safe');
select isnt((select preview->>'snapshot_hash' from prep_snapshots where stage='expired'),(select preview->>'snapshot_hash' from prep_snapshots where stage='verdict_revision'),'Expiry changes digest');
select is(api.save_current_product_preparation(null,'[]',1,1)->>'status','stale_write','Stale preparation write denied');
select is(api.resolve_current_onboarding_preview(),(select preview from prep_snapshots where stage='expired'),'Denied write leaves whole preview unchanged');
insert into prep_receipts values('expired',api.confirm_current_onboarding_preview(api.resolve_current_onboarding_preview()->>'snapshot_hash'));
reset role;
select is(api.publish_current_onboarding((select (receipt->>'receipt_id')::uuid from prep_receipts where stage='expired'),(select receipt->>'snapshot_hash' from prep_receipts where stage='expired'),'product')->>'status','item_preparation_pending','Staged Product Publish remains denied');
select is((select revision from core.product_drafts),1::bigint,'Review changes no Product revision');
select is((select revision from core.identity_working),1::bigint,'Review changes no Identity revision');
select is((select count(*) from core.spill_item_identity_registry),1::bigint,'Review allocates no reference');
select is((select count(*) from core.identity_publications),0::bigint,'Review creates no public Identity');
select ok((select onboarding_completed_at is null from core.owners where id=(select owner_id from preview_prep_owners where auth_user_id='83000000-0000-4000-8000-000000000001')),'Review never completes onboarding');
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated","sub":"83000000-0000-4000-8000-000000000002"}';
select is(api.claim_current_owner_handle('preview-prep-two',1)->>'status','success','Other Handle');
select is(api.set_current_owner_primary_use_case('creator',2)->>'status','success','Other guidance');
select is(api.save_current_owner_basic_identity('Other Owner',null,null,3)->>'status','success','Other Identity');
select is(api.save_current_owner_starter_composition('clean',null,4)->>'status','success','Other layout');
select is(api.advance_current_owner_relevant_first_job(5)->>'status','success','Other S6');
select is(api.resolve_current_onboarding_preview()->'product_draft','null'::jsonb,'Other Owner cannot see prepared Product');
reset role;
select * from finish();
rollback;

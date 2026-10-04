begin;
select no_plan();
select ok(not has_function_privilege('anon', 'api.resolve_current_onboarding_preview()', 'EXECUTE'), 'Anonymous preview denied');
select ok(not has_function_privilege('service_role', 'api.resolve_current_onboarding_preview()', 'EXECUTE'), 'Service role has no Owner preview entry');
select ok(has_function_privilege('authenticated', 'api.resolve_current_onboarding_preview()', 'EXECUTE'), 'Authenticated preview enabled');
select ok(not has_function_privilege('authenticated', 'core.preview_destination_safety(text)', 'EXECUTE'), 'Arbitrary private safety lookup denied');
select is((select provolatile::text from pg_proc where oid = 'api.resolve_current_onboarding_preview()'::regprocedure), 's', 'Coherent STABLE snapshot');
insert into auth.users(id,email) values
 ('77000000-0000-4000-8000-000000000001','preview-one@example.test'),
 ('77000000-0000-4000-8000-000000000002','preview-two@example.test');
create temporary table preview_test_owners as select auth_user_id,owner_id from core.owner_auth_bindings
 where auth_user_id in ('77000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select is(api.resolve_current_onboarding_preview()->>'status','unauthenticated','No subject cannot read preview');
set local request.jwt.claims = '{"role":"authenticated","sub":"77000000-0000-4000-8000-000000000001"}';
select is(api.resolve_current_onboarding_preview()->>'status','step_not_available','S1 cannot skip to preview');
select is(api.claim_current_owner_handle('preview-one',1)->>'status','success','Claim Handle');
select is(api.set_current_owner_primary_use_case('business',2)->>'status','success','Set Business');
select is(api.save_current_owner_basic_identity('Private Preview',E'Bio\nSecond line',null,3)->>'status','success','Save Identity');
select is(api.save_current_owner_starter_composition('business',null,4)->>'status','success','Save layout');
select is(api.save_current_owner_product_draft('https://example.test/preview-product',null,null)->>'status','success','Save incomplete Product');
select is(api.save_current_owner_resource_draft('menu',null,'Our menu',null)->>'status','success','Save title-only Resource');
select is(api.save_current_owner_identity_connection('generic_link',null,'https://example.test/preview-connection',null)->>'status','success','Save Connection');
select is(api.resolve_current_onboarding_preview()->>'status','step_not_available','S5 has no premature preview');
select is(api.advance_current_owner_relevant_first_job(5)->>'status','success','Explicitly reach S6');
reset role;
create temporary table preview_before as select
 (select count(*) from core.spill_item_identity_registry) as reservations,
 (select count(*) from core.product_drafts) as products,
 (select count(*) from core.resource_drafts) as resources;
grant select on preview_before to authenticated;
set local role authenticated;
select is(api.resolve_current_onboarding_preview()->>'status','success','S6 preview succeeds');
select is(api.resolve_current_onboarding_preview()->>'current_handle','preview-one','Current Owner Handle');
select is(api.resolve_current_onboarding_preview()->'identity_working'->>'display_name','Private Preview','Working Identity shown');
select is(api.resolve_current_onboarding_preview()->'layout_working'->>'starter_key','business','Working composition shown');
select is(api.resolve_current_onboarding_preview()->'product_draft'->'validation_issues',
 '["title_missing","source_not_safe","product_publication_preparation_pending"]'::jsonb,'Incomplete Product explicitly invalid');
select is(api.resolve_current_onboarding_preview()->'resource_draft'->'validation_issues',
 '["source_missing"]'::jsonb,'Title-only Resource retained with missing source');
select is(api.resolve_current_onboarding_preview()->'identity_validation_issues',
 '["connection_not_safe"]'::jsonb,'Unsafe Connection blocks Identity eligibility');
select is(api.resolve_current_onboarding_preview()->'product_draft'->>'spill_reference','1','Product reference preserved');
select is(api.resolve_current_onboarding_preview()->'resource_draft'->>'spill_reference','2','Resource reference preserved');
select is(api.resolve_current_onboarding_preview()->>'snapshot_hash',api.resolve_current_onboarding_preview()->>'snapshot_hash','Unchanged preview has stable digest');
select ok(api.resolve_current_onboarding_preview()->>'snapshot_hash' ~ '^[0-9a-f]{64}$','Digest has strict SHA-256 shape');
reset role;
select is((select count(*) from core.spill_item_identity_registry),(select reservations from preview_before),'Preview reserves no Items');
select is((select count(*) from core.product_drafts),(select products from preview_before),'Preview creates no Product');
select is((select count(*) from core.resource_drafts),(select resources from preview_before),'Preview creates no Resource');
select is((select revision from core.owner_onboarding_progress where owner_id=(select owner_id from preview_test_owners where auth_user_id='77000000-0000-4000-8000-000000000001')),6::bigint,'Preview leaves progress revision unchanged');
select ok((select onboarding_completed_at is null from core.owners where id=(select owner_id from preview_test_owners where auth_user_id='77000000-0000-4000-8000-000000000001')),'Preview never completes onboarding');
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at)
 values('https://example.test/preview-product',encode(extensions.digest('https://example.test/preview-product','sha256'),'hex'),'safe','preview-test',now(),now()+interval '5 minutes'),
 ('https://example.test/preview-connection',encode(extensions.digest('https://example.test/preview-connection','sha256'),'hex'),'safe','preview-test',now(),now()+interval '5 minutes');
set local role authenticated;
select is(api.save_current_owner_product_draft('https://example.test/preview-product','Ready Product',1)->>'status','success','Fix Product at S6 without losing reference');
select is(api.resolve_current_onboarding_preview()->'product_draft'->'validation_issues','["product_publication_preparation_pending"]'::jsonb,'Safe source/title still require primary image and marketplace preparation');
select is(api.resolve_current_onboarding_preview()->'identity_validation_issues','[]'::jsonb,'Exact safe Connection resolves Identity issue');
reset role;
create temporary table preview_digest_before as select encode(extensions.digest(
 (api.resolve_current_onboarding_preview() - 'snapshot_hash')::text,'sha256'),'hex') as hash;
grant select on preview_digest_before to authenticated;
set local role authenticated;
select is(api.resolve_current_onboarding_preview()->>'snapshot_hash',(select hash from preview_digest_before),'Digest binds canonical full payload');
set local timezone = 'Asia/Jakarta';
select is(api.resolve_current_onboarding_preview()->>'snapshot_hash',(select hash from preview_digest_before),'Digest is independent of caller timezone');
set local timezone = 'UTC';
select is(api.save_current_owner_product_draft('https://example.test/new-product','Ready Product',2)->>'status','success','Change source');
select is(api.resolve_current_onboarding_preview()->'product_draft'->'safety'->>'status','pending','Changed source cannot reuse previous safe verdict');
select isnt(api.resolve_current_onboarding_preview()->>'snapshot_hash',(select hash from preview_digest_before),'Content/source edit invalidates previous snapshot');
reset role;
update core.external_destination_safety set checked_at=now()-interval '10 minutes',expires_at=now()-interval '1 minute'
 where normalized_url='https://example.test/preview-connection';
set local role authenticated;
select is(api.resolve_current_onboarding_preview()->'connection_working'->'safety'->>'status','pending','Expired safe Connection fails closed');
reset role;
update core.external_destination_safety set safety_status='blocked',reason_codes=array['malware'],checked_at=now(),expires_at=now()+interval '5 minutes'
 where normalized_url='https://example.test/preview-connection';
set local role authenticated;
select is(api.resolve_current_onboarding_preview()->'connection_working'->'safety'->>'status','blocked','Blocked state stays blocked');
set local request.jwt.claims = '{"role":"authenticated","sub":"77000000-0000-4000-8000-000000000002"}';
select is(api.claim_current_owner_handle('preview-two',1)->>'status','success','Other Handle');
select is(api.set_current_owner_primary_use_case('personal',2)->>'status','success','Other guidance');
select is(api.save_current_owner_basic_identity('Other Owner',null,null,3)->>'status','success','Other Identity');
select is(api.save_current_owner_starter_composition('clean',null,4)->>'status','success','Other layout');
select is(api.advance_current_owner_relevant_first_job(5)->>'status','success','Other S6');
select is(api.resolve_current_onboarding_preview()->'product_draft','null'::jsonb,'Other Owner cannot see first Product');
select is(api.resolve_current_onboarding_preview()->'resource_draft','null'::jsonb,'Other Owner cannot see first Resource');
select is(api.resolve_current_onboarding_preview()->'identity_working'->>'display_name','Other Owner','Other Owner isolated Identity');
reset role;
update core.owners set account_state='restricted' where id=(select owner_id from preview_test_owners where auth_user_id='77000000-0000-4000-8000-000000000002');
set local role authenticated;
select is(api.resolve_current_onboarding_preview()->>'status','owner_unavailable','Restricted Owner cannot preview');
reset role;
update core.owners set account_state='active',onboarding_completed_at=now() where id=(select owner_id from preview_test_owners where auth_user_id='77000000-0000-4000-8000-000000000002');
set local role authenticated;
select is(api.resolve_current_onboarding_preview()->>'status','onboarding_complete','Completed Owner not exposed through onboarding');
reset role;
select * from finish();
rollback;

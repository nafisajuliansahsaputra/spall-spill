begin;
select no_plan();
select ok(not has_function_privilege('anon','api.execute_public_spill_server(text,text,jsonb)','execute'),'Anonymous cannot call service gateway directly');
select ok(not has_function_privilege('authenticated','api.execute_public_spill_server(text,text,jsonb)','execute'),'Viewer cannot call service gateway directly');
select ok(has_function_privilege('service_role','api.execute_public_spill_server(text,text,jsonb)','execute'),'Fixed service admission only');
select ok(not has_function_privilege('service_role','api.resolve_public_spill_item(text,bigint)','execute'),'Original exact reader stays closed');
select ok(not has_function_privilege('service_role','core.public_spill_recognition(text,bigint)','execute'),'Internal projection stays closed');
select ok(not has_table_privilege('service_role','core.spill_item_publications','SELECT'),'Raw snapshots stay closed');
set local role anon;
select throws_ok($$select api.execute_public_spill_server('browse','spill-creator','{}')$$,'42501',null,'Actual anonymous gateway call denied');
reset role;
set local role authenticated;
select throws_ok($$select api.execute_public_spill_server('browse','spill-creator','{}')$$,'42501',null,'Actual viewer gateway call denied');
reset role;
insert into auth.users(id,email) values
 ('28100000-0000-4000-8000-000000000001','spill-original@example.test'),
 ('28100000-0000-4000-8000-000000000002','other-creator@example.test');
create temporary table product_media_owners as select * from core.owner_auth_bindings
 where auth_user_id in ('28100000-0000-4000-8000-000000000001','28100000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated","sub":"28100000-0000-4000-8000-000000000001"}';
select is(api.claim_current_owner_handle('spill-original',1)->>'status','success','First Handle');
select is(api.set_current_owner_primary_use_case('affiliate',2)->>'status','success','First guidance');
select is(api.save_current_owner_basic_identity('Product Media Owner',null,null,3)->>'status','success','First Identity');
select is(api.save_current_owner_starter_composition('featured',null,4)->>'status','success','First layout');
select is(api.claim_current_owner_handle('spill-creator',5)->>'status','success','Protected alias');
select is(api.save_current_owner_product_draft('https://shopee.co.id/item','Private Product',null)->>'status','success','First private Product');
select is(api.save_current_owner_resource_draft('website','https://resource.example.test','Private Resource',null)->>'status','success','Resource reserves another type/reference');
set local request.jwt.claims='{"role":"authenticated","sub":"28100000-0000-4000-8000-000000000002"}';
select is(api.claim_current_owner_handle('other-creator',1)->>'status','success','Other Handle');
select is(api.set_current_owner_primary_use_case('creator',2)->>'status','success','Other guidance');
select is(api.save_current_owner_basic_identity('Other Owner',null,null,3)->>'status','success','Other Identity');
select is(api.save_current_owner_starter_composition('clean',null,4)->>'status','success','Other layout');
select is(api.save_current_owner_product_draft('https://shopee.co.id/other','Other Product',null)->>'status','success','Other Product');
reset role;

-- Privileged, rolled-back fixtures test staged transport without activating Publish.
create temporary table product_media_assets(asset_key uuid,auth_id uuid,status core.profile_media_upload_status);
insert into product_media_assets values
 ('28100000-0000-4000-8000-000000000001','28100000-0000-4000-8000-000000000001','consumed'),
 ('28100000-0000-4000-8000-000000000002','28100000-0000-4000-8000-000000000002','consumed'),
 ('28100000-0000-4000-8000-000000000003','28100000-0000-4000-8000-000000000001','consumed'),
 ('28100000-0000-4000-8000-000000000004','28100000-0000-4000-8000-000000000001','pending');
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select f.asset_key,o.owner_id,'image/png',100,'staging/profile/'||f.asset_key||'/'||f.asset_key,f.status,
 now()+interval '1 hour',case when f.status='consumed' then now() else null end
 from product_media_assets f join product_media_owners o on o.auth_user_id=f.auth_id;
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select f.asset_key::text,o.owner_id,'working/profile/'||f.asset_key||'.webp','image/webp',12,100,100,f.asset_key
 from product_media_assets f join product_media_owners o on o.auth_user_id=f.auth_id;

insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,published_at)
 select owner_id,jsonb_build_object('display_name','Published Creator','bio','Public biography','starter_key','featured','profile_asset_key',null,'connection',null),1,1,now() from product_media_owners;
update core.owners set onboarding_completed_at=now() where id in(select owner_id from product_media_owners);
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,published_at)
 select item_id,owner_id,item_type,spill_reference,1,
 case when item_type='product' then '{"title":"Needle Product","preparation_revision":1,"primary_asset_key":"28100000-0000-4000-8000-000000000001","destinations":[{"provider_key":"shopee","destination_url":"https://shopee.co.id/item?affiliate=creator"}]}'::jsonb
 else '{"resource_type":"website","title":"Needle","source_url":"https://resource.example.test/private-attribution"}'::jsonb end,
 case when item_type='product' then now()-interval '1 day' else now()-interval '2 days' end
 from core.spill_item_identity_registry where owner_id=(select owner_id from product_media_owners where auth_user_id='28100000-0000-4000-8000-000000000001');
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at) values('https://shopee.co.id/item?affiliate=creator',encode(extensions.digest('https://shopee.co.id/item?affiliate=creator','sha256'),'hex'),'safe','fixture',now(),now()+interval '1 hour');

select ok(not has_function_privilege('anon','api.execute_owner_spill_lifecycle_server(uuid,text,jsonb)','execute'),'Anon gateway denied');
select ok(not has_function_privilege('authenticated','api.execute_owner_spill_lifecycle_server(uuid,text,jsonb)','execute'),'Viewer gateway denied');
select ok(has_function_privilege('service_role','api.execute_owner_spill_lifecycle_server(uuid,text,jsonb)','execute'),'Service gateway explicit');
select ok(not has_function_privilege('service_role','api.change_current_owner_spill_lifecycle(jsonb)','execute'),'Original mutation closed');
select ok(not has_table_privilege('service_role','core.spill_lifecycle_commands','SELECT'),'Ledger raw read closed');
select ok((select relrowsecurity from pg_class where oid='core.spill_lifecycle_commands'::regclass),'Ledger RLS');
set local role authenticated;
select throws_ok($$select api.change_current_owner_spill_lifecycle('{}')$$,'42501',null,'Actual original mutation denied');
select throws_ok($$select * from core.spill_lifecycle_commands$$,'42501',null,'Actual ledger denied');
reset role;
create temporary table retained as select snapshot,published_at,item_id,spill_reference from core.spill_item_publications where item_type='product';
create function pg_temp.lifecycle(ref bigint,action text,state text,revision bigint,intent uuid default gen_random_uuid(),confirmed boolean default false)
returns jsonb language sql as $$ select api.execute_owner_spill_lifecycle_server('28100000-0000-4000-8000-000000000001','change_current_owner_spill_lifecycle',jsonb_build_object('input_command',jsonb_build_object('intent_id',intent,'reference',ref,'action',action,'expected_lifecycle',state,'expected_revision',revision,'confirmed',confirmed)));$$;
create function pg_temp.current_lifecycle() returns jsonb language sql as $$select api.execute_owner_spill_lifecycle_server('28100000-0000-4000-8000-000000000001','resolve_current_owner_spill_lifecycle','{"input_reference":1}');$$;
grant execute on function pg_temp.lifecycle(bigint,text,text,bigint,uuid,boolean),pg_temp.current_lifecycle() to service_role;
set local role service_role;
set local request.jwt.claims='{"sub":"untrusted","role":"service_role"}';set local request.jwt.claim.sub='untrusted';
select is(pg_temp.current_lifecycle()->>'lifecycle','published','Bound read');
select is(current_setting('request.jwt.claim.sub'),'untrusted','Gateway restores sub');
select is(current_setting('request.jwt.claims'),'{"sub":"untrusted","role":"service_role"}','Claims restored');
select is(pg_temp.lifecycle(1,'hide','published',1,'28200000-0000-4000-8000-000000000001')->>'revision','2','Hide increments publication revision');
select is(pg_temp.current_lifecycle()->>'lifecycle','hidden','Hide visible in guarded read');
select is(api.execute_public_spill_server('detail','spill-creator','{"reference":1}')->>'status','unavailable','Hidden detail not public');
select is(pg_temp.lifecycle(1,'hide','published',1,'28200000-0000-4000-8000-000000000001')->>'revision','2','Identical replay receipt');
select is(pg_temp.current_lifecycle()->>'revision','2','Replay has no second mutation');
select is(pg_temp.lifecycle(1,'restore','hidden',2,'28200000-0000-4000-8000-000000000001')->>'status','conflicting_intent','Intent cannot change command');
select is(pg_temp.lifecycle(1,'restore','hidden',2)->>'lifecycle','published','Hidden Restore uses last Published');
select is(api.execute_public_spill_server('detail','spill-creator','{"reference":1}')->>'status','success','Restored public recognition');
select is(pg_temp.lifecycle(1,'hide','published',1)->>'status','stale_write','ABA stale version denied');
select is(pg_temp.lifecycle(1,'archive','published',3)->>'status','confirmation_required','Archive needs confirmation');
select is(pg_temp.lifecycle(1,'archive','published',3,gen_random_uuid(),true)->>'revision','4','Confirmed Archive');
select is(api.execute_public_spill_server('detail','spill-creator','{"reference":1}')->>'status','unavailable','Archive not public');
select is(pg_temp.lifecycle(1,'restore','archived',4)->>'lifecycle','hidden','Archived restore only Hidden');
select is(api.execute_public_spill_server('detail','spill-creator','{"reference":1}')->>'status','unavailable','Restored archive still not public');
select is(pg_temp.lifecycle(1,'hide','hidden',5)->>'status','invalid_transition','Hidden cannot Hide again');
select is(pg_temp.lifecycle(1,'restore','hidden',5)->>'revision','6','Separate explicit Hidden Restore');
select is(api.execute_owner_spill_lifecycle_server('28100000-0000-4000-8000-000000000002','resolve_current_owner_spill_lifecycle','{"input_reference":1}')->>'status','unavailable','Other Owner cannot read first publication');
select is(api.execute_owner_spill_lifecycle_server('28100000-0000-4000-8000-000000000002','change_current_owner_spill_lifecycle','{"input_command":{"intent_id":"28200000-0000-4000-8000-000000000009","reference":1,"expected_revision":6,"expected_lifecycle":"published","action":"hide","confirmed":false}}')->>'status','unavailable','Other Owner cannot mutate first publication');
select is(api.execute_owner_spill_lifecycle_server('28100000-0000-4000-8000-000000000001','resolve_current_owner_spill_lifecycle','{"input_reference":1,"owner_id":"forged"}')->>'status','unavailable','Caller Owner selection denied');
select is(api.execute_owner_spill_lifecycle_server('28100000-0000-4000-8000-000000000001','arbitrary','{}')->>'status','unavailable','Unknown operation denied');
reset role;
select is((select snapshot from core.spill_item_publications where item_id=(select item_id from retained)),(select snapshot from retained),'Snapshots unchanged across lifecycle');
select is((select published_at from core.spill_item_publications where item_id=(select item_id from retained)),(select published_at from retained),'Published timestamp preserved');
select is((select spill_reference from core.spill_item_publications where item_id=(select item_id from retained)),(select spill_reference from retained),'Reference preserved');
select is((select title from core.product_drafts where owner_id=(select owner_id from product_media_owners where auth_user_id='28100000-0000-4000-8000-000000000001')),'Private Product','Private Working unchanged');
select is((select count(*) from core.spill_lifecycle_commands),5::bigint,'Exactly five successful commands retained');
update core.spill_item_publications set publication_revision=1 where item_id=(select item_id from retained);
select is((select publication_revision from core.spill_item_publications where item_id=(select item_id from retained)),6::bigint,'Cannot reset revision directly');
update core.spill_item_publications set snapshot=snapshot||'{"title":""}' where item_type='resource';
set local role service_role;
select is(pg_temp.lifecycle(2,'hide','published',1)->>'status','stale_write','Snapshot update advances revision');
select is(pg_temp.lifecycle(2,'hide','published',2)->>'revision','3','Malformed Item can still be hidden');
select is(pg_temp.lifecycle(2,'restore','hidden',3)->>'status','review_required','Invalid last Published snapshot cannot Restore');
reset role;
select is((select lifecycle_state from core.spill_item_publications where item_type='resource'),'hidden','Failed Restore rolls back visibility');
select is((select publication_revision from core.spill_item_publications where item_type='resource'),3::bigint,'Failed Restore rolls back revision');
select is((select count(*) from core.spill_lifecycle_commands),6::bigint,'Failed Restore stores no successful receipt');
set local role service_role;
select is(pg_temp.lifecycle(2,'archive','hidden',3,gen_random_uuid(),true)->>'status','success','Invalid hidden Item can Archive');
reset role;
update core.owners set account_state='restricted' where id=(select owner_id from product_media_owners where auth_user_id='28100000-0000-4000-8000-000000000001');
set local role service_role;
select is(pg_temp.lifecycle(1,'hide','published',1,'28200000-0000-4000-8000-000000000001')->>'status','owner_not_eligible','Restriction wins over old replay');
select is(pg_temp.current_lifecycle()->>'status','unavailable','Restricted read denied');
reset role;
select throws_ok($$update core.spill_lifecycle_commands set command=command$$,'P0001','Lifecycle receipts are immutable','Receipt cannot change');
select throws_ok($$delete from core.spill_lifecycle_commands$$,'P0001','Lifecycle receipts are immutable','Receipt cannot delete');
update core.owners set account_state='active' where id=(select owner_id from product_media_owners where auth_user_id='28100000-0000-4000-8000-000000000001');
insert into core.workspace_resource_drafts(owner_id,creation_id,resource_type,title,source_url)
 select owner_id,gen_random_uuid(),'website','Exhausted publication','https://resource.example.test/exhausted' from product_media_owners where auth_user_id='28100000-0000-4000-8000-000000000001';
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,published_at,publication_revision)
 select id,owner_id,'resource',spill_reference,1,jsonb_build_object('title',title,'resource_type',resource_type,'source_url',source_url),now(),9007199254740991 from core.workspace_resource_drafts where title='Exhausted publication';
set local role service_role;
select is(pg_temp.lifecycle(3,'archive','published',9007199254740991,gen_random_uuid(),true)->>'status','revision_exhausted','Revision overflow denies atomically');
reset role;
select is((select lifecycle_state from core.spill_item_publications where spill_reference=3),'published','Overflow preserved current state');
-- Temporary grants prove RLS deny-by-default independently of grant denial.
grant usage on schema core to anon,authenticated;
grant select on core.spill_lifecycle_commands to anon,authenticated;
set local role anon;
select is((select count(*) from core.spill_lifecycle_commands),0::bigint,'Anon RLS sees no receipts even with accidental SELECT grant');
reset role;
set local role authenticated;
select is((select count(*) from core.spill_lifecycle_commands),0::bigint,'Authenticated RLS sees no receipts even with accidental SELECT grant');
reset role;
revoke select on core.spill_lifecycle_commands from anon,authenticated;
select is((select actor_subject::text from core.spill_lifecycle_commands limit 1),'28100000-0000-4000-8000-000000000001','Immutable actor derived from current server subject');
select * from finish();rollback;

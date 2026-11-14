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
create function pg_temp.browse(q text default '',kind text default 'all',cursor jsonb default 'null') returns jsonb language sql as $$ select api.execute_public_spill_server('browse','spill-creator',jsonb_build_object('q',q,'kind',kind,'cursor',cursor)); $$;
grant execute on function pg_temp.browse(text,text,jsonb) to service_role;
set local role service_role;
select is(pg_temp.browse()->>'status','success','Published mixed Spill readable');
select is(pg_temp.browse()->'items'->0->>'reference','1','Newest publication wins over numeric reference');
select is(pg_temp.browse('Needle')->'items'->0->>'reference','2','Exact title relevance outranks newer phrase');
select is(pg_temp.browse('Product Needle')->'items'->0->>'reference','1','All literal title tokens supported');
select is(jsonb_array_length(pg_temp.browse('','product')->'items'),1,'Product filter');
select is(jsonb_array_length(pg_temp.browse('','resource')->'items'),1,'Resource filter');
select is((pg_temp.browse()->>'has_products')::boolean,true,'Adaptive Product context');
select is((pg_temp.browse()->>'has_resources')::boolean,true,'Adaptive Resource context');
select is((pg_temp.browse('','resource')->'items'->0->>'available')::boolean,false,'Unsafe source preserves Published recognition');
select is(jsonb_array_length(pg_temp.browse('%')->'items'),0,'Wildcard is literal, not match-all');
select is(jsonb_array_length(pg_temp.browse('no match')->'items'),0,'Keyword zero is valid success');
select is(api.execute_public_spill_server('browse','SPILL-ORIGINAL','{"q":"","kind":"all","cursor":null}'),pg_temp.browse(),'Protected alias/case same public result');
select is(api.execute_public_spill_server('browse','other-creator','{"q":"","kind":"all","cursor":null}')->>'status','unavailable','Draft-only creator has no normal empty public Spill');
select is(api.execute_public_spill_server('detail','other-creator','{"reference":1}')->>'status','unavailable','Same reference on another creator cannot leak Item');
select is(api.execute_public_spill_server('detail','spill-creator','{"reference":1}')->>'item_type','product','Exact Product dispatch');
select is(api.execute_public_spill_server('detail','spill-creator','{"reference":2}')->>'item_type','resource','Exact Resource dispatch');
select ok(position('destination_url' in api.execute_public_spill_server('detail','spill-creator','{"reference":1}')::text)=0,'No marketplace URL in detail DTO');
select ok(position('source_url' in api.execute_public_spill_server('detail','spill-creator','{"reference":2}')::text)=0,'No Resource URL in detail DTO');
select ok(position('primary_asset_key' in pg_temp.browse()::text)=0 and position('owner_id' in pg_temp.browse()::text)=0,'No private authority in catalog');
select is(api.execute_public_spill_server('detail','spill-creator','{"reference":9007199254740992}')->>'status','unavailable','Unsafe reference denied');
select is(pg_temp.browse('#01')->>'status','unavailable','Malformed reference cannot fall back to titles');
select is(api.execute_public_spill_server('publish','spill-creator','{}')->>'status','unavailable','Arbitrary operation denied');
select is(api.execute_public_spill_server('detail','spill-creator','{"reference":1,"owner_id":"forged"}')->>'status','unavailable','Caller Owner selector denied');
reset role;
update core.identity_working set display_name='PRIVATE WORKING';
update core.product_drafts set title='PRIVATE PRODUCT';
update core.resource_drafts set title='PRIVATE RESOURCE';
set local role service_role;
select is(pg_temp.browse()->>'display_name','Published Creator','Working Identity cannot leak');
select is(pg_temp.browse('','product')->'items'->0->>'title','Needle Product','Working Item title cannot leak');
reset role;
insert into core.workspace_resource_drafts(owner_id,creation_id,resource_type,title,source_url)
 select owner_id,gen_random_uuid(),'document','Notebook '||n,'https://resource.example.test/notebook' from product_media_owners cross join generate_series(1,27) n where auth_user_id='28100000-0000-4000-8000-000000000001';
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,published_at)
 select d.id,d.owner_id,'resource',d.spill_reference,1,jsonb_build_object('resource_type',d.resource_type,'title',d.title,'source_url',d.source_url),now()-(((d.spill_reference-2)::text||' minutes')::interval) from core.workspace_resource_drafts d where d.owner_id=(select owner_id from product_media_owners where auth_user_id='28100000-0000-4000-8000-000000000001');
create temporary table baseline as select count(*) total from core.spill_item_publications;
set local role service_role;
select is(jsonb_array_length(pg_temp.browse('Notebook')->'items'),20,'Bounded first search page');
select is(pg_temp.browse('Notebook')->'items'->0->>'reference','3','Newest time, not highest reference');
select is(pg_temp.browse('Notebook')->>'has_more','true','Continuation acknowledged');
select is(jsonb_array_length(pg_temp.browse('Notebook','all',pg_temp.browse('Notebook')->'next_cursor')->'items'),7,'Scope-bound seek continuation');
select is(pg_temp.browse('other','all',pg_temp.browse('Notebook')->'next_cursor')->>'status','unavailable','Cursor cannot change query');
select is(pg_temp.browse('Notebook','product',pg_temp.browse('Notebook')->'next_cursor')->>'status','unavailable','Cursor cannot change type');
reset role;
update core.spill_item_publications set lifecycle_state='hidden' where spill_reference=1 and owner_id=(select owner_id from product_media_owners where auth_user_id='28100000-0000-4000-8000-000000000001');
set local role service_role;
select is(api.execute_public_spill_server('detail','spill-creator','{"reference":1}')->>'status','unavailable','Hidden exact Item uniform denial');
reset role;
update core.spill_item_publications set lifecycle_state='archived' where spill_reference=2 and owner_id=(select owner_id from product_media_owners where auth_user_id='28100000-0000-4000-8000-000000000001');
set local role service_role;
select is(api.execute_public_spill_server('detail','spill-creator','{"reference":2}')->>'status','unavailable','Archived exact Item uniform denial');
reset role;
update core.owners set account_state='restricted' where id=(select owner_id from product_media_owners where auth_user_id='28100000-0000-4000-8000-000000000001');
set local role service_role;
select is(pg_temp.browse()->>'status','unavailable','Restricted creator uniform denial');
reset role;
select is((select count(*) from core.spill_item_publications),(select total from baseline),'Reads allocate no public Items');
select * from finish();
rollback;

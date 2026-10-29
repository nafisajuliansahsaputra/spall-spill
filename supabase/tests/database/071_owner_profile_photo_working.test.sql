begin;
select no_plan();
select ok((select prosecdef and provolatile='s' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) from pg_proc where oid='api.resolve_current_owner_typed_blocks_working_page(jsonb)'::regprocedure),'Stable hardened typed page');
select ok(not has_function_privilege('anon','api.resolve_current_owner_typed_blocks_working_page(jsonb)','EXECUTE'),'Execution withheld anon');
set local role anon;
select throws_ok($$select api.resolve_current_owner_typed_blocks_working_page('{}')$$,'42501',null,'Actual role denied');
reset role;
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_typed_blocks_working_page(jsonb)','EXECUTE'),'Execution withheld authenticated');
set local role authenticated;
select throws_ok($$select api.resolve_current_owner_typed_blocks_working_page('{}')$$,'42501',null,'Actual role denied');
reset role;
select ok(not has_function_privilege('service_role','api.resolve_current_owner_typed_blocks_working_page(jsonb)','EXECUTE'),'Execution withheld service_role');
set local role service_role;
select throws_ok($$select api.resolve_current_owner_typed_blocks_working_page('{}')$$,'42501',null,'Actual role denied');
reset role;
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='resolve_current_owner_typed_blocks_working_page' and grantee='PUBLIC'),'No PUBLIC grant');
set local request.jwt.claims='{}';
select is(api.resolve_current_owner_typed_blocks_working_page('{}'),'{"status":"unavailable"}'::jsonb,'No actor uniform denial');
insert into auth.users(id,email) values ('24900000-0000-4000-8000-000000000001','persisted-one@example.test'),('24900000-0000-4000-8000-000000000002','persisted-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in ('24900000-0000-4000-8000-000000000001','24900000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind) select 'photo249-'||right(auth_user_id::text,6),owner_id,'current' from actors;
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select ('24900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,owner_id,kind::core.identity_block_kind,n,false
 from actors cross join(values(1,'social'),(2,'generic_link'),(3,'contact'),(4,'text'),(5,'media'),(6,'spill_cta')) kinds(n,kind)
 where auth_user_id='24900000-0000-4000-8000-000000000001';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
 select block_id,owner_id,kind,' <Raw> ',case when kind='social' then 'raw_platform' else null end,'javascript:raw()' from core.identity_blocks_working where block_id in('24900000-0000-4000-8000-000000000001','24900000-0000-4000-8000-000000000002');
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_type,label,contact_value)
 select block_id,owner_id,kind,null,' <Label> ',E' Raw\n Value ' from core.identity_blocks_working where block_id='24900000-0000-4000-8000-000000000003';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,E' <Text>\n ' from core.identity_blocks_working where block_id='24900000-0000-4000-8000-000000000004';
insert into core.identity_block_media_working(block_id,owner_id,kind,asset_key,alt_text)
 select block_id,owner_id,kind,null,' <Alt> ' from core.identity_blocks_working where block_id='24900000-0000-4000-8000-000000000005';
insert into core.identity_block_spill_cta_working(block_id,owner_id,kind)
 select block_id,owner_id,kind from core.identity_blocks_working where block_id='24900000-0000-4000-8000-000000000006';
set local request.jwt.claims='{"sub":"24900000-0000-4000-8000-000000000001"}';
insert into core.identity_working(owner_id,display_name,bio,revision)
 select owner_id,case when auth_user_id='24900000-0000-4000-8000-000000000001' then 'Private Identity' else 'Foreign Identity' end,E'Private\nBio',2 from actors;
insert into core.identity_layout_working(owner_id,starter_key,revision) select owner_id,'clean',7 from actors;
insert into core.identity_connection_working(owner_id,connection_kind,social_platform,destination_url,revision)
 select owner_id,'generic_link',null,'HTTPS://Private.example.test/Keep?X=1#Exact',3 from actors where auth_user_id='24900000-0000-4000-8000-000000000001';
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select auth_user_id,owner_id,'image/png',12,'staging/profile/'||owner_id||'/'||auth_user_id,'consumed',now()+interval '10 minutes',now() from actors;
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select case when auth_user_id='24900000-0000-4000-8000-000000000001' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end,
 owner_id,'working/profile/'||case when auth_user_id='24900000-0000-4000-8000-000000000001' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end||'.webp',
 'image/webp',12,1,1,auth_user_id from actors;
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select '24900000-0000-4000-8000-000000000003',owner_id,'image/png',12,'staging/profile/'||owner_id||'/24900000-0000-4000-8000-000000000003','consumed',now()+interval '10 minutes',now() from actors where auth_user_id='24900000-0000-4000-8000-000000000001';
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',owner_id,'working/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp','image/webp',12,1,1,'24900000-0000-4000-8000-000000000003' from actors where auth_user_id='24900000-0000-4000-8000-000000000001';
do $$ begin
 if api.save_current_owner_profile_text_working('{"action":"save_profile_text_working","base_profile_revision":2,"base_text_revision":null,"profile_text_working":{"display_name":null,"bio":" Raw\r\nBio "}}')->>'status' is distinct from 'success' then raise exception 'Controlled recovery fixture setup failed'; end if;
end $$;
-- Profile photo CAS fixtures end here.
select ok((select prosecdef and provolatile='v' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) from pg_proc where oid='api.save_current_owner_profile_photo_working(jsonb)'::regprocedure),'Photo mutation hardened');
select ok(not has_function_privilege('anon','api.save_current_owner_profile_photo_working(jsonb)','EXECUTE'),'No anon photo execution');
set local role anon;
select throws_ok($$select api.save_current_owner_profile_photo_working('{}')$$,'42501',null,'Actual anon denied');
reset role;
select ok(not has_function_privilege('authenticated','api.save_current_owner_profile_photo_working(jsonb)','EXECUTE'),'No authenticated photo execution');
set local role authenticated;
select throws_ok($$select api.save_current_owner_profile_photo_working('{}')$$,'42501',null,'Actual authenticated denied');
reset role;
select ok(not has_function_privilege('service_role','api.save_current_owner_profile_photo_working(jsonb)','EXECUTE'),'No service_role photo execution');
set local role service_role;
select throws_ok($$select api.save_current_owner_profile_photo_working('{}')$$,'42501',null,'Actual service_role denied');
reset role;
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='save_current_owner_profile_photo_working' and grantee='PUBLIC'),'No PUBLIC grant');
create function pg_temp.photo(key text,source_base numeric default 2,text_base numeric default 1) returns jsonb language sql as $$
 select api.save_current_owner_profile_photo_working(jsonb_build_object('action','save_profile_photo_working','base_profile_revision',source_base,'base_text_revision',text_base,'profile_asset_key',key));
$$;
create function pg_temp.read_edit() returns jsonb language sql stable as $$
 select api.resolve_current_owner_editable_identity_working_page('{"expected_collection_revision":null,"after_position":null}');
$$;
insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,connection_revision,published_at)
 select owner_id,'{"legacy":true,"profile_asset_key":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}',2,7,3,now() from actors where auth_user_id='24900000-0000-4000-8000-000000000001';
create temporary table preserved as select
 (select jsonb_agg(to_jsonb(x) order by asset_key) from core.profile_media_assets x) assets,
 (select jsonb_agg(to_jsonb(x) order by id) from core.profile_media_upload_intents x) intents,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_layout_working x where owner_id in(select owner_id from actors)) layout,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x where owner_id in(select owner_id from actors)) progress,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_connection_working x where owner_id in(select owner_id from actors)) source,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x where owner_id in(select owner_id from actors)) publication,
 pg_temp.read_edit()#>'{collection}' blocks;
select is(pg_temp.photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'{"status":"success","changed":true,"profile_revision":3,"text_revision":2,"profile_asset_key":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb,'Selection atomically advances source and existing text binding');
select is(pg_temp.read_edit()#>>'{profile_working,profile_asset_key}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Full editable readback gets selected source photo');
select is(pg_temp.read_edit()#>'{profile_text_working}',jsonb_build_object('display_name',null,'bio',E' Raw\r\nBio ','revision',2,'source_profile_revision',3),'Raw text preserved with matching new source');
select is(pg_temp.read_edit()->>'profile_text_state','saved','Photo does not create artificial source drift');
select is(pg_temp.read_edit()->'revision_vector','{"profile":3,"layout":7,"connection":3,"blocks":1,"profile_text":2}'::jsonb,'Full revision vector coherent');
create temporary table no_op_before as select to_jsonb(p) profile,to_jsonb(t) recovery from core.identity_working p join core.identity_profile_text_working t using(owner_id) where owner_id=(select owner_id from actors where auth_user_id='24900000-0000-4000-8000-000000000001');
select is(pg_temp.photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',3,2),'{"status":"success","changed":false,"profile_revision":3,"text_revision":2,"profile_asset_key":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb,'Exact same-key no-op');
select is((select to_jsonb(p) from core.identity_working p where owner_id=(select owner_id from actors where auth_user_id='24900000-0000-4000-8000-000000000001')),(select profile from no_op_before),'No-op profile timestamp unchanged');
select is((select to_jsonb(t) from core.identity_profile_text_working t where owner_id=(select owner_id from actors where auth_user_id='24900000-0000-4000-8000-000000000001')),(select recovery from no_op_before),'No-op recovery timestamp unchanged');
select is(pg_temp.photo('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',3,2),'{"status":"invalid_asset"}'::jsonb,'Foreign asset unavailable without existence disclosure');
select is(pg_temp.photo('dddddddd-dddd-4ddd-8ddd-dddddddddddd',3,2),'{"status":"invalid_asset"}'::jsonb,'Missing asset same denial');
update core.profile_media_upload_intents set status='processing',consumed_at=null where id='24900000-0000-4000-8000-000000000001';
select is(pg_temp.photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',3,2),'{"status":"invalid_asset"}'::jsonb,'Unconsumed same-key asset cannot receive acknowledgment');
update core.profile_media_upload_intents set status='consumed',consumed_at=now() where id='24900000-0000-4000-8000-000000000001';
-- Restore exact fixture metadata to verify subsequent operations never mutate it.
update preserved set intents=(select jsonb_agg(to_jsonb(x) order by id) from core.profile_media_upload_intents x);
select is(pg_temp.photo('cccccccc-cccc-4ccc-8ccc-cccccccccccc',2,2),'{"status":"stale_source"}'::jsonb,'Source CAS denial');
select is(pg_temp.photo('cccccccc-cccc-4ccc-8ccc-cccccccccccc',3,1),'{"status":"stale_write"}'::jsonb,'Text CAS denial');
select is(pg_temp.photo('cccccccc-cccc-4ccc-8ccc-cccccccccccc',3,null),'{"status":"stale_write"}'::jsonb,'Unknown existing recovery cannot be overwritten');
update core.identity_working set revision=4 where owner_id=(select owner_id from actors where auth_user_id='24900000-0000-4000-8000-000000000001');
select is(pg_temp.photo('cccccccc-cccc-4ccc-8ccc-cccccccccccc',4,2),'{"status":"stale_source"}'::jsonb,'Earlier source drift requires full text review, never silent rebase');
select is(pg_temp.read_edit()->>'profile_text_state','source_changed','Earlier raw source drift preserved');
select is(api.save_current_owner_profile_text_working('{"action":"save_profile_text_working","base_profile_revision":4,"base_text_revision":2,"profile_text_working":{"display_name":null,"bio":" Raw\r\nBio "}}')->>'status','success','Explicit text review/rebase permitted');
select is(pg_temp.photo('cccccccc-cccc-4ccc-8ccc-cccccccccccc',4,3)->>'profile_revision','5','Reviewed source photo replacement');
select is(pg_temp.photo(null,5,4),'{"status":"success","changed":true,"profile_revision":6,"text_revision":5,"profile_asset_key":null}'::jsonb,'Explicit photo removal keeps raw text coherent');
select is(pg_temp.read_edit()#>'{profile_working,profile_asset_key}','null'::jsonb,'Removed source photo null');
select is(pg_temp.read_edit()#>>'{profile_text_working,bio}',E' Raw\r\nBio ','Removal preserves raw recovery');
select is(pg_temp.read_edit()#>>'{profile_working,display_name}','Private Identity','Canonical name unchanged');
select is(pg_temp.read_edit()#>>'{profile_working,bio}',E'Private\nBio','Canonical Bio unchanged');
select is((select jsonb_agg(to_jsonb(x) order by asset_key) from core.profile_media_assets x),(select assets from preserved),'All old/new immutable assets retained');
select is((select jsonb_agg(to_jsonb(x) order by id) from core.profile_media_upload_intents x),(select intents from preserved),'No upload/intent mutation');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_layout_working x where owner_id in(select owner_id from actors)),(select layout from preserved),'Layout unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x where owner_id in(select owner_id from actors)),(select progress from preserved),'No onboarding replay');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_connection_working x where owner_id in(select owner_id from actors)),(select source from preserved),'Connection unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x where owner_id in(select owner_id from actors)),(select publication from preserved),'Previous Published unchanged');
select is(pg_temp.read_edit()#>'{collection}',(select blocks from preserved),'Six block collection untouched');
select is(api.save_current_owner_profile_photo_working('null'::jsonb),'{"status":"invalid_profile_photo_working"}'::jsonb,'Malformed/URL/authority shape denied');
select is(api.save_current_owner_profile_photo_working('{}'::jsonb),'{"status":"invalid_profile_photo_working"}'::jsonb,'Malformed/URL/authority shape denied');
select is(api.save_current_owner_profile_photo_working('[]'::jsonb),'{"status":"invalid_profile_photo_working"}'::jsonb,'Malformed/URL/authority shape denied');
select is(api.save_current_owner_profile_photo_working('{"action":"save_profile_photo_working","base_profile_revision":6,"base_text_revision":5,"profile_asset_key":"https://foreign.example/a.webp"}'::jsonb),'{"status":"invalid_profile_photo_working"}'::jsonb,'Malformed/URL/authority shape denied');
select is(api.save_current_owner_profile_photo_working('{"action":"save_profile_photo_working","base_profile_revision":6,"base_text_revision":5,"profile_asset_key":null,"owner_id":"foreign"}'::jsonb),'{"status":"invalid_profile_photo_working"}'::jsonb,'Malformed/URL/authority shape denied');
select is(pg_temp.photo(null,0,5),'{"status":"invalid_profile_photo_working"}'::jsonb,'Unsafe revision denied');
select is(pg_temp.photo(null,6,0),'{"status":"invalid_profile_photo_working"}'::jsonb,'Unsafe revision denied');
select is(pg_temp.photo(null,6,1.5),'{"status":"invalid_profile_photo_working"}'::jsonb,'Unsafe revision denied');
select is(pg_temp.photo(null,9007199254740992,5),'{"status":"invalid_profile_photo_working"}'::jsonb,'Unsafe revision denied');
select is(pg_temp.photo(null,6,9007199254740992),'{"status":"invalid_profile_photo_working"}'::jsonb,'Unsafe revision denied');
set local request.jwt.claims='{"sub":"24900000-0000-4000-8000-000000000002"}';
select is(pg_temp.photo('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2,null),'{"status":"success","changed":true,"profile_revision":3,"text_revision":null,"profile_asset_key":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}'::jsonb,'No recovery row is synthesized');
select is(pg_temp.read_edit()->>'profile_text_state','source','Second Owner uses only own source');
select is(pg_temp.photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',3,null),'{"status":"invalid_asset"}'::jsonb,'Second Owner cannot use first asset');
select is(pg_temp.photo(null,3,null)->>'profile_revision','4','Second Owner removes only own selection');
select is((select revision::text from core.identity_working where owner_id=(select owner_id from actors where auth_user_id='24900000-0000-4000-8000-000000000001')),'6','First Owner remains isolated');
delete from core.identity_working where owner_id=(select owner_id from actors where auth_user_id='24900000-0000-4000-8000-000000000002');
select is(pg_temp.photo(null,4,null),'{"status":"unavailable"}'::jsonb,'Missing profile never initialized');
set local request.jwt.claims='{"sub":"24900000-0000-4000-8000-000000000001"}';
update core.identity_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='24900000-0000-4000-8000-000000000001');
update core.identity_profile_text_working set revision=9007199254740991,source_profile_revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='24900000-0000-4000-8000-000000000001');
select is(pg_temp.photo(null,9007199254740991,9007199254740991)->>'changed','false','Maximum-safe no-op retained');
select is(pg_temp.photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',9007199254740991,9007199254740991),'{"status":"revision_exhausted"}'::jsonb,'Exhaustion cannot partially attach/rebase');
select is(pg_temp.read_edit()#>'{profile_working,profile_asset_key}','null'::jsonb,'Exhaustion preserves source selection');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='24900000-0000-4000-8000-000000000001');
select is(pg_temp.photo(null,9007199254740991,9007199254740991),'{"status":"owner_not_eligible"}'::jsonb,'Restricted denied');
set local request.jwt.claims='{}';
select is(pg_temp.photo(null,1,null),'{"status":"unauthenticated"}'::jsonb,'Anonymous denied');
select * from finish();
rollback;

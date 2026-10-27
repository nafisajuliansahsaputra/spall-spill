begin;
select no_plan();
select ok((select prosecdef and provolatile='v' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) from pg_proc where oid='api.initialize_current_owner_blocks_from_media(jsonb)'::regprocedure),'Hardened volatile empty-path definer');
select ok(not has_function_privilege('anon','api.initialize_current_owner_blocks_from_media(jsonb)','EXECUTE'),'anon execution withheld');
set local role anon;
select throws_ok($$select api.initialize_current_owner_blocks_from_media('{}')$$,'42501',null,'Actual anon denied');
reset role;
select ok(not has_function_privilege('authenticated','api.initialize_current_owner_blocks_from_media(jsonb)','EXECUTE'),'authenticated execution withheld');
set local role authenticated;
select throws_ok($$select api.initialize_current_owner_blocks_from_media('{}')$$,'42501',null,'Actual authenticated denied');
reset role;
select ok(not has_function_privilege('service_role','api.initialize_current_owner_blocks_from_media(jsonb)','EXECUTE'),'service_role execution withheld');
set local role service_role;
select throws_ok($$select api.initialize_current_owner_blocks_from_media('{}')$$,'42501',null,'Actual service_role denied');
reset role;
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='initialize_current_owner_blocks_from_media' and grantee='PUBLIC'),'PUBLIC execution withheld');
set local request.jwt.claims='{}';
select is(api.initialize_current_owner_blocks_from_media('{}'),'{"status":"unauthenticated"}'::jsonb,'No actor');
set local request.jwt.claims='{"sub":"23300000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"forged"}}';
select is(api.initialize_current_owner_blocks_from_media('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata not authority');
insert into auth.users(id,email) values
 ('23300000-0000-4000-8000-000000000001','media-init-one@example.test'),
 ('23300000-0000-4000-8000-000000000002','media-init-two@example.test'),
 ('23300000-0000-4000-8000-000000000003','media-init-missing@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('23300000-0000-4000-8000-000000000001','23300000-0000-4000-8000-000000000002','23300000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='business' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'media-init-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"23300000-0000-4000-8000-000000000001"}';
select is(api.initialize_current_owner_blocks_from_media('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner cannot initialize');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
insert into core.identity_connection_working(owner_id,connection_kind,social_platform,destination_url,revision)
 select owner_id,case when auth_user_id='23300000-0000-4000-8000-000000000001' then 'generic_link'::core.identity_connection_kind else 'social'::core.identity_connection_kind end,
 case when auth_user_id='23300000-0000-4000-8000-000000000001' then null else 'custom_platform-1' end,
 'HTTPS://Private.example.test/Exact?X=1#Recoverable',3 from actors where auth_user_id<>'23300000-0000-4000-8000-000000000003';

-- Synthetic registry only, not real sanitizer/storage evidence.
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select auth_user_id,owner_id,'image/png',12,'staging/profile/'||owner_id||'/'||auth_user_id,'consumed',now()+interval '10 minutes',now() from actors
 where auth_user_id<>'23300000-0000-4000-8000-000000000003';
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select case when auth_user_id='23300000-0000-4000-8000-000000000001' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end,
 owner_id,'working/profile/'||case when auth_user_id='23300000-0000-4000-8000-000000000001' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end||'.webp',
 'image/webp',12,1,1,auth_user_id from actors where auth_user_id<>'23300000-0000-4000-8000-000000000003';

-- First Media initialization race fixtures end here.
-- Actual foreign Text/Link/provenance rows prove preservation beyond empty tables.
insert into auth.users(id,email) values('23300000-0000-4000-8000-000000000004','media-init-foreign@example.test');
insert into core.identity_block_collections_working(owner_id) select owner_id from core.owner_auth_bindings where auth_user_id='23300000-0000-4000-8000-000000000004';
insert into core.identity_blocks_working(block_id,owner_id,kind,position) select '23300000-0000-4000-8000-000000000014',owner_id,'text',1 from core.owner_auth_bindings where auth_user_id='23300000-0000-4000-8000-000000000004';
insert into core.identity_blocks_working(block_id,owner_id,kind,position) select '23300000-0000-4000-8000-000000000015',owner_id,'generic_link',2 from core.owner_auth_bindings where auth_user_id='23300000-0000-4000-8000-000000000004';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content) select block_id,owner_id,kind,'Foreign raw' from core.identity_blocks_working where block_id='23300000-0000-4000-8000-000000000014';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,destination_url) select block_id,owner_id,kind,'Foreign link','https://foreign.example.test' from core.identity_blocks_working where block_id='23300000-0000-4000-8000-000000000015';
insert into core.identity_block_initialization_provenance(owner_id,initial_block_id,source_connection_revision,source_connection_kind,source_destination_url) select owner_id,block_id,3,'generic_link','https://foreign.example.test' from core.identity_blocks_working where block_id='23300000-0000-4000-8000-000000000015';
insert into core.identity_blocks_working(block_id,owner_id,kind,position) select '23300000-0000-4000-8000-000000000016',owner_id,'contact',3 from core.owner_auth_bindings where auth_user_id='23300000-0000-4000-8000-000000000004';
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_type,label,contact_value) select block_id,owner_id,kind,'phone','Foreign Contact','RAW Foreign' from core.identity_blocks_working where block_id='23300000-0000-4000-8000-000000000016';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible) select '23300000-0000-4000-8000-000000000017',owner_id,'media',4,false from core.owner_auth_bindings where auth_user_id='23300000-0000-4000-8000-000000000004';
insert into core.identity_block_media_working(block_id,owner_id,kind,alt_text) select block_id,owner_id,kind,'Foreign raw Media' from core.identity_blocks_working where block_id='23300000-0000-4000-8000-000000000017';
create temporary table foreign_media as select * from core.identity_block_media_working;
create function pg_temp.media_intent(content text default ' <script>raw</script> ' || chr(1), visible boolean default false, asset text default 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
returns jsonb language sql as $$select jsonb_build_object('action','initialize_media_block','base_collection_revision',null,'is_visible',visible,'media_working',jsonb_build_object('kind','media','asset_key',asset,'alt_text',content))$$;
create temporary table purity(table_name text,value jsonb);
do $$declare name text; val jsonb; begin
 foreach name in array array['identity_connection_working','identity_block_initialization_provenance','identity_working','identity_layout_working','identity_publications','onboarding_preview_receipts','owner_auth_bindings','owner_handle_namespaces','owner_onboarding_progress','owners','identity_block_links_working','identity_block_texts_working','identity_block_contacts_working','profile_media_assets','profile_media_upload_intents'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',name) into val;
  insert into purity values(name,val);
 end loop;
end;$$;
create temporary table foreign_collections as select * from core.identity_block_collections_working;
create temporary table foreign_members as select * from core.identity_blocks_working;
create temporary table foreign_texts as select * from core.identity_block_texts_working;
create temporary table foreign_contacts as select * from core.identity_block_contacts_working;
select is(api.initialize_current_owner_blocks_from_media('null'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 1');
select is(api.initialize_current_owner_blocks_from_media('[]'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 2');
select is(api.initialize_current_owner_blocks_from_media('{}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 3');
select is(api.initialize_current_owner_blocks_from_media('"init"'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 4');
select is(api.initialize_current_owner_blocks_from_media('true'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 5');
select is(api.initialize_current_owner_blocks_from_media('0'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 6');
select is(api.initialize_current_owner_blocks_from_media('{"base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 7');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 8');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 9');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 10');
select is(api.initialize_current_owner_blocks_from_media('{"action": null, "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 11');
select is(api.initialize_current_owner_blocks_from_media('{"action": true, "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 12');
select is(api.initialize_current_owner_blocks_from_media('{"action": "add_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 13');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_contact_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 14');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_link_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 15');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_text_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 16');
select is(api.initialize_current_owner_blocks_from_media('{"action": "import_onboarding_connection", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 17');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": 0, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 18');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": 1, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 19');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": 9007199254740991, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 20');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": "null", "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 21');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": false, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 22');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": [], "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 23');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": {}, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 24');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": null, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 25');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": 0, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 26');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": "false", "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 27');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": [], "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 28');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": {}, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 29');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}, "owner_id": "forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 30');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}, "block_id": "forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 31');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}, "position": "forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 32');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}, "source_revision": "forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 33');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}, "asset_state": "forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 34');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}, "url": "forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 35');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw"}, "issues": "forged"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 36');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": null}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 37');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": []}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 38');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 39');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": "raw"}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 40');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 41');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 42');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 43');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "text", "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 44');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": null, "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 45');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": true, "asset_key": null, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 46');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": "not-uuid", "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 47');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": "123", "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 48');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": 12, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 49');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": false, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 50');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": [], "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 51');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": {}, "alt_text": "Raw"}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 52');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": 12}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 53');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": false}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 54');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": []}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 55');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": {}}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 56');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw", "owner_id": null}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 57');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw", "block_id": null}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 58');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw", "url": null}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 59');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw", "object_key": null}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 60');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw", "asset_state": null}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 61');
select is(api.initialize_current_owner_blocks_from_media('{"action": "initialize_media_block", "base_collection_revision": null, "is_visible": false, "media_working": {"kind": "media", "asset_key": null, "alt_text": "Raw", "issues": null}}'::jsonb),'{"status":"invalid_initialization_intent"}'::jsonb,'Strict first Media envelope 62');
select is(api.initialize_current_owner_blocks_from_media(null),'{"status":"invalid_initialization_intent"}'::jsonb,'SQL null denied');
select is(api.initialize_current_owner_blocks_from_media(jsonb_set(pg_temp.media_intent(),'{media_working,alt_text}',to_jsonb(repeat('🙂',2049)))),'{"status":"invalid_initialization_intent"}'::jsonb,'No truncation');
select throws_ok($q$select api.initialize_current_owner_blocks_from_media('{"action":"initialize_media_block","base_collection_revision":null,"is_visible":false,"media_working":{"kind":"media","asset_key":null,"alt_text":"\u0000"}}'::jsonb)$q$,'22P05',null,'PostgreSQL rejects NUL before invocation');
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent('denied',false,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),'{"status":"invalid_asset"}'::jsonb,'Foreign/missing/case key denial');
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent('denied',false,'cccccccc-cccc-4ccc-8ccc-cccccccccccc')),'{"status":"invalid_asset"}'::jsonb,'Foreign/missing/case key denial');
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent('denied',false,'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA')),'{"status":"invalid_asset"}'::jsonb,'Foreign/missing/case key denial');
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent('denied',false,'00000000-0000-0000-0000-000000000000')),'{"status":"invalid_asset"}'::jsonb,'Foreign/missing/case key denial');
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent('denied',false,'ffffffff-ffff-ffff-ffff-ffffffffffff')),'{"status":"invalid_asset"}'::jsonb,'Foreign/missing/case key denial');
update core.profile_media_upload_intents set status='pending',consumed_at=null where id='23300000-0000-4000-8000-000000000001';
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()),'{"status":"invalid_asset"}'::jsonb,'Unconsumed pending denied');
update core.profile_media_upload_intents set status='processing',consumed_at=null where id='23300000-0000-4000-8000-000000000001';
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()),'{"status":"invalid_asset"}'::jsonb,'Unconsumed processing denied');
update core.profile_media_upload_intents set status='rejected',consumed_at=null where id='23300000-0000-4000-8000-000000000001';
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()),'{"status":"invalid_asset"}'::jsonb,'Unconsumed rejected denied');
update core.profile_media_upload_intents set status='expired',consumed_at=null where id='23300000-0000-4000-8000-000000000001';
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()),'{"status":"invalid_asset"}'::jsonb,'Unconsumed expired denied');
update core.profile_media_upload_intents set status='consumed',consumed_at=now(),created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id='23300000-0000-4000-8000-000000000001';
update core.profile_media_assets set byte_size=1 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()),'{"status":"invalid_asset"}'::jsonb,'Invalid bytes 1 deny before creation');
update core.profile_media_assets set byte_size=11 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()),'{"status":"invalid_asset"}'::jsonb,'Invalid bytes 11 deny before creation');
update core.profile_media_assets set byte_size=3145729 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()),'{"status":"invalid_asset"}'::jsonb,'Invalid bytes 3145729 deny before creation');
update core.profile_media_assets set byte_size=12 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update purity set value=(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from core.profile_media_upload_intents t) where table_name='profile_media_upload_intents';
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='23300000-0000-4000-8000-000000000001');
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()),'{"status":"owner_not_eligible"}'::jsonb,'restricted denied');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='23300000-0000-4000-8000-000000000001');
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()),'{"status":"owner_not_eligible"}'::jsonb,'suspended denied');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='23300000-0000-4000-8000-000000000001');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='23300000-0000-4000-8000-000000000001');
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()),'{"status":"unavailable"}'::jsonb,'Canonical context required');
update core.owner_onboarding_progress set primary_use_case='business' where owner_id=(select owner_id from actors where auth_user_id='23300000-0000-4000-8000-000000000001');
select is((select count(*) from core.identity_block_collections_working where owner_id in(select owner_id from actors)),0::bigint,'All denials no collection');
-- Fail at each insert boundary, including AFTER payload insertion: no partial state.
create function pg_temp.reject_media_init() returns trigger language plpgsql as $$begin raise exception 'fixture blocked first Media'; end;$$;
create trigger reject_media_init before insert on core.identity_blocks_working for each row execute function pg_temp.reject_media_init();
select throws_ok('select api.initialize_current_owner_blocks_from_media(pg_temp.media_intent())','P0001','fixture blocked first Media','before identity_blocks_working failure propagates');
drop trigger reject_media_init on core.identity_blocks_working;
select is((select count(*) from core.identity_block_collections_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no collection');
select is((select count(*) from core.identity_blocks_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no membership');
select is((select count(*) from core.identity_block_media_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no payload');
create trigger reject_media_init before insert on core.identity_block_media_working for each row execute function pg_temp.reject_media_init();
select throws_ok('select api.initialize_current_owner_blocks_from_media(pg_temp.media_intent())','P0001','fixture blocked first Media','before identity_block_media_working failure propagates');
drop trigger reject_media_init on core.identity_block_media_working;
select is((select count(*) from core.identity_block_collections_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no collection');
select is((select count(*) from core.identity_blocks_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no membership');
select is((select count(*) from core.identity_block_media_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no payload');
create trigger reject_media_init after insert on core.identity_block_media_working for each row execute function pg_temp.reject_media_init();
select throws_ok('select api.initialize_current_owner_blocks_from_media(pg_temp.media_intent())','P0001','fixture blocked first Media','after identity_block_media_working failure propagates');
drop trigger reject_media_init on core.identity_block_media_working;
select is((select count(*) from core.identity_block_collections_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no collection');
select is((select count(*) from core.identity_blocks_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no membership');
select is((select count(*) from core.identity_block_media_working where owner_id in(select owner_id from actors)),0::bigint,'Rollback no payload');
create temporary table replies(value jsonb);
insert into replies values(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()));
select is((select array_agg(k order by k) from replies,jsonb_object_keys(value) k),array['block_id','collection_revision','status'],'Exact minimal acknowledgment');
select is((select value->>'status' from replies),'success','First Media initialized');
select is((select value->>'collection_revision' from replies),'1','Creation revision1');
select matches((select value->>'block_id' from replies),'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$','Server UUID');
select ok((select b.kind='media' and not b.is_visible and b.position=1 and b.owner_id=(select owner_id from actors where auth_user_id='23300000-0000-4000-8000-000000000001') from core.identity_blocks_working b where b.block_id=(select (value->>'block_id')::uuid from replies)),'Actual own hidden first Media membership');
select is((select t.alt_text from core.identity_block_media_working t where t.block_id=(select (value->>'block_id')::uuid from replies)),pg_temp.media_intent()->'media_working'->>'alt_text','Recoverable raw control and markup retained');
select is((select api.resolve_current_owner_media_block_working((value->>'block_id')::uuid)->'block'->'media_working' from replies),(pg_temp.media_intent()->'media_working')-'kind','Selected reader observes exact persisted raw Media');
create temporary table initial_collection as select * from core.identity_block_collections_working;
create temporary table initial_members as select * from core.identity_blocks_working;
create temporary table initial_payloads as select * from core.identity_block_media_working;
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()),'{"status":"already_initialized"}'::jsonb,'Replay is conflict, not success');
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent('foreign',false,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),'{"status":"already_initialized"}'::jsonb,'Existing collection conflict precedes asset validation');
select ok(not exists((select * from core.identity_block_collections_working except select * from initial_collection) union all(select * from initial_collection except select * from core.identity_block_collections_working)),'Existing conflict retains every identity_block_collections_working column');
select ok(not exists((select * from core.identity_blocks_working except select * from initial_members) union all(select * from initial_members except select * from core.identity_blocks_working)),'Existing conflict retains every identity_blocks_working column');
select ok(not exists((select * from core.identity_block_media_working except select * from initial_payloads) union all(select * from initial_payloads except select * from core.identity_block_media_working)),'Existing conflict retains every identity_block_media_working column');
delete from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='23300000-0000-4000-8000-000000000001');
select is(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent()),'{"status":"already_initialized"}'::jsonb,'Initialized-empty collection not replaced');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='23300000-0000-4000-8000-000000000001')),1::bigint,'Empty conflict no revision bump');
set local request.jwt.claims='{"sub":"23300000-0000-4000-8000-000000000003"}';
insert into replies values(api.initialize_current_owner_blocks_from_media(pg_temp.media_intent(null,true,null)));
select ok((select asset_key is null and alt_text is null and kind='media' from core.identity_block_media_working where owner_id=(select owner_id from actors where auth_user_id='23300000-0000-4000-8000-000000000003')),'No source or asset needed; present all-null Media');
select ok((select is_visible and position=1 from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='23300000-0000-4000-8000-000000000003')),'Explicit visible retained');
select is((select count(distinct value->>'block_id') from replies),2::bigint,'Distinct server IDs across Owners');
set local request.jwt.claims='{"sub":"23300000-0000-4000-8000-000000000002"}';
create function pg_temp.check_raw_initialization() returns setof text language plpgsql as $$declare raw text; key text; reply jsonb; expected jsonb; begin
 foreach key in array array[null,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'] loop
  foreach raw in array array[null,'',E'  \r\n\t  ','<script>raw</script>'||chr(1),'é🐈',repeat('🙂',2048)] loop
   expected := pg_temp.media_intent(raw,true,key);
   reply := api.initialize_current_owner_blocks_from_media(expected);
   return next is(reply->>'status','success','Raw first Media accepted');
   return next is((select jsonb_build_object('kind',kind,'asset_key',asset_key,'alt_text',alt_text) from core.identity_block_media_working where block_id=(reply->>'block_id')::uuid),expected->'media_working','Whole raw Media tuple retained');
   delete from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='23300000-0000-4000-8000-000000000002');
  end loop;
 end loop;
end;$$;
select * from pg_temp.check_raw_initialization();
select ok(not exists(select * from foreign_collections except select * from core.identity_block_collections_working),'All preexisting collections retained');
select ok(not exists(select * from foreign_members except select * from core.identity_blocks_working),'All preexisting memberships retained');
select ok(not exists(select * from foreign_texts except select * from core.identity_block_texts_working),'All preexisting Text payloads retained');
create function pg_temp.check_purity() returns setof text language plpgsql as $$declare item record; val jsonb; begin
 for item in select * from purity loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',item.table_name) into val;
  return next is(val,item.value,item.table_name || ' unchanged');
 end loop;
end;$$;
select ok(not exists(select * from foreign_contacts except select * from core.identity_block_contacts_working),'All preexisting Contact payloads retained');
select ok(not exists(select * from foreign_media except select * from core.identity_block_media_working),'Foreign Media retains every column');
select * from pg_temp.check_purity();
select * from finish();
rollback;

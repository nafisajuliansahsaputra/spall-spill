begin;
select no_plan();
select ok((select prosecdef and provolatile='v' from pg_proc where oid='api.add_current_owner_link_block_working(jsonb)'::regprocedure),'Hardened volatile CAS definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.add_current_owner_link_block_working(jsonb)'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.add_current_owner_link_block_working(jsonb)','EXECUTE'),'anon execution withheld');
select ok(not has_function_privilege('authenticated','api.add_current_owner_link_block_working(jsonb)','EXECUTE'),'authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.add_current_owner_link_block_working(jsonb)','EXECUTE'),'service execution withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='add_current_owner_link_block_working' and grantee='PUBLIC'),'PUBLIC execution withheld');
set local role authenticated;
select throws_ok($$select api.add_current_owner_link_block_working('{}')$$,'42501',null,'Actual authenticated execution denied');
reset role;
set local role anon;
select throws_ok($$select api.add_current_owner_link_block_working('{}')$$,'42501',null,'Actual anon execution denied');
reset role;
set local role service_role;
select throws_ok($$select api.add_current_owner_link_block_working('{}')$$,'42501',null,'Actual service execution denied');
reset role;
set local request.jwt.claims='{}';
select is(api.add_current_owner_link_block_working('{}'),'{"status":"unauthenticated"}'::jsonb,'No actor denies');
set local request.jwt.claims='{"sub":"99000000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"forged"}}';
select is(api.add_current_owner_link_block_working('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata cannot invent Owner');
insert into auth.users(id,email) values
 ('99000000-0000-4000-8000-000000000001','add-one@example.test'),
 ('99000000-0000-4000-8000-000000000002','add-two@example.test'),
 ('99000000-0000-4000-8000-000000000003','add-empty@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in (select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'add-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"99000000-0000-4000-8000-000000000001"}';
select is(api.add_current_owner_link_block_working('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner denies');
update core.owners set onboarding_completed_at=now() where id in (select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id<>'99000000-0000-4000-8000-000000000003';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select '99000000-0000-4000-8000-000000000011',owner_id,'generic_link',1,false from actors where auth_user_id='99000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '99000000-0000-4000-8000-000000000012',owner_id,'social',2 from actors where auth_user_id='99000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '99000000-0000-4000-8000-000000000013',owner_id,'text',3 from actors where auth_user_id='99000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '99000000-0000-4000-8000-000000000014',owner_id,'generic_link',1 from actors where auth_user_id='99000000-0000-4000-8000-000000000002';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url,created_at)
 select block_id,owner_id,kind,'original',null,'https://original.example.test','2000-01-01'::timestamptz
 from core.identity_blocks_working where block_id in ('99000000-0000-4000-8000-000000000011','99000000-0000-4000-8000-000000000014');
insert into core.identity_connection_working(owner_id,connection_kind,destination_url,revision)
 select owner_id,'generic_link','https://source.example.test',3 from actors where auth_user_id='99000000-0000-4000-8000-000000000001';
insert into core.identity_block_initialization_provenance(owner_id,initial_block_id,source_connection_revision,source_connection_kind,source_destination_url,initial_title)
 select owner_id,'99000000-0000-4000-8000-000000000011',3,'generic_link','https://source.example.test','original' from actors where auth_user_id='99000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '99000000-0000-4000-8000-000000000015',owner_id,'contact',4 from actors where auth_user_id='99000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '99000000-0000-4000-8000-000000000016',owner_id,'media',5 from actors where auth_user_id='99000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '99000000-0000-4000-8000-000000000017',owner_id,'spill_cta',6 from actors where auth_user_id='99000000-0000-4000-8000-000000000001';
update core.identity_blocks_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_block_collections_working set created_at='2000-01-01',updated_at='2000-01-01' where owner_id in (select owner_id from actors);
update core.identity_blocks_working set position=case right(block_id::text,2)
 when '11' then 1 when '12' then 7 when '13' then 42 when '15' then 100 when '16' then 500 when '17' then 1000 else position end
 where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001');
update core.identity_blocks_working set position=7 where block_id='99000000-0000-4000-8000-000000000014';
-- Addition CAS race fixtures end here.
create temporary table original_members as select * from core.identity_blocks_working;
create temporary table original_collections as select * from core.identity_block_collections_working;
create temporary table original_payload as select * from core.identity_block_links_working;
create temporary table original_source as select * from core.identity_connection_working;
create temporary table original_provenance as select * from core.identity_block_initialization_provenance;
create temporary table original_profile as select * from core.identity_working;
create temporary table original_layout as select * from core.identity_layout_working;
create temporary table original_publications as select * from core.identity_publications;
create temporary table original_receipts as select * from core.onboarding_preview_receipts;
create temporary table original_bindings as select * from core.owner_auth_bindings;
create temporary table original_namespaces as select * from core.owner_handle_namespaces;
select is(api.add_current_owner_link_block_working('null'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('[]'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('"add"'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": null, "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": true, "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block ", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "import_onboarding_connection", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": null, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 0, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": -1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1.5, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": "1", "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 9007199254740992, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": null, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": 0, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": 1, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": "true", "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": "false", "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": null}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": []}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Strict outer shape');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}, "owner_id": "forged"}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Caller authority rejected');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}, "block_id": "forged"}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Caller authority rejected');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}, "position": "forged"}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Caller authority rejected');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}, "neighbor_block_id": "forged"}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Caller authority rejected');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}, "source_revision": "forged"}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Caller authority rejected');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}, "published": "forged"}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Caller authority rejected');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}, "provenance": "forged"}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Caller authority rejected');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}, "issues": "forged"}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Caller authority rejected');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Nested fields required');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Nested fields required');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Nested fields required');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Nested fields required');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": null, "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Typed shape and budgets');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "text", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Typed shape and budgets');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "social ", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Typed shape and budgets');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "Social", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Typed shape and budgets');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": 3, "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Typed shape and budgets');
select is(api.add_current_owner_link_block_working(jsonb_build_object('action','"add_link_block"'::jsonb,'base_collection_revision','1'::jsonb,'is_visible','false'::jsonb,'link_working',jsonb_build_object('kind','"generic_link"'::jsonb,'title',to_jsonb(repeat('🙂',513)),'social_platform','"unexpected"'::jsonb,'destination_url','"javascript:private"'::jsonb))),'{"status": "invalid_add_intent"}'::jsonb,'Typed shape and budgets');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": false, "destination_url": "javascript:private"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Typed shape and budgets');
select is(api.add_current_owner_link_block_working(jsonb_build_object('action','"add_link_block"'::jsonb,'base_collection_revision','1'::jsonb,'is_visible','false'::jsonb,'link_working',jsonb_build_object('kind','"generic_link"'::jsonb,'title','" <script>raw</script> "'::jsonb,'social_platform',to_jsonb(repeat('🙂',41)),'destination_url','"javascript:private"'::jsonb))),'{"status": "invalid_add_intent"}'::jsonb,'Typed shape and budgets');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": {}}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Typed shape and budgets');
select is(api.add_current_owner_link_block_working(jsonb_build_object('action','"add_link_block"'::jsonb,'base_collection_revision','1'::jsonb,'is_visible','false'::jsonb,'link_working',jsonb_build_object('kind','"generic_link"'::jsonb,'title','" <script>raw</script> "'::jsonb,'social_platform','"unexpected"'::jsonb,'destination_url',to_jsonb(repeat('🙂',2049))))),'{"status": "invalid_add_intent"}'::jsonb,'Typed shape and budgets');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private", "owner_id": "forged"}}'::jsonb),'{"status": "invalid_add_intent"}'::jsonb,'Nested Owner rejected');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 2, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "stale_write"}'::jsonb,'Wrong base no allocation');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "owner_not_eligible"}'::jsonb,'Nonactive no allocation');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "owner_not_eligible"}'::jsonb,'Nonactive no allocation');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001');
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "unavailable"}'::jsonb,'Missing canonical context');
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001');
select ok(not exists((select * from core.identity_blocks_working except select * from original_members) union all(select * from original_members except select * from core.identity_blocks_working)),'Denied members unchanged');
select ok(not exists((select * from core.identity_block_links_working except select * from original_payload) union all(select * from original_payload except select * from core.identity_block_links_working)),'Denied payload unchanged');
select ok(not exists((select * from core.identity_block_collections_working except select * from original_collections) union all(select * from original_collections except select * from core.identity_block_collections_working)),'Denied collections unchanged');
create function pg_temp.fail_after_add() returns void language plpgsql as $$ begin
 perform api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb); raise exception 'fixture forced rollback'; end; $$;
select throws_ok('select pg_temp.fail_after_add()','P0001','fixture forced rollback','Error rolls back all addition records');
select ok(not exists((select * from core.identity_blocks_working except select * from original_members) union all(select * from original_members except select * from core.identity_blocks_working)),'Rollback members exact');
select ok(not exists((select * from core.identity_block_links_working except select * from original_payload) union all(select * from original_payload except select * from core.identity_block_links_working)),'Rollback payload exact');
select ok(not exists((select * from core.identity_block_collections_working except select * from original_collections) union all(select * from original_collections except select * from core.identity_block_collections_working)),'Rollback collections exact');
create temporary table replies(value jsonb); insert into replies values(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb));
select is((select value->>'status' from replies),'success','Confirmed addition acknowledged');
select is((select value - 'block_id' from replies),'{"status":"success","collection_revision":2}'::jsonb,'Minimal acknowledgment');
select ok((select value->>'block_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' from replies),'Server canonical UUID');
select is((select position from core.identity_blocks_working where block_id=(select (value->>'block_id')::uuid from replies)),1001,'Append own max including hidden and unsupported kinds');
select ok((select owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001') and kind='generic_link' and not is_visible from core.identity_blocks_working where block_id=(select (value->>'block_id')::uuid from replies)),'Actual own kind and explicit hidden intent');
select is((select jsonb_build_object('kind',kind,'title',title,'social_platform',social_platform,'destination_url',destination_url) from core.identity_block_links_working where block_id=(select (value->>'block_id')::uuid from replies)),'{"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}'::jsonb,'Exact invalid raw Working retained');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001')),2::bigint,'One collection bump');
select ok(not exists(select * from original_members except select * from core.identity_blocks_working),'All old member columns retained');
select ok(not exists(select * from original_payload except select * from core.identity_block_links_working),'Old payload columns retained');
select is((select created_at from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001')),'2000-01-01'::timestamptz,'Collection created_at retained');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "stale_write"}'::jsonb,'Replay old base does not duplicate');
select is((select count(*) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001')),7::bigint,'Replay count stable');
insert into replies values(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 2, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb));
select is((select count(distinct value->>'block_id') from replies),2::bigint,'Fresh add allocates distinct stable ID even identical content');
insert into replies values(api.add_current_owner_link_block_working(jsonb_build_object('action','"add_link_block"'::jsonb,'base_collection_revision','3'::jsonb,'is_visible','true'::jsonb,'link_working',jsonb_build_object('kind','"social"'::jsonb,'title','null'::jsonb,'social_platform',to_jsonb(repeat('🙂',40)),'destination_url',to_jsonb(repeat('🙂',2048))))));
select is((select char_length(destination_url) from core.identity_block_links_working where block_id=(select (value->>'block_id')::uuid from replies where value->>'collection_revision'='4')),2048,'Unicode code-point envelope');
select ok(not exists((select * from core.identity_connection_working except select * from original_source) union all(select * from original_source except select * from core.identity_connection_working)),'source fully unchanged');
select ok(not exists((select * from core.identity_block_initialization_provenance except select * from original_provenance) union all(select * from original_provenance except select * from core.identity_block_initialization_provenance)),'provenance fully unchanged');
select ok(not exists((select * from core.identity_working except select * from original_profile) union all(select * from original_profile except select * from core.identity_working)),'profile fully unchanged');
select ok(not exists((select * from core.identity_layout_working except select * from original_layout) union all(select * from original_layout except select * from core.identity_layout_working)),'layout fully unchanged');
select ok(not exists((select * from core.identity_publications except select * from original_publications) union all(select * from original_publications except select * from core.identity_publications)),'publications fully unchanged');
select ok(not exists((select * from core.onboarding_preview_receipts except select * from original_receipts) union all(select * from original_receipts except select * from core.onboarding_preview_receipts)),'receipts fully unchanged');
select ok(not exists((select * from core.owner_auth_bindings except select * from original_bindings) union all(select * from original_bindings except select * from core.owner_auth_bindings)),'bindings fully unchanged');
select ok(not exists((select * from core.owner_handle_namespaces except select * from original_namespaces) union all(select * from original_namespaces except select * from core.owner_handle_namespaces)),'namespaces fully unchanged');
select ok(not exists((select * from core.identity_blocks_working where owner_id<>(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001') except select * from original_members where owner_id<>(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001')) union all(select * from original_members where owner_id<>(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001') except select * from core.identity_blocks_working where owner_id<>(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001'))),'Foreign members untouched');
update core.identity_blocks_working set position=2147483647 where block_id='99000000-0000-4000-8000-000000000017';
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 4, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "position_exhausted"}'::jsonb,'Maximum int32 position no overflow or gap reuse');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001')),4::bigint,'Overflow no bump');
update core.identity_block_collections_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000001');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 9007199254740991, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "revision_exhausted"}'::jsonb,'Safe revision exhaustion before allocation');
set local request.jwt.claims='{"sub":"99000000-0000-4000-8000-000000000002"}'; delete from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002');
insert into replies values(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "social", "title": null, "social_platform": null, "destination_url": null}}'::jsonb));
select is((select position from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002')),1,'Explicit empty appends at1 without importing source');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002')),2::bigint,'Empty uses existing collection revision');
-- 12.111: bounded complete readback makes500 an obsolete allocation gate.
create function pg_temp.read_capacity_pages() returns jsonb language plpgsql as $$
declare request jsonb := '{"expected_collection_revision":null,"after_position":null}';
  reply jsonb; pages jsonb := '[]';
begin
  for page in 1..10 loop
    reply := api.resolve_current_owner_blocks_working_page(request);
    pages := pages || jsonb_build_array(reply);
    exit when reply->>'status' is distinct from 'success' or reply->'collection' is null
      or reply->'collection'->>'has_more' is distinct from 'true';
    request := jsonb_build_object('expected_collection_revision',reply->'collection'->'revision',
      'after_position',reply->'collection'->'next_after_position');
  end loop;
  return pages;
end; $$;
create temporary table capacity_replies(value jsonb);
create temporary table capacity_pages(label text,value jsonb);
insert into core.identity_blocks_working(owner_id,kind,position,is_visible)
  select (select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002'),'contact',g,false from generate_series(2,500) g;
insert into capacity_replies values(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 2, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb));
select is((select count(*) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002')),501::bigint,'500 now appends through501 without truncation');
select is((select value - 'block_id' from capacity_replies),'{"status":"success","collection_revision":3}'::jsonb,'501 minimal acknowledged revision');
select is(api.resolve_current_owner_blocks_working(),'{"status":"unavailable"}'::jsonb,'Standalone old500 reader stays unavailable');
insert into capacity_pages values('501',pg_temp.read_capacity_pages());
select is((select jsonb_array_length(value) from capacity_pages where label='501'),6,'501 complete readback follows six pages');
select is((select item->>'block_id' from capacity_pages p,jsonb_array_elements(p.value) page,
  jsonb_array_elements(page->'collection'->'blocks') item where label='501' and (item->>'position')::int=501),
  (select value->>'block_id' from capacity_replies),'Acknowledged server ID present in complete paged readback');
insert into core.identity_blocks_working(owner_id,kind,position,is_visible)
  select (select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002'),'contact',g,false from generate_series(502,999) g;
insert into capacity_replies values(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 3, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb));
select is((select count(*) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002')),1000::bigint,'999 appends through guarded reconstruction bound1000');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 3, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status":"stale_write"}'::jsonb,'Old base is stale before capacity denial');
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 4, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status":"unavailable"}'::jsonb,'Engineering availability at1000 not product quota');
select is((select count(*) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002')),1000::bigint,'Availability denial no hidden truncation');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002')),4::bigint,'Availability denial no bump');
insert into capacity_pages values('1000',pg_temp.read_capacity_pages());
select is((select jsonb_array_length(value) from capacity_pages where label='1000'),10,'Exactly ten terminal pages reconstruct1000');
select ok((select bool_and(page->>'status'='success' and page->'collection'->>'revision'='4'
  and jsonb_array_length(page->'collection'->'blocks')=100
  and page->'collection'->>'has_more'=case when ordinal<10 then 'true' else 'false' end
  and page->'collection'->'next_after_position'=case when ordinal<10 then to_jsonb(ordinal*100) else 'null'::jsonb end)
  from capacity_pages p,jsonb_array_elements(p.value) with ordinality a(page,ordinal) where label='1000'),
  'Every page binds exact revision and last cursor with terminal null');
create temporary table capacity_rows as select item from capacity_pages p,jsonb_array_elements(p.value) page,
  jsonb_array_elements(page->'collection'->'blocks') item where label='1000';
select is((select count(*) from capacity_rows),1000::bigint,'No omitted rows in complete reconstruction');
select is((select count(distinct item->>'block_id') from capacity_rows),1000::bigint,'Every stable ID appears once');
select is((select array_agg((item->>'position')::int order by (item->>'position')::int) from capacity_rows),
  array(select generate_series(1,1000)),'All ordered positions reconstructed');
select ok((select bool_and(item->'is_visible'='false'::jsonb) from capacity_rows),'Hidden rows are never filtered');
select ok((select bool_and(item->'link_working'=jsonb_build_object('title',l.title,'social_platform',l.social_platform,'destination_url',l.destination_url))
  from capacity_rows c join core.identity_block_links_working l on l.block_id=(c.item->>'block_id')::uuid),
  'Every stored link raw payload preserved across pages');
update core.identity_block_collections_working set revision=5 where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002');
select is(api.resolve_current_owner_blocks_working_page('{"expected_collection_revision":4,"after_position":100}'::jsonb),'{"status":"stale_read"}'::jsonb,'Changed revision rejects old readback continuation');
insert into core.identity_blocks_working(owner_id,kind,position,is_visible) values((select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002'),'text',1001,false);
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 5, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status":"unavailable"}'::jsonb,'Already over bound remains unavailable without deletion');
select is((select count(*) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002')),1001::bigint,'Existing over-bound data stays intact');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='99000000-0000-4000-8000-000000000002')),5::bigint,'Over-bound denial no revision change');
set local request.jwt.claims='{"sub":"99000000-0000-4000-8000-000000000003"}';
select is(api.add_current_owner_link_block_working('{"action": "add_link_block", "base_collection_revision": 1, "is_visible": false, "link_working": {"kind": "generic_link", "title": " <script>raw</script> ", "social_platform": "unexpected", "destination_url": "javascript:private"}}'::jsonb),'{"status": "unavailable"}'::jsonb,'Missing collection not inferred empty');
select * from finish();
rollback;

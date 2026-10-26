begin;
select no_plan();
select ok(to_regprocedure('api.resolve_current_owner_media_block_working(uuid)') is not null,'Selected Media reader exists');
select ok((select pronargs=1 and prosecdef and provolatile='s' from pg_proc where oid='api.resolve_current_owner_media_block_working(uuid)'::regprocedure),'One-selector stable definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.resolve_current_owner_media_block_working(uuid)'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.resolve_current_owner_media_block_working(uuid)','EXECUTE'),'anon withheld');
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_media_block_working(uuid)','EXECUTE'),'authenticated withheld');
select ok(not has_function_privilege('service_role','api.resolve_current_owner_media_block_working(uuid)','EXECUTE'),'service role withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='resolve_current_owner_media_block_working' and grantee='PUBLIC' and privilege_type='EXECUTE'),'PUBLIC withheld');
set local request.jwt.claims='{}';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Unauthenticated denies without content');
set local request.jwt.claims='{"sub":"22600000-0000-4000-8000-000000000099","role":"authenticated"}';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Unbound actor denies');
insert into auth.users(id,email) values
 ('22600000-0000-4000-8000-000000000001','media-read-one@example.test'),
 ('22600000-0000-4000-8000-000000000002','media-read-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('22600000-0000-4000-8000-000000000001','22600000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='business' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select case auth_user_id when '22600000-0000-4000-8000-000000000001' then 'media-read-one' else 'media-read-two' end,owner_id,'current' from actors;
insert into core.identity_block_collections_working(owner_id,revision) select owner_id,3 from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,is_visible,position)
 select '22600000-0000-4000-8000-000000000011',owner_id,'media',false,4 from actors where auth_user_id='22600000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '22600000-0000-4000-8000-000000000012',owner_id,'generic_link',9 from actors where auth_user_id='22600000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '22600000-0000-4000-8000-000000000021',owner_id,'media',1 from actors where auth_user_id='22600000-0000-4000-8000-000000000002';
set local request.jwt.claims='{"sub":"22600000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Incomplete Owner excluded');
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011'),'{"status":"success","current_handle":"media-read-one","primary_use_case":"business","collection_revision":3,"block":{"block_id":"22600000-0000-4000-8000-000000000011","kind":"media","is_visible":false,"position":4,"payload_state":"missing","media_working":null,"asset_state":"not_selected"}}'::jsonb,'Exact own hidden membership with missing payload, no fabricated content');
select is((select count(*)::integer from core.identity_block_media_working),0,'Missing read does not initialize payload');
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000012'),'{"status":"unavailable"}'::jsonb,'Other kind uniform denial');
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000021'),'{"status":"unavailable"}'::jsonb,'Other Owner membership uniform denial');
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000099'),'{"status":"unavailable"}'::jsonb,'Missing membership uniform denial');
select is(api.resolve_current_owner_media_block_working(null),'{"status":"unavailable"}'::jsonb,'Null selector uniform denial');
insert into core.identity_block_media_working(block_id,owner_id,kind,alt_text)
 select block_id,owner_id,kind,case when block_id='22600000-0000-4000-8000-000000000021' then 'Other private Media' else null end from core.identity_blocks_working where kind='media';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->'media_working','{"asset_key":null,"alt_text":null}'::jsonb,'Present all-null Media is not missing');
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->>'payload_state','present','Explicit present state');
update core.identity_block_media_working set alt_text=E' \t\r\n ' where block_id='22600000-0000-4000-8000-000000000011';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->'media_working'->>'alt_text',E' \t\r\n ','Raw whitespace/control/line endings retained without normalization');
update core.identity_block_media_working set alt_text='<script>literal()</script>'||chr(1)||U&'e\0301' where block_id='22600000-0000-4000-8000-000000000011';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->'media_working'->>'alt_text','<script>literal()</script>'||chr(1)||U&'e\0301','Markup/control/combining sequence is exact private plain text');
update core.identity_block_media_working set alt_text=repeat('🙂',2048) where block_id='22600000-0000-4000-8000-000000000011';
select is(char_length(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->'media_working'->>'alt_text'),2048,'Maximum Unicode code-point payload read without truncation');
set local request.jwt.claims='{"sub":"22600000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"owner_id":"forged","handle":"media-read-one"}}';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Forged metadata does not select other Owner');
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000021')->'block'->'media_working'->>'alt_text','Other private Media','Second Owner reads only own Media');
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000021')->>'current_handle','media-read-two','Current context bound to actual actor');
set local request.jwt.claims='{"sub":"22600000-0000-4000-8000-000000000001","role":"authenticated"}';
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from actors where auth_user_id='22600000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->>'primary_use_case','personal','Personalization is not a permission filter');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='22600000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Restricted actor denied without payload');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='22600000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Suspended actor denied without payload');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='22600000-0000-4000-8000-000000000001');
update core.owner_handle_namespaces set namespace_kind='alias' where normalized_handle='media-read-one';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Missing current context never falls back to alias');
update core.owner_handle_namespaces set namespace_kind='current' where normalized_handle='media-read-one';
-- Synthetic registry metadata only; no real upload, R2 or sanitizer evidence.
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select auth_user_id,owner_id,'image/png',12,'staging/profile/'||owner_id||'/'||auth_user_id,'consumed',now()+interval '10 minutes',now() from actors;
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select case when auth_user_id='22600000-0000-4000-8000-000000000001' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end,
 owner_id,'working/profile/'||case when auth_user_id='22600000-0000-4000-8000-000000000001' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end||'.webp',
 'image/webp',12,1,1,auth_user_id from actors;
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->>'asset_state','not_selected','Existing profile registry never implicitly selects a Media asset');
update core.identity_block_media_working set asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where block_id='22600000-0000-4000-8000-000000000011';
update core.identity_block_media_working set asset_key='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where block_id='22600000-0000-4000-8000-000000000021';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->>'asset_state','registered','Own consumed canonical reference at minimum byte/dimension bounds');
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->'media_working'->>'asset_key','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Raw private asset key is recovered, not an object key or URL');
update core.profile_media_upload_intents set status='pending',consumed_at=null where id='22600000-0000-4000-8000-000000000001';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->>'asset_state','unavailable','Registry FK does not substitute for consumed source intent');
select is(char_length(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->'media_working'->>'alt_text'),2048,'Unavailable asset retains exact raw alt content');
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->'media_working'->>'asset_key','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Unavailable asset does not erase Working key');
update core.profile_media_upload_intents set status='consumed',consumed_at=now(),created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id='22600000-0000-4000-8000-000000000001';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->>'asset_state','registered','Expired transport intent does not invalidate already-consumed registration');
update core.profile_media_assets set byte_size=11 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->>'asset_state','unavailable','Below canonical WebP byte envelope is unavailable');
update core.profile_media_assets set byte_size=3145729 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->>'asset_state','unavailable','Over canonical byte envelope is unavailable');
update core.profile_media_assets set byte_size=3145728,width=2048,height=2048 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->>'asset_state','registered','Maximum bounded canonical metadata is registered, not delivery proof');
select is((select array_agg(k order by k) from jsonb_object_keys(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block') k),
 array['asset_state','block_id','is_visible','kind','media_working','payload_state','position'],'Selected block does not expose object metadata, URLs, Owner or source intent');
select is((select array_agg(k order by k) from jsonb_object_keys(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->'block'->'media_working') k),
 array['alt_text','asset_key'],'Payload exposes raw recoverable fields only');
update core.identity_block_collections_working set revision=7 where owner_id=(select owner_id from actors where auth_user_id='22600000-0000-4000-8000-000000000001');
select is((api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->>'collection_revision')::integer,7,'Reads current own collection revision without cached context');
create temporary table before_reads as select
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_block_collections_working x) collections,
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_blocks_working x) blocks,
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_media_working x) medias,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x) profiles,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x) publications,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x) progress,
 (select jsonb_agg(to_jsonb(x) order by asset_key) from core.profile_media_assets x) assets,
 (select jsonb_agg(to_jsonb(x) order by id) from core.profile_media_upload_intents x) intents;
select is(api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')->>'status','success','Repeated own read remains available');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_block_collections_working x),(select collections from before_reads),'Collection revision/timestamps unchanged');
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_blocks_working x),(select blocks from before_reads),'Membership/visibility/order unchanged');
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_media_working x),(select medias from before_reads),'Payload unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x),(select profiles from before_reads),'Profile unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x),(select publications from before_reads),'Published unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x),(select progress from before_reads),'Onboarding progress unchanged');
select is((select jsonb_agg(to_jsonb(x) order by asset_key) from core.profile_media_assets x),(select assets from before_reads),'Registry unchanged by read');
select is((select jsonb_agg(to_jsonb(x) order by id) from core.profile_media_upload_intents x),(select intents from before_reads),'Intent lifecycle unchanged by read');
set local role authenticated;
select throws_ok($$select api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')$$,'42501',null,'Authenticated execution withheld');
reset role;
set local role anon;
select throws_ok($$select api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')$$,'42501',null,'Anonymous execution withheld');
reset role;
set local role service_role;
select throws_ok($$select api.resolve_current_owner_media_block_working('22600000-0000-4000-8000-000000000011')$$,'42501',null,'Service role execution withheld');
reset role;
select * from finish();
rollback;

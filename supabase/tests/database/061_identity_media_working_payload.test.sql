begin;
select no_plan();
select has_table('core','identity_block_media_working','Private typed Media foundation exists');
select is((select count(*)::integer from core.identity_block_media_working),0,'No payload backfill/default content');
select ok((select relrowsecurity from pg_class where oid='core.identity_block_media_working'::regclass),'Media RLS enabled');
select is((select count(*)::integer from pg_policies where schemaname='core' and tablename='identity_block_media_working'),0,'No runtime policies');
select ok(not has_table_privilege('anon','core.identity_block_media_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'anon privileges withheld');
select ok(not has_table_privilege('authenticated','core.identity_block_media_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'authenticated privileges withheld');
select ok(not has_table_privilege('service_role','core.identity_block_media_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'service role privileges withheld');
select ok(not exists(select 1 from information_schema.table_privileges where table_schema='core' and table_name='identity_block_media_working' and grantee='PUBLIC'),'PUBLIC privileges withheld');
select has_index('core','identity_block_media_working','identity_block_media_working_owner_asset_idx','Owner/asset FK lookup index');
select is((select array_agg(attname::text order by n) from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,n)
 join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
 where i.indexrelid='core.identity_block_media_working_owner_asset_idx'::regclass),array['owner_id','asset_key'],'Index preserves Owner-leading asset lookup order');
select is((select count(*)::integer from pg_trigger where tgrelid='core.identity_block_media_working'::regclass and not tgisinternal),0,'No autonomous revision/touch triggers');
insert into auth.users(id,email) values
 ('22500000-0000-4000-8000-000000000001','media-payload-one@example.test'),
 ('22500000-0000-4000-8000-000000000002','media-payload-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('22500000-0000-4000-8000-000000000001','22500000-0000-4000-8000-000000000002');
select is((select count(*)::integer from core.identity_block_media_working),0,'Provisioning does not fabricate Media payload');
insert into core.identity_block_collections_working(owner_id) select owner_id from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '22500000-0000-4000-8000-000000000011',owner_id,'media',1 from actors where auth_user_id='22500000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '22500000-0000-4000-8000-000000000012',owner_id,'media',2 from actors where auth_user_id='22500000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '22500000-0000-4000-8000-000000000013',owner_id,'social',3 from actors where auth_user_id='22500000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '22500000-0000-4000-8000-000000000014',owner_id,'text',4 from actors where auth_user_id='22500000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '22500000-0000-4000-8000-000000000015',owner_id,'contact',5 from actors where auth_user_id='22500000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '22500000-0000-4000-8000-000000000021',owner_id,'media',1 from actors where auth_user_id='22500000-0000-4000-8000-000000000002';
insert into core.identity_block_links_working(block_id,owner_id,kind,title)
 select block_id,owner_id,kind,'Sibling Social' from core.identity_blocks_working where kind='social';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,'Sibling Text' from core.identity_blocks_working where kind='text';
insert into core.identity_block_contacts_working(block_id,owner_id,kind,label)
 select block_id,owner_id,kind,'Sibling Contact' from core.identity_blocks_working where kind='contact';
select is((select count(*)::integer from core.identity_block_media_working),0,'Membership and siblings do not initialize Media');
select throws_ok($$insert into core.identity_block_media_working(block_id,owner_id,kind) select '22500000-0000-4000-8000-000000000099',owner_id,'media' from actors where auth_user_id='22500000-0000-4000-8000-000000000001'$$,'23503',null,'Missing block denied');
select throws_ok($$insert into core.identity_block_media_working(block_id,owner_id,kind) select '22500000-0000-4000-8000-000000000011',owner_id,'media' from actors where auth_user_id='22500000-0000-4000-8000-000000000002'$$,'23503',null,'Other Owner claim denied even without asset');
select throws_ok($$insert into core.identity_block_media_working(block_id,owner_id,kind) select '22500000-0000-4000-8000-000000000013',owner_id,'media' from actors where auth_user_id='22500000-0000-4000-8000-000000000001'$$,'23503',null,'Media cannot attach to actual Social membership');
select throws_ok($$insert into core.identity_block_media_working(block_id,owner_id,kind) select block_id,owner_id,kind from core.identity_blocks_working where kind='social'$$,'23514',null,'Non-Media payload kind denied even for matching membership');
select throws_ok($$insert into core.identity_block_media_working(block_id,owner_id,kind) values ('22500000-0000-4000-8000-000000000011',null,'media')$$,'23502',null,'Owner required');
select throws_ok($$insert into core.identity_block_media_working(block_id,owner_id,kind) select '22500000-0000-4000-8000-000000000011',owner_id,null from actors where auth_user_id='22500000-0000-4000-8000-000000000001'$$,'23502',null,'Kind required');
select throws_ok($$insert into core.identity_block_media_working(block_id,owner_id,kind) select null,owner_id,'media' from actors where auth_user_id='22500000-0000-4000-8000-000000000001'$$,'23502',null,'Block ID required');
insert into core.identity_block_media_working(block_id,owner_id,kind) select block_id,owner_id,kind from core.identity_blocks_working where kind='media';
select is((select count(*)::integer from core.identity_block_media_working),3,'One Media payload for each actual membership of both Owners');
select ok((select bool_and(asset_key is null and alt_text is null) from core.identity_block_media_working),'Unfinished asset/alt remain nullable');
select ok((select bool_and(created_at is not null and updated_at is not null) from core.identity_block_media_working),'Timestamp defaults');
select throws_ok($$insert into core.identity_block_media_working(block_id,owner_id,kind) select block_id,owner_id,kind from core.identity_blocks_working where kind='media'$$,'23505',null,'One payload per stable block');
-- Privileged synthetic registry fixtures: not upload/sanitization or runtime authorization evidence.
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select auth_user_id,owner_id,'image/png',12,'staging/profile/'||owner_id||'/'||auth_user_id,'consumed',now()+interval '10 minutes',now() from actors;
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select case when auth_user_id='22500000-0000-4000-8000-000000000001' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end,
 owner_id,'working/profile/'||case when auth_user_id='22500000-0000-4000-8000-000000000001' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end||'.webp',
 'image/webp',12,1,1,auth_user_id from actors;
create temporary table untouched as select
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_block_collections_working x) collections,
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_links_working x) links,
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_texts_working x) texts,
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_contacts_working x) contacts,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x) profiles,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_layout_working x) layouts,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_connection_working x) connections,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x) publications,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x) progress,
 (select jsonb_agg(to_jsonb(x) order by asset_key) from core.profile_media_assets x) assets,
 (select jsonb_agg(to_jsonb(x) order by id) from core.profile_media_upload_intents x) intents,
 (select jsonb_agg(jsonb_build_array(block_id,created_at,updated_at) order by block_id) from core.identity_block_media_working) times;
update core.identity_block_media_working set alt_text='' where block_id='22500000-0000-4000-8000-000000000011';
select is((select alt_text from core.identity_block_media_working where block_id='22500000-0000-4000-8000-000000000011'),'','Empty alt is recoverable, not a decorative policy');
update core.identity_block_media_working set alt_text=E' \t\r\n ' where block_id='22500000-0000-4000-8000-000000000011';
select is((select alt_text from core.identity_block_media_working where block_id='22500000-0000-4000-8000-000000000011'),E' \t\r\n ','Blank/control/line endings preserved');
update core.identity_block_media_working set alt_text='<script>literal()</script>'||chr(1)||U&'e\0301'||E'\r\n🙂' where block_id='22500000-0000-4000-8000-000000000011';
select is((select alt_text from core.identity_block_media_working where block_id='22500000-0000-4000-8000-000000000011'),'<script>literal()</script>'||chr(1)||U&'e\0301'||E'\r\n🙂','Private markup/control/combining/non-BMP content stays raw');
update core.identity_block_media_working set alt_text=repeat('🙂',2048) where block_id='22500000-0000-4000-8000-000000000011';
select is((select char_length(alt_text) from core.identity_block_media_working where block_id='22500000-0000-4000-8000-000000000011'),2048,'Alt bound counts Unicode code points');
select throws_ok($$update core.identity_block_media_working set alt_text=repeat('🙂',2049) where block_id='22500000-0000-4000-8000-000000000011'$$,'23514',null,'Oversized alt denied without truncation');
select is((select char_length(alt_text) from core.identity_block_media_working where block_id='22500000-0000-4000-8000-000000000011'),2048,'Failed oversized write preserves previous value');
select throws_ok($$update core.identity_block_media_working set alt_text=convert_from(decode('00','hex'),'UTF8')$$,'22021',null,'Postgres cannot represent NUL alt');
select throws_ok($$update core.identity_block_media_working set owner_id=(select owner_id from actors where auth_user_id='22500000-0000-4000-8000-000000000002') where block_id='22500000-0000-4000-8000-000000000011'$$,'23503',null,'Payload Owner cannot independently rebind');
select throws_ok($$update core.identity_blocks_working set owner_id=(select owner_id from actors where auth_user_id='22500000-0000-4000-8000-000000000002') where block_id='22500000-0000-4000-8000-000000000011'$$,'23503',null,'No parent Owner update cascade');
select throws_ok($$update core.identity_blocks_working set kind='text' where block_id='22500000-0000-4000-8000-000000000011'$$,'23503',null,'No parent kind update cascade');
select throws_ok($$update core.identity_block_media_working set asset_key='cccccccc-cccc-4ccc-8ccc-cccccccccccc' where block_id='22500000-0000-4000-8000-000000000011'$$,'23503',null,'Missing canonical asset denied');
select throws_ok($$update core.identity_block_media_working set asset_key='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where block_id='22500000-0000-4000-8000-000000000011'$$,'23503',null,'Other Owner canonical asset denied');
select throws_ok($$update core.identity_block_media_working set asset_key='https://private.example/image?signature=private'$$,'23514',null,'URL is not canonical asset key');
select throws_ok($$update core.identity_block_media_working set asset_key='working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'$$,'23514',null,'Object key is not canonical asset key');
select throws_ok($$update core.identity_block_media_working set asset_key='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'$$,'23514',null,'Uppercase syntax does not silently normalize to catalog key');
select throws_ok($$update core.identity_block_media_working set asset_key=' aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'23514',null,'No implicit key trimming');
update core.identity_block_media_working set asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where block_id in ('22500000-0000-4000-8000-000000000011','22500000-0000-4000-8000-000000000012');
update core.identity_block_media_working set asset_key='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where block_id='22500000-0000-4000-8000-000000000021';
select is((select count(*)::integer from core.identity_block_media_working where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),2,'Same Owner can reference one immutable asset from two blocks');
select throws_ok($$delete from core.profile_media_assets where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'23503',null,'Referenced registry asset cannot cascade-delete Working');
select throws_ok($$update core.profile_media_assets set asset_key='cccccccc-cccc-4ccc-8ccc-cccccccccccc',object_key='working/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp' where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'23503',null,'Referenced key cannot silently rebind Working');
select is((select count(*)::integer from core.identity_block_media_working where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),2,'Failed catalog changes preserve both Working references');
select throws_ok($$update core.identity_block_media_working set asset_key='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where block_id='22500000-0000-4000-8000-000000000011'$$,'23503',null,'Cross Owner replacement rejected after valid attachment');
select is((select asset_key from core.identity_block_media_working where block_id='22500000-0000-4000-8000-000000000011'),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Failed replacement keeps old reference');
update core.identity_block_media_working set asset_key=null,alt_text=null where block_id='22500000-0000-4000-8000-000000000012';
select ok((select asset_key is null and alt_text is null from core.identity_block_media_working where block_id='22500000-0000-4000-8000-000000000012'),'Unfinished payload can explicitly return to null');
select is((select jsonb_agg(jsonb_build_array(block_id,created_at,updated_at) order by block_id) from core.identity_block_media_working),(select times from untouched),'No autonomous timestamp updates');
create temporary table before_movement as select jsonb_agg(to_jsonb(x) order by block_id) payloads from core.identity_block_media_working x;
update core.identity_blocks_working set is_visible=false where block_id='22500000-0000-4000-8000-000000000011';
set constraints core.identity_blocks_working_owner_position_unique deferred;
update core.identity_blocks_working set position=case position when 1 then 2 else 1 end where block_id in ('22500000-0000-4000-8000-000000000011','22500000-0000-4000-8000-000000000012');
set constraints core.identity_blocks_working_owner_position_unique immediate;
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_media_working x),(select payloads from before_movement),'Hide/reorder retains exact payloads and asset keys');
delete from core.identity_blocks_working where block_id='22500000-0000-4000-8000-000000000011';
select is((select count(*)::integer from core.identity_block_media_working),2,'Parent removal cleans only its Media payload');
select ok(exists(select 1 from core.identity_block_media_working where block_id='22500000-0000-4000-8000-000000000012' and asset_key is null),'Sibling Media retained');
select ok(exists(select 1 from core.identity_block_media_working where block_id='22500000-0000-4000-8000-000000000021' and asset_key='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'Other Owner Media retained');
select is((select jsonb_agg(to_jsonb(x) order by asset_key) from core.profile_media_assets x),(select assets from untouched),'Detaching/removing Media does not delete/change canonical registry');
select is((select jsonb_agg(to_jsonb(x) order by id) from core.profile_media_upload_intents x),(select intents from untouched),'Upload intents untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_block_collections_working x),(select collections from untouched),'Collection revision/timestamps unchanged');
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_links_working x),(select links from untouched),'Sibling Link unchanged');
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_texts_working x),(select texts from untouched),'Sibling Text unchanged');
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_contacts_working x),(select contacts from untouched),'Sibling Contact unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x),(select profiles from untouched),'Profile untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_layout_working x),(select layouts from untouched),'Layout untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_connection_working x),(select connections from untouched),'Onboarding first slot untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x),(select publications from untouched),'Published untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x),(select progress from untouched),'Onboarding progress untouched');
set local role authenticated;
select throws_ok('select * from core.identity_block_media_working','42501',null,'Authenticated Media read withheld');
select throws_ok('update core.identity_block_media_working set alt_text=null','42501',null,'Authenticated Media write withheld');
reset role;
set local role anon;
select throws_ok('select * from core.identity_block_media_working','42501',null,'Anonymous Media read withheld');
select throws_ok('delete from core.identity_block_media_working','42501',null,'Anonymous Media delete withheld');
reset role;
set local role service_role;
select throws_ok('select * from core.identity_block_media_working','42501',null,'Bypass-RLS role lacks Media read privilege');
select throws_ok('delete from core.identity_block_media_working','42501',null,'Bypass-RLS role lacks Media mutation privilege');
reset role;
select * from finish();
rollback;

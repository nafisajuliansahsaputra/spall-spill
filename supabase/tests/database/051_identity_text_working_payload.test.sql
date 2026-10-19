begin;
select no_plan();
select has_table('core','identity_block_texts_working','Private typed Text foundation exists');
select is((select count(*)::integer from core.identity_block_texts_working),0,'No payload backfill/default content');
select ok((select relrowsecurity from pg_class where oid='core.identity_block_texts_working'::regclass),'Text RLS enabled');
select is((select count(*)::integer from pg_policies where schemaname='core' and tablename='identity_block_texts_working'),0,'No runtime policies');
select ok(not has_table_privilege('anon','core.identity_block_texts_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'anon privileges withheld');
select ok(not has_table_privilege('authenticated','core.identity_block_texts_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'authenticated privileges withheld');
select ok(not has_table_privilege('service_role','core.identity_block_texts_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'service role privileges withheld');
select ok(not exists(select 1 from information_schema.table_privileges where table_schema='core' and table_name='identity_block_texts_working' and grantee='PUBLIC'),'PUBLIC privileges withheld');
select has_index('core','identity_block_texts_working','identity_block_texts_working_owner_idx','Owner-leading query index');
insert into auth.users(id,email) values
 ('13900000-0000-4000-8000-000000000001','text-payload-one@example.test'),
 ('13900000-0000-4000-8000-000000000002','text-payload-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('13900000-0000-4000-8000-000000000001','13900000-0000-4000-8000-000000000002');
select is((select count(*)::integer from core.identity_block_texts_working),0,'Provisioning does not fabricate Text payload');
insert into core.identity_block_collections_working(owner_id) select owner_id from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '13900000-0000-4000-8000-000000000011',owner_id,'text',1 from actors where auth_user_id='13900000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '13900000-0000-4000-8000-000000000012',owner_id,'text',2 from actors where auth_user_id='13900000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '13900000-0000-4000-8000-000000000013',owner_id,'social',3 from actors where auth_user_id='13900000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '13900000-0000-4000-8000-000000000021',owner_id,'text',5 from actors where auth_user_id='13900000-0000-4000-8000-000000000002';
insert into core.identity_block_links_working(block_id,owner_id,kind,title)
 select block_id,owner_id,kind,'Sibling Social' from core.identity_blocks_working where kind='social';
select is((select count(*)::integer from core.identity_block_texts_working),0,'Membership and sibling Link creation do not initialize Text');
select throws_ok($$insert into core.identity_block_texts_working(block_id,owner_id,kind) select '13900000-0000-4000-8000-000000000099',owner_id,'text' from actors where auth_user_id='13900000-0000-4000-8000-000000000001'$$,'23503',null,'Missing block denied');
select throws_ok($$insert into core.identity_block_texts_working(block_id,owner_id,kind) select '13900000-0000-4000-8000-000000000011',owner_id,'text' from actors where auth_user_id='13900000-0000-4000-8000-000000000002'$$,'23503',null,'Other Owner claim denied');
select throws_ok($$insert into core.identity_block_texts_working(block_id,owner_id,kind) select '13900000-0000-4000-8000-000000000013',owner_id,'text' from actors where auth_user_id='13900000-0000-4000-8000-000000000001'$$,'23503',null,'Text cannot attach to actual Social membership');
select throws_ok($$insert into core.identity_block_texts_working(block_id,owner_id,kind) select block_id,owner_id,kind from core.identity_blocks_working where kind='social'$$,'23514',null,'Non-Text payload kind denied even for matching membership');
select throws_ok($$insert into core.identity_block_texts_working(block_id,owner_id,kind) values ('13900000-0000-4000-8000-000000000011',null,'text')$$,'23502',null,'Owner required');
select throws_ok($$insert into core.identity_block_texts_working(block_id,owner_id,kind) select '13900000-0000-4000-8000-000000000011',owner_id,null from actors where auth_user_id='13900000-0000-4000-8000-000000000001'$$,'23502',null,'Kind required');
select throws_ok($$insert into core.identity_block_texts_working(block_id,owner_id,kind) select null,owner_id,'text' from actors where auth_user_id='13900000-0000-4000-8000-000000000001'$$,'23502',null,'Block ID required');
insert into core.identity_block_texts_working(block_id,owner_id,kind) select block_id,owner_id,kind from core.identity_blocks_working where kind='text';
select is((select count(*)::integer from core.identity_block_texts_working),3,'Independent Text payloads bound to actual memberships of both Owners');
select ok((select bool_and(text_content is null) from core.identity_block_texts_working),'Explicit incomplete null text persists without fabricated content');
select ok((select bool_and(created_at is not null and updated_at is not null) from core.identity_block_texts_working),'Timestamp defaults');
select throws_ok($$insert into core.identity_block_texts_working(block_id,owner_id,kind) select block_id,owner_id,kind from core.identity_blocks_working where kind='text'$$,'23505',null,'One Text payload per stable block');
create temporary table untouched as select
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_block_collections_working x) collections,
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_links_working x) links,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x) profiles,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_layout_working x) layouts,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_connection_working x) connections,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x) publications,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x) progress;
update core.identity_block_texts_working set text_content='' where block_id='13900000-0000-4000-8000-000000000011';
select is((select text_content from core.identity_block_texts_working where block_id='13900000-0000-4000-8000-000000000011'),'','Empty text remains recoverable');
update core.identity_block_texts_working set text_content=E' \t\r\n ' where block_id='13900000-0000-4000-8000-000000000011';
select is((select text_content from core.identity_block_texts_working where block_id='13900000-0000-4000-8000-000000000011'),E' \t\r\n ','Whitespace and line endings are not trimmed');
update core.identity_block_texts_working set text_content='<script>literal()</script>'||chr(1)||E'\r\n**literal** https://127.0.0.1/private' where block_id='13900000-0000-4000-8000-000000000011';
select is((select text_content from core.identity_block_texts_working where block_id='13900000-0000-4000-8000-000000000011'),'<script>literal()</script>'||chr(1)||E'\r\n**literal** https://127.0.0.1/private','Markup/control/URL-looking text stays exact raw private Working, not executable or public-safe');
update core.identity_block_texts_working set text_content=U&'e\0301' where block_id='13900000-0000-4000-8000-000000000011';
select is((select char_length(text_content) from core.identity_block_texts_working where block_id='13900000-0000-4000-8000-000000000011'),2,'Combining sequence not normalized to precomposed character');
update core.identity_block_texts_working set text_content=repeat('🙂',16384) where block_id='13900000-0000-4000-8000-000000000011';
select is((select char_length(text_content) from core.identity_block_texts_working where block_id='13900000-0000-4000-8000-000000000011'),16384,'Unicode code-point bound, not byte or UTF-16 length');
select throws_ok($$update core.identity_block_texts_working set text_content=repeat('🙂',16385) where block_id='13900000-0000-4000-8000-000000000011'$$,'23514',null,'Oversized text rejected without truncation');
select is((select char_length(text_content) from core.identity_block_texts_working where block_id='13900000-0000-4000-8000-000000000011'),16384,'Failed oversized write preserves previously saved fixture value');
select throws_ok($$update core.identity_block_texts_working set text_content=convert_from(decode('00','hex'),'UTF8')$$,'22021',null,'Postgres cannot represent NUL text');
select throws_ok($$update core.identity_block_texts_working set owner_id=(select owner_id from actors where auth_user_id='13900000-0000-4000-8000-000000000002') where block_id='13900000-0000-4000-8000-000000000011'$$,'23503',null,'Payload cannot independently rebind Owner');
select throws_ok($$update core.identity_blocks_working set owner_id=(select owner_id from actors where auth_user_id='13900000-0000-4000-8000-000000000002') where block_id='13900000-0000-4000-8000-000000000011'$$,'23503',null,'No silent parent Owner update cascade');
select throws_ok($$update core.identity_blocks_working set kind='contact' where block_id='13900000-0000-4000-8000-000000000011'$$,'23503',null,'No silent parent kind update cascade');
create temporary table before_movement as select jsonb_agg(to_jsonb(x) order by block_id) payloads from core.identity_block_texts_working x;
update core.identity_blocks_working set is_visible=false where block_id='13900000-0000-4000-8000-000000000011';
set constraints core.identity_blocks_working_owner_position_unique deferred;
update core.identity_blocks_working set position=case position when 1 then 2 else 1 end where block_id in ('13900000-0000-4000-8000-000000000011','13900000-0000-4000-8000-000000000012');
set constraints core.identity_blocks_working_owner_position_unique immediate;
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_texts_working x),(select payloads from before_movement),'Hide/reorder retains exact Text payloads and stable IDs');
delete from core.identity_blocks_working where block_id='13900000-0000-4000-8000-000000000011';
select is((select count(*)::integer from core.identity_block_texts_working),2,'Localized parent removal cleans only its Text payload');
select ok(exists(select 1 from core.identity_block_texts_working where block_id='13900000-0000-4000-8000-000000000012' and text_content is null),'Sibling Text payload retained');
select ok(exists(select 1 from core.identity_block_texts_working where block_id='13900000-0000-4000-8000-000000000021' and text_content is null),'Other Owner Text payload retained');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_block_collections_working x),(select collections from untouched),'No automatic collection revision or timestamp mutation');
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_links_working x),(select links from untouched),'Sibling Link payload unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x),(select profiles from untouched),'Profile untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_layout_working x),(select layouts from untouched),'Layout untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_connection_working x),(select connections from untouched),'Onboarding first slot untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x),(select publications from untouched),'Published untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x),(select progress from untouched),'Onboarding progress untouched');
set local role authenticated;
select throws_ok('select * from core.identity_block_texts_working','42501',null,'Authenticated Text read withheld');
select throws_ok('update core.identity_block_texts_working set text_content=null','42501',null,'Authenticated Text write withheld');
reset role;
set local role anon;
select throws_ok('select * from core.identity_block_texts_working','42501',null,'Anonymous Text read withheld');
select throws_ok('delete from core.identity_block_texts_working','42501',null,'Anonymous Text delete withheld');
reset role;
set local role service_role;
select throws_ok('select * from core.identity_block_texts_working','42501',null,'Bypass-RLS role has no Text read privilege');
select throws_ok('delete from core.identity_block_texts_working','42501',null,'Bypass-RLS role has no Text mutation privilege');
reset role;
select * from finish();
rollback;

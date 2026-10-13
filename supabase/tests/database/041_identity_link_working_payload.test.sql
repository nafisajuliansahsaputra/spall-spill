begin;
select no_plan();
select has_table('core','identity_block_links_working','Private typed link payload foundation exists');
select is((select count(*)::integer from core.identity_block_links_working),0,'No payload backfill/default content');
select ok((select relrowsecurity from pg_class where oid='core.identity_block_links_working'::regclass),'Payload RLS enabled');
select is((select count(*)::integer from pg_policies where schemaname='core' and tablename='identity_block_links_working'),0,'No runtime policies');
select ok(not has_table_privilege('anon','core.identity_block_links_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'anon privileges withheld');
select ok(not has_table_privilege('authenticated','core.identity_block_links_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'authenticated privileges withheld');
select ok(not has_table_privilege('service_role','core.identity_block_links_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'service role privileges withheld');
select ok(not exists(select 1 from information_schema.table_privileges where table_schema='core' and table_name='identity_block_links_working' and grantee='PUBLIC'),'PUBLIC privileges withheld');
select has_index('core','identity_block_links_working','identity_block_links_working_owner_idx','Owner-leading query index');
insert into auth.users(id,email) values
 ('85000000-0000-4000-8000-000000000001','link-payload-one@example.test'),
 ('85000000-0000-4000-8000-000000000002','link-payload-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002');
select is((select count(*)::integer from core.identity_block_links_working),0,'Provisioning does not fabricate payload');
insert into core.identity_block_collections_working(owner_id) select owner_id from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '85000000-0000-4000-8000-000000000011',owner_id,'social',1 from actors where auth_user_id='85000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '85000000-0000-4000-8000-000000000012',owner_id,'generic_link',2 from actors where auth_user_id='85000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '85000000-0000-4000-8000-000000000013',owner_id,'contact',3 from actors where auth_user_id='85000000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '85000000-0000-4000-8000-000000000021',owner_id,'generic_link',1 from actors where auth_user_id='85000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from core.identity_block_links_working),0,'Membership creation is not payload initialization');
select throws_ok($$insert into core.identity_block_links_working(block_id,owner_id,kind) select '85000000-0000-4000-8000-000000000099',owner_id,'generic_link' from actors where auth_user_id='85000000-0000-4000-8000-000000000001'$$,'23503',null,'Missing block denied');
select throws_ok($$insert into core.identity_block_links_working(block_id,owner_id,kind) select '85000000-0000-4000-8000-000000000011',owner_id,'social' from actors where auth_user_id='85000000-0000-4000-8000-000000000002'$$,'23503',null,'Other Owner claim denied');
select throws_ok($$insert into core.identity_block_links_working(block_id,owner_id,kind) select '85000000-0000-4000-8000-000000000011',owner_id,'generic_link' from actors where auth_user_id='85000000-0000-4000-8000-000000000001'$$,'23503',null,'Subtype mismatch denied');
select throws_ok($$insert into core.identity_block_links_working(block_id,owner_id,kind) select '85000000-0000-4000-8000-000000000013',owner_id,'contact' from actors where auth_user_id='85000000-0000-4000-8000-000000000001'$$,'23514',null,'Non-link payload kind denied');
select throws_ok($$insert into core.identity_block_links_working(block_id,owner_id,kind) values ('85000000-0000-4000-8000-000000000011',null,'social')$$,'23502',null,'Owner required');
select throws_ok($$insert into core.identity_block_links_working(block_id,owner_id,kind) select '85000000-0000-4000-8000-000000000011',owner_id,null from actors where auth_user_id='85000000-0000-4000-8000-000000000001'$$,'23502',null,'Kind required');
insert into core.identity_block_links_working(block_id,owner_id,kind) select block_id,owner_id,kind from core.identity_blocks_working where kind in ('social','generic_link');
select is((select count(*)::integer from core.identity_block_links_working),3,'Both link kinds tied to actual own memberships');
select ok((select bool_and(title is null and social_platform is null and destination_url is null) from core.identity_block_links_working),'Explicit incomplete null fields persist without guessed content');
select ok((select bool_and(created_at is not null and updated_at is not null) from core.identity_block_links_working),'Timestamp defaults');
select throws_ok($$insert into core.identity_block_links_working(block_id,owner_id,kind) select block_id,owner_id,kind from core.identity_blocks_working where kind='social'$$,'23505',null,'One typed payload per stable block');
update core.identity_block_links_working set title='',social_platform=' NotNormalized ',destination_url='javascript:recoverable' where kind='generic_link';
select is((select destination_url from core.identity_block_links_working where block_id='85000000-0000-4000-8000-000000000012'),'javascript:recoverable','Invalid destination remains private recoverable Working, not a public-safe projection');
select is((select social_platform from core.identity_block_links_working where block_id='85000000-0000-4000-8000-000000000012'),' NotNormalized ','Inappropriate platform retained for explicit correction');
update core.identity_block_links_working set title='<script>literal</script>'||chr(9),destination_url=' HTTPS://Private.example.test/Exact#Working ' where kind='social';
select is((select destination_url from core.identity_block_links_working where kind='social'),' HTTPS://Private.example.test/Exact#Working ','Exact raw whitespace/case/fragment retained without URL rewriting');
select is((select title from core.identity_block_links_working where kind='social'),'<script>literal</script>'||chr(9),'Raw text/control retained, never rendered here');
update core.identity_block_links_working set title=repeat('🙂',512),social_platform=repeat('🙂',40),destination_url=repeat('🙂',2048) where kind='social';
select is((select char_length(title) from core.identity_block_links_working where kind='social'),512,'Title code-point budget');
select is((select char_length(social_platform) from core.identity_block_links_working where kind='social'),40,'Platform code-point budget, validity separate');
select is((select char_length(destination_url) from core.identity_block_links_working where kind='social'),2048,'Destination code-point budget, validity separate');
select throws_ok($$update core.identity_block_links_working set title=repeat('🙂',513)$$,'23514',null,'Oversized title denied without truncation');
select throws_ok($$update core.identity_block_links_working set social_platform=repeat('🙂',41)$$,'23514',null,'Oversized platform denied');
select throws_ok($$update core.identity_block_links_working set destination_url=repeat('🙂',2049)$$,'23514',null,'Oversized destination denied');
select throws_ok($$update core.identity_block_links_working set owner_id=(select owner_id from actors where auth_user_id='85000000-0000-4000-8000-000000000002') where kind='social'$$,'23503',null,'Payload cannot independently rebind Owner');
select throws_ok($$update core.identity_blocks_working set kind='generic_link' where kind='social'$$,'23503',null,'No silent parent subtype cascade');
create temporary table before_changes as select
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_links_working x) payloads,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x) profiles,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_layout_working x) layouts,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_connection_working x) connections,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x) publications,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x) progress;
update core.identity_blocks_working set is_visible=false where kind='social';
set constraints core.identity_blocks_working_owner_position_unique deferred;
update core.identity_blocks_working set position=case position when 1 then 2 else 1 end
 where block_id in ('85000000-0000-4000-8000-000000000011','85000000-0000-4000-8000-000000000012');
set constraints core.identity_blocks_working_owner_position_unique immediate;
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_links_working x),(select payloads from before_changes),'Hide/reorder retains exact typed payload/IDs');
delete from core.identity_blocks_working where kind='social';
select is((select count(*)::integer from core.identity_block_links_working),2,'Localized parent removal cleans only matching payload');
select is((select destination_url from core.identity_block_links_working where block_id='85000000-0000-4000-8000-000000000021'),'javascript:recoverable','Other Owner payload untouched');
select is((select count(*)::integer from core.identity_blocks_working),3,'Other membership intact');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x),(select profiles from before_changes),'Profile untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_layout_working x),(select layouts from before_changes),'Layout untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_connection_working x),(select connections from before_changes),'Onboarding slot untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x),(select publications from before_changes),'Published untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x),(select progress from before_changes),'Onboarding state untouched');
set local role authenticated;
select throws_ok('select * from core.identity_block_links_working','42501',null,'Authenticated payload read withheld');
reset role;
set local role anon;
select throws_ok('select * from core.identity_block_links_working','42501',null,'Anonymous payload read withheld');
reset role;
set local role service_role;
select throws_ok('delete from core.identity_block_links_working','42501',null,'Bypass-RLS role has no payload mutation privilege');
reset role;
select * from finish();
rollback;

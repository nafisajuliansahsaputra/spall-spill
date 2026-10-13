begin;
select no_plan();
select has_table('core','identity_block_collections_working','Private collection foundation exists');
select has_table('core','identity_blocks_working','Private membership foundation exists');
select is((select enum_range(null::core.identity_block_kind)::text),'{social,generic_link,contact,media,text,spill_cta}','Exactly six locked kinds, no profile/template/product block');
select is((select count(*)::integer from core.identity_block_collections_working),0,'No collection backfill');
select is((select count(*)::integer from core.identity_blocks_working),0,'No fabricated modular blocks');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('core.identity_block_collections_working'::regclass,'core.identity_blocks_working'::regclass)),'RLS on both private tables');
select is((select count(*)::integer from pg_policies where schemaname='core' and tablename in ('identity_block_collections_working','identity_blocks_working')),0,'No runtime policies');
select ok(not has_table_privilege('anon','core.identity_block_collections_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'anon collection privileges withheld');
select ok(not has_table_privilege('authenticated','core.identity_block_collections_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'authenticated collection privileges withheld');
select ok(not has_table_privilege('service_role','core.identity_block_collections_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'service role collection privileges withheld');
select ok(not has_table_privilege('anon','core.identity_blocks_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'anon block privileges withheld');
select ok(not has_table_privilege('authenticated','core.identity_blocks_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'authenticated block privileges withheld');
select ok(not has_table_privilege('service_role','core.identity_blocks_working','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'service role block privileges withheld');
select ok(not exists(select 1 from information_schema.table_privileges where table_schema='core' and table_name in ('identity_block_collections_working','identity_blocks_working') and grantee='PUBLIC'),'PUBLIC table privileges withheld');
select ok((select condeferrable and not condeferred from pg_constraint where conrelid='core.identity_blocks_working'::regclass and conname='identity_blocks_working_owner_position_unique'),'Owner-leading unique order index can defer swaps');
insert into auth.users(id,email) values
 ('83000000-0000-4000-8000-000000000001','block-one@example.test'),
 ('83000000-0000-4000-8000-000000000002','block-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002');
select is((select count(*)::integer from core.identity_block_collections_working),0,'Auth provisioning does not infer initialized canvas');
select throws_ok($$insert into core.identity_block_collections_working(owner_id) values ('83000000-0000-4000-8000-000000000099')$$,'23503',null,'Missing Owner collection denied');
select throws_ok($$insert into core.identity_blocks_working(owner_id,kind,position) select owner_id,'text',1 from actors where auth_user_id='83000000-0000-4000-8000-000000000001'$$,'23503',null,'Own collection required, not another Owner collection');
insert into core.identity_block_collections_working(owner_id) select owner_id from actors;
select is((select min(revision) from core.identity_block_collections_working),1::bigint,'Collection starts with acknowledged revision 1');
select throws_ok($$insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id='83000000-0000-4000-8000-000000000001'$$,'23505',null,'One collection per Owner');
select throws_ok($$update core.identity_block_collections_working set revision=0$$,'23514',null,'Zero revision denied');
select throws_ok($$update core.identity_block_collections_working set revision=9007199254740992$$,'23514',null,'Unsafe revision denied');
insert into core.identity_blocks_working(owner_id,kind,position)
 select a.owner_id,k.kind,k.position::integer from actors a
 cross join unnest(enum_range(null::core.identity_block_kind)) with ordinality as k(kind,position)
 where a.auth_user_id='83000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from core.identity_blocks_working),6,'All six membership kinds persist without fabricated typed payload');
select ok((select bool_and(block_id is not null and is_visible and created_at is not null and updated_at is not null) from core.identity_blocks_working),'UUID/visibility/timestamp defaults');
select is((select count(distinct block_id)::integer from core.identity_blocks_working),6,'Distinct generated stable IDs');
select throws_ok($$insert into core.identity_blocks_working(owner_id,kind,position) select owner_id,'text',1 from actors where auth_user_id='83000000-0000-4000-8000-000000000001'$$,'23505',null,'Duplicate own order denied');
select throws_ok($$insert into core.identity_blocks_working(owner_id,kind,position) select owner_id,'text',0 from actors where auth_user_id='83000000-0000-4000-8000-000000000001'$$,'23514',null,'Zero position denied');
select throws_ok($$insert into core.identity_blocks_working(owner_id,kind,position) select owner_id,'text',-1 from actors where auth_user_id='83000000-0000-4000-8000-000000000001'$$,'23514',null,'Negative position denied');
select throws_ok($$insert into core.identity_blocks_working(owner_id,kind,position) select owner_id,null,7 from actors where auth_user_id='83000000-0000-4000-8000-000000000001'$$,'23502',null,'Kind required');
select throws_ok($$insert into core.identity_blocks_working(owner_id,kind,position,is_visible) select owner_id,'text',7,null from actors where auth_user_id='83000000-0000-4000-8000-000000000001'$$,'23502',null,'Visibility required');
insert into core.identity_blocks_working(owner_id,kind,position)
 select owner_id,'text',1 from actors where auth_user_id='83000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from core.identity_blocks_working where position=1),2,'Positions scoped by Owner');
create temporary table original as select block_id,owner_id,kind,position from core.identity_blocks_working;
update core.identity_blocks_working set is_visible=false where kind='social';
select is((select count(*)::integer from core.identity_blocks_working),7,'Hiding retains membership');
select ok(not (select is_visible from core.identity_blocks_working where kind='social'),'Working hidden state persisted');
set constraints core.identity_blocks_working_owner_position_unique deferred;
update core.identity_blocks_working set position=case position when 1 then 2 when 2 then 1 else position end
 where owner_id=(select owner_id from actors where auth_user_id='83000000-0000-4000-8000-000000000001') and position in (1,2);
set constraints core.identity_blocks_working_owner_position_unique immediate;
select is((select position from core.identity_blocks_working where kind='social'),2,'Transactional swap changes order');
select is((select jsonb_agg(jsonb_build_array(block_id,owner_id,kind) order by block_id) from core.identity_blocks_working),
 (select jsonb_agg(jsonb_build_array(block_id,owner_id,kind) order by block_id) from original),'Hide/reorder preserve IDs and ownership');
select is((select position from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='83000000-0000-4000-8000-000000000002')),1,'Other Owner order unchanged');
create temporary table before_remove as select
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x) profiles,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_layout_working x) layouts,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_connection_working x) connections,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x) publications,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x) progress;
delete from core.identity_blocks_working where kind='social';
select is((select count(*)::integer from core.identity_blocks_working),6,'Localized removal does not recreate/reset other blocks');
select is((select count(*)::integer from core.identity_block_collections_working),2,'Removing one block retains collections');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x),(select profiles from before_remove),'Core Profile untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_layout_working x),(select layouts from before_remove),'Layout untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_connection_working x),(select connections from before_remove),'Onboarding first slot untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x),(select publications from before_remove),'Published snapshots untouched');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x),(select progress from before_remove),'Onboarding state untouched');
set local role authenticated;
select throws_ok('select * from core.identity_blocks_working','42501',null,'Actual authenticated private membership access denied');
reset role;
set local role anon;
select throws_ok('select * from core.identity_block_collections_working','42501',null,'Actual anonymous collection access denied');
reset role;
set local role service_role;
select throws_ok('insert into core.identity_blocks_working(owner_id,kind,position) values (null,''text'',1)','42501',null,'Bypass-RLS role still lacks table write privilege');
reset role;
select * from finish();
rollback;

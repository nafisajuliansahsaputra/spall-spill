begin;
select no_plan();
select ok((select prosecdef and provolatile='v' from pg_proc where oid='api.add_current_owner_media_block_working(jsonb)'::regprocedure),'Hardened volatile CAS definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.add_current_owner_media_block_working(jsonb)'::regprocedure),'Empty search path');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='add_current_owner_media_block_working' and grantee='PUBLIC'),'PUBLIC withheld');
select ok(not has_function_privilege('anon','api.add_current_owner_media_block_working(jsonb)','EXECUTE'),'anon withheld');
set local role anon;
select throws_ok($$select api.add_current_owner_media_block_working('{}')$$,'42501',null,'Actual anon denied');
reset role;
select ok(not has_function_privilege('authenticated','api.add_current_owner_media_block_working(jsonb)','EXECUTE'),'authenticated withheld');
set local role authenticated;
select throws_ok($$select api.add_current_owner_media_block_working('{}')$$,'42501',null,'Actual authenticated denied');
reset role;
select ok(not has_function_privilege('service_role','api.add_current_owner_media_block_working(jsonb)','EXECUTE'),'service_role withheld');
set local role service_role;
select throws_ok($$select api.add_current_owner_media_block_working('{}')$$,'42501',null,'Actual service_role denied');
reset role;
set local request.jwt.claims='{}';
select is(api.add_current_owner_media_block_working('{}'),' {"status":"unauthenticated"}'::jsonb,'Missing actor');
set local request.jwt.claims='{"sub":"23100000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"forged"}}';
select is(api.add_current_owner_media_block_working('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata cannot grant Owner');
insert into auth.users(id,email) values
 ('23100000-0000-4000-8000-000000000001','media-add-one@example.test'),
 ('23100000-0000-4000-8000-000000000002','media-add-two@example.test'),
 ('23100000-0000-4000-8000-000000000003','media-add-empty@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('23100000-0000-4000-8000-000000000001','23100000-0000-4000-8000-000000000002','23100000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'media-add-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"23100000-0000-4000-8000-000000000001"}';
select is(api.add_current_owner_media_block_working('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner');
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id<>'23100000-0000-4000-8000-000000000003';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible,created_at,updated_at)
 select '23100000-0000-4000-8000-000000000011',owner_id,'media',1,false,'2000-01-01','2000-01-01' from actors where auth_user_id='23100000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '23100000-0000-4000-8000-000000000012',owner_id,'media',7 from actors where auth_user_id='23100000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '23100000-0000-4000-8000-000000000021',owner_id,'media',1 from actors where auth_user_id='23100000-0000-4000-8000-000000000002';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select ('23100000-0000-4000-8000-0000000000'||n)::uuid,owner_id,k::core.identity_block_kind,n::integer
 from actors cross join (values ('13','generic_link'),('14','social'),('15','text'),('16','contact'),('17','spill_cta')) t(n,k)
 where auth_user_id='23100000-0000-4000-8000-000000000001';
insert into core.identity_block_media_working(block_id,owner_id,kind,alt_text,created_at,updated_at)
 select block_id,owner_id,kind,'original','2000-01-01','2000-01-01' from core.identity_blocks_working
 where block_id in ('23100000-0000-4000-8000-000000000011','23100000-0000-4000-8000-000000000021');
-- Synthetic registry only, not real sanitizer/storage evidence.
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select auth_user_id,owner_id,'image/png',12,'staging/profile/'||owner_id||'/'||auth_user_id,'consumed',now()+interval '10 minutes',now() from actors
 where auth_user_id<>'23100000-0000-4000-8000-000000000003';
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select case when auth_user_id='23100000-0000-4000-8000-000000000001' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end,
 owner_id,'working/profile/'||case when auth_user_id='23100000-0000-4000-8000-000000000001' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end||'.webp',
 'image/webp',12,1,1,auth_user_id from actors where auth_user_id<>'23100000-0000-4000-8000-000000000003';
-- Media allocation CAS race fixtures end here.
create function pg_temp.media_add(alt text default 'raw', base numeric default 1, asset text default null, visible boolean default false)
returns jsonb language sql as $$select jsonb_build_object('action','add_media_block','base_collection_revision',base,'is_visible',visible,'media_working',jsonb_build_object('kind','media','asset_key',asset,'alt_text',alt))$$;
create temporary table old_members as select * from core.identity_blocks_working;
create temporary table old_payloads as select * from core.identity_block_media_working;
create temporary table purity(table_name text,value jsonb);
do $$declare name text; val jsonb; begin
 foreach name in array array['owners','identity_block_links_working','identity_block_contacts_working','identity_block_texts_working','identity_connection_working','identity_block_initialization_provenance','identity_working','identity_layout_working','identity_publications','onboarding_preview_receipts','owner_auth_bindings','owner_handle_namespaces','owner_onboarding_progress'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',name) into val;
  insert into purity values(name,val);
 end loop;
end;$$;
create function pg_temp.invalid_shapes() returns setof text language plpgsql as $$declare item jsonb; field text; v jsonb; begin
 foreach item in array array['null'::jsonb,'[]','true','42','"raw"','{}'] loop
  return next is(api.add_current_owner_media_block_working(item),'{"status":"invalid_add_intent"}'::jsonb,'Invalid outer shape');
 end loop;
 foreach field in array array['action','is_visible','base_collection_revision','media_working'] loop
  return next is(api.add_current_owner_media_block_working(pg_temp.media_add()-field),'{"status":"invalid_add_intent"}'::jsonb,'Required outer key '||field);
 end loop;
 foreach field in array array['kind','asset_key','alt_text'] loop
  return next is(api.add_current_owner_media_block_working(jsonb_set(pg_temp.media_add(),'{media_working}',(pg_temp.media_add()->'media_working')-field)),'{"status":"invalid_add_intent"}'::jsonb,'Required nested key '||field);
 end loop;
 foreach field in array array['block_id','owner_id','asset_state','object_key','position','issues','url'] loop
  return next is(api.add_current_owner_media_block_working(pg_temp.media_add()||jsonb_build_object(field,null)),'{"status":"invalid_add_intent"}'::jsonb,'No extra outer '||field);
  return next is(api.add_current_owner_media_block_working(jsonb_set(pg_temp.media_add(),'{media_working}',(pg_temp.media_add()->'media_working')||jsonb_build_object(field,null))),'{"status":"invalid_add_intent"}'::jsonb,'No extra nested '||field);
 end loop;
 foreach v in array array['null'::jsonb,'"1"','true','0','-1','1.1','9007199254740992','[]','{}'] loop
  return next is(api.add_current_owner_media_block_working(jsonb_set(pg_temp.media_add(),'{base_collection_revision}',v)),'{"status":"invalid_add_intent"}'::jsonb,'Strict safe integral base');
 end loop;
 foreach field in array array['asset_key','alt_text'] loop
  foreach v in array array['true'::jsonb,'42','[]','{}'] loop
   return next is(api.add_current_owner_media_block_working(jsonb_set(pg_temp.media_add(),array['media_working',field],v)),'{"status":"invalid_add_intent"}'::jsonb,'Strict nullable string '||field);
  end loop;
 end loop;
 foreach v in array array['null'::jsonb,'"text"','"Media"','true','42','[]','{}'] loop
  return next is(api.add_current_owner_media_block_working(jsonb_set(pg_temp.media_add(),'{media_working,kind}',v)),'{"status":"invalid_add_intent"}'::jsonb,'Exact Media discriminator');
 end loop;
 foreach v in array array['null'::jsonb,'"raw"','true','42','[]'] loop
  return next is(api.add_current_owner_media_block_working(jsonb_set(pg_temp.media_add(),'{media_working}',v)),'{"status":"invalid_add_intent"}'::jsonb,'Strict nested object');
 end loop;
 foreach v in array array['null'::jsonb,'"add_contact_block"','true','42','[]','{}'] loop
  return next is(api.add_current_owner_media_block_working(jsonb_set(pg_temp.media_add(),'{action}',v)),'{"status":"invalid_add_intent"}'::jsonb,'Exact addition action');
 end loop;
 foreach v in array array['null'::jsonb,'"false"','1','[]','{}'] loop
  return next is(api.add_current_owner_media_block_working(jsonb_set(pg_temp.media_add(),'{is_visible}',v)),'{"status":"invalid_add_intent"}'::jsonb,'Explicit boolean visibility');
 end loop;
 foreach v in array array['"not-uuid"'::jsonb,'"https://image.example.test"','"working/profile/asset.webp"','"aaaaaaaa-aaaa-0aaa-8aaa-aaaaaaaaaaaa"','"aaaaaaaa-aaaa-4aaa-0aaa-aaaaaaaaaaaa"','" aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa "'] loop
  return next is(api.add_current_owner_media_block_working(jsonb_set(pg_temp.media_add(),'{media_working,asset_key}',v)),'{"status":"invalid_add_intent"}'::jsonb,'UUID syntax without normalization');
 end loop;
end;$$;
select * from pg_temp.invalid_shapes();
select is(api.add_current_owner_media_block_working(null),'{"status":"invalid_add_intent"}'::jsonb,'SQL null');
select is(api.add_current_owner_media_block_working(pg_temp.media_add(repeat('🐈',2049))),'{"status":"invalid_add_intent"}'::jsonb,'Unicode ceiling');
select throws_ok($$select '"\u0000"'::jsonb$$,'22P05',null,'PG rejects NUL');
select is(api.add_current_owner_media_block_working(pg_temp.media_add('denied',1,'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA')),'{"status":"invalid_asset"}'::jsonb,'Nonmatching registry selection uniform denial');
select is(api.add_current_owner_media_block_working(pg_temp.media_add('denied',1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),'{"status":"invalid_asset"}'::jsonb,'Nonmatching registry selection uniform denial');
select is(api.add_current_owner_media_block_working(pg_temp.media_add('denied',1,'cccccccc-cccc-4ccc-8ccc-cccccccccccc')),'{"status":"invalid_asset"}'::jsonb,'Nonmatching registry selection uniform denial');
select is(api.add_current_owner_media_block_working(pg_temp.media_add('denied',1,'00000000-0000-0000-0000-000000000000')),'{"status":"invalid_asset"}'::jsonb,'Nonmatching registry selection uniform denial');
select is(api.add_current_owner_media_block_working(pg_temp.media_add('denied',1,'ffffffff-ffff-ffff-ffff-ffffffffffff')),'{"status":"invalid_asset"}'::jsonb,'Nonmatching registry selection uniform denial');
update core.profile_media_upload_intents set status='pending',consumed_at=null where id='23100000-0000-4000-8000-000000000001';
select is(api.add_current_owner_media_block_working(pg_temp.media_add('denied',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Unconsumed pending denied');
update core.profile_media_upload_intents set status='processing',consumed_at=null where id='23100000-0000-4000-8000-000000000001';
select is(api.add_current_owner_media_block_working(pg_temp.media_add('denied',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Unconsumed processing denied');
update core.profile_media_upload_intents set status='rejected',consumed_at=null where id='23100000-0000-4000-8000-000000000001';
select is(api.add_current_owner_media_block_working(pg_temp.media_add('denied',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Unconsumed rejected denied');
update core.profile_media_upload_intents set status='expired',consumed_at=null where id='23100000-0000-4000-8000-000000000001';
select is(api.add_current_owner_media_block_working(pg_temp.media_add('denied',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Unconsumed expired denied');
update core.profile_media_upload_intents set status='consumed',consumed_at=now(),created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id='23100000-0000-4000-8000-000000000001';
update core.profile_media_assets set byte_size=1 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.add_current_owner_media_block_working(pg_temp.media_add('denied',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Out-of-envelope registry bytes 1 denied');
update core.profile_media_assets set byte_size=11 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.add_current_owner_media_block_working(pg_temp.media_add('denied',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Out-of-envelope registry bytes 11 denied');
update core.profile_media_assets set byte_size=3145729 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.add_current_owner_media_block_working(pg_temp.media_add('denied',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Out-of-envelope registry bytes 3145729 denied');
update core.profile_media_assets set byte_size=12 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000001')),1::bigint,'All malformed/target/asset denials preserve revision');
select is((select alt_text from core.identity_block_media_working where block_id='23100000-0000-4000-8000-000000000011'),'original','Denials preserve raw payload');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000001');
select is(api.add_current_owner_media_block_working(pg_temp.media_add()),'{"status":"owner_not_eligible"}'::jsonb,'restricted denies');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000001');
select is(api.add_current_owner_media_block_working(pg_temp.media_add()),'{"status":"owner_not_eligible"}'::jsonb,'suspended denies');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000001');
create temporary table registry_snapshot as select * from core.profile_media_assets;
create temporary table intent_snapshot as select * from core.profile_media_upload_intents;
create temporary table allocated(reply jsonb);
create function pg_temp.allocate_raw() returns setof text language plpgsql as $$declare alt text; ack jsonb; base bigint:=1; last_id uuid; begin
 foreach alt in array array[null,'','  ',E'\t\r\n','<script>literal()</script>'||chr(1)||U&'e\0301',repeat('🐈',2048)] loop
  ack:=api.add_current_owner_media_block_working(pg_temp.media_add(alt,base,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',base%2=0));
  return next is(ack->>'status','success','Explicit raw allocation');
  return next is((select array_agg(k order by k) from jsonb_object_keys(ack) k),array['block_id','collection_revision','status'],'Minimal ack keys');
  return next is((ack->>'collection_revision')::bigint,base+1,'One aggregate bump');
  return next ok((ack->>'block_id')::uuid is distinct from last_id,'Fresh server ID');
  return next is((select alt_text from core.identity_block_media_working where block_id=(ack->>'block_id')::uuid),alt,'Exact raw alt payload');
  return next is((select asset_key from core.identity_block_media_working where block_id=(ack->>'block_id')::uuid),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Exact canonical selection');
  return next is((select position from core.identity_blocks_working where block_id=(ack->>'block_id')::uuid),17+base::integer,'Append own max without foreign influence');
  return next is((select is_visible from core.identity_blocks_working where block_id=(ack->>'block_id')::uuid),base%2=0,'Explicit visibility');
  return next is(api.resolve_current_owner_media_block_working((ack->>'block_id')::uuid)->'block'->>'payload_state','present','Selected read recovers newly allocated payload');
  insert into allocated values(ack);last_id:=(ack->>'block_id')::uuid;base:=base+1;
 end loop;
end;$$;
select * from pg_temp.allocate_raw();
select is(api.add_current_owner_media_block_working(pg_temp.media_add('duplicate',1)),'{"status":"stale_write"}'::jsonb,'Old base never duplicates');
select is(api.add_current_owner_media_block_working(pg_temp.media_add(null,7))->'collection_revision','8'::jsonb,'Null selection remains recoverable');
select is((select count(*) from core.identity_block_media_working where owner_id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000001') and asset_key is null and alt_text is null),1::bigint,'Explicit all-null payload present');
select is((select jsonb_agg(to_jsonb(t) order by asset_key) from core.profile_media_assets t),(select jsonb_agg(to_jsonb(t) order by asset_key) from registry_snapshot t),'No registry mutation');
select is((select jsonb_agg(to_jsonb(t) order by id) from core.profile_media_upload_intents t),(select jsonb_agg(to_jsonb(t) order by id) from intent_snapshot t),'No source intent mutation');
select is((select jsonb_agg(to_jsonb(t) order by block_id) from core.identity_blocks_working t where block_id in(select block_id from old_members)),(select jsonb_agg(to_jsonb(t) order by block_id) from old_members t),'Existing/foreign membership untouched');
select is((select jsonb_agg(to_jsonb(t) order by block_id) from core.identity_block_media_working t where block_id in(select block_id from old_payloads)),(select jsonb_agg(to_jsonb(t) order by block_id) from old_payloads t),'Existing/foreign payload untouched');
create temporary table before_fail_members as select * from core.identity_blocks_working;
create temporary table before_fail_payloads as select * from core.identity_block_media_working;
create function pg_temp.fail_write() returns trigger language plpgsql as $$begin raise exception 'allocation fixture failure' using errcode='P0001';end;$$;
create trigger fail_payload before insert on core.identity_block_media_working for each row execute function pg_temp.fail_write();
select throws_ok($$select api.add_current_owner_media_block_working(pg_temp.media_add('fail payload',8))$$,'P0001','allocation fixture failure','Rollback membership when payload insert fails');
drop trigger fail_payload on core.identity_block_media_working;
create trigger fail_revision before update on core.identity_block_collections_working for each row execute function pg_temp.fail_write();
select throws_ok($$select api.add_current_owner_media_block_working(pg_temp.media_add('fail revision',8))$$,'P0001','allocation fixture failure','Rollback member+payload when bump fails');
drop trigger fail_revision on core.identity_block_collections_working;
select is((select jsonb_agg(to_jsonb(t) order by block_id) from core.identity_blocks_working t),(select jsonb_agg(to_jsonb(t) order by block_id) from before_fail_members t),'No orphan member');
select is((select jsonb_agg(to_jsonb(t) order by block_id) from core.identity_block_media_working t),(select jsonb_agg(to_jsonb(t) order by block_id) from before_fail_payloads t),'No orphan payload');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000001')),8::bigint,'No failure bump');
update core.identity_block_collections_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000001');
select is(api.add_current_owner_media_block_working(pg_temp.media_add('exhausted',9007199254740991)),'{"status":"revision_exhausted"}'::jsonb,'Revision exhaustion');
update core.identity_block_collections_working set revision=8 where owner_id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000001');
insert into core.identity_blocks_working(owner_id,kind,position) select (select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000001'),'media',2147483647;
select is(api.add_current_owner_media_block_working(pg_temp.media_add('position exhausted',8)),'{"status":"position_exhausted"}'::jsonb,'No integer append overflow');
delete from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000001') and position=2147483647;
insert into core.identity_blocks_working(owner_id,kind,position,is_visible) select (select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000001'),'media',g,false from generate_series(2000,2985) g;
select is((select count(*) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000001')),1000::bigint,'All hidden kinds count toward inherited availability bound');
select is(api.add_current_owner_media_block_working(pg_temp.media_add('capacity denied',8)),'{"status":"unavailable"}'::jsonb,'Capacity denies without allocation');
set local request.jwt.claims='{"sub":"23100000-0000-4000-8000-000000000002"}';
delete from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000002');
select is(api.add_current_owner_media_block_working(pg_temp.media_add(null))->'collection_revision','2'::jsonb,'Existing empty collection can append first Media');
select is((select position from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000002')),1,'Empty append starts1');
set local request.jwt.claims='{"sub":"23100000-0000-4000-8000-000000000003"}';
select is(api.add_current_owner_media_block_working(pg_temp.media_add()),'{"status":"unavailable"}'::jsonb,'Missing collection never initialized');
create function pg_temp.check_purity() returns setof text language plpgsql as $$declare item record; val jsonb; begin
 for item in select * from purity loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',item.table_name) into val;
  return next is(val,item.value,item.table_name||' unchanged');
 end loop;
end;$$;
select * from pg_temp.check_purity();
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='23100000-0000-4000-8000-000000000003');
select is(api.add_current_owner_media_block_working('{}'),'{"status":"unavailable"}'::jsonb,'Missing canonical context');
select * from finish();
rollback;

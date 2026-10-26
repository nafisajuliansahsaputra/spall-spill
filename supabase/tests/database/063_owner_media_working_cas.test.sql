begin;
select no_plan();
select ok((select prosecdef and provolatile='v' from pg_proc where oid='api.save_current_owner_block_media_working(jsonb)'::regprocedure),'Hardened volatile CAS definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.save_current_owner_block_media_working(jsonb)'::regprocedure),'Empty search path');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='save_current_owner_block_media_working' and grantee='PUBLIC'),'PUBLIC withheld');
select ok(not has_function_privilege('anon','api.save_current_owner_block_media_working(jsonb)','EXECUTE'),'anon withheld');
set local role anon;
select throws_ok($$select api.save_current_owner_block_media_working('{}')$$,'42501',null,'Actual anon denied');
reset role;
select ok(not has_function_privilege('authenticated','api.save_current_owner_block_media_working(jsonb)','EXECUTE'),'authenticated withheld');
set local role authenticated;
select throws_ok($$select api.save_current_owner_block_media_working('{}')$$,'42501',null,'Actual authenticated denied');
reset role;
select ok(not has_function_privilege('service_role','api.save_current_owner_block_media_working(jsonb)','EXECUTE'),'service_role withheld');
set local role service_role;
select throws_ok($$select api.save_current_owner_block_media_working('{}')$$,'42501',null,'Actual service_role denied');
reset role;
set local request.jwt.claims='{}';
select is(api.save_current_owner_block_media_working('{}'),' {"status":"unauthenticated"}'::jsonb,'Missing actor');
set local request.jwt.claims='{"sub":"22900000-0000-4000-8000-000000000099","user_metadata":{"owner_id":"forged"}}';
select is(api.save_current_owner_block_media_working('{}'),'{"status":"owner_missing"}'::jsonb,'Metadata cannot grant Owner');
insert into auth.users(id,email) values
 ('22900000-0000-4000-8000-000000000001','media-save-one@example.test'),
 ('22900000-0000-4000-8000-000000000002','media-save-two@example.test'),
 ('22900000-0000-4000-8000-000000000003','media-save-empty@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('22900000-0000-4000-8000-000000000001','22900000-0000-4000-8000-000000000002','22900000-0000-4000-8000-000000000003');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select 'media-save-'||right(auth_user_id::text,6),owner_id,'current' from actors;
set local request.jwt.claims='{"sub":"22900000-0000-4000-8000-000000000001"}';
select is(api.save_current_owner_block_media_working('{}'),'{"status":"owner_not_eligible"}'::jsonb,'Incomplete Owner');
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors where auth_user_id<>'22900000-0000-4000-8000-000000000003';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible,created_at,updated_at)
 select '22900000-0000-4000-8000-000000000011',owner_id,'media',1,false,'2000-01-01','2000-01-01' from actors where auth_user_id='22900000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '22900000-0000-4000-8000-000000000012',owner_id,'media',7 from actors where auth_user_id='22900000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '22900000-0000-4000-8000-000000000021',owner_id,'media',1 from actors where auth_user_id='22900000-0000-4000-8000-000000000002';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select ('22900000-0000-4000-8000-0000000000'||n)::uuid,owner_id,k::core.identity_block_kind,n::integer
 from actors cross join (values ('13','generic_link'),('14','social'),('15','text'),('16','contact'),('17','spill_cta')) t(n,k)
 where auth_user_id='22900000-0000-4000-8000-000000000001';
insert into core.identity_block_media_working(block_id,owner_id,kind,alt_text,created_at,updated_at)
 select block_id,owner_id,kind,'original','2000-01-01','2000-01-01' from core.identity_blocks_working
 where block_id in ('22900000-0000-4000-8000-000000000011','22900000-0000-4000-8000-000000000021');
-- Synthetic registry only, not real sanitizer/storage evidence.
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select auth_user_id,owner_id,'image/png',12,'staging/profile/'||owner_id||'/'||auth_user_id,'consumed',now()+interval '10 minutes',now() from actors
 where auth_user_id<>'22900000-0000-4000-8000-000000000003';
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select case when auth_user_id='22900000-0000-4000-8000-000000000001' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end,
 owner_id,'working/profile/'||case when auth_user_id='22900000-0000-4000-8000-000000000001' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' end||'.webp',
 'image/webp',12,1,1,auth_user_id from actors where auth_user_id<>'22900000-0000-4000-8000-000000000003';
-- Media save CAS race fixtures end here.
create function pg_temp.media_save(alt text default 'raw', base numeric default 1, target uuid default '22900000-0000-4000-8000-000000000011', asset text default null)
returns jsonb language sql as $$select jsonb_build_object('block_id',target,'base_collection_revision',base,'media_working',jsonb_build_object('kind','media','asset_key',asset,'alt_text',alt))$$;
create temporary table original_members as select * from core.identity_blocks_working;
create temporary table original_foreign as select * from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000021';
create temporary table purity(table_name text,value jsonb);
do $$declare name text; val jsonb; begin
 foreach name in array array['owners','identity_block_links_working','identity_block_contacts_working','identity_block_texts_working','identity_connection_working','identity_block_initialization_provenance','identity_working','identity_layout_working','identity_publications','onboarding_preview_receipts','owner_auth_bindings','owner_handle_namespaces','owner_onboarding_progress'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',name) into val;
  insert into purity values(name,val);
 end loop;
end;$$;
-- Strict envelope, no partial updates or caller-supplied authority.
create function pg_temp.invalid_shapes() returns setof text language plpgsql as $$declare item jsonb; field text; v jsonb; begin
 foreach item in array array['null'::jsonb,'[]','true','42','"raw"','{}'] loop
  return next is(api.save_current_owner_block_media_working(item),'{"status":"invalid_media_working"}'::jsonb,'Invalid outer shape');
 end loop;
 foreach field in array array['block_id','base_collection_revision','media_working'] loop
  return next is(api.save_current_owner_block_media_working(pg_temp.media_save()-field),'{"status":"invalid_media_working"}'::jsonb,'Required outer key '||field);
 end loop;
 foreach field in array array['kind','asset_key','alt_text'] loop
  return next is(api.save_current_owner_block_media_working(jsonb_set(pg_temp.media_save(),'{media_working}',pg_temp.media_save()->'media_working'-field)),'{"status":"invalid_media_working"}'::jsonb,'Required nested key '||field);
 end loop;
 foreach field in array array['owner_id','asset_state','object_key','action','is_visible','position','issues','url'] loop
  return next is(api.save_current_owner_block_media_working(pg_temp.media_save()||jsonb_build_object(field,null)),'{"status":"invalid_media_working"}'::jsonb,'No extra outer '||field);
  return next is(api.save_current_owner_block_media_working(jsonb_set(pg_temp.media_save(),'{media_working}',pg_temp.media_save()->'media_working'||jsonb_build_object(field,null))),'{"status":"invalid_media_working"}'::jsonb,'No extra nested '||field);
 end loop;
 foreach v in array array['null'::jsonb,'"1"','true','0','-1','1.1','9007199254740992','[]','{}'] loop
  return next is(api.save_current_owner_block_media_working(jsonb_set(pg_temp.media_save(),'{base_collection_revision}',v)),'{"status":"invalid_media_working"}'::jsonb,'Strict safe integral base');
 end loop;
 foreach field in array array['asset_key','alt_text'] loop
  foreach v in array array['true'::jsonb,'42','[]','{}'] loop
   return next is(api.save_current_owner_block_media_working(jsonb_set(pg_temp.media_save(),array['media_working',field],v)),'{"status":"invalid_media_working"}'::jsonb,'Strict nullable string '||field);
  end loop;
 end loop;
 foreach v in array array['null'::jsonb,'"text"','"Media"','true','42','[]','{}'] loop
  return next is(api.save_current_owner_block_media_working(jsonb_set(pg_temp.media_save(),'{media_working,kind}',v)),'{"status":"invalid_media_working"}'::jsonb,'Exact Media discriminator');
 end loop;
 foreach v in array array['null'::jsonb,'"raw"','true','42','[]'] loop
  return next is(api.save_current_owner_block_media_working(jsonb_set(pg_temp.media_save(),'{media_working}',v)),'{"status":"invalid_media_working"}'::jsonb,'Strict nested object');
 end loop;
 foreach v in array array['null'::jsonb,'"NOT-UUID"','true','42','[]','{}','"AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"'] loop
  return next is(api.save_current_owner_block_media_working(jsonb_set(pg_temp.media_save(),'{block_id}',v)),'{"status":"invalid_media_working"}'::jsonb,'Strict canonical block locator');
 end loop;
 foreach v in array array['"not-uuid"'::jsonb,'"https://image.example.test"','"working/profile/asset.webp"','"aaaaaaaa-aaaa-0aaa-8aaa-aaaaaaaaaaaa"','"aaaaaaaa-aaaa-4aaa-0aaa-aaaaaaaaaaaa"','" aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa "'] loop
  return next is(api.save_current_owner_block_media_working(jsonb_set(pg_temp.media_save(),'{media_working,asset_key}',v)),'{"status":"invalid_media_working"}'::jsonb,'UUID syntax without normalization');
 end loop;
end;$$;
select * from pg_temp.invalid_shapes();
select is(api.save_current_owner_block_media_working(null),'{"status":"invalid_media_working"}'::jsonb,'SQL null');
select is(api.save_current_owner_block_media_working(pg_temp.media_save(repeat('🐈',2049))),'{"status":"invalid_media_working"}'::jsonb,'Unicode ceiling');
select throws_ok($$select '"\u0000"'::jsonb$$,'22P05',null,'PG rejects NUL');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('raw',1,'22900000-0000-4000-8000-000000000021')),'{"status":"block_not_found"}'::jsonb,'Actual member Owner/kind authority');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('raw',1,'22900000-0000-4000-8000-000000000099')),'{"status":"block_not_found"}'::jsonb,'Actual member Owner/kind authority');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('raw',1,'22900000-0000-4000-8000-000000000013')),'{"status":"unsupported_block_kind"}'::jsonb,'Actual member Owner/kind authority');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('raw',1,'22900000-0000-4000-8000-000000000014')),'{"status":"unsupported_block_kind"}'::jsonb,'Actual member Owner/kind authority');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('raw',1,'22900000-0000-4000-8000-000000000015')),'{"status":"unsupported_block_kind"}'::jsonb,'Actual member Owner/kind authority');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('raw',1,'22900000-0000-4000-8000-000000000016')),'{"status":"unsupported_block_kind"}'::jsonb,'Actual member Owner/kind authority');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('raw',1,'22900000-0000-4000-8000-000000000017')),'{"status":"unsupported_block_kind"}'::jsonb,'Actual member Owner/kind authority');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('raw',2)),'{"status":"stale_write"}'::jsonb,'Stale base');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('denied',1,'22900000-0000-4000-8000-000000000011','AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA')),'{"status":"invalid_asset"}'::jsonb,'Nonmatching registry selection uniform denial');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('denied',1,'22900000-0000-4000-8000-000000000011','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),'{"status":"invalid_asset"}'::jsonb,'Nonmatching registry selection uniform denial');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('denied',1,'22900000-0000-4000-8000-000000000011','cccccccc-cccc-4ccc-8ccc-cccccccccccc')),'{"status":"invalid_asset"}'::jsonb,'Nonmatching registry selection uniform denial');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('denied',1,'22900000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000')),'{"status":"invalid_asset"}'::jsonb,'Nonmatching registry selection uniform denial');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('denied',1,'22900000-0000-4000-8000-000000000011','ffffffff-ffff-ffff-ffff-ffffffffffff')),'{"status":"invalid_asset"}'::jsonb,'Nonmatching registry selection uniform denial');
update core.profile_media_upload_intents set status='pending',consumed_at=null where id='22900000-0000-4000-8000-000000000001';
select is(api.save_current_owner_block_media_working(pg_temp.media_save('denied',1,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Unconsumed pending denied');
update core.profile_media_upload_intents set status='processing',consumed_at=null where id='22900000-0000-4000-8000-000000000001';
select is(api.save_current_owner_block_media_working(pg_temp.media_save('denied',1,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Unconsumed processing denied');
update core.profile_media_upload_intents set status='rejected',consumed_at=null where id='22900000-0000-4000-8000-000000000001';
select is(api.save_current_owner_block_media_working(pg_temp.media_save('denied',1,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Unconsumed rejected denied');
update core.profile_media_upload_intents set status='expired',consumed_at=null where id='22900000-0000-4000-8000-000000000001';
select is(api.save_current_owner_block_media_working(pg_temp.media_save('denied',1,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Unconsumed expired denied');
update core.profile_media_upload_intents set status='consumed',consumed_at=now(),created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id='22900000-0000-4000-8000-000000000001';
update core.profile_media_assets set byte_size=1 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.save_current_owner_block_media_working(pg_temp.media_save('denied',1,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Out-of-envelope registry bytes 1 denied');
update core.profile_media_assets set byte_size=11 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.save_current_owner_block_media_working(pg_temp.media_save('denied',1,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Out-of-envelope registry bytes 11 denied');
update core.profile_media_assets set byte_size=3145729 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.save_current_owner_block_media_working(pg_temp.media_save('denied',1,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'{"status":"invalid_asset"}'::jsonb,'Out-of-envelope registry bytes 3145729 denied');
update core.profile_media_assets set byte_size=12 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='22900000-0000-4000-8000-000000000001')),1::bigint,'All malformed/target/asset denials preserve revision');
select is((select alt_text from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000011'),'original','Denials preserve raw payload');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='22900000-0000-4000-8000-000000000001');
select is(api.save_current_owner_block_media_working(pg_temp.media_save()),'{"status":"owner_not_eligible"}'::jsonb,'restricted denies');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='22900000-0000-4000-8000-000000000001');
select is(api.save_current_owner_block_media_working(pg_temp.media_save()),'{"status":"owner_not_eligible"}'::jsonb,'suspended denies');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='22900000-0000-4000-8000-000000000001');
select is(api.save_current_owner_block_media_working(pg_temp.media_save(null,1,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),jsonb_build_object('status','success','block_id','22900000-0000-4000-8000-000000000011','collection_revision',2),'Exact ack, consumed expired source allowed');
select is((select alt_text from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000011'),null,'Raw nullable alt retained');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('',2,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),jsonb_build_object('status','success','block_id','22900000-0000-4000-8000-000000000011','collection_revision',3),'Exact ack, consumed expired source allowed');
select is((select alt_text from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000011'),'','Raw nullable alt retained');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('  ',3,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),jsonb_build_object('status','success','block_id','22900000-0000-4000-8000-000000000011','collection_revision',4),'Exact ack, consumed expired source allowed');
select is((select alt_text from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000011'),'  ','Raw nullable alt retained');
select is(api.save_current_owner_block_media_working(pg_temp.media_save(E'\t\r\n',4,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),jsonb_build_object('status','success','block_id','22900000-0000-4000-8000-000000000011','collection_revision',5),'Exact ack, consumed expired source allowed');
select is((select alt_text from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000011'),E'\t\r\n','Raw nullable alt retained');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('<script>literal()</script>'||chr(1)||U&'e\0301',5,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),jsonb_build_object('status','success','block_id','22900000-0000-4000-8000-000000000011','collection_revision',6),'Exact ack, consumed expired source allowed');
select is((select alt_text from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000011'),'<script>literal()</script>'||chr(1)||U&'e\0301','Raw nullable alt retained');
select is(api.save_current_owner_block_media_working(pg_temp.media_save(repeat('🐈',2048),6,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),jsonb_build_object('status','success','block_id','22900000-0000-4000-8000-000000000011','collection_revision',7),'Exact ack, consumed expired source allowed');
select is((select alt_text from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000011'),repeat('🐈',2048),'Raw nullable alt retained');
select is((select created_at from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000011'),'2000-01-01'::timestamptz,'Existing created_at preserved');
select ok((select updated_at>created_at from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000011'),'Payload update timestamp');
create temporary table registry_snapshot as select * from core.profile_media_assets;
create temporary table intent_snapshot as select * from core.profile_media_upload_intents;
select is(api.save_current_owner_block_media_working(pg_temp.media_save(null,7,'22900000-0000-4000-8000-000000000012'))->'collection_revision','8'::jsonb,'Explicit missing payload insert for own existing member');
select is(api.resolve_current_owner_media_block_working('22900000-0000-4000-8000-000000000012')->'block'->'media_working','{"asset_key":null,"alt_text":null}'::jsonb,'All-null is present');
select is(api.save_current_owner_block_media_working(pg_temp.media_save(null,8,'22900000-0000-4000-8000-000000000012'))->'collection_revision','9'::jsonb,'Identical save bumps exactly once');
select is(api.save_current_owner_block_media_working(pg_temp.media_save(null,9))->'collection_revision','10'::jsonb,'Clear Working reference only');
select is((select asset_key from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000011'),null,'No fallback selection');
select is((select jsonb_agg(to_jsonb(t) order by asset_key) from core.profile_media_assets t),(select jsonb_agg(to_jsonb(t) order by asset_key) from registry_snapshot t),'Clear does not delete registry');
select is((select jsonb_agg(to_jsonb(t) order by id) from core.profile_media_upload_intents t),(select jsonb_agg(to_jsonb(t) order by id) from intent_snapshot t),'Save never mutates source intent');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('old',1)),'{"status":"stale_write"}'::jsonb,'Lost/old acknowledgment cannot overwrite');
create temporary table before_failure as select * from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000011';
create function pg_temp.fail_revision() returns trigger language plpgsql as $$begin raise exception 'fixture after payload' using errcode='P0001'; end;$$;
create trigger media_save_fail_revision before update on core.identity_block_collections_working for each row execute function pg_temp.fail_revision();
select throws_ok($$select api.save_current_owner_block_media_working(pg_temp.media_save('rollback update',10))$$,'P0001','fixture after payload','Rollback after updating payload');
delete from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000012';
select throws_ok($$select api.save_current_owner_block_media_working(pg_temp.media_save('rollback insert',10,'22900000-0000-4000-8000-000000000012'))$$,'P0001','fixture after payload','Rollback after inserting missing payload');
select is((select count(*) from core.identity_block_media_working where block_id='22900000-0000-4000-8000-000000000012'),0::bigint,'Rollback inserted row stays missing');
drop trigger media_save_fail_revision on core.identity_block_collections_working;
select is((select to_jsonb(t) from core.identity_block_media_working t where block_id='22900000-0000-4000-8000-000000000011'),(select to_jsonb(t) from before_failure t),'Rollback retains complete previous payload/timestamps');
select is((select revision from core.identity_block_collections_working where owner_id=(select owner_id from actors where auth_user_id='22900000-0000-4000-8000-000000000001')),10::bigint,'Failure never bumps revision');
update core.identity_block_collections_working set revision=9007199254740991 where owner_id=(select owner_id from actors where auth_user_id='22900000-0000-4000-8000-000000000001');
select is(api.save_current_owner_block_media_working(pg_temp.media_save('no write',9007199254740991)),'{"status":"revision_exhausted"}'::jsonb,'Safe revision exhausted');
select throws_ok($$update core.identity_block_collections_working set revision=9007199254740992 where owner_id=(select owner_id from actors where auth_user_id='22900000-0000-4000-8000-000000000001')$$,'23514',null,'Storage rejects unsafe revision');
select is((select jsonb_agg(to_jsonb(t) order by block_id) from core.identity_blocks_working t),(select jsonb_agg(to_jsonb(t) order by block_id) from original_members t),'All membership fields retained');
select is((select to_jsonb(t) from core.identity_block_media_working t where block_id='22900000-0000-4000-8000-000000000021'),(select to_jsonb(t) from original_foreign t),'Foreign Media unchanged');
update core.identity_block_collections_working set revision=10 where owner_id=(select owner_id from actors where auth_user_id='22900000-0000-4000-8000-000000000001');
insert into core.identity_blocks_working(owner_id,kind,position) select (select owner_id from actors where auth_user_id='22900000-0000-4000-8000-000000000001'),'media',g from generate_series(2000,3000) g;
update core.profile_media_assets set byte_size=3145728,width=2048,height=2048 where asset_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(api.save_current_owner_block_media_working(pg_temp.media_save('max metadata',10,'22900000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))->'collection_revision','11'::jsonb,'Max metadata and over-bound existing collection allowed');
select is((select count(*) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='22900000-0000-4000-8000-000000000001')),1008::bigint,'No allocation quota or new member on existing save');
set local request.jwt.claims='{"sub":"22900000-0000-4000-8000-000000000003"}';
select is(api.save_current_owner_block_media_working(pg_temp.media_save()),'{"status":"unavailable"}'::jsonb,'Missing collection not fabricated');
create function pg_temp.check_purity() returns setof text language plpgsql as $$declare item record; val jsonb; begin
 for item in select * from purity loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),%L::jsonb) from core.%I t','[]',item.table_name) into val;
  return next is(val,item.value,item.table_name||' unchanged');
 end loop;
end;$$;
select * from pg_temp.check_purity();
update core.owner_onboarding_progress set primary_use_case=null where owner_id=(select owner_id from actors where auth_user_id='22900000-0000-4000-8000-000000000003');
select is(api.save_current_owner_block_media_working('{}'),'{"status":"unavailable"}'::jsonb,'Missing canonical context');
select * from finish();
rollback;

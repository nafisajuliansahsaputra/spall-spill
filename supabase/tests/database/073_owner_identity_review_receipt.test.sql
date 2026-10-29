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
insert into auth.users(id,email) values ('25200000-0000-4000-8000-000000000001','persisted-one@example.test'),('25200000-0000-4000-8000-000000000002','persisted-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in ('25200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind) select 'receipt252-'||right(auth_user_id::text,6),owner_id,'current' from actors;
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select ('25200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,owner_id,kind::core.identity_block_kind,n,false
 from actors cross join(values(1,'social'),(2,'generic_link'),(3,'contact'),(4,'text'),(5,'media'),(6,'spill_cta')) kinds(n,kind)
 where auth_user_id='25200000-0000-4000-8000-000000000001';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
 select block_id,owner_id,kind,' <Raw> ',case when kind='social' then 'raw_platform' else null end,'javascript:raw()' from core.identity_blocks_working where block_id in('25200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000002');
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_type,label,contact_value)
 select block_id,owner_id,kind,null,' <Label> ',E' Raw\n Value ' from core.identity_blocks_working where block_id='25200000-0000-4000-8000-000000000003';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,E' <Text>\n ' from core.identity_blocks_working where block_id='25200000-0000-4000-8000-000000000004';
insert into core.identity_block_media_working(block_id,owner_id,kind,asset_key,alt_text)
 select block_id,owner_id,kind,null,' <Alt> ' from core.identity_blocks_working where block_id='25200000-0000-4000-8000-000000000005';
insert into core.identity_block_spill_cta_working(block_id,owner_id,kind)
 select block_id,owner_id,kind from core.identity_blocks_working where block_id='25200000-0000-4000-8000-000000000006';
set local request.jwt.claims='{"sub":"25200000-0000-4000-8000-000000000001"}';
insert into core.identity_working(owner_id,display_name,bio,revision)
 select owner_id,case when auth_user_id='25200000-0000-4000-8000-000000000001' then 'Private Identity' else 'Foreign Identity' end,E'Private\nBio',2 from actors;
insert into core.identity_layout_working(owner_id,starter_key,revision) select owner_id,'clean',7 from actors;
insert into core.identity_connection_working(owner_id,connection_kind,social_platform,destination_url,revision)
 select owner_id,'generic_link',null,'HTTPS://Private.example.test/Keep?X=1#Exact',3 from actors where auth_user_id='25200000-0000-4000-8000-000000000001';


-- Whole Identity receipt fixtures end here.
create function pg_temp.read_review() returns jsonb language sql as $$
 select api.resolve_current_owner_identity_review_snapshot('{"expected_collection_revision":null,"after_position":null}');
$$;
create function pg_temp.confirm_review(hash text) returns jsonb language sql as $$
 select api.confirm_current_owner_identity_working_review(jsonb_build_object('action','confirm_identity_working_review','snapshot_hash',hash));
$$;
select ok((select relrowsecurity from pg_class where oid='core.identity_working_review_receipts'::regclass),'Private receipt RLS');
select is((select count(*) from pg_policy where polrelid='core.identity_working_review_receipts'::regclass),0::bigint,'No permissive policy');
select ok((select prosecdef and provolatile='s' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) and 'TimeZone=UTC'=any(proconfig) from pg_proc where oid='api.resolve_current_owner_identity_review_snapshot(jsonb)'::regprocedure),'Stable hardened complete reader');
select ok((select prosecdef and provolatile='v' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) and 'TimeZone=UTC'=any(proconfig) from pg_proc where oid='api.confirm_current_owner_identity_working_review(jsonb)'::regprocedure),'Volatile hardened confirmation');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name in('resolve_current_owner_identity_review_snapshot','confirm_current_owner_identity_working_review') and grantee='PUBLIC'),'No PUBLIC RPC access');
select ok(not has_table_privilege('anon','core.identity_working_review_receipts','SELECT,INSERT,UPDATE,DELETE'),'No anon table grant');
select ok(not has_table_privilege('authenticated','core.identity_working_review_receipts','SELECT,INSERT,UPDATE,DELETE'),'No authenticated table grant');
select ok(not has_table_privilege('service_role','core.identity_working_review_receipts','SELECT,INSERT,UPDATE,DELETE'),'No service table grant');
set local role anon;
select throws_ok($$select api.resolve_current_owner_identity_review_snapshot('{}')$$,'42501',null,'Actual anon snapshot denied');
select throws_ok($$select api.confirm_current_owner_identity_working_review('{}')$$,'42501',null,'Actual anon confirmation denied');
select throws_ok($$select * from core.identity_working_review_receipts$$,'42501',null,'Actual anon table denied');
reset role;
set local role authenticated;
select throws_ok($$select api.resolve_current_owner_identity_review_snapshot('{}')$$,'42501',null,'Actual authenticated snapshot denied');
select throws_ok($$select api.confirm_current_owner_identity_working_review('{}')$$,'42501',null,'Actual authenticated confirmation denied');
select throws_ok($$select * from core.identity_working_review_receipts$$,'42501',null,'Actual authenticated table denied');
reset role;
set local role service_role;
select throws_ok($$select api.resolve_current_owner_identity_review_snapshot('{}')$$,'42501',null,'Actual service snapshot denied');
select throws_ok($$select api.confirm_current_owner_identity_working_review('{}')$$,'42501',null,'Actual service confirmation denied');
select throws_ok($$select * from core.identity_working_review_receipts$$,'42501',null,'Actual service table denied');
reset role;
set local request.jwt.claims='{}';
select is(pg_temp.read_review(),'{"status":"unavailable"}'::jsonb,'Anonymous no graph');
select is(pg_temp.confirm_review(repeat('a',64)),'{"status":"unauthenticated"}'::jsonb,'Anonymous no receipt');
set local request.jwt.claims='{"sub":"25200000-0000-4000-8000-000000000001"}';
select is(pg_temp.read_review()->>'review_format','identity_working_review_v1','Explicit format');
select matches(pg_temp.read_review()->>'snapshot_hash','^[0-9a-f]{64}$','Server digest');
select is(jsonb_array_length(pg_temp.read_review()#>'{collection,blocks}'),6,'All kinds retained');
select is(pg_temp.read_review()#>>'{collection,has_more}','false','Terminal complete snapshot');
select is(pg_temp.read_review()#>>'{collection,blocks,0,working,destination_url}','javascript:raw()','Invalid hidden raw work retained');
select is(pg_temp.read_review()->>'publication_comparison','not_assessed','Not publish readiness');
select is(api.resolve_current_owner_identity_review_snapshot('{}'),'{"status":"invalid_page_request"}'::jsonb,'Explicit start required');
select is(api.resolve_current_owner_identity_review_snapshot('{"expected_collection_revision":1,"after_position":1}'),'{"status":"invalid_page_request"}'::jsonb,'No partial/cursor review');
select is(api.resolve_current_owner_identity_review_snapshot('{"expected_collection_revision":null,"after_position":null,"owner_id":"foreign"}'),'{"status":"invalid_page_request"}'::jsonb,'No Owner selector');
create temporary table initial as select pg_temp.read_review() snapshot;
create temporary table saved_rows as select
 (select jsonb_agg(to_jsonb(p)) from core.identity_working p where owner_id in(select owner_id from actors)) profiles,
 (select jsonb_agg(to_jsonb(p)) from core.identity_block_collections_working p where owner_id in(select owner_id from actors)) collections,
 (select jsonb_agg(to_jsonb(p)) from core.owner_onboarding_progress p where owner_id in(select owner_id from actors)) progress;
create temporary table ack as select pg_temp.confirm_review((select snapshot->>'snapshot_hash' from initial)) value;
select is((select value->>'status' from ack),'success','Explicit review confirmed');
select is((select count(*) from core.identity_working_review_receipts where owner_id in(select owner_id from actors)),1::bigint,'One own bounded receipt');
select ok((select expires_at=issued_at+interval '10 minutes' from core.identity_working_review_receipts where owner_id=(select owner_id from actors where auth_user_id='25200000-0000-4000-8000-000000000001')),'Fixed ten-minute lifetime');
select is(pg_temp.confirm_review((select snapshot->>'snapshot_hash' from initial)),(select value from ack),'Same review reuses exact receipt and expiry');
select is(pg_temp.confirm_review(repeat('0',64)),'{"status":"stale_review"}'::jsonb,'Stale hash denied');
select is(pg_temp.confirm_review(null),'{"status":"invalid_review"}'::jsonb,'Null hash denied');
select is(pg_temp.confirm_review(repeat('A',64)),'{"status":"invalid_review"}'::jsonb,'Upper hash denied');
select is(pg_temp.confirm_review(repeat('a',64)||E'\n'),'{"status":"invalid_review"}'::jsonb,'Trailing newline denied');
select is(api.confirm_current_owner_identity_working_review('{}'),'{"status":"invalid_review"}'::jsonb,'Missing action/hash denied');
select is(api.confirm_current_owner_identity_working_review(jsonb_build_object('action','confirm_identity_working_review','snapshot_hash',(select snapshot->>'snapshot_hash' from initial),'owner_id','forged')),'{"status":"invalid_review"}'::jsonb,'Forged authority denied');
select is(pg_temp.confirm_review((select snapshot->>'snapshot_hash' from initial)),(select value from ack),'Rejected confirmation preserves receipt');
select is((select jsonb_agg(to_jsonb(p)) from core.identity_working p where owner_id in(select owner_id from actors)),(select profiles from saved_rows),'Profile untouched');
select is((select jsonb_agg(to_jsonb(p)) from core.identity_block_collections_working p where owner_id in(select owner_id from actors)),(select collections from saved_rows),'Collection/revision untouched');
select is((select jsonb_agg(to_jsonb(p)) from core.owner_onboarding_progress p where owner_id in(select owner_id from actors)),(select progress from saved_rows),'Onboarding untouched');
grant usage on schema core to anon,authenticated;
grant select on core.identity_working_review_receipts to anon,authenticated;
set local role authenticated;
select is((select count(*) from core.identity_working_review_receipts),0::bigint,'RLS denies own/foreign receipts even with fixture SELECT grant');
reset role;
set local role anon;
select is((select count(*) from core.identity_working_review_receipts),0::bigint,'RLS denies anonymous receipts even with fixture SELECT grant');
reset role;
create function pg_temp.reject_receipt() returns trigger language plpgsql as $$begin raise check_violation using message='fixture receipt failure'; end;$$;
create trigger fixture_receipt_failure before insert or update on core.identity_working_review_receipts for each row execute function pg_temp.reject_receipt();
select throws_ok($$select pg_temp.confirm_review((select snapshot->>'snapshot_hash' from initial))$$,'23514','fixture receipt failure','Receipt failure propagates, no fabricated acknowledgment');
select is((select receipt_id::text from core.identity_working_review_receipts where owner_id=(select owner_id from actors where auth_user_id='25200000-0000-4000-8000-000000000001')),(select value->>'receipt_id' from ack),'Failed confirmation preserves prior receipt');
drop trigger fixture_receipt_failure on core.identity_working_review_receipts;
update core.identity_layout_working set starter_key='business' where owner_id=(select owner_id from actors where auth_user_id='25200000-0000-4000-8000-000000000001');
select isnt(pg_temp.read_review()->>'snapshot_hash',(select snapshot->>'snapshot_hash' from initial),'Equal-revision layout change invalidates hash');
select is(pg_temp.confirm_review((select snapshot->>'snapshot_hash' from initial)),'{"status":"stale_review"}'::jsonb,'Old content review denied');
create temporary table rotated as select pg_temp.confirm_review(pg_temp.read_review()->>'snapshot_hash') value;
select isnt((select value->>'receipt_id' from rotated),(select value->>'receipt_id' from ack),'Changed graph rotates UUID');
update core.identity_working_review_receipts set issued_at=issued_at-interval '11 minutes',expires_at=expires_at-interval '11 minutes'
 where owner_id=(select owner_id from actors where auth_user_id='25200000-0000-4000-8000-000000000001');
select isnt(pg_temp.confirm_review(pg_temp.read_review()->>'snapshot_hash')->>'receipt_id',(select value->>'receipt_id' from rotated),'Expired review rotates without changed graph');
insert into core.identity_profile_text_working(owner_id,display_name,bio,revision,source_profile_revision)
 select owner_id,null,E' Raw\r\nBio ',1,2 from actors where auth_user_id='25200000-0000-4000-8000-000000000001';
select is(pg_temp.confirm_review(pg_temp.read_review()->>'snapshot_hash')->>'status','success','Recoverable invalid text can be reviewed, never publish-approved');
select is(pg_temp.read_review()#>'{profile_text_working,display_name}','null'::jsonb,'Raw null name preserved');
update core.identity_blocks_working set is_visible=true where block_id='25200000-0000-4000-8000-000000000001';
update core.identity_block_links_working set destination_url='https://receipt252.example.test/link' where block_id='25200000-0000-4000-8000-000000000001';
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at,revision)
 values('https://receipt252.example.test/link',encode(extensions.digest('https://receipt252.example.test/link','sha256'),'hex'),'safe','fixture',now()-interval '1 minute',now()+interval '1 hour',1);
create temporary table safety_before as select pg_temp.read_review() snapshot;
update core.external_destination_safety set safety_status='blocked',reason_codes=array['fixture'],revision=2 where normalized_url='https://receipt252.example.test/link';
select is(pg_temp.read_review()->'revision_vector',(select snapshot->'revision_vector' from safety_before),'Safety change has no content revision bump');
select isnt(pg_temp.read_review()->>'snapshot_hash',(select snapshot->>'snapshot_hash' from safety_before),'Safety verdict/revision bound');
select is(pg_temp.confirm_review((select snapshot->>'snapshot_hash' from safety_before)),'{"status":"stale_review"}'::jsonb,'Old safety review denied');
create temporary table expiry_before as select pg_temp.read_review() snapshot;
update core.external_destination_safety set expires_at=expires_at+interval '1 minute' where normalized_url='https://receipt252.example.test/link';
select isnt(pg_temp.read_review()->>'snapshot_hash',(select snapshot->>'snapshot_hash' from expiry_before),'Expiry change also bound');
create temporary table own_hash as select pg_temp.read_review()->>'snapshot_hash' hash;
set local request.jwt.claims='{"sub":"25200000-0000-4000-8000-000000000002"}';
select is(pg_temp.confirm_review((select hash from own_hash)),'{"status":"stale_review"}'::jsonb,'Foreign hash cannot confirm own graph');
select is(pg_temp.read_review()#>'{collection,blocks}','[]'::jsonb,'Foreign graph never returned');
select is(pg_temp.confirm_review(pg_temp.read_review()->>'snapshot_hash')->>'status','success','Second Owner independently confirms own review');
select is((select count(*) from core.identity_working_review_receipts where owner_id in(select owner_id from actors)),2::bigint,'One receipt per Owner');
set local request.jwt.claims='{"sub":"25200000-0000-4000-8000-000000000001"}';
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select ('25200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,owner_id,'text',n,false from actors cross join generate_series(7,1000) n
 where auth_user_id='25200000-0000-4000-8000-000000000001';
select is(jsonb_array_length(pg_temp.read_review()#>'{collection,blocks}'),1000,'All ten pages included');
select is(pg_temp.confirm_review(pg_temp.read_review()->>'snapshot_hash')->>'status','success','Complete 1000-row review can confirm');
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select '25200000-0000-4000-8000-000000001001',owner_id,'text',1001,false from actors where auth_user_id='25200000-0000-4000-8000-000000000001';
select is(pg_temp.read_review(),'{"status":"unavailable"}'::jsonb,'Overbound never truncated into complete review');
delete from core.identity_blocks_working where block_id='25200000-0000-4000-8000-000000001001';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,repeat('x',16000) from core.identity_blocks_working where owner_id=(select owner_id from actors where auth_user_id='25200000-0000-4000-8000-000000000001') and position>=7;
select is(pg_temp.read_review(),'{"status":"unavailable"}'::jsonb,'Complete review byte bound fails closed');
delete from core.identity_block_texts_working where owner_id=(select owner_id from actors where auth_user_id='25200000-0000-4000-8000-000000000001') and block_id in(select block_id from core.identity_blocks_working where position>=7);
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='25200000-0000-4000-8000-000000000001');
select is(pg_temp.confirm_review((select hash from own_hash)),'{"status":"owner_not_eligible"}'::jsonb,'Restriction takes precedence');
select is(pg_temp.read_review(),'{"status":"unavailable"}'::jsonb,'Restricted no graph');
select * from finish();
rollback;

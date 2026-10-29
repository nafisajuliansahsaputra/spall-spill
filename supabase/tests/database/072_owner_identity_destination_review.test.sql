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
insert into auth.users(id,email) values ('25100000-0000-4000-8000-000000000001','persisted-one@example.test'),('25100000-0000-4000-8000-000000000002','persisted-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in ('25100000-0000-4000-8000-000000000001','25100000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind) select 'destination251-'||right(auth_user_id::text,6),owner_id,'current' from actors;
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select ('25100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,owner_id,kind::core.identity_block_kind,n,false
 from actors cross join(values(1,'social'),(2,'generic_link'),(3,'contact'),(4,'text'),(5,'media'),(6,'spill_cta')) kinds(n,kind)
 where auth_user_id='25100000-0000-4000-8000-000000000001';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
 select block_id,owner_id,kind,' <Raw> ',case when kind='social' then 'raw_platform' else null end,'javascript:raw()' from core.identity_blocks_working where block_id in('25100000-0000-4000-8000-000000000001','25100000-0000-4000-8000-000000000002');
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_type,label,contact_value)
 select block_id,owner_id,kind,null,' <Label> ',E' Raw\n Value ' from core.identity_blocks_working where block_id='25100000-0000-4000-8000-000000000003';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,E' <Text>\n ' from core.identity_blocks_working where block_id='25100000-0000-4000-8000-000000000004';
insert into core.identity_block_media_working(block_id,owner_id,kind,asset_key,alt_text)
 select block_id,owner_id,kind,null,' <Alt> ' from core.identity_blocks_working where block_id='25100000-0000-4000-8000-000000000005';
insert into core.identity_block_spill_cta_working(block_id,owner_id,kind)
 select block_id,owner_id,kind from core.identity_blocks_working where block_id='25100000-0000-4000-8000-000000000006';
set local request.jwt.claims='{"sub":"25100000-0000-4000-8000-000000000001"}';
insert into core.identity_working(owner_id,display_name,bio,revision)
 select owner_id,case when auth_user_id='25100000-0000-4000-8000-000000000001' then 'Private Identity' else 'Foreign Identity' end,E'Private\nBio',2 from actors;
insert into core.identity_layout_working(owner_id,starter_key,revision) select owner_id,'clean',7 from actors;
insert into core.identity_connection_working(owner_id,connection_kind,social_platform,destination_url,revision)
 select owner_id,'generic_link',null,'HTTPS://Private.example.test/Keep?X=1#Exact',3 from actors where auth_user_id='25100000-0000-4000-8000-000000000001';

-- Destination review fixtures end here.
create function pg_temp.read_destination() returns jsonb language sql as $$
 select api.resolve_current_owner_identity_destination_review_page('{"expected_collection_revision":null,"after_position":null}');
$$;
select ok((select prosecdef and provolatile='s' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) and 'TimeZone=UTC'=any(proconfig)
 from pg_proc where oid='api.resolve_current_owner_identity_destination_review_page(jsonb)'::regprocedure),'Stable empty-path UTC definer');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='resolve_current_owner_identity_destination_review_page' and grantee='PUBLIC'),'No PUBLIC execution');
select ok(not has_function_privilege('anon','api.resolve_current_owner_identity_destination_review_page(jsonb)','EXECUTE'),'No anon execution');
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_identity_destination_review_page(jsonb)','EXECUTE'),'No authenticated execution');
select ok(not has_function_privilege('service_role','api.resolve_current_owner_identity_destination_review_page(jsonb)','EXECUTE'),'No service execution');
set local role anon;
select throws_ok($$select api.resolve_current_owner_identity_destination_review_page('{}')$$,'42501',null,'Actual anon RPC denied');
reset role;
set local role authenticated;
select throws_ok($$select api.resolve_current_owner_identity_destination_review_page('{}')$$,'42501',null,'Actual authenticated RPC denied');
reset role;
set local role service_role;
select throws_ok($$select api.resolve_current_owner_identity_destination_review_page('{}')$$,'42501',null,'Actual service RPC denied');
reset role;
set local request.jwt.claims='{}';
select is(pg_temp.read_destination(),'{"status":"unavailable"}'::jsonb,'Anonymous receives no private graph/safety');
set local request.jwt.claims='{"sub":"25100000-0000-4000-8000-000000000001"}';
select is(pg_temp.read_destination()->>'status','success','Current Owner graph');
select is(pg_temp.read_destination()#>>'{source_destination_safety,status}','pending','Unknown exact source pending');
select is(pg_temp.read_destination()#>'{collection,blocks,0,destination_safety}','null'::jsonb,'Hidden raw link has no active safety');
select is(jsonb_array_length(pg_temp.read_destination()#>'{collection,blocks}'),6,'All six kinds retained');
select is(pg_temp.read_destination()->>'publication_comparison','not_assessed','No readiness comparison');
select is(api.resolve_current_owner_identity_destination_review_page('{}'),'{"status":"invalid_page_request"}'::jsonb,'Strict request inherited');
select is(api.resolve_current_owner_identity_destination_review_page('{"expected_collection_revision":null,"after_position":null,"owner_id":"25100000-0000-4000-8000-000000000002"}'),'{"status":"invalid_page_request"}'::jsonb,'No forged Owner selector');
update core.identity_connection_working set destination_url='https://source251.example.test/exact?Case=1'
 where owner_id=(select owner_id from actors where auth_user_id='25100000-0000-4000-8000-000000000001');
update core.identity_blocks_working set is_visible=true where block_id in('25100000-0000-4000-8000-000000000001','25100000-0000-4000-8000-000000000002');
update core.identity_block_links_working set destination_url='https://link251.example.test/exact?Case=1' where block_id='25100000-0000-4000-8000-000000000001';
select is(pg_temp.read_destination()#>>'{collection,blocks,0,destination_safety,status}','pending','Visible URL missing verdict pending');
select is(pg_temp.read_destination()#>>'{collection,blocks,1,destination_safety,status}','pending','Invalid raw javascript has no inherited safety');
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at,revision)
 values ('https://source251.example.test/exact?Case=1',encode(extensions.digest('https://source251.example.test/exact?Case=1','sha256'),'hex'),'safe','fixture',now()-interval '1 minute',now()+interval '1 hour',5),
 ('https://link251.example.test/exact?Case=1',encode(extensions.digest('https://link251.example.test/exact?Case=1','sha256'),'hex'),'safe','fixture',now()-interval '1 minute',now()+interval '1 hour',7);
select is(pg_temp.read_destination()#>>'{source_destination_safety,status}','safe','Exact source safe');
select is(pg_temp.read_destination()#>>'{source_destination_safety,revision}','5','Source verdict revision preserved');
select is(pg_temp.read_destination()#>>'{collection,blocks,0,destination_safety,status}','safe','Exact visible link safe');
select is(pg_temp.read_destination()#>>'{collection,blocks,0,destination_safety,revision}','7','Link verdict revision preserved');
select ok(not (pg_temp.read_destination()->'source_destination_safety' ?| array['scanner_version','reason_codes','normalized_url','id','owner_id']),'No private scan record fields');
create temporary table saved_state as select
 (select jsonb_agg(to_jsonb(p)) from core.identity_working p where owner_id in(select owner_id from actors)) profiles,
 (select jsonb_agg(to_jsonb(p)) from core.identity_block_links_working p where owner_id in(select owner_id from actors)) links,
 (select jsonb_agg(to_jsonb(p)) from core.identity_block_collections_working p where owner_id in(select owner_id from actors)) collections;
create temporary table observed as select pg_temp.read_destination() value;
select is((select jsonb_agg(to_jsonb(p)) from core.identity_working p where owner_id in(select owner_id from actors)),(select profiles from saved_state),'Read never changes profile');
select is((select jsonb_agg(to_jsonb(p)) from core.identity_block_links_working p where owner_id in(select owner_id from actors)),(select links from saved_state),'Read never changes raw links');
select is((select jsonb_agg(to_jsonb(p)) from core.identity_block_collections_working p where owner_id in(select owner_id from actors)),(select collections from saved_state),'Read never changes revisions');
update core.external_destination_safety set safety_status='review',reason_codes=array['fixture_review'],revision=8 where normalized_url='https://link251.example.test/exact?Case=1';
select is(pg_temp.read_destination()#>>'{collection,blocks,0,destination_safety,status}','review','Stored review never promoted');
update core.external_destination_safety set safety_status='blocked',reason_codes=array['fixture_blocked'],revision=9 where normalized_url='https://link251.example.test/exact?Case=1';
select is(pg_temp.read_destination()#>>'{collection,blocks,0,destination_safety,status}','blocked','Stored blocked never promoted');
select is(pg_temp.read_destination()->'revision_vector',(select value->'revision_vector' from observed),'Safety changes independent of content vector');
update core.external_destination_safety set checked_at=now()-interval '2 hours',expires_at=now()-interval '1 hour',revision=10 where normalized_url='https://link251.example.test/exact?Case=1';
select is(pg_temp.read_destination()#>>'{collection,blocks,0,destination_safety,status}','pending','Expired verdict becomes pending');
select is(pg_temp.read_destination()#>>'{collection,blocks,0,destination_safety,revision}','10','Expired revision retained, not fabricated missing');
update core.external_destination_safety set checked_at=now()-interval '1 hour',expires_at=now(),revision=11 where normalized_url='https://link251.example.test/exact?Case=1';
select is(pg_temp.read_destination()#>>'{collection,blocks,0,destination_safety,status}','pending','Exact expiry boundary pending');
update core.external_destination_safety set safety_status='safe',reason_codes='{}',checked_at=now()-interval '1 minute',expires_at=now()+interval '1 hour',revision=12,url_hash=repeat('0',64) where normalized_url='https://link251.example.test/exact?Case=1';
select is(pg_temp.read_destination()#>'{collection,blocks,0,destination_safety}','{"status":"pending","revision":null,"expires_at":null}'::jsonb,'URL alone cannot inherit mismatched hash');
update core.external_destination_safety set url_hash=encode(extensions.digest(normalized_url,'sha256'),'hex') where normalized_url='https://link251.example.test/exact?Case=1';
update core.identity_block_links_working set destination_url='https://link251.example.test/exact?Case=2' where block_id='25100000-0000-4000-8000-000000000001';
select is(pg_temp.read_destination()#>>'{collection,blocks,0,destination_safety,status}','pending','Query change cannot inherit old verdict');
update core.identity_block_links_working set destination_url='HTTPS://link251.example.test/exact?Case=1' where block_id='25100000-0000-4000-8000-000000000001';
select is(pg_temp.read_destination()#>>'{collection,blocks,0,destination_safety,status}','pending','No implicit case normalization');
update core.identity_block_links_working set destination_url=' https://link251.example.test/exact?Case=1 ' where block_id='25100000-0000-4000-8000-000000000001';
select is(pg_temp.read_destination()#>>'{collection,blocks,0,destination_safety,status}','pending','No implicit raw whitespace trim');
update core.identity_block_links_working set destination_url=null where block_id='25100000-0000-4000-8000-000000000001';
select is(pg_temp.read_destination()#>'{collection,blocks,0,destination_safety}','null'::jsonb,'No URL selection has no safety');
delete from core.identity_block_links_working where block_id='25100000-0000-4000-8000-000000000001';
select is(pg_temp.read_destination()#>'{collection,blocks,0,destination_safety}','null'::jsonb,'Missing payload has no safety');
select is(pg_temp.read_destination()#>>'{collection,blocks,0,payload_state}','missing','Missing remains explicit');
select ok(not exists(select 1 from jsonb_array_elements(pg_temp.read_destination()#>'{collection,blocks}') b where b->>'kind' not in('social','generic_link') and b->'destination_safety'<>'null'::jsonb),'No Contact/Text/Media/CTA safety inference');
set local request.jwt.claims='{"sub":"25100000-0000-4000-8000-000000000002"}';
select is(pg_temp.read_destination()#>'{collection,blocks}','[]'::jsonb,'Foreign blocks/URLs/safety never leak');
select is(pg_temp.read_destination()->'source_destination_safety','null'::jsonb,'Foreign source safety not selected');
set local request.jwt.claims='{"sub":"25100000-0000-4000-8000-000000000001"}';
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='25100000-0000-4000-8000-000000000001');
select is(pg_temp.read_destination(),'{"status":"unavailable"}'::jsonb,'Restricted Owner no graph/safety');
select * from finish();
rollback;

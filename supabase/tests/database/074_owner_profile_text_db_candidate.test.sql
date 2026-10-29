begin;
select no_plan();
insert into auth.users(id,email) values ('25400000-0000-4000-8000-000000000001','persisted-one@example.test'),('25400000-0000-4000-8000-000000000002','persisted-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in ('25400000-0000-4000-8000-000000000001','25400000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='personal' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind) select 'candidate254-'||right(auth_user_id::text,6),owner_id,'current' from actors;
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
insert into core.identity_block_collections_working(owner_id) select owner_id from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,position,is_visible)
 select ('25400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,owner_id,kind::core.identity_block_kind,n,false
 from actors cross join(values(1,'social'),(2,'generic_link'),(3,'contact'),(4,'text'),(5,'media'),(6,'spill_cta')) kinds(n,kind)
 where auth_user_id='25400000-0000-4000-8000-000000000001';
insert into core.identity_block_links_working(block_id,owner_id,kind,title,social_platform,destination_url)
 select block_id,owner_id,kind,' <Raw> ',case when kind='social' then 'raw_platform' else null end,'javascript:raw()' from core.identity_blocks_working where block_id in('25400000-0000-4000-8000-000000000001','25400000-0000-4000-8000-000000000002');
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_type,label,contact_value)
 select block_id,owner_id,kind,null,' <Label> ',E' Raw\n Value ' from core.identity_blocks_working where block_id='25400000-0000-4000-8000-000000000003';
insert into core.identity_block_texts_working(block_id,owner_id,kind,text_content)
 select block_id,owner_id,kind,E' <Text>\n ' from core.identity_blocks_working where block_id='25400000-0000-4000-8000-000000000004';
insert into core.identity_block_media_working(block_id,owner_id,kind,asset_key,alt_text)
 select block_id,owner_id,kind,null,' <Alt> ' from core.identity_blocks_working where block_id='25400000-0000-4000-8000-000000000005';
insert into core.identity_block_spill_cta_working(block_id,owner_id,kind)
 select block_id,owner_id,kind from core.identity_blocks_working where block_id='25400000-0000-4000-8000-000000000006';
set local request.jwt.claims='{"sub":"25400000-0000-4000-8000-000000000001"}';
insert into core.identity_working(owner_id,display_name,bio,revision)
 select owner_id,case when auth_user_id='25400000-0000-4000-8000-000000000001' then 'Private Identity' else 'Foreign Identity' end,E'Private\nBio',2 from actors;
insert into core.identity_layout_working(owner_id,starter_key,revision) select owner_id,'clean',7 from actors;
insert into core.identity_connection_working(owner_id,connection_kind,social_platform,destination_url,revision)
 select owner_id,'generic_link',null,'HTTPS://Private.example.test/Keep?X=1#Exact',3 from actors where auth_user_id='25400000-0000-4000-8000-000000000001';



delete from core.identity_connection_working where owner_id in(select owner_id from actors);
update core.identity_blocks_working set is_visible=(kind='text') where owner_id in(select owner_id from actors);
-- Profile/Text DB candidate fixtures end here.
create function pg_temp.read_review() returns jsonb language sql as $$
 select api.resolve_current_owner_identity_review_snapshot('{"expected_collection_revision":null,"after_position":null}'); $$;
create function pg_temp.intent() returns jsonb language plpgsql as $$ declare r jsonb; begin
 r:=api.confirm_current_owner_identity_working_review(jsonb_build_object('action','confirm_identity_working_review','snapshot_hash',pg_temp.read_review()->>'snapshot_hash'));
 return jsonb_build_object('action','prepare_identity_profile_text_candidate','receipt_id',r->>'receipt_id','snapshot_hash',r->>'snapshot_hash'); end; $$;
create function pg_temp.prepare() returns jsonb language sql as $$
 select api.prepare_current_owner_identity_profile_text_candidate(pg_temp.intent()); $$;
select ok((select prosecdef and provolatile='v' and ('search_path=""'=any(proconfig) or 'search_path='=any(proconfig)) and 'TimeZone=UTC'=any(proconfig) from pg_proc where oid='api.prepare_current_owner_identity_profile_text_candidate(jsonb)'::regprocedure),'Hardened volatile owner-scoped function');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema in('api','core') and routine_name in('prepare_current_owner_identity_profile_text_candidate','identity_candidate_trim') and grantee='PUBLIC'),'PUBLIC execution withheld');
set local role anon;
select throws_ok($$select api.prepare_current_owner_identity_profile_text_candidate('{}')$$,'42501',null,'Actual anon denied');
reset role;
set local role authenticated;
select throws_ok($$select api.prepare_current_owner_identity_profile_text_candidate('{}')$$,'42501',null,'Actual authenticated denied');
reset role;
set local role service_role;
select throws_ok($$select api.prepare_current_owner_identity_profile_text_candidate('{}')$$,'42501',null,'Actual service role denied');
reset role;
select ok(not has_function_privilege('authenticated','core.identity_candidate_trim(text)','EXECUTE'),'Internal helper not exposed');
select is(pg_temp.prepare()->>'assessment','candidate_validated','Valid Profile/Text candidate');
select is(pg_temp.prepare()->>'publication_validation','profile_text_subset','Subset only');
select is(pg_temp.prepare()#>>'{candidate,blocks,0,text}',E' <Text>\n ','Exact literal text retained');
select is(pg_temp.prepare()->'issues','[]'::jsonb,'No issues for valid subset');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.prepare()->'candidate') k),array['bio','blocks','current_handle','display_name','starter_key'],'Candidate exact private-field-free keys');
create temporary table original_intent as select pg_temp.intent() value;
create temporary table original_receipt as select to_jsonb(r) value from core.identity_working_review_receipts r where owner_id=(select owner_id from actors where auth_user_id='25400000-0000-4000-8000-000000000001');
select is(api.prepare_current_owner_identity_profile_text_candidate((select value from original_intent)),api.prepare_current_owner_identity_profile_text_candidate((select value from original_intent)),'Replay no mutation/no sliding lifetime');
select is((select to_jsonb(r) from core.identity_working_review_receipts r where owner_id=(select owner_id from actors where auth_user_id='25400000-0000-4000-8000-000000000001')),(select value from original_receipt),'Receipt unchanged');
select is(api.prepare_current_owner_identity_profile_text_candidate(value)->>'status','invalid_candidate_request','Strict malformed intent') from (
 values('null'::jsonb),('[]'),('{}'),('{"action":"prepare_identity_profile_text_candidate"}'),
 ((select value||'{"owner_id":"foreign"}'::jsonb from original_intent)),
 ((select jsonb_set(value,'{receipt_id}','"bad"') from original_intent)),
 ((select jsonb_set(value,'{snapshot_hash}',to_jsonb(repeat('A',64))) from original_intent)),
 ((select jsonb_set(value,'{snapshot_hash}',to_jsonb(repeat('a',64)||E'\n')) from original_intent)),
 ((select jsonb_set(value,'{receipt_id}','null') from original_intent)),
 ((select jsonb_set(value,'{action}','"publish"') from original_intent))) bad(value);
set local request.jwt.claims='{}';
select is(api.prepare_current_owner_identity_profile_text_candidate('{}'),'{"status":"unauthenticated"}'::jsonb,'Anonymous no candidate');
set local request.jwt.claims='{"sub":"25400000-0000-4000-8000-000000000002"}';
select is(api.prepare_current_owner_identity_profile_text_candidate((select value from original_intent)),'{"status":"stale_review"}'::jsonb,'Foreign receipt denied without graph');
select is(pg_temp.prepare()->>'assessment','candidate_validated','Other Owner has independent empty composition');
set local request.jwt.claims='{"sub":"25400000-0000-4000-8000-000000000001"}';
update core.identity_working set display_name='Changed',revision=revision+1 where owner_id in(select owner_id from actors);
select is(api.prepare_current_owner_identity_profile_text_candidate((select value from original_intent)),'{"status":"stale_review"}'::jsonb,'Changed graph rejects old receipt');
select is(pg_temp.prepare()#>>'{candidate,display_name}','Changed','New explicit review permits changed candidate');
update core.identity_working_review_receipts set issued_at=issued_at-interval '11 minutes',expires_at=expires_at-interval '11 minutes' where owner_id in(select owner_id from actors);
select is(api.prepare_current_owner_identity_profile_text_candidate(jsonb_build_object('action','prepare_identity_profile_text_candidate','receipt_id',receipt_id,'snapshot_hash',snapshot_hash)),'{"status":"review_expired"}'::jsonb,'Matching expired own receipt rejected') from core.identity_working_review_receipts where owner_id=(select owner_id from actors where auth_user_id='25400000-0000-4000-8000-000000000001');
-- All unsupported active kinds remain explicit blockers; no partial result.
update core.identity_blocks_working set is_visible=true where owner_id in(select owner_id from actors);
select is(pg_temp.prepare()->>'assessment','blocked','Unsupported active kinds block entire candidate');
select is(pg_temp.prepare()->'candidate','null'::jsonb,'Never partial supported-only projection');
select is(jsonb_array_length(pg_temp.prepare()->'issues'),5,'All five unsupported active kinds reported');
select ok(pg_temp.prepare()->'issues' @> '[{"code":"spill_cta_publication_eligibility_pending"}]','CTA not silently omitted');
select ok(pg_temp.prepare()->'issues' @> '[{"code":"contact_publication_policy_pending"}]','Contact policy not invented');
update core.identity_blocks_working set is_visible=(kind='text') where owner_id in(select owner_id from actors);
update core.identity_block_texts_working set text_content=U&'\00A0\FEFF\3000' where owner_id in(select owner_id from actors);
select ok(pg_temp.prepare()->'issues' @> '[{"code":"text_invalid"}]','ECMAScript Unicode blank Text denied');
update core.identity_block_texts_working set text_content=E'a\001b' where owner_id in(select owner_id from actors);
select ok(pg_temp.prepare()->'issues' @> '[{"code":"text_invalid"}]','Text control denied');
update core.identity_block_texts_working set text_content=U&' <script>\000D\000A\009F ' where owner_id in(select owner_id from actors);
select is(pg_temp.prepare()#>>'{candidate,blocks,0,text}',U&' <script>\000D\000A\009F ','Text literal and C1 legacy policy unchanged');
delete from core.identity_block_texts_working where owner_id in(select owner_id from actors);
select ok(pg_temp.prepare()->'issues' @> '[{"code":"payload_missing"}]','Active missing payload blocks');
update core.identity_blocks_working set is_visible=false where owner_id in(select owner_id from actors);
select is(pg_temp.prepare()#>'{candidate,blocks}','[]'::jsonb,'Explicit hidden invalid work excluded');
-- Recoverable profile overlay normalized on copy, never rewritten.
insert into core.identity_profile_text_working(owner_id,display_name,bio,revision,source_profile_revision)
 select owner_id,U&'\00A0\FEFF Name \3000',E'\r\n Bio\rLine \r\n',1,3 from actors;
select is(pg_temp.prepare()#>>'{candidate,display_name}','Name','Exact ECMAScript profile trim');
select is(pg_temp.prepare()#>>'{candidate,bio}',E'Bio\nLine','Bio newline normalization');
select is((select display_name from core.identity_profile_text_working where owner_id=(select owner_id from actors where auth_user_id='25400000-0000-4000-8000-000000000001')),U&'\00A0\FEFF Name \3000','Raw overlay preserved');
update core.identity_profile_text_working set display_name=repeat(U&'\+01F600',80),bio=repeat(U&'\+01F600',300) where owner_id in(select owner_id from actors);
select is(pg_temp.prepare()->>'assessment','candidate_validated','Unicode codepoint limits, not UTF16 units');
update core.identity_profile_text_working set display_name=repeat('a',81),bio=repeat('b',301) where owner_id in(select owner_id from actors);
select is(jsonb_array_length(pg_temp.prepare()->'issues'),2,'Both over-limit profile fields diagnosed');
update core.identity_profile_text_working set display_name=U&'a\2028b',bio=U&'a\009Fb' where owner_id in(select owner_id from actors);
select is(jsonb_array_length(pg_temp.prepare()->'issues'),2,'Single-line Unicode separator and Bio C1 rejected');
update core.identity_profile_text_working set display_name='Name',bio=U&'\00A0\FEFF',source_profile_revision=2 where owner_id in(select owner_id from actors);
select ok(pg_temp.prepare()->'issues' @> '[{"code":"source_review_required"}]','Explicit source rebase required');
update core.identity_profile_text_working set source_profile_revision=3 where owner_id in(select owner_id from actors);
select is(pg_temp.prepare()#>'{candidate,bio}','null'::jsonb,'Empty normalized Bio becomes null');
-- Source connections/photos never silently disappear into a supported subset.
insert into core.identity_connection_working(owner_id,connection_kind,destination_url,revision)
 select owner_id,'generic_link','https://candidate254.example.test/',1 from actors;
select ok(pg_temp.prepare()->'issues' @> '[{"code":"connection_publication_preparation_pending"}]','Even stored HTTPS source blocks subset');
delete from core.identity_connection_working where owner_id in(select owner_id from actors);
insert into core.profile_media_upload_intents(id,owner_id,expected_content_type,declared_byte_size,staging_object_key,status,expires_at,consumed_at)
 select auth_user_id,owner_id,'image/png',12,'staging/profile/'||owner_id||'/'||auth_user_id,'consumed',now()+interval '10 minutes',now() from actors;
insert into core.profile_media_assets(asset_key,owner_id,object_key,stored_content_type,byte_size,width,height,source_upload_intent_id)
 select auth_user_id,owner_id,'working/profile/'||auth_user_id||'.webp','image/webp',12,1,1,auth_user_id from actors;
update core.identity_working p set profile_asset_key=a.auth_user_id::text from actors a where p.owner_id=a.owner_id;
select ok(pg_temp.prepare()->'issues' @> '[{"code":"profile_media_publication_pending"}]','Canonical same Owner photo remains gated');
update core.identity_working set profile_asset_key=null where owner_id in(select owner_id from actors);
create temporary table purity as select pg_temp.read_review() snapshot,pg_temp.intent() intent;
select is(api.prepare_current_owner_identity_profile_text_candidate((select intent from purity))->>'assessment','candidate_validated','Preparation succeeds before purity comparison');
select is(pg_temp.read_review(),(select snapshot from purity),'All raw Working and revision/safety graph unchanged');
update core.owners set account_state='restricted' where id in(select owner_id from actors);
select is(api.prepare_current_owner_identity_profile_text_candidate((select value from original_intent)),'{"status":"owner_not_eligible"}'::jsonb,'Restricted Owner denied');
select * from finish();
rollback;

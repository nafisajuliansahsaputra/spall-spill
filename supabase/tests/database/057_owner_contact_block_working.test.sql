begin;
select no_plan();
select ok(to_regprocedure('api.resolve_current_owner_contact_block_working(uuid)') is not null,'Selected Contact reader exists');
select ok((select pronargs=1 and prosecdef and provolatile='s' from pg_proc where oid='api.resolve_current_owner_contact_block_working(uuid)'::regprocedure),'One-selector stable definer');
select ok((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from pg_proc where oid='api.resolve_current_owner_contact_block_working(uuid)'::regprocedure),'Empty search path');
select ok(not has_function_privilege('anon','api.resolve_current_owner_contact_block_working(uuid)','EXECUTE'),'anon withheld');
select ok(not has_function_privilege('authenticated','api.resolve_current_owner_contact_block_working(uuid)','EXECUTE'),'authenticated withheld');
select ok(not has_function_privilege('service_role','api.resolve_current_owner_contact_block_working(uuid)','EXECUTE'),'service role withheld');
select ok(not exists(select 1 from information_schema.routine_privileges where routine_schema='api' and routine_name='resolve_current_owner_contact_block_working' and grantee='PUBLIC' and privilege_type='EXECUTE'),'PUBLIC withheld');
set local request.jwt.claims='{}';
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Unauthenticated denies without content');
set local request.jwt.claims='{"sub":"18400000-0000-4000-8000-000000000099","role":"authenticated"}';
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Unbound actor denies');
insert into auth.users(id,email) values
 ('18400000-0000-4000-8000-000000000001','contact-read-one@example.test'),
 ('18400000-0000-4000-8000-000000000002','contact-read-two@example.test');
create temporary table actors as select auth_user_id,owner_id from core.owner_auth_bindings where auth_user_id in
 ('18400000-0000-4000-8000-000000000001','18400000-0000-4000-8000-000000000002');
update core.owner_onboarding_progress set current_step='preview_publish',primary_use_case='business' where owner_id in(select owner_id from actors);
insert into core.owner_handle_namespaces(normalized_handle,owner_id,namespace_kind)
 select case auth_user_id when '18400000-0000-4000-8000-000000000001' then 'contact-read-one' else 'contact-read-two' end,owner_id,'current' from actors;
insert into core.identity_block_collections_working(owner_id,revision) select owner_id,3 from actors;
insert into core.identity_blocks_working(block_id,owner_id,kind,is_visible,position)
 select '18400000-0000-4000-8000-000000000011',owner_id,'contact',false,4 from actors where auth_user_id='18400000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '18400000-0000-4000-8000-000000000012',owner_id,'generic_link',9 from actors where auth_user_id='18400000-0000-4000-8000-000000000001';
insert into core.identity_blocks_working(block_id,owner_id,kind,position)
 select '18400000-0000-4000-8000-000000000021',owner_id,'contact',1 from actors where auth_user_id='18400000-0000-4000-8000-000000000002';
set local request.jwt.claims='{"sub":"18400000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Incomplete Owner excluded');
update core.owners set onboarding_completed_at=now() where id in(select owner_id from actors);
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011'),'{"status":"success","current_handle":"contact-read-one","primary_use_case":"business","collection_revision":3,"block":{"block_id":"18400000-0000-4000-8000-000000000011","kind":"contact","is_visible":false,"position":4,"payload_state":"missing","contact_working":null}}'::jsonb,'Exact own hidden membership with missing payload, no fabricated content');
select is((select count(*)::integer from core.identity_block_contacts_working),0,'Missing read does not initialize payload');
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000012'),'{"status":"unavailable"}'::jsonb,'Other kind uniform denial');
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000021'),'{"status":"unavailable"}'::jsonb,'Other Owner membership uniform denial');
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000099'),'{"status":"unavailable"}'::jsonb,'Missing membership uniform denial');
select is(api.resolve_current_owner_contact_block_working(null),'{"status":"unavailable"}'::jsonb,'Null selector uniform denial');
insert into core.identity_block_contacts_working(block_id,owner_id,kind,contact_value)
 select block_id,owner_id,kind,case when block_id='18400000-0000-4000-8000-000000000021' then 'Other private Contact' else null end from core.identity_blocks_working where kind='contact';
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')->'block'->'contact_working','{"contact_type":null,"label":null,"value":null}'::jsonb,'Present all-null Contact is not missing');
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')->'block'->>'payload_state','present','Explicit present state');
update core.identity_block_contacts_working set contact_value=E' \t\r\n ' where block_id='18400000-0000-4000-8000-000000000011';
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')->'block'->'contact_working'->>'value',E' \t\r\n ','Raw whitespace/control/line endings retained without normalization');
update core.identity_block_contacts_working set contact_value='<script>literal()</script>'||chr(1)||U&'e\0301' where block_id='18400000-0000-4000-8000-000000000011';
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')->'block'->'contact_working'->>'value','<script>literal()</script>'||chr(1)||U&'e\0301','Markup/control/combining sequence is exact private plain text');
update core.identity_block_contacts_working set contact_value=repeat('🙂',2048) where block_id='18400000-0000-4000-8000-000000000011';
select is(char_length(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')->'block'->'contact_working'->>'value'),2048,'Maximum Unicode code-point payload read without truncation');
set local request.jwt.claims='{"sub":"18400000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"owner_id":"forged","handle":"contact-read-one"}}';
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Forged metadata does not select other Owner');
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000021')->'block'->'contact_working'->>'value','Other private Contact','Second Owner reads only own Contact');
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000021')->>'current_handle','contact-read-two','Current context bound to actual actor');
set local request.jwt.claims='{"sub":"18400000-0000-4000-8000-000000000001","role":"authenticated"}';
update core.owner_onboarding_progress set primary_use_case='personal' where owner_id=(select owner_id from actors where auth_user_id='18400000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')->>'primary_use_case','personal','Personalization is not a permission filter');
update core.owners set account_state='restricted' where id=(select owner_id from actors where auth_user_id='18400000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Restricted actor denied without payload');
update core.owners set account_state='suspended' where id=(select owner_id from actors where auth_user_id='18400000-0000-4000-8000-000000000001');
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Suspended actor denied without payload');
update core.owners set account_state='active' where id=(select owner_id from actors where auth_user_id='18400000-0000-4000-8000-000000000001');
update core.owner_handle_namespaces set namespace_kind='alias' where normalized_handle='contact-read-one';
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011'),'{"status":"unavailable"}'::jsonb,'Missing current context never falls back to alias');
update core.owner_handle_namespaces set namespace_kind='current' where normalized_handle='contact-read-one';
update core.identity_block_contacts_working set contact_type='email',label=E' Name\t\r\n ',contact_value=' Invalid@Contact ' where block_id='18400000-0000-4000-8000-000000000011';
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')->'block'->'contact_working',jsonb_build_object('contact_type','email','label',E' Name\t\r\n ','value',' Invalid@Contact '),'Exact email tuple retains invalid raw content');
update core.identity_block_contacts_working set contact_type='whatsapp',label=null,contact_value=' +62 not-a-number ' where block_id='18400000-0000-4000-8000-000000000011';
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')->'block'->'contact_working',jsonb_build_object('contact_type','whatsapp','label',null,'value',' +62 not-a-number '),'WhatsApp is structured raw data without normalization');
update core.identity_block_contacts_working set contact_type='phone',label=repeat('🙂',512),contact_value=repeat('🙂',2048) where block_id='18400000-0000-4000-8000-000000000011';
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')->'block'->'contact_working',jsonb_build_object('contact_type','phone','label',repeat('🙂',512),'value',repeat('🙂',2048)),'Phone raw Unicode label/value bounds retained exactly');
update core.identity_block_collections_working set revision=7 where owner_id=(select owner_id from actors where auth_user_id='18400000-0000-4000-8000-000000000001');
select is((api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')->>'collection_revision')::integer,7,'Reads current own collection revision without cached context');
create temporary table before_reads as select
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_block_collections_working x) collections,
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_blocks_working x) blocks,
 (select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_contacts_working x) contacts,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x) profiles,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x) publications,
 (select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x) progress;
select is(api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')->>'status','success','Repeated own read remains available');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_block_collections_working x),(select collections from before_reads),'Collection revision/timestamps unchanged');
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_blocks_working x),(select blocks from before_reads),'Membership/visibility/order unchanged');
select is((select jsonb_agg(to_jsonb(x) order by block_id) from core.identity_block_contacts_working x),(select contacts from before_reads),'Payload unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_working x),(select profiles from before_reads),'Profile unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.identity_publications x),(select publications from before_reads),'Published unchanged');
select is((select jsonb_agg(to_jsonb(x) order by owner_id) from core.owner_onboarding_progress x),(select progress from before_reads),'Onboarding progress unchanged');
set local role authenticated;
select throws_ok($$select api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')$$,'42501',null,'Authenticated execution withheld');
reset role;
set local role anon;
select throws_ok($$select api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')$$,'42501',null,'Anonymous execution withheld');
reset role;
set local role service_role;
select throws_ok($$select api.resolve_current_owner_contact_block_working('18400000-0000-4000-8000-000000000011')$$,'42501',null,'Service role execution withheld');
reset role;
select * from finish();
rollback;

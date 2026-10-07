begin;
select no_plan();
select ok(not has_function_privilege('anon','api.resolve_published_resource_source_server(text,bigint,text,text)','EXECUTE'),'Resource source anon execution withheld');
select ok(not has_function_privilege('authenticated','api.resolve_published_resource_source_server(text,bigint,text,text)','EXECUTE'),'Resource source authenticated execution withheld');
select ok(not has_function_privilege('service_role','api.resolve_published_resource_source_server(text,bigint,text,text)','EXECUTE'),'Resource source service_role execution withheld');

select ok(not has_function_privilege('anon','api.resolve_public_resource_context(text,bigint)','EXECUTE'),'New anonymous reader withheld');
select ok(not has_function_privilege('authenticated','api.resolve_public_resource_context(text,bigint)','EXECUTE'),'New authenticated reader withheld');
select ok(not has_function_privilege('service_role','api.resolve_public_resource_context(text,bigint)','EXECUTE'),'New service reader withheld');
select ok(not has_function_privilege('anon','api.resolve_public_resource(text,bigint)','EXECUTE'),'Existing safe-source reader remains withheld');
select ok(not has_function_privilege('authenticated','api.publish_current_onboarding(uuid,text,text)','EXECUTE'),'First Publish remains withheld');
select ok(not has_table_privilege('anon','core.spill_item_publications','SELECT'),'No raw public Item reads');
select ok(not has_table_privilege('authenticated','core.identity_publications','SELECT'),'No raw signed-in Identity reads');
insert into auth.users(id,email) values
 ('94000000-0000-4000-8000-000000000001','resource-context-one@example.test'),
 ('94000000-0000-4000-8000-000000000002','resource-context-two@example.test');
create temporary table resource_context_owners as select * from core.owner_auth_bindings
 where auth_user_id in ('94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}';
select is(api.claim_current_owner_handle('resource-context-one',1)->>'status','success','First Handle');
select is(api.set_current_owner_primary_use_case('business',2)->>'status','success','First guidance');
select is(api.save_current_owner_basic_identity('Private Owner',null,null,3)->>'status','success','First Working Identity');
select is(api.save_current_owner_starter_composition('business',null,4)->>'status','success','First layout');
select is(api.claim_current_owner_handle('resource-context-renamed',5)->>'status','success','Protected alias');
select is(api.save_current_owner_resource_draft('portfolio','https://portfolio.example.test/works?creator=original&campaign=A%2FB','Private Portfolio',null)->>'status','success','Private Resource reference');
select is(api.save_current_owner_product_draft('https://store.example.test/item','Private Product',null)->>'status','success','Different Item type reserves second reference');
set local request.jwt.claims='{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000002"}';
select is(api.claim_current_owner_handle('resource-context-two',1)->>'status','success','Other Owner Handle');
select is(api.set_current_owner_primary_use_case('personal',2)->>'status','success','Other guidance');
select is(api.save_current_owner_basic_identity('Other Private Owner',null,null,3)->>'status','success','Other Working Identity');
select is(api.save_current_owner_starter_composition('clean',null,4)->>'status','success','Other layout');
select is(api.save_current_owner_resource_draft('menu','https://menu.example.test/','Other Private Menu',null)->>'status','success','Other Owner has same reference');
reset role;
-- Privileged publication fixtures and all reader grants roll back together.
grant usage on schema api to anon;
grant execute on function api.resolve_published_resource_source_server(text,bigint,text,text) to anon, authenticated;
grant execute on function api.resolve_public_resource_context(text,bigint) to anon, authenticated;
grant execute on function api.resolve_public_spill_item(text,bigint) to anon, authenticated;
grant execute on function api.resolve_public_resource(text,bigint) to anon;
set local role anon;
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Private Draft/Working/reservation never public');
select is(api.resolve_public_spill_item('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Exact Resource dispatch cannot expose private Draft/Working');
select is(api.resolve_published_resource_source_server('resource-context-one',1,repeat('a',64),repeat('b',64)),'{"status":"unavailable"}'::jsonb,'Private Resource source never exposed');
reset role;
insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,published_at)
 select owner_id,'{"display_name":"Published Resource Owner","profile_asset_key":null}',1,1,now()
 from resource_context_owners where auth_user_id='94000000-0000-4000-8000-000000000001';
insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,published_at)
 select item_id,owner_id,item_type,spill_reference,1,
 case when item_type='resource' then '{"resource_type":"portfolio","title":"Published Portfolio","source_url":"https://portfolio.example.test/works?creator=original&campaign=A%2FB"}'::jsonb
 else '{"title":"Published Product"}'::jsonb end,now()
 from core.spill_item_identity_registry where owner_id=(select owner_id from resource_context_owners where auth_user_id='94000000-0000-4000-8000-000000000001');
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Incomplete onboarding denies Published fixtures');
update core.owners set onboarding_completed_at=now() where id=(select owner_id from resource_context_owners where auth_user_id='94000000-0000-4000-8000-000000000001');
create temporary table resource_context_baseline as
 select p.*, api.resolve_public_resource_context('resource-context-one',1) as payload
 from core.spill_item_publications p where p.item_type='resource';
create temporary table resource_source_binding as
 select encode(extensions.digest(i::text||p::text,'sha256'),'hex') as publication_token,
 encode(extensions.digest(p.snapshot->>'source_url','sha256'),'hex') as source_hash,
 i.snapshot as identity_snapshot
 from core.identity_publications i join core.spill_item_publications p on p.owner_id=i.owner_id
 where p.item_type='resource';
grant select on resource_source_binding to anon, authenticated;
set local role anon;
select is(api.resolve_public_resource_context('resource-context-one',1),
 '{"status":"success","current_handle":"resource-context-renamed","display_name":"Published Resource Owner","spill_reference":1,"resource_type":"portfolio","title":"Published Portfolio","available":false,"source_url":null}'::jsonb,'Absent verdict keeps exact recognition and masks source');
select is(api.resolve_public_resource_context('RESOURCE-CONTEXT-RENAMED',1),api.resolve_public_resource_context('resource-context-one',1),'Alias/case resolves identical canonical DTO');
select is(api.resolve_public_spill_item('resource-context-one',1)->>'item_type','resource','Exact immutable Resource binding chooses context reader');
select is(api.resolve_public_spill_item('resource-context-one',1)->'detail',api.resolve_public_resource_context('resource-context-one',1),'Source-unavailable Resource remains exact recognition match');
select is(api.resolve_public_spill_item('RESOURCE-CONTEXT-RENAMED',1),api.resolve_public_spill_item('resource-context-one',1),'Exact Resource aliases/case share canonical wrapper');
select is(api.resolve_public_spill_item('resource-context-two',1),'{"status":"unavailable"}'::jsonb,'Owner-scoped reference never leaks other Resource');
select is(api.resolve_public_spill_item('resource-context-one',0),'{"status":"unavailable"}'::jsonb,'Invalid exact reference denied');
select is(api.resolve_public_spill_item('resource-context-one',9007199254740992),'{"status":"unavailable"}'::jsonb,'Oversized exact reference denied');
select is(api.resolve_public_spill_item('../resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Malformed exact Handle denied');
select is(api.resolve_public_resource('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Existing safe-source reader behavior unchanged');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Missing verdict cannot resolve source');
select is(api.resolve_public_resource_context('resource-context-two',1),'{"status":"unavailable"}'::jsonb,'Other Owner same reference cannot borrow Published context');
select is(api.resolve_public_resource_context('resource-context-one',2),'{"status":"unavailable"}'::jsonb,'Published Product cannot be treated as Resource');
select is(api.resolve_public_resource_context('resource-context-one',3),'{"status":"unavailable"}'::jsonb,'Missing reference never falls back to neighbor');
select is(api.resolve_public_resource_context('unknown-owner',1),'{"status":"unavailable"}'::jsonb,'Unknown Owner uniform unavailable');
select is(api.resolve_public_resource_context('../resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Malformed Handle denied');
select is(api.resolve_public_resource_context(' resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Whitespace Handle denied');
select is(api.resolve_public_resource_context(null,1),'{"status":"unavailable"}'::jsonb,'Null Handle denied');
select is(api.resolve_public_resource_context('resource-context-one',null),'{"status":"unavailable"}'::jsonb,'Null reference denied');
select is(api.resolve_public_resource_context('resource-context-one',0),'{"status":"unavailable"}'::jsonb,'Zero reference denied');
select is(api.resolve_public_resource_context('resource-context-one',9007199254740992),'{"status":"unavailable"}'::jsonb,'Unsafe integer reference denied');
select ok(not(api.resolve_public_resource_context('resource-context-one',1) ?| array['owner_id','item_id','working_revision','publication_token','receipt_id','profile_asset_key','reason_codes','scanner_version','destinations']),'No private authority or Product fields');
reset role;
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000002"}';
select is(api.resolve_public_resource_context('resource-context-one',1)->>'display_name','Published Resource Owner','Other signed-in viewer gains no private context');
select is(api.resolve_public_spill_item('resource-context-one',1)->'detail',api.resolve_public_resource_context('resource-context-one',1),'Viewer authentication does not change exact Resource DTO');
set local request.jwt.claims='{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}';
select is(api.resolve_public_resource_context('resource-context-one',1)->>'title','Published Portfolio','Owner receives same public title');
reset role;
update core.identity_working set display_name='New private name',revision=revision+1 where owner_id=(select owner_id from resource_context_baseline);
update core.resource_drafts set title='New private title',source_url='https://private-repair.example.test/',resource_type='website',revision=revision+1
 where owner_id=(select owner_id from resource_context_baseline);
select is(api.resolve_public_resource_context('resource-context-one',1),(select payload from resource_context_baseline),'New Working/type/source repair never replaces Published DTO');
select is(api.resolve_public_spill_item('resource-context-one',1)->'detail',(select payload from resource_context_baseline),'Exact dispatch preserves Published type/source/title across private repair');
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at)
 select snapshot->>'source_url',encode(extensions.digest(snapshot->>'source_url','sha256'),'hex'),'safe','resource-context-fixture',now(),now()+interval '1 hour' from resource_context_baseline;
select is(api.resolve_public_resource_context('resource-context-one',1)->>'available','true','Fresh exact safe verdict enables only availability');
select is(api.resolve_public_resource_context('resource-context-one',1)->>'source_url',(select snapshot->>'source_url' from resource_context_baseline),'Exact attribution preserved without URL rewriting');
select is(api.resolve_public_resource('resource-context-one',1)->>'status','success','Existing reader still requires safe source');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),jsonb_build_object('status','success','source_url',(select snapshot->>'source_url' from resource_context_baseline)),'Exact source retains original creator attribution only');
select is(api.resolve_published_resource_source_server('RESOURCE-CONTEXT-RENAMED',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'Source aliases and case share exact binding');
select ok(not(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)) ?| array['publication_token','source_hash','owner_id','item_id','reason_codes','scanner_version']),'Source response leaks no private binding or reason');
select is(api.resolve_published_resource_source_server('resource-context-two',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Other Owner cannot borrow source');
select is(api.resolve_published_resource_source_server('resource-context-one',2,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Product reference cannot resolve Resource source');
select is(api.resolve_published_resource_source_server('resource-context-one',3,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Missing reference cannot resolve neighbor');
select is(api.resolve_published_resource_source_server('resource-context-one',0,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Zero source reference denied');
select is(api.resolve_published_resource_source_server('resource-context-one',9007199254740992,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Unsafe integer source reference denied');
select is(api.resolve_published_resource_source_server('resource-context-one',null,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Null source reference denied');
select is(api.resolve_published_resource_source_server('../resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Malformed source Handle denied');
select is(api.resolve_published_resource_source_server(null,1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Null source Handle denied');
select is(api.resolve_published_resource_source_server(' resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Whitespace source Handle denied');
select is(api.resolve_published_resource_source_server('resource-context-one',1,null,(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Null publication binding denied');
select is(api.resolve_published_resource_source_server('resource-context-one',1,upper((select publication_token from resource_source_binding)),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Uppercase publication binding denied');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),'short'),'{"status":"unavailable"}'::jsonb,'Short source hash denied');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),null),'{"status":"unavailable"}'::jsonb,'Null source hash denied');
select is(api.resolve_published_resource_source_server('resource-context-one',1,repeat('0',64),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Wrong publication rows denied');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),repeat('0',64)),'{"status":"unavailable"}'::jsonb,'Wrong source bytes denied');
set local role anon;
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding))->>'status','success','Rolled-back anonymous fixture grant gives same exact source');
reset role;
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000002"}';
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding))->>'status','success','Signed-in other viewer gets only same public-safe source');
reset role;
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding))->>'source_url',(select snapshot->>'source_url' from resource_context_baseline),'Private source repair never substitutes Published source');
update core.external_destination_safety set safety_status='pending',checked_at=null,expires_at=null,scanner_version=null,revision=revision+1;
select is(api.resolve_public_resource_context('resource-context-one',1)->>'status','success','Pending retains Published recognition');
select is(api.resolve_public_resource_context('resource-context-one',1)->'source_url','null'::jsonb,'Pending masks exact URL');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Pending source cannot resolve');
update core.external_destination_safety set safety_status='review',reason_codes=array['malware'],
 checked_at=now(),expires_at=now()+interval '1 hour',scanner_version='resource-context-fixture',revision=revision+1;
select is(api.resolve_public_resource_context('resource-context-one',1)->>'available','false','Review source unavailable');
select is(api.resolve_public_resource_context('resource-context-one',1)->>'title','Published Portfolio','Review preserves title');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Review source cannot resolve');
update core.external_destination_safety set safety_status='blocked',revision=revision+1;
select is(api.resolve_public_resource_context('resource-context-one',1)->'source_url','null'::jsonb,'Blocked source masked');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Blocked source cannot resolve');
select is(api.resolve_public_resource_context('resource-context-one',1)->>'resource_type','portfolio','Blocked source never changes semantic type');
select is(api.resolve_public_spill_item('resource-context-one',1)->'detail'->'source_url','null'::jsonb,'Blocked exact Resource keeps recognition without URL');
update core.external_destination_safety set safety_status='safe',reason_codes=array[]::text[],checked_at=now()-interval '10 minutes',expires_at=now()-interval '1 second',revision=revision+1;
select is(api.resolve_public_resource_context('resource-context-one',1)->>'available','false','Expired safe verdict denied by wall clock');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Expired source cannot resolve');
update core.external_destination_safety set expires_at=now()+interval '1 hour',url_hash=repeat('0',64),revision=revision+1;
select is(api.resolve_public_resource_context('resource-context-one',1)->'source_url','null'::jsonb,'Mismatched hash cannot authorize source');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Safety hash mismatch cannot resolve');
update core.external_destination_safety set url_hash=encode(extensions.digest(normalized_url,'sha256'),'hex'),revision=revision+1;
select is(api.resolve_public_resource_context('resource-context-one',1)->>'available','true','Safety recovery restores same Resource source');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding))->>'source_url',(select snapshot->>'source_url' from resource_context_baseline),'Exact safe recovery retains same source binding');
update core.identity_publications set snapshot=jsonb_set(snapshot,'{display_name}','"Changed Published Owner"');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Changed Published Identity cannot inherit old binding');
update core.identity_publications set snapshot=(select identity_snapshot from resource_source_binding);
update core.spill_item_publications set snapshot=jsonb_set(snapshot,'{title}','"Changed Published Resource"') where item_type='resource';
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Changed Published Resource cannot inherit old binding');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from resource_context_baseline),'{source_url}','"https://portfolio.example.test/works?creator=replacement"') where item_type='resource';
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at) values ('https://portfolio.example.test/works?creator=replacement',encode(extensions.digest('https://portfolio.example.test/works?creator=replacement','sha256'),'hex'),'safe','resource-source-fixture',now(),now()+interval '1 hour');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Even safe changed source cannot inherit old token or attribution');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select encode(extensions.digest(i::text||p::text,'sha256'),'hex') from core.identity_publications i join core.spill_item_publications p on p.owner_id=i.owner_id where p.item_type='resource'),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'New publication rows cannot inherit old source hash');
update core.spill_item_publications set snapshot=(select snapshot from resource_context_baseline) where item_type='resource';
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding))->>'status','success','Restored unchanged rows recover exact original binding');
select is(api.resolve_public_spill_item('resource-context-one',1)->'detail'->>'source_url',(select snapshot->>'source_url' from resource_context_baseline),'Resource recovery preserves exact original attribution');
select is((select snapshot from core.spill_item_publications where item_type='resource'),(select snapshot from resource_context_baseline),'Degradation/recovery never rewrites snapshot');
select is((select lifecycle_state from core.spill_item_publications where item_type='resource'),'published','Degradation never auto-Hides/Archives');
-- Missing/malformed Published minimum is not source degradation or private fallback.
update core.spill_item_publications set snapshot=snapshot-'source_url' where item_type='resource';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Missing source never fills from private repair');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select encode(extensions.digest(i::text||p::text,'sha256'),'hex') from core.identity_publications i join core.spill_item_publications p on p.owner_id=i.owner_id where p.item_type='resource'),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Incomplete source denies even current row binding');
select is(api.resolve_public_spill_item('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Incomplete Resource exposes no type and never falls back to Product');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from resource_context_baseline),'{resource_type}','"pdf"') where item_type='resource';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Unknown semantic type denied');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select encode(extensions.digest(i::text||p::text,'sha256'),'hex') from core.identity_publications i join core.spill_item_publications p on p.owner_id=i.owner_id where p.item_type='resource'),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Malformed semantic type denies even current row binding');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from resource_context_baseline),'{title}','" "') where item_type='resource';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Blank Published title denied');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select encode(extensions.digest(i::text||p::text,'sha256'),'hex') from core.identity_publications i join core.spill_item_publications p on p.owner_id=i.owner_id where p.item_type='resource'),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Blank title denies even current row binding');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from resource_context_baseline),'{source_url}','"javascript:alert(1)"') where item_type='resource';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Malformed Published source denied');
update core.spill_item_publications set snapshot=(select snapshot from resource_context_baseline),lifecycle_state='hidden' where item_type='resource';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Hidden Resource uniform unavailable');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Hidden Resource source denied');
select is(api.resolve_public_spill_item('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Hidden exact Resource reveals no binding');
update core.spill_item_publications set lifecycle_state='archived' where item_type='resource';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Archived Resource not normal detail');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Archived Resource source denied');
update core.spill_item_publications set lifecycle_state='published' where item_type='resource';
update core.identity_publications set lifecycle_state='hidden';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Hidden Identity denies Resource context');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Hidden Identity source denied');
select is(api.resolve_public_spill_item('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Hidden Identity denies exact dispatch');
update core.identity_publications set lifecycle_state='published',snapshot=jsonb_set(snapshot,'{display_name}','" "');
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Malformed Published Owner context denied');
update core.identity_publications set snapshot=jsonb_set(snapshot,'{display_name}','"Published Resource Owner"');
update core.owners set account_state='restricted' where id=(select owner_id from resource_context_baseline);
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Restricted Owner alias discloses no reason');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Restricted Owner source denied');
select is(api.resolve_public_spill_item('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Restricted Owner exact alias reveals no Item type');
update core.owners set account_state='suspended' where id=(select owner_id from resource_context_baseline);
select is(api.resolve_public_resource_context('resource-context-renamed',1),'{"status":"unavailable"}'::jsonb,'Suspended Owner denies context');
select is(api.resolve_published_resource_source_server('resource-context-one',1,(select publication_token from resource_source_binding),(select source_hash from resource_source_binding)),'{"status":"unavailable"}'::jsonb,'Suspended Owner source denied');
select is((select count(*) from core.spill_item_publications),2::bigint,'Reads create no publication');
select is((select count(*) from core.first_onboarding_publications),0::bigint,'Reads complete no first Publish');
select is((select count(*) from core.spill_item_identity_registry),3::bigint,'Reads allocate no reference');
select * from finish();
rollback;

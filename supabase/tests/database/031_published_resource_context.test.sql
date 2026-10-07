begin;
select no_plan();
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
grant execute on function api.resolve_public_resource_context(text,bigint) to anon, authenticated;
grant execute on function api.resolve_public_resource(text,bigint) to anon;
set local role anon;
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Private Draft/Working/reservation never public');
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
set local role anon;
select is(api.resolve_public_resource_context('resource-context-one',1),
 '{"status":"success","current_handle":"resource-context-renamed","display_name":"Published Resource Owner","spill_reference":1,"resource_type":"portfolio","title":"Published Portfolio","available":false,"source_url":null}'::jsonb,'Absent verdict keeps exact recognition and masks source');
select is(api.resolve_public_resource_context('RESOURCE-CONTEXT-RENAMED',1),api.resolve_public_resource_context('resource-context-one',1),'Alias/case resolves identical canonical DTO');
select is(api.resolve_public_resource('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Existing safe-source reader behavior unchanged');
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
set local request.jwt.claims='{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}';
select is(api.resolve_public_resource_context('resource-context-one',1)->>'title','Published Portfolio','Owner receives same public title');
reset role;
update core.identity_working set display_name='New private name',revision=revision+1 where owner_id=(select owner_id from resource_context_baseline);
update core.resource_drafts set title='New private title',source_url='https://private-repair.example.test/',resource_type='website',revision=revision+1
 where owner_id=(select owner_id from resource_context_baseline);
select is(api.resolve_public_resource_context('resource-context-one',1),(select payload from resource_context_baseline),'New Working/type/source repair never replaces Published DTO');
insert into core.external_destination_safety(normalized_url,url_hash,safety_status,scanner_version,checked_at,expires_at)
 select snapshot->>'source_url',encode(extensions.digest(snapshot->>'source_url','sha256'),'hex'),'safe','resource-context-fixture',now(),now()+interval '1 hour' from resource_context_baseline;
select is(api.resolve_public_resource_context('resource-context-one',1)->>'available','true','Fresh exact safe verdict enables only availability');
select is(api.resolve_public_resource_context('resource-context-one',1)->>'source_url',(select snapshot->>'source_url' from resource_context_baseline),'Exact attribution preserved without URL rewriting');
select is(api.resolve_public_resource('resource-context-one',1)->>'status','success','Existing reader still requires safe source');
update core.external_destination_safety set safety_status='pending',checked_at=null,expires_at=null,scanner_version=null,revision=revision+1;
select is(api.resolve_public_resource_context('resource-context-one',1)->>'status','success','Pending retains Published recognition');
select is(api.resolve_public_resource_context('resource-context-one',1)->'source_url','null'::jsonb,'Pending masks exact URL');
update core.external_destination_safety set safety_status='review',reason_codes=array['malware'],
 checked_at=now(),expires_at=now()+interval '1 hour',scanner_version='resource-context-fixture',revision=revision+1;
select is(api.resolve_public_resource_context('resource-context-one',1)->>'available','false','Review source unavailable');
select is(api.resolve_public_resource_context('resource-context-one',1)->>'title','Published Portfolio','Review preserves title');
update core.external_destination_safety set safety_status='blocked',revision=revision+1;
select is(api.resolve_public_resource_context('resource-context-one',1)->'source_url','null'::jsonb,'Blocked source masked');
select is(api.resolve_public_resource_context('resource-context-one',1)->>'resource_type','portfolio','Blocked source never changes semantic type');
update core.external_destination_safety set safety_status='safe',reason_codes=array[]::text[],checked_at=now()-interval '10 minutes',expires_at=now()-interval '1 second',revision=revision+1;
select is(api.resolve_public_resource_context('resource-context-one',1)->>'available','false','Expired safe verdict denied by wall clock');
update core.external_destination_safety set expires_at=now()+interval '1 hour',url_hash=repeat('0',64),revision=revision+1;
select is(api.resolve_public_resource_context('resource-context-one',1)->'source_url','null'::jsonb,'Mismatched hash cannot authorize source');
update core.external_destination_safety set url_hash=encode(extensions.digest(normalized_url,'sha256'),'hex'),revision=revision+1;
select is(api.resolve_public_resource_context('resource-context-one',1)->>'available','true','Safety recovery restores same Resource source');
select is((select snapshot from core.spill_item_publications where item_type='resource'),(select snapshot from resource_context_baseline),'Degradation/recovery never rewrites snapshot');
select is((select lifecycle_state from core.spill_item_publications where item_type='resource'),'published','Degradation never auto-Hides/Archives');
-- Missing/malformed Published minimum is not source degradation or private fallback.
update core.spill_item_publications set snapshot=snapshot-'source_url' where item_type='resource';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Missing source never fills from private repair');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from resource_context_baseline),'{resource_type}','"pdf"') where item_type='resource';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Unknown semantic type denied');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from resource_context_baseline),'{title}','" "') where item_type='resource';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Blank Published title denied');
update core.spill_item_publications set snapshot=jsonb_set((select snapshot from resource_context_baseline),'{source_url}','"javascript:alert(1)"') where item_type='resource';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Malformed Published source denied');
update core.spill_item_publications set snapshot=(select snapshot from resource_context_baseline),lifecycle_state='hidden' where item_type='resource';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Hidden Resource uniform unavailable');
update core.spill_item_publications set lifecycle_state='archived' where item_type='resource';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Archived Resource not normal detail');
update core.spill_item_publications set lifecycle_state='published' where item_type='resource';
update core.identity_publications set lifecycle_state='hidden';
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Hidden Identity denies Resource context');
update core.identity_publications set lifecycle_state='published',snapshot=jsonb_set(snapshot,'{display_name}','" "');
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Malformed Published Owner context denied');
update core.identity_publications set snapshot=jsonb_set(snapshot,'{display_name}','"Published Resource Owner"');
update core.owners set account_state='restricted' where id=(select owner_id from resource_context_baseline);
select is(api.resolve_public_resource_context('resource-context-one',1),'{"status":"unavailable"}'::jsonb,'Restricted Owner alias discloses no reason');
update core.owners set account_state='suspended' where id=(select owner_id from resource_context_baseline);
select is(api.resolve_public_resource_context('resource-context-renamed',1),'{"status":"unavailable"}'::jsonb,'Suspended Owner denies context');
select is((select count(*) from core.spill_item_publications),2::bigint,'Reads create no publication');
select is((select count(*) from core.first_onboarding_publications),0::bigint,'Reads complete no first Publish');
select is((select count(*) from core.spill_item_identity_registry),3::bigint,'Reads allocate no reference');
select * from finish();
rollback;

begin;
select no_plan();
select ok(relrowsecurity, 'Resource table uses RLS') from pg_class where oid = 'core.resource_drafts'::regclass;
select ok(not has_table_privilege(role_name, 'core.resource_drafts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  role_name || ' has no direct Resource privileges') from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name);
select ok(not has_function_privilege(role_name, 'core.reserve_resource_draft_identity()', 'EXECUTE'),
  role_name || ' cannot allocate Resource identity') from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name);
select ok(not has_function_privilege('anon', 'api.save_current_owner_resource_draft(text,text,text,bigint)', 'EXECUTE'), 'Anonymous cannot save');
insert into auth.users(id, email) values
  ('76000000-0000-4000-8000-000000000001', 'resource-one@example.test'),
  ('76000000-0000-4000-8000-000000000002', 'resource-two@example.test');
create temporary table resource_test_owners as select auth_user_id, owner_id from core.owner_auth_bindings
where auth_user_id in ('76000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select is(api.resolve_current_resource_draft_state()->>'status', 'unauthenticated', 'Missing subject denied');
set local request.jwt.claims = '{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000001"}';
select is(api.save_current_owner_resource_draft('menu', null, 'Menu', null)->>'status', 'step_not_available', 'Cannot skip prerequisites');
select is(api.claim_current_owner_handle('resource-one', 1)->>'status', 'success', 'Claim Handle');
select is(api.set_current_owner_primary_use_case('business', 2)->>'status', 'success', 'Business guidance');
select is(api.save_current_owner_basic_identity('Resource One', null, null, 3)->>'status', 'success', 'Identity prerequisite');
select is(api.save_current_owner_starter_composition('clean', null, 4)->>'status', 'success', 'Reach S5');
select is(api.resolve_current_resource_draft_state()->'resource_draft', 'null'::jsonb, 'Read has no Draft');
select is(api.save_current_owner_resource_draft('menu', null, null, null)->>'status', 'empty_draft', 'Type alone rejected');
select is(api.save_current_owner_resource_draft('unknown', 'https://example.com/menu.pdf', null, null)->>'status', 'invalid_resource_type', 'URL does not infer type');
select is(api.save_current_owner_resource_draft('menu', 'javascript:alert(1)', 'Menu', null)->>'status', 'invalid_source_url', 'Unsafe scheme rejected');
select is(api.save_current_owner_resource_draft('menu', 'https://example.com\\bad', 'Menu', null)->>'status', 'invalid_source_url', 'Backslash rejected');
select is(api.save_current_owner_resource_draft('menu', null, E'Bad\nTitle', null)->>'status', 'invalid_title', 'Control characters rejected');
select is(api.save_current_owner_resource_draft('menu', null, repeat('x', 161), null)->>'status', 'invalid_title', 'Oversized title rejected');
reset role;
select is((select count(*) from core.resource_drafts d join resource_test_owners o using(owner_id)), 0::bigint, 'Invalid inputs create no content');
select is((select count(*) from core.spill_item_identity_registry r join resource_test_owners o using(owner_id)), 0::bigint, 'Invalid inputs and reads allocate nothing');
set local role authenticated;
select is(api.save_current_owner_resource_draft('menu', null, '  Our menu  ', null)->'resource_draft',
  '{"resource_type":"menu","source_url":null,"title":"Our menu","revision":1}'::jsonb, 'Meaningful title-only Draft acknowledged');
select is(api.save_current_owner_resource_draft('menu', null, 'Stale', null)->>'status', 'stale_write', 'Stale initial save denied');
select is(api.save_current_owner_resource_draft('catalog', 'https://example.com/catalog.pdf', null, 1)->'resource_draft',
  '{"resource_type":"catalog","source_url":"https://example.com/catalog.pdf","title":null,"revision":2}'::jsonb, 'Explicit meaning can change while source-only Draft persists');
select is(api.save_current_owner_resource_draft('catalog', null, null, 2)->>'status', 'empty_draft', 'Cannot clear all meaningful content');
select is(api.save_current_owner_resource_draft('menu', null, 'Stale', 1)->>'status', 'stale_write', 'Stale update denied');
select is(api.save_current_owner_product_draft('https://example.com/product', 'Product', null)->>'status', 'success', 'Product coexists with Resource');
reset role;
create temporary table resource_reservation as select r.* from core.spill_item_identity_registry r
join core.resource_drafts d on d.id = r.item_id join resource_test_owners o on o.owner_id = d.owner_id;
select is((select spill_reference from resource_reservation), 1::bigint, 'Resource receives first shared reference');
select is((select item_type from resource_reservation), 'resource', 'Item type stays Resource');
select is((select spill_reference from core.spill_item_identity_registry r join core.product_drafts d on d.id = r.item_id
  where d.owner_id = (select owner_id from resource_reservation)), 2::bigint, 'Product uses next shared reference');
select is((select revision from core.resource_drafts where id = (select item_id from resource_reservation)), 2::bigint, 'Rejected writes do not increment revision');
select throws_ok($$update core.resource_drafts set id = gen_random_uuid() where id = (select item_id from resource_reservation)$$, '23514', null, 'Item UUID immutable');
select throws_ok($$update core.resource_drafts set owner_id = (select owner_id from resource_test_owners where auth_user_id = '76000000-0000-4000-8000-000000000002') where id = (select item_id from resource_reservation)$$, '23514', null, 'Owner immutable');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000002"}';
select is(api.claim_current_owner_handle('resource-two', 1)->>'status', 'success', 'Other Owner Handle');
select is(api.set_current_owner_primary_use_case('personal', 2)->>'status', 'success', 'Other Owner Personal');
select is(api.save_current_owner_basic_identity('Resource Two', null, null, 3)->>'status', 'success', 'Other Identity');
select is(api.save_current_owner_starter_composition('clean', null, 4)->>'status', 'success', 'Other S5');
select is(api.resolve_current_resource_draft_state()->'resource_draft', 'null'::jsonb, 'Owner isolation');
select is(api.save_current_owner_resource_draft('portfolio', 'https://example.com/work', null, null)->>'status', 'success', 'Personal Owner can create Resource');
select throws_ok($$select * from core.resource_drafts$$, '42501', null, 'Direct private read denied');
reset role;
select is((select count(*) from core.spill_item_identity_registry r join resource_test_owners o using(owner_id) where spill_reference = 1), 2::bigint, 'Separate Owner namespace');
select is((select current_step::text from core.owner_onboarding_progress where owner_id = (select owner_id from resource_reservation)), 'relevant_first_job', 'Save never advances onboarding');
select ok((select onboarding_completed_at is null from core.owners where id = (select owner_id from resource_reservation)), 'Save never completes onboarding');
delete from core.resource_drafts where id = (select item_id from resource_reservation);
select ok(exists(select 1 from core.spill_item_identity_registry where item_id = (select item_id from resource_reservation)), 'Content removal retains reservation');
select * from finish();
rollback;

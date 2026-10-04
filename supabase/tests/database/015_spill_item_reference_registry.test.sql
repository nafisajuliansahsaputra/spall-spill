begin;
select no_plan();

select ok(c.relrowsecurity, c.relname || ' has RLS')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'core' and c.relname in ('spill_item_identity_registry', 'spill_reference_counters');
select ok(not has_table_privilege(role_name, table_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  role_name || ' cannot access ' || table_name)
from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
cross join (values ('core.spill_item_identity_registry'), ('core.spill_reference_counters')) tables(table_name);
select ok(not has_function_privilege(role_name, function_name, 'EXECUTE'),
  role_name || ' cannot call ' || function_name)
from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
cross join (values ('core.reserve_spill_item_identity(uuid,uuid,text)'),
  ('core.reserve_product_draft_identity()'), ('core.guard_spill_identity_reservation()'),
  ('core.guard_spill_reference_counter()')) functions(function_name);

insert into auth.users (id, email) values
  ('75000000-0000-4000-8000-000000000001', 'reference-one@example.test'),
  ('75000000-0000-4000-8000-000000000002', 'reference-two@example.test');
create temporary table reference_test_owners as
select auth_user_id, owner_id from core.owner_auth_bindings
where auth_user_id in ('75000000-0000-4000-8000-000000000001', '75000000-0000-4000-8000-000000000002');

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"75000000-0000-4000-8000-000000000001"}';
select is(api.claim_current_owner_handle('reference-one', 1)->>'status', 'success', 'Owner one claims Handle');
select is(api.set_current_owner_primary_use_case('affiliate', 2)->>'status', 'success', 'Owner one chooses guidance');
select is(api.save_current_owner_basic_identity('Reference One', null, null, 3)->>'status', 'success', 'Owner one saves Identity');
select is(api.save_current_owner_starter_composition('featured', null, 4)->>'status', 'success', 'Owner one reaches S5');
select is(api.resolve_current_product_draft_state()->>'status', 'success', 'Draft read succeeds');
select is(api.save_current_owner_product_draft('not a URL', null, null)->>'status', 'invalid_source_url', 'Invalid save denied');
reset role;
select is((select count(*) from core.spill_item_identity_registry r join reference_test_owners o using(owner_id)),
  0::bigint, 'Reads and invalid input allocate no Item');
select is((select count(*) from core.spill_reference_counters c join reference_test_owners o using(owner_id)),
  0::bigint, 'Reads and invalid input allocate no counter');

set local role authenticated;
select is(api.save_current_owner_product_draft('https://example.com/one', null, null)->>'status', 'success', 'URL-only Draft creates Item');
select is(api.save_current_owner_product_draft('https://example.com/stale', null, null)->>'status', 'stale_write', 'Stale first save rejected');
select is(api.save_current_owner_product_draft('https://example.com/edited', 'New title', 1)->>'status', 'success', 'Content edit succeeds');
reset role;
create temporary table initial_reservation as
select r.* from core.spill_item_identity_registry r join reference_test_owners o using(owner_id)
where o.auth_user_id = '75000000-0000-4000-8000-000000000001';
select is((select spill_reference from initial_reservation), 1::bigint, 'First Owner reference is 1');
select is((select item_type from initial_reservation), 'product', 'Registry records explicit Product type');
select is((select count(*) from core.spill_item_identity_registry r join reference_test_owners o using(owner_id)),
  1::bigint, 'Stale save and content edits allocate no extra Item');
select is((select next_reference from core.spill_reference_counters where owner_id = (select owner_id from initial_reservation)),
  2::bigint, 'Stale save and edits do not consume another number');
select ok(exists(select 1 from core.product_drafts d join initial_reservation r
  on d.id = r.item_id and d.owner_id = r.owner_id where d.source_url = 'https://example.com/edited' and d.revision = 2),
  'Content edits preserve Item UUID and Owner binding');

select throws_ok($$update core.spill_item_identity_registry set spill_reference = 27 where item_id = (select item_id from initial_reservation)$$,
  '23514', null, 'Reference cannot change');
select throws_ok($$update core.spill_item_identity_registry set item_type = 'resource' where item_id = (select item_id from initial_reservation)$$,
  '23514', null, 'Item type cannot change');
select throws_ok($$delete from core.spill_item_identity_registry where item_id = (select item_id from initial_reservation)$$,
  '23514', null, 'Reservation cannot be deleted');
select throws_ok($$truncate core.spill_item_identity_registry$$, '23514', null, 'Registry cannot be truncated');
select throws_ok($$update core.spill_reference_counters set next_reference = 1 where owner_id = (select owner_id from initial_reservation)$$,
  '23514', null, 'Counter cannot rewind');
select throws_ok($$delete from core.spill_reference_counters where owner_id = (select owner_id from initial_reservation)$$,
  '23514', null, 'Counter cannot be deleted');
select throws_ok($$truncate core.spill_reference_counters$$, '23514', null, 'Counter cannot be truncated');
select throws_ok($$update core.product_drafts set id = gen_random_uuid() where id = (select item_id from initial_reservation)$$,
  '23514', null, 'Content Item UUID cannot change');
select throws_ok($$update core.product_drafts set owner_id = (select owner_id from reference_test_owners where auth_user_id = '75000000-0000-4000-8000-000000000002') where id = (select item_id from initial_reservation)$$,
  '23514', null, 'Content Owner cannot change');

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"75000000-0000-4000-8000-000000000002"}';
select is(api.claim_current_owner_handle('reference-two', 1)->>'status', 'success', 'Owner two claims Handle');
select is(api.set_current_owner_primary_use_case('personal', 2)->>'status', 'success', 'Owner two chooses Personal guidance');
select is(api.save_current_owner_basic_identity('Reference Two', null, null, 3)->>'status', 'success', 'Owner two saves Identity');
select is(api.save_current_owner_starter_composition('clean', null, 4)->>'status', 'success', 'Owner two reaches S5');
select is(api.save_current_owner_product_draft('https://example.com/two', null, null)->>'status', 'success', 'Personal Owner also creates Product');
reset role;
select is((select count(*) from core.spill_item_identity_registry r join reference_test_owners o using(owner_id) where spill_reference = 1),
  2::bigint, 'Distinct Owners may both have reference 1');

-- Reserve another type internally; no Resource API is exposed by this foundation.
select core.reserve_spill_item_identity('75000000-0000-4000-8000-000000000010', (select owner_id from initial_reservation), 'resource');
select is((select spill_reference from core.spill_item_identity_registry where item_id = '75000000-0000-4000-8000-000000000010'),
  2::bigint, 'Product and Resource share an Owner reference sequence');
select throws_ok($$select core.reserve_spill_item_identity(gen_random_uuid(), (select owner_id from initial_reservation), 'generic_link')$$,
  '23514', null, 'Identity generic links cannot reserve Spill identities');
select is((select next_reference from core.spill_reference_counters where owner_id = (select owner_id from initial_reservation)),
  3::bigint, 'Failed type validation rolls back counter allocation');

delete from core.product_drafts where id = (select item_id from initial_reservation);
select ok(exists(select 1 from core.spill_item_identity_registry where item_id = (select item_id from initial_reservation)),
  'Physical content deletion retains its reference reservation');
select throws_ok($$insert into core.product_drafts(id, owner_id, source_url) select item_id, owner_id, 'https://example.com/reused' from initial_reservation$$,
  '23505', null, 'Removed Item UUID cannot be reused');
select is((select next_reference from core.spill_reference_counters where owner_id = (select owner_id from initial_reservation)),
  3::bigint, 'Rejected UUID reuse rolls back counter and content creation');
insert into core.product_drafts(owner_id, source_url) select owner_id, 'https://example.com/replacement' from initial_reservation;
select is((select spill_reference from core.spill_item_identity_registry r join core.product_drafts d on d.id = r.item_id
  where d.owner_id = (select owner_id from initial_reservation)), 3::bigint, 'New Item never recycles deleted reference 1');

select throws_ok($$select core.reserve_spill_item_identity(gen_random_uuid(), '75000000-0000-4000-8000-000000000099', 'product')$$,
  '23503', null, 'Unknown canonical Owner cannot allocate');
select is((select current_step::text from core.owner_onboarding_progress where owner_id = (select owner_id from initial_reservation)),
  'relevant_first_job', 'Allocation does not advance onboarding');
select ok((select onboarding_completed_at is null from core.owners where id = (select owner_id from initial_reservation)),
  'Allocation does not complete onboarding');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and p.proname like '%spill%reference%'), 0::bigint, 'No exposed reference allocator/lookup API');

set local role authenticated;
select throws_ok($$select core.reserve_spill_item_identity(gen_random_uuid(), gen_random_uuid(), 'product')$$,
  '42501', null, 'Authenticated callers cannot directly select an allocation Owner');
reset role;
delete from core.product_drafts where owner_id = (select owner_id from initial_reservation);
update core.spill_reference_counters set next_reference = 9007199254740992
where owner_id = (select owner_id from initial_reservation);
select throws_ok($$insert into core.product_drafts(owner_id, source_url) select owner_id, 'https://example.com/exhausted' from initial_reservation$$,
  '23514', null, 'Exhausted JavaScript-safe namespace fails closed');
select is((select count(*) from core.product_drafts where owner_id = (select owner_id from initial_reservation)),
  0::bigint, 'Allocation failure leaves no partially created content');
select is((select count(*) from core.spill_item_identity_registry where owner_id = (select owner_id from initial_reservation)),
  3::bigint, 'Allocation failure creates no partial identity reservation');

select * from finish();
rollback;

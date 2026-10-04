begin;

select no_plan();

-- ===========================================================================
-- O01-S5 — First Product Draft
-- ===========================================================================

select ok(
  to_regprocedure(
    'api.resolve_current_product_draft_state()'
  ) is not null,
  'Product Draft current-Owner resolver exists'
);

select ok(
  to_regprocedure(
    'api.save_current_owner_product_draft(text,text,bigint)'
  ) is not null,
  'Product Draft current-Owner save RPC exists'
);

select ok(
  (
    select p.prosecdef
    from pg_proc as p
    where p.oid =
      'api.resolve_current_product_draft_state()'::regprocedure
  ),
  'Product Draft resolver is SECURITY DEFINER'
);

select ok(
  (
    select p.prosecdef
    from pg_proc as p
    where p.oid =
      'api.save_current_owner_product_draft(text,text,bigint)'::regprocedure
  ),
  'Product Draft save RPC is SECURITY DEFINER'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.resolve_current_product_draft_state()',
    'EXECUTE'
  ),
  'authenticated may execute Product Draft resolver'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.resolve_current_product_draft_state()',
    'EXECUTE'
  ),
  'anon cannot execute Product Draft resolver'
);

select ok(
  has_function_privilege(
    'authenticated',
    'api.save_current_owner_product_draft(text,text,bigint)',
    'EXECUTE'
  ),
  'authenticated may execute Product Draft save RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'api.save_current_owner_product_draft(text,text,bigint)',
    'EXECUTE'
  ),
  'anon cannot execute Product Draft save RPC'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.product_drafts',
    'SELECT'
  ),
  'authenticated cannot read private Product Draft table directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.product_drafts',
    'INSERT'
  ),
  'authenticated cannot insert Product Draft directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.product_drafts',
    'UPDATE'
  ),
  'authenticated cannot update Product Draft directly'
);

select is(
  (
    select count(*)
    from pg_proc as p
    join pg_namespace as n
      on n.oid = p.pronamespace
    where
      n.nspname = 'api'
      and p.proname =
        'save_current_owner_product_draft'
      and not exists (
        select 1
        from unnest(
          coalesce(
            p.proargnames,
            array[]::text[]
          )
        ) as argument_name
        where argument_name in (
          'owner_id',
          'input_owner_id',
          'target_owner_id'
        )
      )
  ),
  1::bigint,
  'Product Draft save exposes no client-selectable Owner target'
);

-- Product Draft identity is deliberately not a public Spill Reference.

select is(
  (
    select count(*)
    from information_schema.columns
    where
      table_schema = 'core'
      and table_name = 'product_drafts'
      and column_name in (
        'reference',
        'spill_reference',
        'persistent_reference'
      )
  ),
  0::bigint,
  'Product Draft schema contains no Persistent Spill Reference column'
);

-- ---------------------------------------------------------------------------
-- Unauthenticated requests fail closed
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated"}';

select is(
  api.resolve_current_product_draft_state()
    ->> 'status',
  'unauthenticated',
  'Product Draft resolver fails closed without auth.uid()'
);

select is(
  api.save_current_owner_product_draft(
    'https://example.com/product',
    null,
    null
  ) ->> 'status',
  'unauthenticated',
  'Product Draft save fails closed without auth.uid()'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

reset role;

insert into auth.users (id, email)
values
  (
    '72000000-0000-4000-8000-000000000001',
    'product-affiliate@example.test'
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    'product-personal@example.test'
  ),
  (
    '72000000-0000-4000-8000-000000000003',
    'product-early@example.test'
  );

-- Affiliate Owner -> S5

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000001"}';

select is(
  api.claim_current_owner_handle(
    'product-affiliate',
    1
  ) ->> 'status',
  'success',
  'Affiliate Owner completes S1'
);

select is(
  api.set_current_owner_primary_use_case(
    'affiliate',
    2
  ) ->> 'status',
  'success',
  'Affiliate Owner completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'Product Affiliate',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Affiliate Owner completes S3'
);

select is(
  api.save_current_owner_starter_composition(
    'featured',
    null,
    4
  ) ->> 'status',
  'success',
  'Affiliate Owner reaches S5'
);

-- Personal Owner -> S5.
-- This proves Primary Use Case is recommendation, not Product permission.

set local request.jwt.claims =
  '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000002"}';

select is(
  api.claim_current_owner_handle(
    'product-personal',
    1
  ) ->> 'status',
  'success',
  'Personal Owner completes S1'
);

select is(
  api.set_current_owner_primary_use_case(
    'personal',
    2
  ) ->> 'status',
  'success',
  'Personal Owner completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'Product Personal',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Personal Owner completes S3'
);

select is(
  api.save_current_owner_starter_composition(
    'clean',
    null,
    4
  ) ->> 'status',
  'success',
  'Personal Owner reaches S5'
);

-- Early Owner stops at S4

set local request.jwt.claims =
  '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000003"}';

select is(
  api.claim_current_owner_handle(
    'product-early',
    1
  ) ->> 'status',
  'success',
  'Early Owner completes S1'
);

select is(
  api.set_current_owner_primary_use_case(
    'affiliate',
    2
  ) ->> 'status',
  'success',
  'Early Owner completes S2'
);

select is(
  api.save_current_owner_basic_identity(
    'Product Early',
    null,
    null,
    3
  ) ->> 'status',
  'success',
  'Early Owner reaches S4'
);

select is(
  api.save_current_owner_product_draft(
    'https://example.com/too-early',
    null,
    null
  ) ->> 'status',
  'step_not_available',
  'Owner below S5 cannot create Product Draft'
);

-- ---------------------------------------------------------------------------
-- Affiliate initial Draft boundary
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000001"}';

select is(
  api.resolve_current_product_draft_state()
    ->> 'status',
  'success',
  'Affiliate Product Draft resolver succeeds at S5'
);

select ok(
  api.resolve_current_product_draft_state()
    -> 'product_draft'
    is null
    or
  api.resolve_current_product_draft_state()
    -> 'product_draft' =
      'null'::jsonb,
  'no Product Draft exists before explicit valid URL save'
);

-- URL alone is sufficient for first private Draft persistence.

select is(
  api.save_current_owner_product_draft(
    ' https://shop.example.com/products/first?affiliate=natsx ',
    '   ',
    null
  ) ->> 'status',
  'success',
  'valid Product URL creates first private Draft'
);

select is(
  api.resolve_current_product_draft_state()
    -> 'product_draft'
    ->> 'source_url',
  'https://shop.example.com/products/first?affiliate=natsx',
  'Product source URL outer whitespace is normalized'
);

select is(
  api.resolve_current_product_draft_state()
    -> 'product_draft'
    ->> 'title',
  null::text,
  'Product title remains optional at initial Draft threshold'
);

select is(
  api.resolve_current_product_draft_state()
    -> 'product_draft'
    ->> 'revision',
  '1',
  'first Product Draft begins at revision 1'
);

select ok(
  not (
    api.resolve_current_product_draft_state()
      -> 'product_draft'
      ? 'id'
  ),
  'Product Draft resolver does not expose internal Draft id'
);

select ok(
  not (
    api.resolve_current_product_draft_state()
      -> 'product_draft'
      ? 'reference'
  ),
  'Product Draft resolver exposes no Persistent Spill Reference'
);

-- Save must not advance or complete onboarding.

reset role;

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress
      as progress
    inner join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where binding.auth_user_id =
      '72000000-0000-4000-8000-000000000001'
  ),
  'relevant_first_job',
  'saving Product Draft does not advance beyond S5'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress
      as progress
    inner join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where binding.auth_user_id =
      '72000000-0000-4000-8000-000000000001'
  ),
  5::bigint,
  'saving Product Draft does not mutate onboarding progress revision'
);

select ok(
  (
    select owner_record.onboarding_completed_at
    from core.owners
      as owner_record
    inner join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        owner_record.id
    where binding.auth_user_id =
      '72000000-0000-4000-8000-000000000001'
  ) is null,
  'saving Product Draft does not complete onboarding'
);

-- ---------------------------------------------------------------------------
-- Edit + revision / stale-write behavior
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000001"}';

select is(
  api.save_current_owner_product_draft(
    'https://shop.example.com/products/first',
    '  First Product  ',
    1
  ) ->> 'status',
  'success',
  'acknowledged Product Draft may be edited'
);

select is(
  api.resolve_current_product_draft_state()
    -> 'product_draft'
    ->> 'title',
  'First Product',
  'Product Draft title is normalized'
);

select is(
  api.resolve_current_product_draft_state()
    -> 'product_draft'
    ->> 'revision',
  '2',
  'Product Draft edit increments revision'
);

select is(
  api.save_current_owner_product_draft(
    'https://evil.example.test/stale',
    'Stale Product',
    1
  ) ->> 'status',
  'stale_write',
  'stale Product Draft revision is rejected'
);

select is(
  api.resolve_current_product_draft_state()
    -> 'product_draft'
    ->> 'source_url',
  'https://shop.example.com/products/first',
  'stale write cannot replace Product URL'
);

select is(
  api.resolve_current_product_draft_state()
    -> 'product_draft'
    ->> 'revision',
  '2',
  'stale Product write does not increment revision'
);

-- ---------------------------------------------------------------------------
-- Dangerous / unsupported destination schemes
-- ---------------------------------------------------------------------------

select is(
  api.save_current_owner_product_draft(
    'javascript:alert(1)',
    null,
    2
  ) ->> 'status',
  'invalid_source_url',
  'javascript Product destination is rejected'
);

select is(
  api.save_current_owner_product_draft(
    'data:text/html,test',
    null,
    2
  ) ->> 'status',
  'invalid_source_url',
  'data Product destination is rejected'
);

select is(
  api.save_current_owner_product_draft(
    'file:///etc/passwd',
    null,
    2
  ) ->> 'status',
  'invalid_source_url',
  'file Product destination is rejected'
);

select is(
  api.save_current_owner_product_draft(
    'ftp://example.com/product',
    null,
    2
  ) ->> 'status',
  'invalid_source_url',
  'unsupported ftp Product destination is rejected'
);

select is(
  api.save_current_owner_product_draft(
    '//example.com/product',
    null,
    2
  ) ->> 'status',
  'invalid_source_url',
  'protocol-relative Product destination is rejected'
);

select is(
  api.save_current_owner_product_draft(
    E'https://example.com\\@evil.test/product',
    null,
    2
  ) ->> 'status',
  'invalid_source_url',
  'backslash-based Product URL ambiguity is rejected'
);

select is(
  api.save_current_owner_product_draft(
    'https://example.com/product',
    repeat('x', 161),
    2
  ) ->> 'status',
  'invalid_title',
  'overlong Product title is rejected'
);

-- Ordinary HTTP remains allowed.

select is(
  api.save_current_owner_product_draft(
    'http://example.com/product',
    'HTTP Product',
    2
  ) ->> 'status',
  'success',
  'ordinary http Product destination remains supported'
);

select is(
  api.resolve_current_product_draft_state()
    -> 'product_draft'
    ->> 'revision',
  '3',
  'valid Product edit advances Draft to revision 3'
);

-- ---------------------------------------------------------------------------
-- Capability neutrality + Owner isolation / BOLA
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000002"}';

select ok(
  api.resolve_current_product_draft_state()
    -> 'product_draft'
    is null
    or
  api.resolve_current_product_draft_state()
    -> 'product_draft' =
      'null'::jsonb,
  'Personal Owner cannot see Affiliate Owner Product Draft'
);

select is(
  api.save_current_owner_product_draft(
    'https://personal.example.test/product',
    'Personal Product',
    null
  ) ->> 'status',
  'success',
  'Personal Owner may create Product Draft despite non-Affiliate recommendation'
);

select is(
  api.resolve_current_product_draft_state()
    -> 'product_draft'
    ->> 'source_url',
  'https://personal.example.test/product',
  'Personal Owner resolver returns only Personal Product Draft'
);

select is(
  api.resolve_current_product_draft_state()
    -> 'product_draft'
    ->> 'revision',
  '1',
  'Personal Product Draft has independent revision'
);

reset role;

select is(
  (
    select count(*)
    from core.product_drafts
  ),
  2::bigint,
  'two Owners create two isolated Product Drafts'
);

select is(
  (
    select draft_record.source_url
    from core.product_drafts
      as draft_record
    inner join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        draft_record.owner_id
    where binding.auth_user_id =
      '72000000-0000-4000-8000-000000000001'
  ),
  'http://example.com/product',
  'Affiliate Product Draft remains untouched by Personal Owner'
);

select is(
  (
    select draft_record.revision
    from core.product_drafts
      as draft_record
    inner join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        draft_record.owner_id
    where binding.auth_user_id =
      '72000000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'Affiliate Product Draft revision remains isolated'
);

select is(
  (
    select progress.current_step::text
    from core.owner_onboarding_progress
      as progress
    inner join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where binding.auth_user_id =
      '72000000-0000-4000-8000-000000000002'
  ),
  'relevant_first_job',
  'Personal Product save also remains at S5'
);

select is(
  (
    select progress.revision
    from core.owner_onboarding_progress
      as progress
    inner join core.owner_auth_bindings
      as binding
      on binding.owner_id =
        progress.owner_id
    where binding.auth_user_id =
      '72000000-0000-4000-8000-000000000002'
  ),
  5::bigint,
  'Personal Product save does not mutate onboarding progress revision'
);

select * from finish();

rollback;
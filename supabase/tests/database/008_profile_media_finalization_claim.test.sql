begin;

select no_plan();

-- ===========================================================================
-- Stage 6B.3D.1 — Profile Media exclusive finalization claim
-- ===========================================================================

reset role;

insert into auth.users (
  id,
  email
)
values (
  '80000000-0000-4000-8000-000000000001',
  'media-finalization-claim@example.test'
);

-- Move Owner through S1 and S2 so Profile Media is available at O01-S3.

set local role authenticated;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"80000000-0000-4000-8000-000000000001"}';

select is(
  api.claim_current_owner_handle(
    'media-finalization-claim',
    1
  ) ->> 'status',
  'success',
  'fixture Owner completes S1'
);

select is(
  api.set_current_owner_primary_use_case(
    'creator',
    2
  ) ->> 'status',
  'success',
  'fixture Owner completes S2 and reaches S3'
);

reset role;

create temporary table finalization_claim_state (
  name text primary key,
  value uuid not null
);

grant select
  on table finalization_claim_state
  to service_role;

set local role service_role;

select is(
  api.create_profile_media_upload_intent_server(
    '80000000-0000-4000-8000-000000000001',
    'image/jpeg',
    123456
  ) ->> 'status',
  'success',
  'eligible Owner creates Profile Media upload intent'
);

reset role;

insert into finalization_claim_state (
  name,
  value
)
select
  'intent',
  intent.id
from core.profile_media_upload_intents as intent
join core.owner_auth_bindings as binding
  on binding.owner_id =
    intent.owner_id
where
  binding.auth_user_id =
    '80000000-0000-4000-8000-000000000001'
order by
  intent.created_at desc
limit 1;

select is(
  (
    select intent.status::text
    from core.profile_media_upload_intents
      as intent
    where
      intent.id = (
        select value
        from finalization_claim_state
        where name = 'intent'
      )
  ),
  'pending',
  'new finalization intent starts pending'
);

-- First resolver obtains the exclusive finalization claim.

set local role service_role;

select is(
  api.resolve_profile_media_upload_intent_server(
    '80000000-0000-4000-8000-000000000001',
    (
      select value
      from finalization_claim_state
      where name = 'intent'
    )
  ) ->> 'status',
  'success',
  'first finalization resolver obtains claim'
);

select is(
  api.resolve_profile_media_upload_intent_server(
    '80000000-0000-4000-8000-000000000001',
    (
      select value
      from finalization_claim_state
      where name = 'intent'
    )
  ) ->> 'status',
  'processing',
  'duplicate finalization resolver cannot obtain second claim'
);

reset role;

select is(
  (
    select intent.status::text
    from core.profile_media_upload_intents
      as intent
    where
      intent.id = (
        select value
        from finalization_claim_state
        where name = 'intent'
      )
  ),
  'processing',
  'exclusive claim persists authoritative processing state'
);

-- A stranded processing claim still respects the original short-lived expiry.

update core.profile_media_upload_intents
set
  created_at =
    now() - interval '10 minutes',
  expires_at =
    now() - interval '1 second'
where
  id = (
    select value
    from finalization_claim_state
    where name = 'intent'
  );

set local role service_role;

select is(
  api.resolve_profile_media_upload_intent_server(
    '80000000-0000-4000-8000-000000000001',
    (
      select value
      from finalization_claim_state
      where name = 'intent'
    )
  ) ->> 'status',
  'expired',
  'stranded processing claim expires safely'
);

reset role;

select is(
  (
    select intent.status::text
    from core.profile_media_upload_intents
      as intent
    where
      intent.id = (
        select value
        from finalization_claim_state
        where name = 'intent'
      )
  ),
  'expired',
  'expired processing claim is persisted authoritatively'
);

select * from finish();

rollback;
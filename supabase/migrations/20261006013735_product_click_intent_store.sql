begin;
create function core.product_click_intent_record_valid(input_record jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare binding jsonb; key text; provider text;
begin
  if jsonb_typeof(input_record) is distinct from 'object' then return false; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(input_record) as keys(k))
    is distinct from array['binding','confirmation_hash','expires_at','issued_at','purpose']::text[] then return false; end if;
  if jsonb_typeof(input_record->'purpose') is distinct from 'string'
    or input_record->>'purpose' is distinct from 'published-product-click-v1'
    or jsonb_typeof(input_record->'confirmation_hash') is distinct from 'string'
    or input_record->>'confirmation_hash' !~ '^[0-9a-f]{64}$' then return false; end if;
  foreach key in array array['issued_at','expires_at'] loop
    if jsonb_typeof(input_record->key) is distinct from 'number'
      or input_record->>key !~ '^[0-9]{1,16}$' then return false; end if;
    if (input_record->>key)::numeric>9007199254740991 then return false; end if;
  end loop;
  if (input_record->>'expires_at')::bigint<>(input_record->>'issued_at')::bigint+120000 then return false; end if;
  binding := input_record->'binding';
  if jsonb_typeof(binding) is distinct from 'object' then return false; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(binding) as keys(k))
    is distinct from array['destination_hash','handle','provider_key','publication_token','spill_reference']::text[] then return false; end if;
  foreach key in array array['handle','provider_key','publication_token','destination_hash'] loop
    if jsonb_typeof(binding->key) is distinct from 'string' then return false; end if;
  end loop;
  if char_length(binding->>'handle') not between 3 and 30
    or binding->>'handle' !~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
    or binding->>'publication_token' !~ '^[0-9a-f]{64}$'
    or binding->>'destination_hash' !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(binding->'spill_reference') is distinct from 'number'
    or binding->>'spill_reference' !~ '^[1-9][0-9]{0,15}$' then return false; end if;
  if (binding->>'spill_reference')::numeric>9007199254740991 then return false; end if;
  provider := binding->>'provider_key';
  if char_length(provider) not between 1 and 262 then return false; end if;
  if provider not in ('shopee','tokopedia','tiktok')
    and (left(provider,9)<>'external:' or core.product_marketplace_provider('https://'||substr(provider,10)||'/') is distinct from provider)
    then return false; end if;
  return true;
end;
$$;
revoke all on function core.product_click_intent_record_valid(jsonb) from public, anon, authenticated, service_role;

create table core.product_click_intents (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  record jsonb not null check(core.product_click_intent_record_valid(record)),
  expires_at bigint generated always as ((record->>'expires_at')::bigint) stored
);
create index product_click_intents_expiry_idx on core.product_click_intents(expires_at,token_hash);
alter table core.product_click_intents enable row level security;
revoke all on core.product_click_intents from public, anon, authenticated, service_role;
comment on table core.product_click_intents is
  'Private hashed one-use Product click capabilities. No raw token or destination URL. RLS/no grants; durable issuance provenance and public transport gates remain withheld.';

create function api.create_product_click_intent_server(input_token_hash text,input_record jsonb)
returns boolean language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare binding jsonb; result jsonb; inserted_count integer;
begin
  if input_token_hash is null or input_token_hash !~ '^[0-9a-f]{64}$'
    or core.product_click_intent_record_valid(input_record) is distinct from true then return false; end if;
  binding := input_record->'binding';
  result := api.resolve_published_product_destination_server(binding->>'handle',(binding->>'spill_reference')::bigint,
    binding->>'provider_key',binding->>'publication_token',binding->>'destination_hash');
  if result->>'status' is distinct from 'success' then return false; end if;
  insert into core.product_click_intents(token_hash,record)
    select input_token_hash,input_record
    where (input_record->>'issued_at')::bigint<=floor(extract(epoch from clock_timestamp())*1000)::bigint
      and (input_record->>'expires_at')::bigint>floor(extract(epoch from clock_timestamp())*1000)::bigint
    on conflict(token_hash) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count=1;
end;
$$;
create function api.consume_product_click_intent_server(input_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare consumed jsonb; checked_at bigint;
begin
  if input_token_hash is null or input_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  delete from core.product_click_intents where token_hash=input_token_hash returning record into consumed;
  if not found then return null; end if;
  checked_at := floor(extract(epoch from clock_timestamp())*1000)::bigint;
  if core.product_click_intent_record_valid(consumed) is distinct from true
    or checked_at<(consumed->>'issued_at')::bigint or checked_at>=(consumed->>'expires_at')::bigint then return null; end if;
  return consumed;
end;
$$;
create function api.cleanup_product_click_intents_server(input_limit integer)
returns integer language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare deleted_count integer; checked_at bigint;
begin
  if input_limit is null or input_limit not between 1 and 500 then return 0; end if;
  checked_at := floor(extract(epoch from clock_timestamp())*1000)::bigint;
  with expired as (select token_hash from core.product_click_intents where expires_at<=checked_at
    order by expires_at,token_hash limit input_limit for update skip locked)
  delete from core.product_click_intents i using expired e where i.token_hash=e.token_hash;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function api.create_product_click_intent_server(text,jsonb),
  api.consume_product_click_intent_server(text), api.cleanup_product_click_intents_server(integer)
  from public, anon, authenticated, service_role;
comment on function api.create_product_click_intent_server(text,jsonb) is
  'Withheld private create-if-absent hashed intent store. Strict 120s record and current exact safety; not proof of confirmation issuance provenance or public authority.';
comment on function api.consume_product_click_intent_server(text) is
  'Withheld atomic delete/return of one current private intent record. Caller must commit consumption before later resolution; never restore on failure.';
comment on function api.cleanup_product_click_intents_server(integer) is
  'Withheld bounded 1-500 expired intent cleanup, expiry-indexed and SKIP LOCKED. No cleanup schedule or public transport enabled.';
commit;

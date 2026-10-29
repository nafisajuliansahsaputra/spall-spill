begin;
create function api.resolve_current_owner_identity_review_snapshot(input_request jsonb)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare
  request jsonb := '{"expected_collection_revision":null,"after_position":null}';
  page jsonb;
  root jsonb;
  blocks jsonb := '[]';
  collection_revision jsonb;
  complete boolean := false;
  payload jsonb;
  current_owner uuid;
begin
  if input_request is distinct from request then return jsonb_build_object('status','invalid_page_request'); end if;
  for page_index in 1..10 loop
    page := api.resolve_current_owner_identity_destination_review_page(request);
    if page->>'status' is distinct from 'success' then return page; end if;
    if root is null then
      root := page - 'collection';
      collection_revision := page#>'{collection,revision}';
    elsif root is distinct from page-'collection' or collection_revision is distinct from page#>'{collection,revision}' then
      return jsonb_build_object('status','unavailable');
    end if;
    if page->'collection'='null'::jsonb then
      payload := root || jsonb_build_object('collection',null); complete := true; exit;
    end if;
    blocks := blocks || (page#>'{collection,blocks}');
    if jsonb_array_length(blocks)>1000 or octet_length(blocks::text)>8388608 then
      return jsonb_build_object('status','unavailable'); end if;
    if page#>'{collection,has_more}'='false'::jsonb then
      payload := root || jsonb_build_object('collection',jsonb_build_object('revision',collection_revision,
        'blocks',blocks,'has_more',false,'next_after_position',null));
      complete := true; exit;
    end if;
    request := jsonb_build_object('expected_collection_revision',collection_revision,
      'after_position',page#>'{collection,next_after_position}');
  end loop;
  if not complete then return jsonb_build_object('status','unavailable'); end if;
  current_owner := (api.resolve_current_owner_state()->>'owner_id')::uuid;
  if current_owner is null then return jsonb_build_object('status','unavailable'); end if;
  payload := payload || jsonb_build_object('review_format','identity_working_review_v1');
  payload := payload || jsonb_build_object('snapshot_hash',encode(extensions.digest(
    'spall-spill:identity-working-review:v1:'||current_owner::text||E'\n'||payload::text,'sha256'),'hex'));
  if octet_length(payload::text)>8388608 then return jsonb_build_object('status','unavailable'); end if;
  return payload;
end;
$$;
revoke all on function api.resolve_current_owner_identity_review_snapshot(jsonb) from public,anon,authenticated,service_role;

create table core.identity_working_review_receipts (
  owner_id uuid primary key references core.owners(id) on delete cascade,
  receipt_id uuid not null unique default gen_random_uuid(),
  snapshot_hash text not null check(char_length(snapshot_hash)=64 and snapshot_hash~'^[0-9a-f]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null check(expires_at=issued_at+interval '10 minutes')
);
alter table core.identity_working_review_receipts enable row level security;
revoke all on table core.identity_working_review_receipts from public,anon,authenticated,service_role;
create function api.confirm_current_owner_identity_working_review(input_review jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare
  actor uuid := auth.uid();
  current_owner uuid;
  bound_owner uuid;
  account core.owner_account_state;
  completed timestamptz;
  snapshot jsonb;
  confirmed_at timestamptz;
  receipt core.identity_working_review_receipts%rowtype;
begin
  if actor is null then return jsonb_build_object('status','unauthenticated'); end if;
  select o.id,o.account_state,o.onboarding_completed_at into current_owner,account,completed
    from core.owner_auth_bindings b join core.owners o on o.id=b.owner_id where b.auth_user_id=actor for update of o;
  if not found then return jsonb_build_object('status','owner_missing'); end if;
  select b.owner_id into bound_owner from core.owner_auth_bindings b where b.auth_user_id=actor for update;
  if not found or bound_owner is distinct from current_owner then return jsonb_build_object('status','unavailable'); end if;
  if account<>'active' or completed is null then return jsonb_build_object('status','owner_not_eligible'); end if;
  if api.resolve_current_owner_home_context()->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable'); end if;
  if jsonb_typeof(input_review) is distinct from 'object' then return jsonb_build_object('status','invalid_review'); end if;
  if not(input_review ?& array['action','snapshot_hash'])
    or exists(select 1 from jsonb_object_keys(input_review) k where k not in('action','snapshot_hash'))
    or input_review->>'action' is distinct from 'confirm_identity_working_review'
    or jsonb_typeof(input_review->'snapshot_hash') is distinct from 'string'
    or char_length(input_review->>'snapshot_hash')<>64 or input_review->>'snapshot_hash'!~'^[0-9a-f]{64}$'
  then return jsonb_build_object('status','invalid_review'); end if;
  snapshot := api.resolve_current_owner_identity_review_snapshot('{"expected_collection_revision":null,"after_position":null}');
  if snapshot->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable'); end if;
  if snapshot->>'snapshot_hash' is distinct from input_review->>'snapshot_hash' then return jsonb_build_object('status','stale_review'); end if;
  confirmed_at := clock_timestamp();
  insert into core.identity_working_review_receipts as existing(owner_id,snapshot_hash,issued_at,expires_at)
    values(current_owner,input_review->>'snapshot_hash',confirmed_at,confirmed_at+interval '10 minutes')
    on conflict(owner_id) do update set receipt_id=gen_random_uuid(),snapshot_hash=excluded.snapshot_hash,
      issued_at=excluded.issued_at,expires_at=excluded.expires_at
    where existing.snapshot_hash is distinct from excluded.snapshot_hash or existing.expires_at<=confirmed_at
    returning * into receipt;
  if not found then select * into receipt from core.identity_working_review_receipts where owner_id=current_owner; end if;
  return jsonb_build_object('status','success','receipt_id',receipt.receipt_id,
    'snapshot_hash',receipt.snapshot_hash,'expires_at',receipt.expires_at);
end;
$$;
revoke all on function api.confirm_current_owner_identity_working_review(jsonb) from public,anon,authenticated,service_role;
comment on table core.identity_working_review_receipts is
 'Private bounded latest returning-Owner full graph/safety review evidence. Fixed ten-minute lifetime, no sliding expiry or publication authority.';
comment on function api.resolve_current_owner_identity_review_snapshot(jsonb) is
 'Dormant bounded whole Working/safety snapshot and server Owner-bound versioned hash. Raw invalid/hidden work retained. No Publish validation, writes or grants.';
comment on function api.confirm_current_owner_identity_working_review(jsonb) is
 'Dormant explicit whole Working/safety review confirmation. Owner-first serialized latest receipt, no Working/Published writes or Publish authority.';
commit;

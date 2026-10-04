begin;

create table core.onboarding_preview_receipts (
  owner_id uuid primary key references core.owners(id) on delete cascade,
  receipt_id uuid not null unique default gen_random_uuid(),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  constraint preview_receipt_fixed_lifetime check (expires_at = issued_at + interval '10 minutes')
);
alter table core.onboarding_preview_receipts enable row level security;
revoke all on core.onboarding_preview_receipts from public, anon, authenticated, service_role;
comment on table core.onboarding_preview_receipts is
  'One private latest explicitly confirmed S6 preview per Owner. Review evidence only; no publication authority. Fixed ten-minute expiry, no sliding renewal.';

create function api.confirm_current_onboarding_preview(input_snapshot_hash text)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  owner_record core.owners%rowtype;
  preview jsonb;
  receipt core.onboarding_preview_receipts%rowtype;
  confirmation_time timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'unauthenticated'); end if;
  select o.* into owner_record from core.owners o
    join core.owner_auth_bindings b on b.owner_id = o.id
    where b.auth_user_id = auth.uid() for update of o;
  if not found then return jsonb_build_object('status', 'owner_missing'); end if;
  if owner_record.account_state <> 'active' or owner_record.onboarding_completed_at is not null then
    return jsonb_build_object('status', 'owner_not_eligible');
  end if;
  perform 1 from core.owner_onboarding_progress where owner_id = owner_record.id for update;
  preview := api.resolve_current_onboarding_preview();
  if preview->>'status' <> 'success' then return preview; end if;
  if input_snapshot_hash is null or input_snapshot_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid_snapshot');
  end if;
  if input_snapshot_hash is distinct from preview->>'snapshot_hash' then
    return jsonb_build_object('status', 'stale_preview');
  end if;
  confirmation_time := clock_timestamp();
  insert into core.onboarding_preview_receipts as existing (owner_id, snapshot_hash, issued_at, expires_at)
    values (owner_record.id, input_snapshot_hash, confirmation_time, confirmation_time + interval '10 minutes')
    on conflict (owner_id) do update set
      receipt_id = gen_random_uuid(), snapshot_hash = excluded.snapshot_hash,
      issued_at = excluded.issued_at, expires_at = excluded.expires_at
    where existing.snapshot_hash is distinct from excluded.snapshot_hash or existing.expires_at <= confirmation_time
    returning * into receipt;
  if not found then
    select * into receipt from core.onboarding_preview_receipts where owner_id = owner_record.id;
  end if;
  return jsonb_build_object('status', 'success', 'receipt_id', receipt.receipt_id,
    'snapshot_hash', receipt.snapshot_hash, 'expires_at', receipt.expires_at);
end;
$$;
revoke all on function api.confirm_current_onboarding_preview(text) from public, anon, authenticated, service_role;
grant execute on function api.confirm_current_onboarding_preview(text) to authenticated;
comment on function api.confirm_current_onboarding_preview(text) is
  'Explicit current-Owner S6 review confirmation. Digest must match current private preview; receipt is not a Publish acknowledgment or safety bypass.';
commit;

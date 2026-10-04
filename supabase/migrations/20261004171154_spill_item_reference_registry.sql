-- Additive reconciliation of 11.22: durable Draft creation reserves Item identity.
begin;
create table core.spill_item_identity_registry (
  item_id uuid primary key,
  owner_id uuid not null,
  item_type text not null check (item_type in ('product', 'resource')),
  spill_reference bigint not null check (spill_reference between 1 and 9007199254740991),
  reserved_at timestamptz not null default now(),
  unique (owner_id, spill_reference)
);

create table core.spill_reference_counters (
  owner_id uuid primary key,
  next_reference bigint not null check (next_reference between 2 and 9007199254740992)
);

alter table core.spill_item_identity_registry enable row level security;
alter table core.spill_reference_counters enable row level security;
revoke all on core.spill_item_identity_registry, core.spill_reference_counters
  from public, anon, authenticated, service_role;

comment on table core.spill_item_identity_registry is
  'Private permanent Item identity/reference reservations. No public content, no cascade deletion, no reference reuse.';
comment on table core.spill_reference_counters is
  'Serialized owner-scoped next unused reference shared by Product and Resource. Never reset or delete.';

create function core.guard_spill_identity_reservation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'Spill identity reservations are immutable.';
end;
$$;
create trigger spill_identity_immutable
before update or delete on core.spill_item_identity_registry
for each row execute function core.guard_spill_identity_reservation();
create trigger spill_identity_no_truncate
before truncate on core.spill_item_identity_registry
for each statement execute function core.guard_spill_identity_reservation();

create function core.guard_spill_reference_counter()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception using errcode = '23514', message = 'Spill reference counters cannot be removed.';
  end if;
  if new.owner_id is distinct from old.owner_id
     or new.next_reference <= old.next_reference then
    raise exception using errcode = '23514', message = 'Spill reference counters cannot rewind or change Owner.';
  end if;
  return new;
end;
$$;
create trigger spill_counter_monotonic
before update or delete on core.spill_reference_counters
for each row execute function core.guard_spill_reference_counter();
create trigger spill_counter_no_truncate
before truncate on core.spill_reference_counters
for each statement execute function core.guard_spill_reference_counter();

create function core.reserve_spill_item_identity(
  input_item_id uuid, input_owner_id uuid, input_item_type text
)
returns void language plpgsql security invoker set search_path = '' as $$
declare allocated_reference bigint;
begin
  -- Same Owner-first lock order as current-Owner save RPCs.
  perform 1 from core.owners where id = input_owner_id for update;
  if not found then
    raise exception using errcode = '23503', message = 'Canonical Spill Owner does not exist.';
  end if;
  insert into core.spill_reference_counters as counter (owner_id, next_reference)
    values (input_owner_id, 2)
    on conflict (owner_id) do update
      set next_reference = counter.next_reference + 1
    returning next_reference - 1 into allocated_reference;

  insert into core.spill_item_identity_registry (item_id, owner_id, item_type, spill_reference)
    values (input_item_id, input_owner_id, input_item_type, allocated_reference);
end;
$$;

create function core.reserve_product_draft_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id then
      raise exception using errcode = '23514', message = 'Product Item identity and Owner are immutable.';
    end if;
  else
    perform core.reserve_spill_item_identity(new.id, new.owner_id, 'product');
  end if;
  return new;
end;
$$;

-- Keep Owner -> content lock order, matching live current-Owner save RPCs.
-- EXCLUSIVE also blocks new Owner creation/row-locking saves during this window,
-- so a newly created Owner cannot race between the Owner snapshot and backfill.
-- Ordinary resolver SELECTs remain available.
lock table core.owners in exclusive mode;
lock table core.product_drafts in share row exclusive mode;
do $$
declare draft_record record;
begin
  for draft_record in
    select id, owner_id from core.product_drafts order by owner_id, created_at, id
  loop
    perform core.reserve_spill_item_identity(draft_record.id, draft_record.owner_id, 'product');
  end loop;
end;
$$;

create trigger product_draft_reserve_identity
after insert on core.product_drafts
for each row execute function core.reserve_product_draft_identity();
create trigger product_draft_preserve_identity
before update on core.product_drafts
for each row execute function core.reserve_product_draft_identity();

revoke all on function core.guard_spill_identity_reservation(),
  core.guard_spill_reference_counter(),
  core.reserve_spill_item_identity(uuid, uuid, text),
  core.reserve_product_draft_identity()
  from public, anon, authenticated, service_role;

comment on function api.save_current_owner_product_draft(text, text, bigint) is
  'Creates or updates the current Owner private Product Draft; initial persistence atomically reserves a permanent owner-scoped Spill Reference. Publishes nothing and does not advance onboarding.';
comment on function api.resolve_current_product_draft_state() is
  'Returns only current Owner private Product Draft content; identity reservation does not make the Draft public.';

commit;

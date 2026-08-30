-- Stable Spall Spill Owner identity and Supabase Auth binding.
--
-- Authentication identity and product ownership identity are intentionally
-- separate. auth.users.id proves the authenticated principal; core.owners.id
-- remains the canonical Spall Spill ownership identity.

create type core.owner_account_state as enum (
  'active',
  'restricted',
  'suspended'
);

create table core.owners (
  id uuid primary key default gen_random_uuid(),
  account_state core.owner_account_state not null default 'active',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table core.owners is
  'Private canonical Spall Spill Owner accounts.';

comment on column core.owners.id is
  'Stable application-owned Owner identity; distinct from auth.users.id.';

comment on column core.owners.account_state is
  'Authoritative Owner access state used by the owner-state resolver.';

comment on column core.owners.onboarding_completed_at is
  'NULL means onboarding is incomplete; non-NULL means authoritatively completed.';

create table core.owner_auth_bindings (
  auth_user_id uuid primary key,
  owner_id uuid not null,
  created_at timestamptz not null default now(),

  constraint owner_auth_bindings_auth_user_fk
    foreign key (auth_user_id)
    references auth.users(id)
    on delete cascade,

  constraint owner_auth_bindings_owner_fk
    foreign key (owner_id)
    references core.owners(id)
    on delete restrict
);

comment on table core.owner_auth_bindings is
  'Server-controlled binding from Supabase Auth principals to stable Spall Spill Owners.';

comment on column core.owner_auth_bindings.auth_user_id is
  'Verified Supabase auth.users primary key.';

comment on column core.owner_auth_bindings.owner_id is
  'Stable canonical Spall Spill Owner identity.';

create index owner_auth_bindings_owner_id_idx
  on core.owner_auth_bindings (owner_id);

-- Defense in depth. Normal application clients still have no USAGE on core
-- and receive no direct privileges on these canonical private tables.
alter table core.owners enable row level security;
alter table core.owner_auth_bindings enable row level security;

revoke all on table core.owners
  from public, anon, authenticated;

revoke all on table core.owner_auth_bindings
  from public, anon, authenticated;

-- This function is SECURITY DEFINER only because the Supabase-managed
-- auth.users insertion boundary must transactionally provision private
-- application-owned records.
--
-- It accepts no client-supplied identity, ownership, email, provider, or
-- metadata values. All object references are fully qualified.
create function core.provision_owner_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provisioned_owner_id uuid;
begin
  insert into core.owners
  default values
  returning id into provisioned_owner_id;

  insert into core.owner_auth_bindings (
    auth_user_id,
    owner_id
  )
  values (
    new.id,
    provisioned_owner_id
  );

  return new;
end;
$$;

comment on function core.provision_owner_for_auth_user() is
  'Transactionally provisions canonical Spall Spill Owner state for a new Supabase Auth user.';

revoke all
  on function core.provision_owner_for_auth_user()
  from public, anon, authenticated;

create trigger on_auth_user_created_provision_owner
after insert on auth.users
for each row
execute function core.provision_owner_for_auth_user();

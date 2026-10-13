begin;
create type core.identity_block_kind as enum ('social','generic_link','contact','media','text','spill_cta');
create table core.identity_block_collections_working (
  owner_id uuid primary key references core.owners(id) on delete cascade,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table core.identity_blocks_working (
  block_id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references core.identity_block_collections_working(owner_id) on delete cascade,
  kind core.identity_block_kind not null,
  is_visible boolean not null default true,
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_blocks_working_owner_position_unique unique (owner_id,position) deferrable initially immediate
);
comment on table core.identity_block_collections_working is
  'Dormant private Working membership collection; missing is not inferred empty. Future Owner-scoped mutations require collection revision CAS. Not whole Identity/content/publication validity.';
comment on table core.identity_blocks_working is
  'Dormant private stable block membership/order/visibility only. Typed payload, validation, onboarding provenance, mutation and publication gates withheld. Never render or publish membership-only skeletons.';
comment on column core.identity_blocks_working.block_id is
  'Stable internal modular block UUID, not a public Spill/reference identity.';
comment on column core.identity_blocks_working.position is
  'Owner-local positive ordering position, not X/Y, pixel sizing or a separate breakpoint document.';
alter table core.identity_block_collections_working enable row level security;
alter table core.identity_blocks_working enable row level security;
revoke all on table core.identity_block_collections_working,core.identity_blocks_working from public,anon,authenticated,service_role;
commit;

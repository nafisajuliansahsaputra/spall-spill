begin;
alter table core.identity_blocks_working add constraint identity_blocks_working_payload_binding_unique unique(block_id,owner_id,kind);
create table core.identity_block_links_working (
  block_id uuid primary key,
  owner_id uuid not null,
  kind core.identity_block_kind not null check(kind in ('social','generic_link')),
  title text check(char_length(title)<=512),
  social_platform text check(char_length(social_platform)<=40),
  destination_url text check(char_length(destination_url)<=2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_block_links_working_membership_fk foreign key(block_id,owner_id,kind)
    references core.identity_blocks_working(block_id,owner_id,kind) on delete cascade
);
create index identity_block_links_working_owner_idx on core.identity_block_links_working(owner_id,block_id);
comment on table core.identity_block_links_working is
  'Dormant private recoverable Social/Generic Link Working payload bound to actual block Owner/kind. Raw invalid fields are not public-safe content. No mutation/reader/grants or onboarding backfill; future collection CAS and whole Identity publication gates required.';
alter table core.identity_block_links_working enable row level security;
revoke all on table core.identity_block_links_working from public,anon,authenticated,service_role;
commit;

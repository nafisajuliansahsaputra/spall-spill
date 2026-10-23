begin;
create table core.identity_block_contacts_working (
  block_id uuid primary key,
  owner_id uuid not null,
  kind core.identity_block_kind not null check(kind='contact'),
  contact_type text check(contact_type in ('email','whatsapp','phone')),
  label text check(char_length(label)<=512),
  contact_value text check(char_length(contact_value)<=2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_block_contacts_working_membership_fk foreign key(block_id,owner_id,kind)
    references core.identity_blocks_working(block_id,owner_id,kind) on delete cascade
);
create index identity_block_contacts_working_owner_idx on core.identity_block_contacts_working(owner_id,block_id);
comment on table core.identity_block_contacts_working is
  'Dormant private recoverable Contact Working payload bound to actual block Owner/kind. Raw fields are not validated contact targets or public-safe actions. No runtime mutation, reader, grants or backfill; collection CAS and coherent Identity publication gates remain required.';
alter table core.identity_block_contacts_working enable row level security;
revoke all on table core.identity_block_contacts_working from public,anon,authenticated,service_role;
commit;

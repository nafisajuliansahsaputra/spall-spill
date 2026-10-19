begin;
create table core.identity_block_texts_working (
  block_id uuid primary key,
  owner_id uuid not null,
  kind core.identity_block_kind not null check(kind='text'),
  text_content text check(char_length(text_content)<=16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_block_texts_working_membership_fk foreign key(block_id,owner_id,kind)
    references core.identity_blocks_working(block_id,owner_id,kind) on delete cascade
);
create index identity_block_texts_working_owner_idx on core.identity_block_texts_working(owner_id,block_id);
comment on table core.identity_block_texts_working is
  'Dormant private recoverable plain Text Working payload bound to actual block Owner/kind. Raw content is not rendered or public-safe. No runtime mutation, reader, grants or backfill; future collection CAS and coherent Identity publication gates required.';
alter table core.identity_block_texts_working enable row level security;
revoke all on table core.identity_block_texts_working from public,anon,authenticated,service_role;
commit;

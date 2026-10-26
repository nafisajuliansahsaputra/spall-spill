begin;
create table core.identity_block_media_working (
  block_id uuid primary key,
  owner_id uuid not null,
  kind core.identity_block_kind not null check(kind='media'),
  asset_key text check(asset_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  alt_text text check(char_length(alt_text)<=2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_block_media_working_membership_fk foreign key(block_id,owner_id,kind)
    references core.identity_blocks_working(block_id,owner_id,kind) on delete cascade,
  constraint identity_block_media_working_asset_fk foreign key(owner_id,asset_key)
    references core.profile_media_assets(owner_id,asset_key) on delete no action on update no action
);
create index identity_block_media_working_owner_asset_idx on core.identity_block_media_working(owner_id,asset_key);
comment on table core.identity_block_media_working is
  'Dormant private recoverable Media Working payload bound to actual membership Owner/kind and optional same-Owner canonical asset registry key. No upload, runtime mutation, reader, grants or backfill. Registry reference is not consumed-source, sanitized-byte, accessibility or Publish proof; collection CAS and coherent publication gates remain required.';
alter table core.identity_block_media_working enable row level security;
revoke all on table core.identity_block_media_working from public,anon,authenticated,service_role;
commit;

-- Spall Spill database foundation.
-- Establishes logical schema boundaries only.
-- Business tables are intentionally added in later migrations.

create schema if not exists core;
create schema if not exists publication;
create schema if not exists analytics;
create schema if not exists moderation;
create schema if not exists audit;
create schema if not exists ops;
create schema if not exists api;

comment on schema core is
  'Private canonical Spall Spill domain data.';

comment on schema publication is
  'Public-safe published projections.';

comment on schema analytics is
  'Spall Spill-owned product and creator analytics.';

comment on schema moderation is
  'Reports, cases, evidence, enforcement, and appeals.';

comment on schema audit is
  'Append-only accountable audit records.';

comment on schema ops is
  'Protected platform and operator controls.';

comment on schema api is
  'Explicitly exposed safe views and RPC interfaces when justified.';

-- Deny application/client access by default.
-- Access will be granted narrowly in later migrations when an
-- implementation surface has an explicit authorization requirement.

revoke all on schema core from public, anon, authenticated;
revoke all on schema publication from public, anon, authenticated;
revoke all on schema analytics from public, anon, authenticated;
revoke all on schema moderation from public, anon, authenticated;
revoke all on schema audit from public, anon, authenticated;
revoke all on schema ops from public, anon, authenticated;
revoke all on schema api from public, anon, authenticated;
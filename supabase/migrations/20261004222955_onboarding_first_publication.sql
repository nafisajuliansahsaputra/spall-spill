begin;

alter table core.spill_item_identity_registry add constraint spill_identity_publication_binding
  unique (item_id, owner_id, item_type, spill_reference);
create table core.identity_publications (
  owner_id uuid primary key references core.owners(id),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  identity_revision bigint not null check (identity_revision between 1 and 9007199254740991),
  layout_revision bigint not null check (layout_revision between 1 and 9007199254740991),
  connection_revision bigint check (connection_revision between 1 and 9007199254740991),
  lifecycle_state text not null default 'published' check (lifecycle_state in ('published','hidden','archived')),
  published_at timestamptz not null
);
create table core.spill_item_publications (
  item_id uuid primary key,
  owner_id uuid not null references core.owners(id),
  item_type text not null check (item_type in ('product','resource')),
  spill_reference bigint not null check (spill_reference between 1 and 9007199254740991),
  working_revision bigint not null check (working_revision between 1 and 9007199254740991),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  lifecycle_state text not null default 'published' check (lifecycle_state in ('published','hidden','archived')),
  published_at timestamptz not null,
  foreign key (item_id,owner_id,item_type,spill_reference)
    references core.spill_item_identity_registry(item_id,owner_id,item_type,spill_reference)
);
create table core.first_onboarding_publications (
  owner_id uuid primary key references core.owners(id),
  receipt_id uuid not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  bundle text not null check (bundle in ('identity_only','resource','product')),
  acknowledgment jsonb not null check (jsonb_typeof(acknowledgment) = 'object')
);
alter table core.identity_publications enable row level security;
alter table core.spill_item_publications enable row level security;
alter table core.first_onboarding_publications enable row level security;
revoke all on core.identity_publications, core.spill_item_publications, core.first_onboarding_publications
  from public, anon, authenticated, service_role;

create function core.publication_destination_is_safe(input_url text, validation_time timestamptz)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from core.external_destination_safety
    where normalized_url=input_url and url_hash=encode(extensions.digest(input_url,'sha256'),'hex')
      and safety_status='safe' and expires_at>validation_time);
$$;
revoke all on function core.publication_destination_is_safe(text,timestamptz) from public, anon, authenticated, service_role;

create function api.publish_current_onboarding(input_receipt_id uuid, input_snapshot_hash text, input_bundle text)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  owner_record core.owners%rowtype;
  existing core.first_onboarding_publications%rowtype;
  receipt core.onboarding_preview_receipts%rowtype;
  progress core.owner_onboarding_progress%rowtype;
  resource_record core.resource_drafts%rowtype;
  reservation core.spill_item_identity_registry%rowtype;
  preview jsonb;
  item jsonb;
  result jsonb;
  publication_time timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('status','unauthenticated'); end if;
  select o.* into owner_record from core.owners o join core.owner_auth_bindings b on b.owner_id=o.id
    where b.auth_user_id=auth.uid() for update of o;
  if not found then return jsonb_build_object('status','owner_missing'); end if;
  if owner_record.account_state <> 'active' then return jsonb_build_object('status','owner_not_eligible'); end if;
  select * into existing from core.first_onboarding_publications where owner_id=owner_record.id;
  if found then
    if existing.receipt_id is not distinct from input_receipt_id
      and existing.snapshot_hash is not distinct from input_snapshot_hash
      and existing.bundle is not distinct from input_bundle then return existing.acknowledgment; end if;
    return jsonb_build_object('status','conflicting_intent');
  end if;
  if owner_record.onboarding_completed_at is not null then return jsonb_build_object('status','owner_not_eligible'); end if;
  if input_bundle is null or input_bundle not in ('identity_only','product','resource') then
    return jsonb_build_object('status','invalid_bundle');
  end if;
  select * into progress from core.owner_onboarding_progress where owner_id=owner_record.id for update;
  if not found then return jsonb_build_object('status','progress_missing'); end if;
  if progress.revision >= 9007199254740991 then return jsonb_build_object('status','revision_exhausted'); end if;
  select * into receipt from core.onboarding_preview_receipts where owner_id=owner_record.id for update;
  if not found or receipt.receipt_id is distinct from input_receipt_id
    or receipt.snapshot_hash is distinct from input_snapshot_hash then
    return jsonb_build_object('status','review_required');
  end if;
  if receipt.expires_at <= clock_timestamp() then return jsonb_build_object('status','expired_preview'); end if;

  perform 1 from core.identity_working where owner_id=owner_record.id for update;
  perform 1 from core.identity_layout_working where owner_id=owner_record.id for update;
  perform 1 from core.identity_connection_working where owner_id=owner_record.id for update;
  perform 1 from core.product_drafts where owner_id=owner_record.id for update;
  select * into resource_record from core.resource_drafts where owner_id=owner_record.id for update;
  perform 1 from core.spill_item_identity_registry where owner_id=owner_record.id order by item_id for share;
  perform 1 from core.external_destination_safety where normalized_url in (
    select destination_url from core.identity_connection_working where owner_id=owner_record.id
    union select source_url from core.product_drafts where owner_id=owner_record.id
    union select source_url from core.resource_drafts where owner_id=owner_record.id
  ) order by url_hash for share;
  preview := api.resolve_current_onboarding_preview();
  if preview->>'status' <> 'success' then return preview; end if;
  if preview->>'snapshot_hash' is distinct from input_snapshot_hash then return jsonb_build_object('status','stale_preview'); end if;
  publication_time := clock_timestamp();
  if receipt.expires_at <= publication_time then return jsonb_build_object('status','expired_preview'); end if;
  if preview->'identity_validation_issues' <> '[]'::jsonb then return jsonb_build_object('status','identity_invalid'); end if;
  if preview->'connection_working' <> 'null'::jsonb
    and not core.publication_destination_is_safe(preview->'connection_working'->>'destination_url',publication_time) then
    return jsonb_build_object('status','identity_invalid');
  end if;
  if input_bundle='product' then return jsonb_build_object('status','item_preparation_pending'); end if;
  if input_bundle='resource' then
    item := preview->'resource_draft';
    if item is null or item='null'::jsonb or item->'validation_issues' <> '[]'::jsonb
      or not core.publication_destination_is_safe(item->>'source_url',publication_time) then
      return jsonb_build_object('status','item_invalid');
    end if;
    select * into reservation from core.spill_item_identity_registry
      where item_id=resource_record.id and owner_id=owner_record.id and item_type='resource';
    if not found then return jsonb_build_object('status','item_invalid'); end if;
  end if;
  insert into core.identity_publications(owner_id,snapshot,identity_revision,layout_revision,connection_revision,published_at)
    values(owner_record.id,jsonb_build_object('display_name',preview->'identity_working'->'display_name',
      'bio',preview->'identity_working'->'bio','profile_asset_key',preview->'identity_working'->'profile_asset_key',
      'starter_key',preview->'layout_working'->'starter_key','connection',preview->'connection_working'),
      (preview->'identity_working'->>'revision')::bigint,(preview->'layout_working'->>'revision')::bigint,
      (preview->'connection_working'->>'revision')::bigint,publication_time);
  if input_bundle='resource' then
    insert into core.spill_item_publications(item_id,owner_id,item_type,spill_reference,working_revision,snapshot,published_at)
      values(reservation.item_id,owner_record.id,'resource',reservation.spill_reference,resource_record.revision,
        jsonb_build_object('resource_type',resource_record.resource_type,'title',resource_record.title,'source_url',resource_record.source_url),publication_time);
  end if;
  result := jsonb_build_object('status','success','identity_status','published',
    'item_status',case when input_bundle='resource' then 'published' else null end,
    'bundle',input_bundle,'publication_id',gen_random_uuid(),'published_at',publication_time,
    'current_handle',preview->>'current_handle','spill_reference',case when input_bundle='resource' then reservation.spill_reference else null end);
  insert into core.first_onboarding_publications(owner_id,receipt_id,snapshot_hash,bundle,acknowledgment)
    values(owner_record.id,input_receipt_id,input_snapshot_hash,input_bundle,result);
  update core.owners set onboarding_completed_at=publication_time where id=owner_record.id;
  update core.owner_onboarding_progress set revision=revision+1,updated_at=publication_time where owner_id=owner_record.id;
  return result;
end;
$$;
revoke all on function api.publish_current_onboarding(uuid,text,text) from public, anon, authenticated, service_role;
comment on function api.publish_current_onboarding(uuid,text,text) is
  'Staged atomic first-publication foundation. Current-Owner receipt/revision/safety revalidated after locks. RPC access intentionally withheld pending public/workspace/UI transport verification.';
commit;

begin;

-- Host recognition is private preparation context, never a live safety verdict.
create function core.product_marketplace_provider(input_url text)
returns text language plpgsql immutable security invoker set search_path = '' as $$
declare authority text; hostname text; port text; label text;
begin
  if input_url is null or char_length(input_url) not between 8 and 2048
    or input_url ~ '[[:space:][:cntrl:]#]' or input_url ~ E'\\\\'
    or input_url !~ '^https?://' then return null; end if;
  authority := lower(substring(input_url from '^https?://([^/?]+)'));
  if authority !~ '^[a-z0-9.-]+(:[0-9]+)?$' then return null; end if;
  hostname := split_part(authority,':',1);
  port := split_part(authority,':',2);
  if port <> '' and not ((input_url like 'https://%' and port='443')
    or (input_url like 'http://%' and port='80')) then return null; end if;
  if char_length(hostname)>253 or hostname not like '%.%' or hostname ~ '^[0-9.]+$'
    or hostname ~ '(^|\.)(localhost|local|internal)$'
    or hostname='home.arpa' or hostname like '%.home.arpa' then return null; end if;
  foreach label in array string_to_array(hostname,'.') loop
    if char_length(label) not between 1 and 63
      or label !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then return null; end if;
  end loop;
  if hostname in ('shopee.co.id','shope.ee') or hostname like '%.shopee.co.id' or hostname like '%.shope.ee' then return 'shopee'; end if;
  if hostname in ('tokopedia.com','tokopedia.link') or hostname like '%.tokopedia.com' or hostname like '%.tokopedia.link' then return 'tokopedia'; end if;
  if hostname='tiktok.com' or hostname like '%.tiktok.com' then return 'tiktok'; end if;
  return 'external:' || hostname;
end;
$$;

create function core.product_destinations_valid(destinations jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare destination jsonb; provider text; providers text[] := '{}'; urls text[] := '{}';
begin
  if destinations is null or jsonb_typeof(destinations)<>'array' then return false; end if;
  if jsonb_array_length(destinations)>10 then return false; end if;
  for destination in select value from jsonb_array_elements(destinations) loop
    if jsonb_typeof(destination)<>'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(destination))<>2
      or jsonb_typeof(destination->'provider_key') is distinct from 'string'
      or jsonb_typeof(destination->'destination_url') is distinct from 'string' then return false; end if;
    provider := core.product_marketplace_provider(destination->>'destination_url');
    if provider is null or provider is distinct from destination->>'provider_key'
      or provider=any(providers) or destination->>'destination_url'=any(urls) then return false; end if;
    providers := array_append(providers,provider);
    urls := array_append(urls,destination->>'destination_url');
  end loop;
  return true;
end;
$$;
revoke all on function core.product_marketplace_provider(text), core.product_destinations_valid(jsonb)
  from public, anon, authenticated, service_role;

alter table core.product_drafts add constraint product_drafts_owner_identity_unique unique(owner_id,id);
create table core.product_preparations (
  product_id uuid primary key,
  owner_id uuid not null unique,
  primary_asset_key text,
  destinations jsonb not null check(core.product_destinations_valid(destinations)),
  revision bigint not null default 1 check(revision between 1 and 9007199254740991),
  foreign key(owner_id,product_id) references core.product_drafts(owner_id,id) on delete cascade,
  foreign key(owner_id,primary_asset_key) references core.profile_media_assets(owner_id,asset_key)
);
alter table core.product_preparations enable row level security;
revoke all on core.product_preparations from public, anon, authenticated, service_role;
comment on table core.product_preparations is
  'Private saved Product image/destination preparation. Sanitized same-Owner media only. No publication, safety certification, progress or Identity mutation. Future media GC must retain these asset references.';

create function api.resolve_current_product_preparation()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare eligibility jsonb; draft core.product_drafts%rowtype; preparation core.product_preparations%rowtype;
begin
  eligibility := core.resource_draft_eligibility();
  if eligibility->>'status'<>'success' then return eligibility; end if;
  select d.* into draft from core.product_drafts d join core.owner_auth_bindings b on b.owner_id=d.owner_id
    where b.auth_user_id=auth.uid();
  select p.* into preparation from core.product_preparations p where p.product_id=draft.id;
  return eligibility || jsonb_build_object('product_revision',draft.revision,'preparation',
    case when found then jsonb_build_object('primary_asset_key',preparation.primary_asset_key,
      'destinations',preparation.destinations,'revision',preparation.revision) else null end);
end;
$$;

create function api.save_current_product_preparation(
  input_primary_asset_key text, input_destinations jsonb, base_product_revision bigint, base_preparation_revision bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_record core.owners%rowtype; draft core.product_drafts%rowtype;
  preparation core.product_preparations%rowtype; eligibility jsonb; preparation_exists boolean;
begin
  if auth.uid() is null then return jsonb_build_object('status','unauthenticated'); end if;
  select o.* into owner_record from core.owners o join core.owner_auth_bindings b on b.owner_id=o.id
    where b.auth_user_id=auth.uid() for update of o;
  if not found then return jsonb_build_object('status','owner_missing'); end if;
  if owner_record.account_state<>'active' or owner_record.onboarding_completed_at is not null then
    return jsonb_build_object('status','owner_not_eligible'); end if;
  perform 1 from core.owner_onboarding_progress where owner_id=owner_record.id for update;
  eligibility := core.resource_draft_eligibility();
  if eligibility->>'status'<>'success' then return eligibility; end if;
  select * into draft from core.product_drafts where owner_id=owner_record.id for update;
  if not found then return jsonb_build_object('status','product_missing'); end if;
  if base_product_revision is distinct from draft.revision then return jsonb_build_object('status','stale_write'); end if;
  select * into preparation from core.product_preparations where product_id=draft.id for update;
  preparation_exists := found;
  if (preparation_exists and base_preparation_revision is distinct from preparation.revision)
    or (not preparation_exists and base_preparation_revision is not null) then
    return jsonb_build_object('status','stale_write'); end if;
  if not core.product_destinations_valid(input_destinations) then return jsonb_build_object('status','invalid_destinations'); end if;
  if input_primary_asset_key is not null then
    perform 1 from core.profile_media_assets a join core.profile_media_upload_intents i
      on i.id=a.source_upload_intent_id and i.owner_id=a.owner_id
      where a.asset_key=input_primary_asset_key and a.owner_id=owner_record.id
        and i.status='consumed' and a.stored_content_type='image/webp'
        and a.byte_size between 1 and 3145728 and a.width between 1 and 2048 and a.height between 1 and 2048
        and a.width::bigint*a.height::bigint<=4194304 for share of a,i;
    if not found then return jsonb_build_object('status','invalid_image'); end if;
  end if;
  if preparation_exists then
    if preparation.revision=9007199254740991 then return jsonb_build_object('status','revision_exhausted'); end if;
    update core.product_preparations set primary_asset_key=input_primary_asset_key,
      destinations=input_destinations, revision=revision+1 where product_id=draft.id returning * into preparation;
  else
    insert into core.product_preparations(product_id,owner_id,primary_asset_key,destinations)
      values(draft.id,owner_record.id,input_primary_asset_key,input_destinations) returning * into preparation;
  end if;
  return eligibility || jsonb_build_object('product_revision',draft.revision,'preparation',
    jsonb_build_object('primary_asset_key',preparation.primary_asset_key,
      'destinations',preparation.destinations,'revision',preparation.revision));
end;
$$;
revoke all on function api.resolve_current_product_preparation(), api.save_current_product_preparation(text,jsonb,bigint,bigint)
  from public, anon, authenticated, service_role;
grant execute on function api.resolve_current_product_preparation(), api.save_current_product_preparation(text,jsonb,bigint,bigint)
  to authenticated;
comment on function api.save_current_product_preparation(text,jsonb,bigint,bigint) is
  'Current active incomplete Owner only. Private atomic image/destination preparation with independent revision and expected Product revision. No publication authority.';
commit;

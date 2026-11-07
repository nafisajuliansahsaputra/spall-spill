begin;
create function core.clear_owner_product_preparations() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 delete from core.workspace_product_preparations where owner_id=old.id;
 delete from core.product_preparations where owner_id=old.id;
 return old;
end;$$;
create trigger owner_product_preparations_before_delete before delete on core.owners for each row execute function core.clear_owner_product_preparations();
revoke all on function core.clear_owner_product_preparations() from public,anon,authenticated,service_role;
create table core.product_media_upload_bindings (
 intent_id uuid primary key,owner_id uuid not null,product_id uuid not null,
 item_type text not null default 'product' check(item_type='product'),spill_reference bigint not null,
 foreign key(owner_id,intent_id) references core.profile_media_upload_intents(owner_id,id) on delete cascade,
 foreign key(product_id,owner_id,item_type,spill_reference) references core.spill_item_identity_registry(item_id,owner_id,item_type,spill_reference)
);
create index product_media_upload_bindings_owner_idx on core.product_media_upload_bindings(owner_id);
alter table core.product_media_upload_bindings enable row level security;
revoke all on core.product_media_upload_bindings from public,anon,authenticated,service_role;
create function core.guard_product_media_binding() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then
  if not exists(select 1 from core.profile_media_upload_intents where id=old.intent_id) then return old;end if;
 end if;
 raise exception using errcode='23514',message='Product media binding is immutable.';
end;$$;
create trigger product_media_binding_immutable before update or delete on core.product_media_upload_bindings for each row execute function core.guard_product_media_binding();
create trigger product_media_binding_no_truncate before truncate on core.product_media_upload_bindings for each statement execute function core.guard_product_media_binding();
revoke all on function core.guard_product_media_binding() from public,anon,authenticated,service_role;
create function core.product_media_owner(input_subject uuid,input_reference bigint) returns uuid language plpgsql security invoker set search_path='' as $$
declare owner_uuid uuid;bound_owner uuid;account core.owner_account_state;completed timestamptz;
begin
 if input_subject is null or input_reference is null or input_reference not between 1 and 9007199254740991 then return null;end if;
 select o.id,o.account_state,o.onboarding_completed_at into owner_uuid,account,completed from core.owners o join core.owner_auth_bindings b on b.owner_id=o.id where b.auth_user_id=input_subject for update of o;
 if not found or account<>'active' or completed is null then return null;end if;
 select owner_id into bound_owner from core.owner_auth_bindings where auth_user_id=input_subject for update;
 if not found or bound_owner is distinct from owner_uuid then return null;end if;
 if not exists(select 1 from core.identity_working where owner_id=owner_uuid)
 or not exists(select 1 from core.identity_layout_working where owner_id=owner_uuid)
 or not exists(select 1 from core.owner_handle_namespaces where owner_id=owner_uuid and namespace_kind='current') then return null;end if;
 perform 1 from core.spill_item_identity_registry r join core.workspace_item_sources s on s.id=r.item_id and s.owner_id=r.owner_id and s.kind='product'
 where r.owner_id=owner_uuid and r.spill_reference=input_reference and r.item_type='product'
 and not exists(select 1 from core.spill_item_publications p where p.item_id=r.item_id and p.owner_id=owner_uuid and p.lifecycle_state='archived') for update of r;
 if not found then return null;end if;
 return owner_uuid;
end;$$;
revoke all on function core.product_media_owner(uuid,bigint) from public,anon,authenticated,service_role;
create function api.create_product_media_upload_intent_server(
  input_auth_user_id uuid,
  input_reference bigint,
  input_expected_content_type text,
  input_declared_byte_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_owner_id uuid;




  normalized_content_type text;

  generated_intent_id uuid;
  generated_staging_token uuid;
  generated_staging_key text;
  generated_expires_at timestamptz;
begin
  if input_auth_user_id is null then
    return jsonb_build_object(
      'status',
      'owner_missing'
    );
  end if;

  resolved_owner_id:=core.product_media_owner(input_auth_user_id,input_reference);
  if resolved_owner_id is null then return jsonb_build_object('status','owner_not_eligible');end if;
  normalized_content_type :=
    lower(
      btrim(
        coalesce(
          input_expected_content_type,
          ''
        )
      )
    );

  if
    normalized_content_type not in (
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  then
    return jsonb_build_object(
      'status',
      'invalid_content_type'
    );
  end if;

  if
    input_declared_byte_size is null
    or input_declared_byte_size
      not between 1 and 5242880
  then
    return jsonb_build_object(
      'status',
      'invalid_byte_size'
    );
  end if;

  generated_intent_id :=
    gen_random_uuid();

  generated_staging_token :=
    gen_random_uuid();

  generated_staging_key :=
    'staging/profile/' ||
    generated_intent_id::text ||
    '/' ||
    generated_staging_token::text;

  generated_expires_at :=
    now() + interval '5 minutes';

  insert into
    core.profile_media_upload_intents (
      id,
      owner_id,
      expected_content_type,
      declared_byte_size,
      staging_object_key,
      expires_at
    )
  values (
    generated_intent_id,
    resolved_owner_id,
    normalized_content_type,
    input_declared_byte_size,
    generated_staging_key,
    generated_expires_at
  );

  insert into core.product_media_upload_bindings(intent_id,owner_id,product_id,spill_reference)
  select generated_intent_id,resolved_owner_id,item_id,input_reference from core.spill_item_identity_registry where owner_id=resolved_owner_id and spill_reference=input_reference and item_type='product';
  return jsonb_build_object(
    'status',
      'success',
    'upload_intent_id',
      generated_intent_id::text,
    'staging_object_key',
      generated_staging_key,
    'expected_content_type',
      normalized_content_type,
    'declared_byte_size',
      input_declared_byte_size,
    'expires_at',
      generated_expires_at
  );
end;
$$;
revoke all on function api.create_product_media_upload_intent_server(uuid,bigint,text,bigint) from public,anon,authenticated,service_role;
grant execute on function api.create_product_media_upload_intent_server(uuid,bigint,text,bigint) to service_role;
create or replace function api.resolve_product_media_upload_intent_server(
  input_auth_user_id uuid,
  input_reference bigint,
  input_upload_intent_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_owner_id uuid;



  resolved_status
    core.profile_media_upload_status;

  resolved_expected_content_type text;
  resolved_declared_byte_size bigint;
  resolved_staging_object_key text;
  resolved_expires_at timestamptz;

  resolved_asset_key text;
  resolved_object_key text;
  resolved_byte_size bigint;
  resolved_width integer;
  resolved_height integer;
begin
  if
    input_auth_user_id is null
    or input_upload_intent_id is null
  then
    return jsonb_build_object(
      'status',
      'intent_missing'
    );
  end if;

  resolved_owner_id:=core.product_media_owner(input_auth_user_id,input_reference);
  if resolved_owner_id is null then return jsonb_build_object('status','owner_not_eligible');end if;
  if not exists(select 1 from core.product_media_upload_bindings where intent_id=input_upload_intent_id and owner_id=resolved_owner_id and spill_reference=input_reference) then return jsonb_build_object('status','intent_missing');end if;
  select
    intent.status,
    intent.expected_content_type,
    intent.declared_byte_size,
    intent.staging_object_key,
    intent.expires_at
  into
    resolved_status,
    resolved_expected_content_type,
    resolved_declared_byte_size,
    resolved_staging_object_key,
    resolved_expires_at
  from core.profile_media_upload_intents
    as intent
  where
    intent.id =
      input_upload_intent_id
    and intent.owner_id =
      resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status',
      'intent_missing'
    );
  end if;

  if
    resolved_status in (
      'pending'::core.profile_media_upload_status,
      'processing'::core.profile_media_upload_status
    )
    and resolved_expires_at <= now()
  then
    update core.profile_media_upload_intents
    set
      status =
        'expired'::core.profile_media_upload_status
    where
      id =
        input_upload_intent_id;

    return jsonb_build_object(
      'status',
      'expired'
    );
  end if;

  if
    resolved_status =
      'expired'::core.profile_media_upload_status
  then
    return jsonb_build_object(
      'status',
      'expired'
    );
  end if;

  if
    resolved_status =
      'rejected'::core.profile_media_upload_status
  then
    return jsonb_build_object(
      'status',
      'rejected'
    );
  end if;

  if
    resolved_status =
      'consumed'::core.profile_media_upload_status
  then
    select
      asset.asset_key,
      asset.object_key,
      asset.byte_size,
      asset.width,
      asset.height
    into
      resolved_asset_key,
      resolved_object_key,
      resolved_byte_size,
      resolved_width,
      resolved_height
    from core.profile_media_assets
      as asset
    where
      asset.owner_id =
        resolved_owner_id
      and asset.source_upload_intent_id =
        input_upload_intent_id;

    if not found then
      return jsonb_build_object(
        'status',
        'asset_missing'
      );
    end if;

    return jsonb_build_object(
      'status',
        'consumed',
      'asset_key',
        resolved_asset_key,
      'object_key',
        resolved_object_key,
      'stored_content_type',
        'image/webp',
      'byte_size',
        resolved_byte_size,
      'width',
        resolved_width,
      'height',
        resolved_height
    );
  end if;

  /*
   * Another finalization request already owns the processing claim.
   * Do not expose staging details again and do not start another R2 pipeline.
   */
  if
    resolved_status =
      'processing'::core.profile_media_upload_status
  then
    return jsonb_build_object(
      'status',
        'processing',
      'expires_at',
        resolved_expires_at
    );
  end if;

  /*
   * At this point the row is necessarily pending and still protected by the
   * FOR UPDATE lock. Claim it before returning its authoritative staging data.
   */
  update core.profile_media_upload_intents
  set
    status =
      'processing'::core.profile_media_upload_status
  where
    id =
      input_upload_intent_id;

  return jsonb_build_object(
    'status',
      'success',
    'intent_status',
      'processing',
    'expected_content_type',
      resolved_expected_content_type,
    'declared_byte_size',
      resolved_declared_byte_size,
    'staging_object_key',
      resolved_staging_object_key,
    'expires_at',
      resolved_expires_at
  );
end;
$$;
revoke all on function api.resolve_product_media_upload_intent_server(uuid,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function api.resolve_product_media_upload_intent_server(uuid,bigint,uuid) to service_role;
create function api.complete_product_media_upload_server(
  input_auth_user_id uuid,
  input_reference bigint,
  input_upload_intent_id uuid,
  input_asset_key text,
  input_object_key text,
  input_stored_content_type text,
  input_byte_size bigint,
  input_width integer,
  input_height integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_owner_id uuid;



  resolved_status
    core.profile_media_upload_status;

  resolved_expires_at timestamptz;

  normalized_asset_key text;
  normalized_object_key text;
  normalized_content_type text;

  existing_asset_key text;
  existing_object_key text;
  existing_byte_size bigint;
  existing_width integer;
  existing_height integer;
begin
  if
    input_auth_user_id is null
    or input_upload_intent_id is null
  then
    return jsonb_build_object(
      'status',
      'intent_missing'
    );
  end if;

  resolved_owner_id:=core.product_media_owner(input_auth_user_id,input_reference);
  if resolved_owner_id is null then return jsonb_build_object('status','owner_not_eligible');end if;
  if not exists(select 1 from core.product_media_upload_bindings where intent_id=input_upload_intent_id and owner_id=resolved_owner_id and spill_reference=input_reference) then return jsonb_build_object('status','intent_missing');end if;
  select
    intent.status,
    intent.expires_at
  into
    resolved_status,
    resolved_expires_at
  from core.profile_media_upload_intents
    as intent
  where
    intent.id =
      input_upload_intent_id
    and intent.owner_id =
      resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status',
      'intent_missing'
    );
  end if;

  -- Lost-response retry: one intent can produce only one canonical asset.
  if
    resolved_status =
      'consumed'::core.profile_media_upload_status
  then
    select
      asset.asset_key,
      asset.object_key,
      asset.byte_size,
      asset.width,
      asset.height
    into
      existing_asset_key,
      existing_object_key,
      existing_byte_size,
      existing_width,
      existing_height
    from core.profile_media_assets
      as asset
    where
      asset.owner_id =
        resolved_owner_id
      and asset.source_upload_intent_id =
        input_upload_intent_id;

    if not found then
      return jsonb_build_object(
        'status',
        'asset_missing'
      );
    end if;

    return jsonb_build_object(
      'status',
        'success',
      'idempotent',
        true,
      'asset_key',
        existing_asset_key,
      'object_key',
        existing_object_key,
      'stored_content_type',
        'image/webp',
      'byte_size',
        existing_byte_size,
      'width',
        existing_width,
      'height',
        existing_height
    );
  end if;

  if
    resolved_status in (
      'pending'::core.profile_media_upload_status,
      'processing'::core.profile_media_upload_status
    )
    and resolved_expires_at <= now()
  then
    update core.profile_media_upload_intents
    set
      status =
        'expired'::core.profile_media_upload_status
    where
      id =
        input_upload_intent_id;

    return jsonb_build_object(
      'status',
      'expired'
    );
  end if;

  if
    resolved_status =
      'expired'::core.profile_media_upload_status
  then
    return jsonb_build_object(
      'status',
      'expired'
    );
  end if;

  if
    resolved_status =
      'rejected'::core.profile_media_upload_status
  then
    return jsonb_build_object(
      'status',
      'rejected'
    );
  end if;

  if resolved_status<>'processing'::core.profile_media_upload_status then return jsonb_build_object('status','rejected');end if;

  normalized_asset_key :=
    lower(
      btrim(
        coalesce(
          input_asset_key,
          ''
        )
      )
    );

  normalized_object_key :=
    btrim(
      coalesce(
        input_object_key,
        ''
      )
    );

  normalized_content_type :=
    lower(
      btrim(
        coalesce(
          input_stored_content_type,
          ''
        )
      )
    );

  if
    normalized_asset_key !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return jsonb_build_object(
      'status',
      'invalid_asset_metadata'
    );
  end if;

  if
    normalized_object_key <>
      (
        'working/profile/' ||
        normalized_asset_key ||
        '.webp'
      )
  then
    return jsonb_build_object(
      'status',
      'invalid_asset_metadata'
    );
  end if;

  if
    normalized_content_type <>
      'image/webp'
  then
    return jsonb_build_object(
      'status',
      'invalid_asset_metadata'
    );
  end if;

  if
    input_byte_size is null
    or input_byte_size <= 0
    or input_width is null
    or input_height is null
    or input_width not between 1 and 2048
    or input_height not between 1 and 2048
    or (
      input_width::bigint *
      input_height::bigint
    ) > 4194304
  then
    return jsonb_build_object(
      'status',
      'invalid_asset_metadata'
    );
  end if;

  begin
    insert into core.profile_media_assets (
      asset_key,
      owner_id,
      object_key,
      stored_content_type,
      byte_size,
      width,
      height,
      source_upload_intent_id
    )
    values (
      normalized_asset_key,
      resolved_owner_id,
      normalized_object_key,
      normalized_content_type,
      input_byte_size,
      input_width,
      input_height,
      input_upload_intent_id
    );
  exception
    when unique_violation then
      return jsonb_build_object(
        'status',
        'asset_conflict'
      );
  end;

  update core.profile_media_upload_intents
  set
    status =
      'consumed'::core.profile_media_upload_status,
    consumed_at =
      now()
  where
    id =
      input_upload_intent_id;

  return jsonb_build_object(
    'status',
      'success',
    'idempotent',
      false,
    'asset_key',
      normalized_asset_key,
    'object_key',
      normalized_object_key,
    'stored_content_type',
      normalized_content_type,
    'byte_size',
      input_byte_size,
    'width',
      input_width,
    'height',
      input_height
  );
end;
$$;
revoke all on function api.complete_product_media_upload_server(uuid,bigint,uuid,text,text,text,bigint,integer,integer) from public,anon,authenticated,service_role;
grant execute on function api.complete_product_media_upload_server(uuid,bigint,uuid,text,text,text,bigint,integer,integer) to service_role;
create function api.resolve_current_owner_product_image(input_reference bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context jsonb; owner_uuid uuid; result jsonb;
begin
 context:=api.resolve_current_owner_home_context();
 if context->>'status' is distinct from 'success' or input_reference is null or input_reference not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable');end if;
 owner_uuid:=(api.resolve_current_owner_state()->>'owner_id')::uuid;
 select context||jsonb_build_object('reference',r.spill_reference,'source_revision',s.revision,
 'preparation_revision',p.revision,'primary_asset_key',p.primary_asset_key)
 into result from core.spill_item_identity_registry r join core.workspace_item_sources s on s.id=r.item_id and s.owner_id=r.owner_id and s.kind='product'
 left join core.workspace_product_preparation_sources p on p.product_id=r.item_id and p.owner_id=r.owner_id
 where r.owner_id=owner_uuid and r.item_type='product' and r.spill_reference=input_reference;
 if result is null or octet_length(result::text)>65536 then return jsonb_build_object('status','unavailable');end if;
 return result;
end;$$;
revoke all on function api.resolve_current_owner_product_image(bigint) from public,anon,authenticated,service_role;
create function api.save_current_owner_product_image(input_working jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare owner_uuid uuid;bound_owner uuid;item core.spill_item_identity_registry%rowtype;source_revision bigint;
 reference numeric;source_base numeric;preparation_base numeric;prepared bigint;is_general boolean;next_revision bigint;
begin
 if auth.uid() is null then return jsonb_build_object('status','unauthenticated');end if;
 select o.id into owner_uuid from core.owners o join core.owner_auth_bindings b on b.owner_id=o.id
 where b.auth_user_id=auth.uid() and o.account_state='active' and o.onboarding_completed_at is not null for update of o;
 if not found or api.resolve_current_owner_home_context()->>'status' is distinct from 'success' then return jsonb_build_object('status','owner_not_eligible');end if;
 select owner_id into bound_owner from core.owner_auth_bindings where auth_user_id=auth.uid() for update;
 if not found or bound_owner is distinct from owner_uuid then return jsonb_build_object('status','unavailable');end if;
 if jsonb_typeof(input_working) is distinct from 'object' then return jsonb_build_object('status','invalid_working');end if;
 if not(input_working ?& array['reference','base_source_revision','base_preparation_revision','primary_asset_key'])
 or exists(select 1 from jsonb_object_keys(input_working) k where k not in('reference','base_source_revision','base_preparation_revision','primary_asset_key'))
 or jsonb_typeof(input_working->'reference') is distinct from 'number'
 or jsonb_typeof(input_working->'base_source_revision') is distinct from 'number'
 or jsonb_typeof(input_working->'base_preparation_revision') not in('number','null') then return jsonb_build_object('status','invalid_working');end if;
 reference:=(input_working->>'reference')::numeric;source_base:=(input_working->>'base_source_revision')::numeric;preparation_base:=(input_working->>'base_preparation_revision')::numeric;
 if reference not between 1 and 9007199254740991 or trunc(reference)<>reference
 or source_base not between 1 and 9007199254740991 or trunc(source_base)<>source_base
 or (preparation_base is not null and (preparation_base not between 1 and 9007199254740991 or trunc(preparation_base)<>preparation_base)) then return jsonb_build_object('status','invalid_working');end if;
 if jsonb_typeof(input_working->'primary_asset_key') not in('string','null') then return jsonb_build_object('status','invalid_image');end if;
 if input_working->>'primary_asset_key' is not null then
  perform 1 from core.profile_media_assets a join core.profile_media_upload_intents i on i.id=a.source_upload_intent_id and i.owner_id=a.owner_id
  where a.asset_key=input_working->>'primary_asset_key' and a.owner_id=owner_uuid and i.status='consumed'
  and a.stored_content_type='image/webp' and a.byte_size between 1 and 3145728 and a.width between 1 and 2048 and a.height between 1 and 2048 and a.width::bigint*a.height::bigint<=4194304
  and a.object_key='working/profile/'||a.asset_key||'.webp' for share of a,i;
  if not found then return jsonb_build_object('status','invalid_image');end if;
 end if;
 select * into item from core.spill_item_identity_registry where owner_id=owner_uuid and spill_reference=reference and item_type='product' for update;
 if not found then return jsonb_build_object('status','unavailable');end if;
 if exists(select 1 from core.spill_item_publications where item_id=item.item_id and owner_id=owner_uuid and lifecycle_state='archived') then return jsonb_build_object('status','owner_not_eligible');end if;
 select revision into source_revision from core.product_drafts where id=item.item_id and owner_id=owner_uuid for update;
 is_general:=not found;
 if is_general then select revision into source_revision from core.workspace_product_drafts where id=item.item_id and owner_id=owner_uuid for update;end if;
 if not found then return jsonb_build_object('status','unavailable');end if;
 if source_revision<>source_base then return jsonb_build_object('status','stale_source');end if;
 if is_general then select revision into prepared from core.workspace_product_preparations where product_id=item.item_id and owner_id=owner_uuid for update;
 else select revision into prepared from core.product_preparations where product_id=item.item_id and owner_id=owner_uuid for update;end if;
 if preparation_base is distinct from prepared then return jsonb_build_object('status','stale_write');end if;
 if prepared=9007199254740991 then return jsonb_build_object('status','revision_exhausted');end if;
 next_revision:=coalesce(prepared,0)+1;
 if is_general then
  insert into core.workspace_product_preparations(product_id,owner_id,primary_asset_key,destinations,revision) values(item.item_id,owner_uuid,input_working->>'primary_asset_key','[]'::jsonb,next_revision)
  on conflict(product_id) do update set primary_asset_key=excluded.primary_asset_key,revision=excluded.revision;
 else
  insert into core.product_preparations(product_id,owner_id,primary_asset_key,destinations,revision) values(item.item_id,owner_uuid,input_working->>'primary_asset_key','[]'::jsonb,next_revision)
  on conflict(product_id) do update set primary_asset_key=excluded.primary_asset_key,revision=excluded.revision;
 end if;
 return jsonb_build_object('status','success','reference',item.spill_reference,'source_revision',source_revision,'preparation_revision',next_revision,'primary_asset_key',input_working->'primary_asset_key');
end;$$;
revoke all on function api.save_current_owner_product_image(jsonb) from public,anon,authenticated,service_role;
create function api.execute_owner_product_image_server(input_subject uuid,input_operation text,input_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare previous_claims text:=current_setting('request.jwt.claims',true);previous_sub text:=current_setting('request.jwt.claim.sub',true);result jsonb;reference numeric;
begin
 if input_subject is null or jsonb_typeof(input_payload) is distinct from 'object' or input_operation is null then return jsonb_build_object('status','unavailable');end if;
 if input_operation='resolve_current_owner_product_image' then
  if not(input_payload ? 'input_reference') or input_payload-'input_reference'<>'{}'::jsonb or jsonb_typeof(input_payload->'input_reference') is distinct from 'number' then return jsonb_build_object('status','unavailable');end if;
  reference:=(input_payload->>'input_reference')::numeric;
  if reference not between 1 and 9007199254740991 or trunc(reference)<>reference then return jsonb_build_object('status','unavailable');end if;
 elsif input_operation='save_current_owner_product_image' then
  if not(input_payload ? 'input_working') or input_payload-'input_working'<>'{}'::jsonb then return jsonb_build_object('status','unavailable');end if;
 else return jsonb_build_object('status','unavailable');end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',input_subject,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',input_subject::text,true);
 if input_operation='resolve_current_owner_product_image' then result:=api.resolve_current_owner_product_image(reference::bigint);
 else result:=api.save_current_owner_product_image(input_payload->'input_working');end if;
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);return result;
exception when others then
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);raise;
end;$$;
revoke all on function api.execute_owner_product_image_server(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function api.execute_owner_product_image_server(uuid,text,jsonb) to service_role;
commit;

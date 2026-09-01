-- Stage 6B.3D.1 — Profile Media exclusive finalization claim.
--
-- A pending upload intent may be claimed by exactly one finalization request.
-- The first resolver transitions pending -> processing while holding the row
-- lock. Concurrent/retry requests see processing and must not start a second
-- R2 canonicalization pipeline.
--
-- Consumed intents remain duplicate-safe and return the already registered
-- canonical asset.

create or replace function api.resolve_profile_media_upload_intent_server(
  input_auth_user_id uuid,
  input_upload_intent_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_owner_id uuid;

  resolved_account_state
    core.owner_account_state;

  resolved_onboarding_completed_at
    timestamptz;

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

  select
    binding.owner_id,
    owner_record.account_state,
    owner_record.onboarding_completed_at
  into
    resolved_owner_id,
    resolved_account_state,
    resolved_onboarding_completed_at
  from core.owner_auth_bindings
    as binding
  inner join core.owners
    as owner_record
    on owner_record.id =
      binding.owner_id
  where
    binding.auth_user_id =
      input_auth_user_id;

  if not found then
    return jsonb_build_object(
      'status',
      'owner_missing'
    );
  end if;

  if
    resolved_account_state <>
      'active'::core.owner_account_state
    or
    resolved_onboarding_completed_at
      is not null
  then
    return jsonb_build_object(
      'status',
      'owner_not_eligible'
    );
  end if;

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

comment on function api.resolve_profile_media_upload_intent_server(
  uuid,
  uuid
) is
  'Service-only Owner-scoped upload-intent resolver with exclusive pending-to-processing finalization claim and consumed-intent recovery.';

revoke all
  on function api.resolve_profile_media_upload_intent_server(
    uuid,
    uuid
  )
  from
    public,
    anon,
    authenticated,
    service_role;

grant execute
  on function api.resolve_profile_media_upload_intent_server(
    uuid,
    uuid
  )
  to service_role;
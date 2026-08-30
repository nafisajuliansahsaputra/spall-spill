-- Narrow authenticated Owner-state resolver.
--
-- The dedicated api schema is intentionally exposed through the Data API,
-- while canonical Owner tables remain private inside core.
--
-- The resolver accepts no target identity. The caller's authenticated
-- principal is derived exclusively from auth.uid().

grant usage on schema api to authenticated;

revoke all on schema api
  from public, anon;

create function api.resolve_current_owner_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;
  resolved_owner_id uuid;
  resolved_account_state core.owner_account_state;
  resolved_onboarding_completed_at timestamptz;
  resolved_status text;
begin
  current_auth_user_id := auth.uid();

  if current_auth_user_id is null then
    return jsonb_build_object(
      'status', 'unauthenticated',
      'owner_id', null,
      'account_state', null,
      'onboarding_completed', null
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
  from core.owner_auth_bindings as binding
  inner join core.owners as owner_record
    on owner_record.id = binding.owner_id
  where binding.auth_user_id = current_auth_user_id;

  if not found then
    return jsonb_build_object(
      'status', 'owner_missing',
      'owner_id', null,
      'account_state', null,
      'onboarding_completed', null
    );
  end if;

  resolved_status :=
    case resolved_account_state
      when 'restricted'::core.owner_account_state then
        'restricted'
      when 'suspended'::core.owner_account_state then
        'suspended'
      when 'active'::core.owner_account_state then
        case
          when resolved_onboarding_completed_at is null then
            'onboarding_incomplete'
          else
            'active'
        end
    end;

  return jsonb_build_object(
    'status', resolved_status,
    'owner_id', resolved_owner_id,
    'account_state', resolved_account_state::text,
    'onboarding_completed',
      resolved_onboarding_completed_at is not null
  );
end;
$$;

comment on function api.resolve_current_owner_state() is
  'Returns the narrow current Spall Spill Owner state for the authenticated auth.uid() principal.';

revoke all
  on function api.resolve_current_owner_state()
  from public, anon, authenticated;

grant execute
  on function api.resolve_current_owner_state()
  to authenticated;

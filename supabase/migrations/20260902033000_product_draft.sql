-- O01-S5 — First Product Draft.
--
-- Implements the private first Product Draft used during Relevant First Job.
--
-- Guarantees:
-- - current Owner is always derived from auth.uid();
-- - Product remains Draft, never Published;
-- - one first onboarding Product Draft per Owner;
-- - a valid ordinary http/https destination is the first persistence threshold;
-- - title is optional at this Draft boundary;
-- - independent Draft revision / stale-write protection;
-- - saving never advances onboarding progress;
-- - saving never creates a Persistent Spill Reference;
-- - saving never creates public Spill state;
-- - this slice performs no provider/metadata network fetch.

-- ---------------------------------------------------------------------------
-- Private Product Draft
-- ---------------------------------------------------------------------------

create table core.product_drafts (
  id uuid
    primary key
    default gen_random_uuid(),

  owner_id uuid
    not null
    unique,

  source_url text
    not null,

  title text,

  revision bigint
    not null
    default 1,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint product_drafts_owner_fk
    foreign key (owner_id)
    references core.owners(id)
    on delete cascade,

  constraint product_drafts_revision_positive
    check (revision > 0),

  constraint product_drafts_source_url_valid
    check (
      char_length(source_url)
        between 8 and 2048
      and source_url =
        regexp_replace(
          source_url,
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        )
      and source_url
        !~ '[[:space:][:cntrl:]]'
      and source_url
        !~ E'\\\\'
      and source_url
        ~* '^https?://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?([/?#].*)?$'
    ),

  constraint product_drafts_title_valid
    check (
      title is null
      or (
        char_length(title)
          between 1 and 160
        and title =
          regexp_replace(
            title,
            '^[[:space:]]+|[[:space:]]+$',
            '',
            'g'
          )
        and title
          !~ '[[:cntrl:]]'
      )
    )
);

comment on table core.product_drafts is
  'Private authoritative Product Draft state. Draft is not Working, Published, or a public Spill Item.';

comment on column core.product_drafts.id is
  'Internal Product Draft identity. It is not a Persistent Spill Reference and is not exposed as a public locator.';

comment on column core.product_drafts.owner_id is
  'Canonical Owner identity. Client mutations never select another Owner.';

comment on column core.product_drafts.source_url is
  'Acknowledged ordinary http/https marketplace, affiliate, or Product destination URL. This slice performs no server-side fetch.';

comment on column core.product_drafts.title is
  'Optional acknowledged Draft title. Metadata/provider assistance is defined separately and is never authoritative by itself.';

comment on column core.product_drafts.revision is
  'Independent monotonic Product Draft revision for stale-write protection.';

alter table core.product_drafts
  enable row level security;

revoke all
  on table core.product_drafts
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated current-Owner Product Draft resolver
-- ---------------------------------------------------------------------------

create function api.resolve_current_product_draft_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;

  resolved_owner_id uuid;
  resolved_account_state
    core.owner_account_state;
  resolved_onboarding_completed_at
    timestamptz;

  resolved_current_step
    core.onboarding_step;
  resolved_primary_use_case
    core.primary_use_case;

  resolved_source_url text;
  resolved_title text;
  resolved_product_revision bigint;

  draft_exists boolean;
begin
  current_auth_user_id :=
    auth.uid();

  if current_auth_user_id is null then
    return jsonb_build_object(
      'status',
      'unauthenticated'
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
      current_auth_user_id;

  if not found then
    return jsonb_build_object(
      'status',
      'owner_missing'
    );
  end if;

  if
    resolved_account_state <>
      'active'::core.owner_account_state
  then
    return jsonb_build_object(
      'status',
      'owner_unavailable'
    );
  end if;

  if
    resolved_onboarding_completed_at
      is not null
  then
    return jsonb_build_object(
      'status',
      'onboarding_complete'
    );
  end if;

  select
    progress.current_step,
    progress.primary_use_case
  into
    resolved_current_step,
    resolved_primary_use_case
  from core.owner_onboarding_progress
    as progress
  where
    progress.owner_id =
      resolved_owner_id;

  if not found then
    return jsonb_build_object(
      'status',
      'progress_missing'
    );
  end if;

  if
    resolved_current_step <
      'relevant_first_job'::core.onboarding_step
  then
    return jsonb_build_object(
      'status',
      'step_not_available',
      'current_step',
      resolved_current_step::text
    );
  end if;

  if resolved_primary_use_case is null then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'primary_use_case'
    );
  end if;

  perform 1
  from core.owner_handle_namespaces
    as namespace_record
  where
    namespace_record.owner_id =
      resolved_owner_id
    and namespace_record.namespace_kind =
      'current'::core.handle_namespace_kind;

  if not found then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'current_handle'
    );
  end if;

  perform 1
  from core.identity_working
    as identity_record
  where
    identity_record.owner_id =
      resolved_owner_id;

  if not found then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'identity_working'
    );
  end if;

  perform 1
  from core.identity_layout_working
    as layout_record
  where
    layout_record.owner_id =
      resolved_owner_id;

  if not found then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'identity_layout_working'
    );
  end if;

  select
    draft_record.source_url,
    draft_record.title,
    draft_record.revision
  into
    resolved_source_url,
    resolved_title,
    resolved_product_revision
  from core.product_drafts
    as draft_record
  where
    draft_record.owner_id =
      resolved_owner_id;

  draft_exists := found;

  if not draft_exists then
    return jsonb_build_object(
      'status',
      'success',
      'current_step',
      resolved_current_step::text,
      'product_draft',
      null
    );
  end if;

  return jsonb_build_object(
    'status',
    'success',
    'current_step',
    resolved_current_step::text,
    'product_draft',
    jsonb_build_object(
      'source_url',
      resolved_source_url,
      'title',
      resolved_title,
      'revision',
      resolved_product_revision
    )
  );
end;
$$;

comment on function api.resolve_current_product_draft_state() is
  'Returns only the authenticated incomplete current Owner first Product Draft. Draft state is private and has no public Spill Reference.';

revoke all
  on function api.resolve_current_product_draft_state()
  from public, anon, authenticated;

grant execute
  on function api.resolve_current_product_draft_state()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated current-Owner Product Draft save boundary
--
-- base_product_revision:
-- - NULL = caller last acknowledged that no Product Draft exists;
-- - N    = caller last acknowledged Product Draft revision N.
--
-- This mutation does not accept Owner id or progress revision.
-- It never advances onboarding progress.
-- ---------------------------------------------------------------------------

create function api.save_current_owner_product_draft(
  input_source_url text,
  input_title text,
  base_product_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid;

  resolved_owner_id uuid;
  resolved_account_state
    core.owner_account_state;
  resolved_onboarding_completed_at
    timestamptz;

  resolved_current_step
    core.onboarding_step;
  resolved_primary_use_case
    core.primary_use_case;

  existing_product_revision bigint;
  draft_exists boolean;

  normalized_source_url text;
  normalized_title text;

  committed_source_url text;
  committed_title text;
  committed_product_revision bigint;
begin
  current_auth_user_id :=
    auth.uid();

  if current_auth_user_id is null then
    return jsonb_build_object(
      'status',
      'unauthenticated'
    );
  end if;

  -- Lock canonical Owner first.
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
      current_auth_user_id
  for update of owner_record;

  if not found then
    return jsonb_build_object(
      'status',
      'owner_missing'
    );
  end if;

  if
    resolved_account_state <>
      'active'::core.owner_account_state
    or resolved_onboarding_completed_at
      is not null
  then
    return jsonb_build_object(
      'status',
      'owner_not_eligible'
    );
  end if;

  -- Lock progress second to serialize with S5 -> S6 advancement.
  select
    progress.current_step,
    progress.primary_use_case
  into
    resolved_current_step,
    resolved_primary_use_case
  from core.owner_onboarding_progress
    as progress
  where
    progress.owner_id =
      resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status',
      'progress_missing'
    );
  end if;

  if
    resolved_current_step <
      'relevant_first_job'::core.onboarding_step
  then
    return jsonb_build_object(
      'status',
      'step_not_available',
      'current_step',
      resolved_current_step::text
    );
  end if;

  if resolved_primary_use_case is null then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'primary_use_case'
    );
  end if;

  perform 1
  from core.owner_handle_namespaces
    as namespace_record
  where
    namespace_record.owner_id =
      resolved_owner_id
    and namespace_record.namespace_kind =
      'current'::core.handle_namespace_kind;

  if not found then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'current_handle'
    );
  end if;

  perform 1
  from core.identity_working
    as identity_record
  where
    identity_record.owner_id =
      resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'identity_working'
    );
  end if;

  perform 1
  from core.identity_layout_working
    as layout_record
  where
    layout_record.owner_id =
      resolved_owner_id
  for update;

  if not found then
    return jsonb_build_object(
      'status',
      'prerequisite_missing',
      'prerequisite',
      'identity_layout_working'
    );
  end if;

  -- Lock the Owner's first Product Draft after shared prerequisites.
  select
    draft_record.revision
  into
    existing_product_revision
  from core.product_drafts
    as draft_record
  where
    draft_record.owner_id =
      resolved_owner_id
  for update;

  draft_exists := found;

  if draft_exists then
    if
      base_product_revision is null
      or base_product_revision <>
        existing_product_revision
    then
      return jsonb_build_object(
        'status',
        'stale_write',
        'product_revision',
        existing_product_revision
      );
    end if;
  else
    if base_product_revision is not null then
      return jsonb_build_object(
        'status',
        'stale_write',
        'product_revision',
        null
      );
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- Canonical normalization / validation
  -- -------------------------------------------------------------------------

  normalized_source_url :=
    btrim(
      coalesce(
        input_source_url,
        ''
      )
    );

  normalized_title :=
    nullif(
      regexp_replace(
        coalesce(
          input_title,
          ''
        ),
        '^[[:space:]]+|[[:space:]]+$',
        '',
        'g'
      ),
      ''
    );

  if
    char_length(
      normalized_source_url
    ) < 8
    or char_length(
      normalized_source_url
    ) > 2048
    or normalized_source_url
      ~ '[[:space:][:cntrl:]]'
    or normalized_source_url
      ~ E'\\\\'
    or normalized_source_url
      !~* '^https?://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?([/?#].*)?$'
  then
    return jsonb_build_object(
      'status',
      'invalid_source_url'
    );
  end if;

  if
    normalized_title is not null
    and (
      char_length(
        normalized_title
      ) > 160
      or normalized_title
        ~ '[[:cntrl:]]'
    )
  then
    return jsonb_build_object(
      'status',
      'invalid_title'
    );
  end if;

  -- -------------------------------------------------------------------------
  -- Acknowledged private Draft persistence only.
  -- -------------------------------------------------------------------------

  if draft_exists then
    update core.product_drafts
    set
      source_url =
        normalized_source_url,
      title =
        normalized_title,
      revision =
        revision + 1,
      updated_at =
        now()
    where
      owner_id =
        resolved_owner_id
    returning
      source_url,
      title,
      revision
    into
      committed_source_url,
      committed_title,
      committed_product_revision;
  else
    insert into core.product_drafts (
      owner_id,
      source_url,
      title
    )
    values (
      resolved_owner_id,
      normalized_source_url,
      normalized_title
    )
    returning
      source_url,
      title,
      revision
    into
      committed_source_url,
      committed_title,
      committed_product_revision;
  end if;

  return jsonb_build_object(
    'status',
    'success',
    'current_step',
    resolved_current_step::text,
    'product_draft',
    jsonb_build_object(
      'source_url',
      committed_source_url,
      'title',
      committed_title,
      'revision',
      committed_product_revision
    )
  );
end;
$$;

comment on function api.save_current_owner_product_draft(
  text,
  text,
  bigint
) is
  'Creates or updates only the authenticated current Owner private first Product Draft. It performs no metadata fetch, creates no Persistent Spill Reference, does not advance onboarding, and publishes nothing.';

revoke all
  on function api.save_current_owner_product_draft(
    text,
    text,
    bigint
  )
  from public, anon, authenticated;

grant execute
  on function api.save_current_owner_product_draft(
    text,
    text,
    bigint
  )
  to authenticated;
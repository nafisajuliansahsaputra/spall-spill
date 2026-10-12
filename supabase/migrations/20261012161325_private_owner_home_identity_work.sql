begin;
create function api.resolve_current_owner_home_identity_work()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  context jsonb;
  current_owner uuid;
  content_revision bigint;
  layout_revision bigint;
  connection_revision bigint;
  has_publication boolean;
  published_content bigint;
  published_layout bigint;
  published_connection bigint;
  work_state text;
begin
  context := api.resolve_current_owner_home_context();
  if context->>'status' is distinct from 'success' then
    return jsonb_build_object('status','unavailable');
  end if;
  current_owner := (api.resolve_current_owner_state()->>'owner_id')::uuid;
  select i.revision,l.revision,c.revision,p.owner_id is not null,
    p.identity_revision,p.layout_revision,p.connection_revision
  into content_revision,layout_revision,connection_revision,has_publication,
    published_content,published_layout,published_connection
  from core.identity_working i
  join core.identity_layout_working l on l.owner_id=i.owner_id
  left join core.identity_connection_working c on c.owner_id=i.owner_id
  left join core.identity_publications p on p.owner_id=i.owner_id
  where i.owner_id=current_owner;
  if not found or content_revision not between 1 and 9007199254740991
    or layout_revision not between 1 and 9007199254740991
    or (connection_revision is not null and connection_revision not between 1 and 9007199254740991)
    or published_content>content_revision or published_layout>layout_revision
    or (published_connection is not null and connection_revision is null)
    or published_connection>connection_revision then
    return jsonb_build_object('status','unavailable');
  end if;
  work_state := case
    when not has_publication then 'never_published'
    when content_revision=published_content and layout_revision=published_layout
      and connection_revision is not distinct from published_connection then 'unchanged'
    else 'unpublished_changes' end;
  return context || jsonb_build_object('identity_work',work_state);
end;
$$;
revoke all on function api.resolve_current_owner_home_identity_work() from public, anon, authenticated, service_role;
comment on function api.resolve_current_owner_home_identity_work() is
  'Staged private saved Identity revision comparison. All publication lifecycles are history, not public readiness. No writes or execution grants.';
commit;

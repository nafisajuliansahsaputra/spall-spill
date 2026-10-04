begin;
create function core.guard_first_publication_acknowledgment()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode='23514', message='First-publication acknowledgments are immutable.';
end;
$$;
revoke all on function core.guard_first_publication_acknowledgment() from public, anon, authenticated, service_role;
create trigger first_publication_acknowledgment_immutable
before update or delete on core.first_onboarding_publications
for each row execute function core.guard_first_publication_acknowledgment();
create trigger first_publication_acknowledgment_no_truncate
before truncate on core.first_onboarding_publications
for each statement execute function core.guard_first_publication_acknowledgment();
commit;

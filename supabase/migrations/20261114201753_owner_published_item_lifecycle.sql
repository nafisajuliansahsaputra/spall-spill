begin;
alter table core.spill_item_publications add column publication_revision bigint not null default 1
 check(publication_revision between 1 and 9007199254740991);
create function core.advance_spill_publication_revision() returns trigger
language plpgsql set search_path='' as $$
begin
 if (to_jsonb(new)-'publication_revision') is distinct from (to_jsonb(old)-'publication_revision') then
  if old.publication_revision>=9007199254740991 then raise exception 'Publication revision exhausted';end if;
  new.publication_revision:=old.publication_revision+1;
 else new.publication_revision:=old.publication_revision;end if;
 return new;
end;$$;
revoke all on function core.advance_spill_publication_revision() from public,anon,authenticated,service_role;
create trigger advance_spill_publication_revision before update on core.spill_item_publications
 for each row execute function core.advance_spill_publication_revision();
create table core.spill_lifecycle_commands(
 owner_id uuid not null references core.owners(id),intent_id uuid not null,actor_subject uuid not null,
 command jsonb not null check(jsonb_typeof(command)='object' and octet_length(command::text)<=2048),
 acknowledgment jsonb not null check(jsonb_typeof(acknowledgment)='object' and octet_length(acknowledgment::text)<=2048),
 created_at timestamptz not null default now(),primary key(owner_id,intent_id)
);
alter table core.spill_lifecycle_commands enable row level security;
revoke all on core.spill_lifecycle_commands from public,anon,authenticated,service_role;
create function core.preserve_spill_lifecycle_commands() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Lifecycle receipts are immutable';end;$$;
revoke all on function core.preserve_spill_lifecycle_commands() from public,anon,authenticated,service_role;
create trigger preserve_spill_lifecycle_commands before update or delete on core.spill_lifecycle_commands
 for each row execute function core.preserve_spill_lifecycle_commands();
create function api.resolve_current_owner_spill_lifecycle(input_reference bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context jsonb; actor_owner uuid; publication core.spill_item_publications%rowtype;
begin
 context:=api.resolve_current_owner_home_context();if context->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable');end if;
 select b.owner_id into actor_owner from core.owner_auth_bindings b where b.auth_user_id=auth.uid();
 select * into publication from core.spill_item_publications where owner_id=actor_owner and spill_reference=input_reference;
 if not found then return jsonb_build_object('status','unavailable');end if;
 return context||jsonb_build_object('reference',publication.spill_reference,'kind',publication.item_type,'lifecycle',publication.lifecycle_state,'revision',publication.publication_revision);
end;$$;
revoke all on function api.resolve_current_owner_spill_lifecycle(bigint) from public,anon,authenticated,service_role;
create function api.change_current_owner_spill_lifecycle(input_command jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare owner_record core.owners%rowtype; publication core.spill_item_publications%rowtype;
 receipt core.spill_lifecycle_commands%rowtype; numeric_ref numeric; numeric_revision numeric;
 intent uuid; action text; target text; current_handle text; recognition jsonb; ack jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('status','unauthenticated');end if;
 select o.* into owner_record from core.owners o join core.owner_auth_bindings b on b.owner_id=o.id where b.auth_user_id=auth.uid() for update of o;
 if not found or owner_record.account_state<>'active' or owner_record.onboarding_completed_at is null then return jsonb_build_object('status','owner_not_eligible');end if;
 if jsonb_typeof(input_command) is distinct from 'object' or octet_length(input_command::text)>2048
 or not(input_command?&array['intent_id','reference','expected_revision','expected_lifecycle','action','confirmed'])
 or (input_command-array['intent_id','reference','expected_revision','expected_lifecycle','action','confirmed'])<>'{}'::jsonb
 or jsonb_typeof(input_command->'intent_id') is distinct from 'string' or (input_command->>'intent_id')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
 or jsonb_typeof(input_command->'reference') is distinct from 'number' or jsonb_typeof(input_command->'expected_revision') is distinct from 'number'
 or jsonb_typeof(input_command->'confirmed') is distinct from 'boolean'
 or (input_command->>'action') is null or (input_command->>'action') not in('hide','restore','archive')
 or (input_command->>'expected_lifecycle') is null or (input_command->>'expected_lifecycle') not in('published','hidden','archived') then return jsonb_build_object('status','invalid_command');end if;
 numeric_ref:=(input_command->>'reference')::numeric;numeric_revision:=(input_command->>'expected_revision')::numeric;
 if numeric_ref not between 1 and 9007199254740991 or trunc(numeric_ref)<>numeric_ref or numeric_revision not between 1 and 9007199254740991 or trunc(numeric_revision)<>numeric_revision then return jsonb_build_object('status','invalid_command');end if;
 intent:=(input_command->>'intent_id')::uuid;action:=input_command->>'action';
 if (input_command->>'confirmed')::boolean is distinct from (action='archive') then return jsonb_build_object('status','confirmation_required');end if;
 select * into receipt from core.spill_lifecycle_commands where owner_id=owner_record.id and intent_id=intent;
 if found then
  if receipt.command=input_command then return receipt.acknowledgment;end if;
  return jsonb_build_object('status','conflicting_intent');
 end if;
 select * into publication from core.spill_item_publications where owner_id=owner_record.id and spill_reference=numeric_ref::bigint for update;
 if not found then return jsonb_build_object('status','unavailable');end if;
 if publication.publication_revision<>numeric_revision::bigint or publication.lifecycle_state<>input_command->>'expected_lifecycle' then return jsonb_build_object('status','stale_write');end if;
 target:=case when action='hide' and publication.lifecycle_state='published' then 'hidden'
  when action='restore' and publication.lifecycle_state='hidden' then 'published'
  when action='restore' and publication.lifecycle_state='archived' then 'hidden'
  when action='archive' and publication.lifecycle_state in('published','hidden') then 'archived' else null end;
 if target is null then return jsonb_build_object('status','invalid_transition');end if;
 if publication.publication_revision>=9007199254740991 then return jsonb_build_object('status','revision_exhausted');end if;
 begin
  update core.spill_item_publications set lifecycle_state=target where item_id=publication.item_id returning * into publication;
  if target='published' then
   select normalized_handle into current_handle from core.owner_handle_namespaces where owner_id=owner_record.id and namespace_kind='current';
   recognition:=core.public_spill_recognition(current_handle,publication.spill_reference);
   if recognition->>'status' is distinct from 'success' then raise exception using errcode='P0282',message='Last Published state requires review';end if;
  end if;
 exception when sqlstate 'P0282' then return jsonb_build_object('status','review_required');end;
 ack:=jsonb_build_object('status','success','intent_id',intent,'reference',publication.spill_reference,'kind',publication.item_type,'lifecycle',publication.lifecycle_state,'revision',publication.publication_revision);
 insert into core.spill_lifecycle_commands(owner_id,intent_id,actor_subject,command,acknowledgment) values(owner_record.id,intent,auth.uid(),input_command,ack);
 return ack;
end;$$;
revoke all on function api.change_current_owner_spill_lifecycle(jsonb) from public,anon,authenticated,service_role;
create function api.execute_owner_spill_lifecycle_server(input_subject uuid,input_operation text,input_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare previous_claims text:=current_setting('request.jwt.claims',true);previous_sub text:=current_setting('request.jwt.claim.sub',true);result jsonb;reference numeric;
begin
 if input_subject is null or jsonb_typeof(input_payload) is distinct from 'object' then return jsonb_build_object('status','unavailable');end if;
 if input_operation='resolve_current_owner_spill_lifecycle' then
  if not(input_payload?'input_reference') or (input_payload-'input_reference')<>'{}'::jsonb or jsonb_typeof(input_payload->'input_reference') is distinct from 'number' then return jsonb_build_object('status','unavailable');end if;
  reference:=(input_payload->>'input_reference')::numeric;
  if reference not between 1 and 9007199254740991 or trunc(reference)<>reference then return jsonb_build_object('status','unavailable');end if;
 elsif input_operation='change_current_owner_spill_lifecycle' then
  if not(input_payload?'input_command') or (input_payload-'input_command')<>'{}'::jsonb then return jsonb_build_object('status','unavailable');end if;
 else return jsonb_build_object('status','unavailable');end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',input_subject,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',input_subject::text,true);
 if input_operation='resolve_current_owner_spill_lifecycle' then result:=api.resolve_current_owner_spill_lifecycle(reference::bigint);
 else result:=api.change_current_owner_spill_lifecycle(input_payload->'input_command');end if;
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);return result;
exception when others then
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);raise;
end;$$;
revoke all on function api.execute_owner_spill_lifecycle_server(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function api.execute_owner_spill_lifecycle_server(uuid,text,jsonb) to service_role;
commit;

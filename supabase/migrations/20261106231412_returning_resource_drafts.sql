begin;
create table core.workspace_resource_drafts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references core.owners(id) on delete cascade,
 item_type text not null default 'resource' check(item_type='resource'), spill_reference bigint not null,
 creation_id uuid not null, resource_type text not null check(resource_type in ('menu','price_list','catalog','portfolio','media_kit','document','website','other')),
 title text,source_url text,revision bigint not null default 1 check(revision=1),created_at timestamptz not null default now(),
 unique(owner_id,creation_id),
 foreign key(id,owner_id,item_type,spill_reference) references core.spill_item_identity_registry(item_id,owner_id,item_type,spill_reference),
 check(title is not null or source_url is not null),
 check(title is null or (char_length(title) between 1 and 160 and title=btrim(title) and title !~ '[[:cntrl:]]')),
 check(source_url is null or (char_length(source_url) between 8 and 2048 and source_url=btrim(source_url)
  and source_url !~ '[[:space:][:cntrl:]]' and source_url !~ E'\\\\'
  and source_url ~* '^https?://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?([/?#].*)?$'))
);
create index workspace_resource_drafts_owner_idx on core.workspace_resource_drafts(owner_id);
alter table core.workspace_resource_drafts enable row level security;
revoke all on core.workspace_resource_drafts from public,anon,authenticated,service_role;
comment on table core.workspace_resource_drafts is 'Immutable private creation sources for returning Resource Drafts. Changes go to recoverable Working; no publication or reference reuse.';
create function core.reserve_workspace_resource_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform core.reserve_spill_item_identity(new.id,new.owner_id,'resource');
 select spill_reference into new.spill_reference from core.spill_item_identity_registry where item_id=new.id and owner_id=new.owner_id and item_type='resource';
 return new;
end;$$;
create trigger workspace_resource_identity before insert on core.workspace_resource_drafts for each row execute function core.reserve_workspace_resource_identity();
revoke all on function core.reserve_workspace_resource_identity() from public,anon,authenticated,service_role;
create function core.guard_workspace_resource_source() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' and not exists(select 1 from core.owners where id=old.owner_id) then return old;end if;
 raise exception using errcode='23514',message='Resource creation source is immutable; use Working.';end;$$;
create trigger workspace_resource_source_immutable before update or delete on core.workspace_resource_drafts for each row execute function core.guard_workspace_resource_source();
create trigger workspace_resource_source_no_truncate before truncate on core.workspace_resource_drafts for each statement execute function core.guard_workspace_resource_source();
revoke all on function core.guard_workspace_resource_source() from public,anon,authenticated,service_role;

create view core.workspace_item_sources with(security_invoker=true) as
 select id,owner_id,'product'::text kind,revision,title,source_url,null::text resource_type from core.product_drafts
 union all select id,owner_id,'resource',revision,title,source_url,resource_type from core.resource_drafts
 union all select id,owner_id,'resource',revision,title,source_url,resource_type from core.workspace_resource_drafts;
revoke all on core.workspace_item_sources from public,anon,authenticated,service_role;
create function core.owner_item_recovery_rows(input_owner uuid,input_reference bigint,input_before bigint,input_limit integer)
returns table(reference bigint,item jsonb) language sql stable security invoker set search_path='' as $$
 select r.spill_reference,jsonb_build_object('reference',r.spill_reference,'kind',s.kind,'source_revision',s.revision,
  'working_revision',w.revision,'source_changed',coalesce(w.source_revision<>s.revision,false),
  'title',case when w.item_id is null then s.title else w.title end,
  'source_url',case when w.item_id is null then s.source_url else w.source_url end,
  'resource_type',case when w.item_id is null then s.resource_type else w.resource_type end,
  'published_lifecycle',p.lifecycle_state,'has_primary_image',prep.primary_asset_key is not null,
  'destinations',coalesce(prep.destinations,'[]'::jsonb))
 from core.workspace_item_sources s
 join core.spill_item_identity_registry r on r.item_id=s.id and r.owner_id=s.owner_id and r.item_type=s.kind
 left join core.starter_item_working w on w.item_id=s.id and w.owner_id=s.owner_id
 left join core.spill_item_publications p on p.item_id=s.id and p.owner_id=s.owner_id
 left join core.product_preparations prep on s.kind='product' and prep.product_id=s.id and prep.owner_id=s.owner_id
 where s.owner_id=input_owner and (input_reference is null or r.spill_reference=input_reference)
 and (input_before is null or r.spill_reference<input_before)
 order by r.spill_reference desc limit case when input_limit between 1 and 21 then input_limit else 0 end;
$$;
revoke all on function core.owner_item_recovery_rows(uuid,bigint,bigint,integer) from public,anon,authenticated,service_role;
create function api.resolve_current_owner_item_recovery(input_reference bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context jsonb; current_owner uuid; selected jsonb; result jsonb;
begin
 context:=api.resolve_current_owner_home_context();
 if context->>'status' is distinct from 'success' or input_reference is null or input_reference not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable');end if;
 current_owner:=(api.resolve_current_owner_state()->>'owner_id')::uuid;
 select item into selected from core.owner_item_recovery_rows(current_owner,input_reference,null,1);
 result:=context||jsonb_build_object('item',selected);
 if octet_length(result::text)>1048576 then return jsonb_build_object('status','unavailable');end if;
 return result;
end;$$;
revoke all on function api.resolve_current_owner_item_recovery(bigint) from public,anon,authenticated,service_role;
create function api.resolve_current_owner_spill_manager(input_before_reference bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context jsonb; current_owner uuid; records jsonb; result jsonb; has_more boolean;
begin
 context:=api.resolve_current_owner_home_context();
 if context->>'status' is distinct from 'success' or (input_before_reference is not null and input_before_reference not between 1 and 9007199254740991) then return jsonb_build_object('status','unavailable');end if;
 current_owner:=(api.resolve_current_owner_state()->>'owner_id')::uuid;
 select coalesce(jsonb_agg(jsonb_build_object('reference',reference,'kind',item->'kind',
 'title_preview',left(item->>'title',160),'resource_type',item->'resource_type','working_revision',item->'working_revision',
 'source_changed',item->'source_changed','published_lifecycle',item->'published_lifecycle') order by reference desc),'[]'::jsonb)
 into records from core.owner_item_recovery_rows(current_owner,null,input_before_reference,21) bounded;
 has_more:=jsonb_array_length(records)>20;
 if has_more then records:=records-20;end if;
 result:=context||jsonb_build_object('items',records,'has_more',has_more,'next_before_reference',case when has_more then (records->19->>'reference')::bigint else null end);
 if octet_length(result::text)>1048576 then return jsonb_build_object('status','unavailable');end if;
 return result;
end;$$;
revoke all on function api.resolve_current_owner_spill_manager(bigint) from public,anon,authenticated,service_role;

create function api.create_current_owner_resource_draft(input_draft jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare current_owner uuid; bound_owner uuid; saved core.workspace_resource_drafts%rowtype; creation uuid; title text; source text; kind text;
begin
 if auth.uid() is null then return jsonb_build_object('status','unauthenticated');end if;
 select o.id into current_owner from core.owners o join core.owner_auth_bindings b on b.owner_id=o.id
 where b.auth_user_id=auth.uid() and o.account_state='active' and o.onboarding_completed_at is not null for update of o;
 if not found or api.resolve_current_owner_home_context()->>'status' is distinct from 'success' then return jsonb_build_object('status','owner_not_eligible');end if;
 select owner_id into bound_owner from core.owner_auth_bindings where auth_user_id=auth.uid() for update;
 if not found or bound_owner is distinct from current_owner then return jsonb_build_object('status','unavailable');end if;
 if jsonb_typeof(input_draft) is distinct from 'object' then return jsonb_build_object('status','invalid_draft');end if;
 if not(input_draft ?& array['creation_id','resource_type','title','source_url'])
 or exists(select 1 from jsonb_object_keys(input_draft) k where k not in('creation_id','resource_type','title','source_url'))
 or jsonb_typeof(input_draft->'creation_id') is distinct from 'string' or input_draft->>'creation_id' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 or jsonb_typeof(input_draft->'resource_type') is distinct from 'string'
 or jsonb_typeof(input_draft->'title') not in('string','null') or jsonb_typeof(input_draft->'source_url') not in('string','null') then return jsonb_build_object('status','invalid_draft');end if;
 creation:=(input_draft->>'creation_id')::uuid;kind:=input_draft->>'resource_type';title:=nullif(btrim(input_draft->>'title'),'');source:=nullif(btrim(input_draft->>'source_url'),'');
 if kind not in('menu','price_list','catalog','portfolio','media_kit','document','website','other') or (title is null and source is null)
 or (title is not null and (char_length(title)>160 or title ~ '[[:cntrl:]]'))
 or (source is not null and (char_length(source) not between 8 and 2048 or source ~ '[[:space:][:cntrl:]]' or source ~ E'\\\\' or source !~* '^https?://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?([/?#].*)?$')) then return jsonb_build_object('status','invalid_draft');end if;
 select * into saved from core.workspace_resource_drafts where owner_id=current_owner and creation_id=creation;
 if found then
  if saved.resource_type is distinct from kind or saved.title is distinct from title or saved.source_url is distinct from source then return jsonb_build_object('status','conflicting_intent');end if;
 else
  insert into core.workspace_resource_drafts(owner_id,creation_id,resource_type,title,source_url) values(current_owner,creation,kind,title,source) returning * into saved;
 end if;
 return jsonb_build_object('status','success','creation_id',saved.creation_id,'reference',saved.spill_reference,'resource_type',saved.resource_type,'title',saved.title,'source_url',saved.source_url);
end;$$;
revoke all on function api.create_current_owner_resource_draft(jsonb) from public,anon,authenticated,service_role;
create or replace function api.save_current_owner_starter_item_working(input_working jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_owner uuid; bound_owner uuid; account core.owner_account_state;
 completed timestamptz; reference numeric; source_base numeric; working_base numeric; source_revision bigint;
 item core.spill_item_identity_registry%rowtype; saved core.starter_item_working%rowtype; present boolean;
 payload jsonb; next_revision bigint;
begin
 if actor is null then return jsonb_build_object('status','unauthenticated'); end if;
 select o.id,o.account_state,o.onboarding_completed_at into current_owner,account,completed
 from core.owner_auth_bindings b join core.owners o on o.id=b.owner_id where b.auth_user_id=actor for update of o;
 if not found then return jsonb_build_object('status','unavailable'); end if;
 select owner_id into bound_owner from core.owner_auth_bindings where auth_user_id=actor for update;
 if not found or bound_owner is distinct from current_owner then return jsonb_build_object('status','unavailable'); end if;
 if account<>'active' or completed is null then return jsonb_build_object('status','owner_not_eligible'); end if;
 if api.resolve_current_owner_home_context()->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable'); end if;
 if jsonb_typeof(input_working) is distinct from 'object' then return jsonb_build_object('status','invalid_working'); end if;
 if not(input_working ?& array['reference','base_source_revision','base_working_revision','working'])
  or exists(select 1 from jsonb_object_keys(input_working) k where k not in('reference','base_source_revision','base_working_revision','working'))
  or jsonb_typeof(input_working->'reference') is distinct from 'number'
  or jsonb_typeof(input_working->'base_source_revision') is distinct from 'number'
  or jsonb_typeof(input_working->'base_working_revision') not in('number','null')
  or jsonb_typeof(input_working->'working') is distinct from 'object' then return jsonb_build_object('status','invalid_working'); end if;
 reference:=(input_working->>'reference')::numeric;source_base:=(input_working->>'base_source_revision')::numeric;working_base:=(input_working->>'base_working_revision')::numeric;
 if reference not between 1 and 9007199254740991 or trunc(reference)<>reference
  or source_base not between 1 and 9007199254740991 or trunc(source_base)<>source_base
  or (working_base is not null and (working_base not between 1 and 9007199254740991 or trunc(working_base)<>working_base))
 then return jsonb_build_object('status','invalid_working'); end if;
 select * into item from core.spill_item_identity_registry where owner_id=current_owner and spill_reference=reference for update;
 if not found then return jsonb_build_object('status','unavailable'); end if;
 if item.item_type='product' then
  select revision into source_revision from core.product_drafts where id=item.item_id and owner_id=current_owner for update;
 else
  select revision into source_revision from core.resource_drafts where id=item.item_id and owner_id=current_owner for update;
  if not found then select revision into source_revision from core.workspace_resource_drafts where id=item.item_id and owner_id=current_owner for update; end if;
 end if;
 if not found then return jsonb_build_object('status','unavailable'); end if;
 if source_revision<>source_base then return jsonb_build_object('status','stale_source'); end if;
 if exists(select 1 from core.spill_item_publications where item_id=item.item_id and owner_id=current_owner and lifecycle_state='archived')
 then return jsonb_build_object('status','owner_not_eligible'); end if;
 payload:=input_working->'working';
 if not(payload ?& array['title','source_url','resource_type']) or exists(select 1 from jsonb_object_keys(payload) k where k not in('title','source_url','resource_type'))
  or jsonb_typeof(payload->'title') not in('string','null') or jsonb_typeof(payload->'source_url') not in('string','null')
  or char_length(payload->>'title')>16384 or char_length(payload->>'source_url')>16384
  or (item.item_type='product' and jsonb_typeof(payload->'resource_type') is distinct from 'null')
  or (item.item_type='resource' and (jsonb_typeof(payload->'resource_type') is distinct from 'string' or payload->>'resource_type' not in
   ('menu','price_list','catalog','portfolio','media_kit','document','website','other')))
 then return jsonb_build_object('status','invalid_working'); end if;
 select * into saved from core.starter_item_working where item_id=item.item_id and owner_id=current_owner for update;
 present:=found;
 if (present and working_base is distinct from saved.revision) or (not present and working_base is not null)
 then return jsonb_build_object('status','stale_write'); end if;
 if present and saved.revision=9007199254740991 then return jsonb_build_object('status','revision_exhausted'); end if;
 next_revision:=case when present then saved.revision+1 else 1 end;
 insert into core.starter_item_working(item_id,owner_id,item_type,spill_reference,title,source_url,resource_type,source_revision,revision)
 values(item.item_id,current_owner,item.item_type,item.spill_reference,payload->>'title',payload->>'source_url',payload->>'resource_type',source_revision,next_revision)
 on conflict(item_id) do update set title=excluded.title,source_url=excluded.source_url,resource_type=excluded.resource_type,
 source_revision=excluded.source_revision,revision=excluded.revision,updated_at=now();
 return jsonb_build_object('status','success','reference',item.spill_reference,'source_revision',source_revision,'working_revision',next_revision);
end;
$$;
revoke all on function api.save_current_owner_starter_item_working(jsonb) from public,anon,authenticated,service_role;


create function api.execute_owner_resource_catalog_server(input_subject uuid,input_operation text,input_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare previous_claims text:=current_setting('request.jwt.claims',true);previous_sub text:=current_setting('request.jwt.claim.sub',true);result jsonb; cursor_value numeric;
begin
 if input_subject is null or jsonb_typeof(input_payload) is distinct from 'object' or input_operation is null then return jsonb_build_object('status','unavailable');end if;
 if input_operation='create_current_owner_resource_draft' then
  if not(input_payload ? 'input_draft') or input_payload-'input_draft'<>'{}'::jsonb then return jsonb_build_object('status','unavailable');end if;
 elsif input_operation in('resolve_current_owner_spill_manager','resolve_current_owner_item_recovery') then
  if not(input_payload ? 'input_reference') or input_payload-'input_reference'<>'{}'::jsonb then return jsonb_build_object('status','unavailable');end if;
  if jsonb_typeof(input_payload->'input_reference')='number' then
   cursor_value:=(input_payload->>'input_reference')::numeric;
   if cursor_value not between 1 and 9007199254740991 or trunc(cursor_value)<>cursor_value then return jsonb_build_object('status','unavailable');end if;
  elsif jsonb_typeof(input_payload->'input_reference') is distinct from 'null' or input_operation='resolve_current_owner_item_recovery' then return jsonb_build_object('status','unavailable');end if;
 else return jsonb_build_object('status','unavailable');end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',input_subject,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',input_subject::text,true);
 if input_operation='create_current_owner_resource_draft' then result:=api.create_current_owner_resource_draft(input_payload->'input_draft');
 elsif input_operation='resolve_current_owner_item_recovery' then result:=api.resolve_current_owner_item_recovery(cursor_value::bigint);
 else result:=api.resolve_current_owner_spill_manager(cursor_value::bigint);end if;
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);return result;
exception when others then
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);raise;
end;$$;
revoke all on function api.execute_owner_resource_catalog_server(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function api.execute_owner_resource_catalog_server(uuid,text,jsonb) to service_role;
commit;

begin;
create table core.starter_item_working (
 item_id uuid primary key, owner_id uuid not null references core.owners(id) on delete cascade, item_type text not null,
 spill_reference bigint not null, title text check(char_length(title)<=16384),
 source_url text check(char_length(source_url)<=16384), resource_type text,
 source_revision bigint not null check(source_revision between 1 and 9007199254740991),
 revision bigint not null check(revision between 1 and 9007199254740991),
 updated_at timestamptz not null default now(),
 foreign key(item_id,owner_id,item_type,spill_reference)
   references core.spill_item_identity_registry(item_id,owner_id,item_type,spill_reference),
 check((item_type='product' and resource_type is null) or (item_type='resource' and resource_type in
   ('menu','price_list','catalog','portfolio','media_kit','document','website','other') and resource_type is not null))
);
comment on table core.starter_item_working is 'Private recoverable raw Working for existing setup Items. Owner deletion removes raw content; immutable identity reservations remain. No publication or source mutation.';
alter table core.starter_item_working enable row level security;
revoke all on core.starter_item_working from public,anon,authenticated,service_role;

create function api.resolve_current_owner_starter_recovery()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context jsonb; current_owner uuid; items jsonb; result jsonb; source_count integer;
begin
 context:=api.resolve_current_owner_home_context();
 if context->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable'); end if;
 current_owner:=(api.resolve_current_owner_state()->>'owner_id')::uuid;
 select (select count(*) from core.product_drafts where owner_id=current_owner)+(select count(*) from core.resource_drafts where owner_id=current_owner) into source_count;
 with sources as (
  select id,owner_id,'product'::text kind,revision,title,source_url,null::text resource_type from core.product_drafts where owner_id=current_owner
  union all
  select id,owner_id,'resource',revision,title,source_url,resource_type from core.resource_drafts where owner_id=current_owner
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'reference',r.spill_reference,'kind',s.kind,'source_revision',s.revision,
  'working_revision',w.revision,'source_changed',coalesce(w.source_revision<>s.revision,false),
  'title',case when w.item_id is null then s.title else w.title end,
  'source_url',case when w.item_id is null then s.source_url else w.source_url end,
  'resource_type',case when w.item_id is null then s.resource_type else w.resource_type end,
  'published_lifecycle',p.lifecycle_state,
  'has_primary_image',prep.primary_asset_key is not null,'destinations',coalesce(prep.destinations,'[]'::jsonb)
 ) order by r.spill_reference),'[]'::jsonb) into items
 from sources s join core.spill_item_identity_registry r on r.item_id=s.id and r.owner_id=s.owner_id and r.item_type=s.kind
 left join core.starter_item_working w on w.item_id=s.id and w.owner_id=current_owner
 left join core.spill_item_publications p on p.item_id=s.id and p.owner_id=current_owner
 left join core.product_preparations prep on s.kind='product' and prep.product_id=s.id and prep.owner_id=current_owner;
 if jsonb_array_length(items)<>source_count then return jsonb_build_object('status','unavailable'); end if;
 result:=context||jsonb_build_object('items',items);
 if octet_length(result::text)>1048576 then return jsonb_build_object('status','unavailable'); end if;
 return result;
end;
$$;
revoke all on function api.resolve_current_owner_starter_recovery() from public,anon,authenticated,service_role;

create function api.save_current_owner_starter_item_working(input_working jsonb)
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

create function api.execute_owner_starter_recovery_server(input_subject uuid,input_operation text,input_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare previous_claims text:=current_setting('request.jwt.claims',true);previous_sub text:=current_setting('request.jwt.claim.sub',true);result jsonb;
begin
 if input_subject is null or jsonb_typeof(input_payload) is distinct from 'object' then return jsonb_build_object('status','unavailable'); end if;
 if not((input_operation='resolve_current_owner_starter_recovery' and input_payload='{}'::jsonb)
  or (input_operation='save_current_owner_starter_item_working' and input_payload ? 'input_working' and (input_payload-'input_working')='{}'::jsonb))
  or input_operation is null then return jsonb_build_object('status','unavailable'); end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',input_subject,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',input_subject::text,true);
 if input_operation='resolve_current_owner_starter_recovery' then result:=api.resolve_current_owner_starter_recovery();
 else result:=api.save_current_owner_starter_item_working(input_payload->'input_working'); end if;
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
 return result;
exception when others then
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);raise;
end;
$$;
revoke all on function api.execute_owner_starter_recovery_server(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function api.execute_owner_starter_recovery_server(uuid,text,jsonb) to service_role;
commit;

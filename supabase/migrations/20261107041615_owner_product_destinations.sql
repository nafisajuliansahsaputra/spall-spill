begin;
alter table core.workspace_product_drafts add constraint workspace_product_owner_identity_unique unique(owner_id,id);
create table core.workspace_product_preparations (
 product_id uuid primary key,owner_id uuid not null,primary_asset_key text,
 destinations jsonb not null check(core.product_destinations_valid(destinations)),
 revision bigint not null default 1 check(revision between 1 and 9007199254740991),
 foreign key(owner_id,product_id) references core.workspace_product_drafts(owner_id,id) on delete cascade,
 foreign key(owner_id,primary_asset_key) references core.profile_media_assets(owner_id,asset_key)
);
create index workspace_product_preparations_owner_idx on core.workspace_product_preparations(owner_id);
alter table core.workspace_product_preparations enable row level security;
revoke all on core.workspace_product_preparations from public,anon,authenticated,service_role;
create view core.workspace_product_preparation_sources with(security_invoker=true) as
 select product_id,owner_id,primary_asset_key,destinations,revision from core.product_preparations
 union all select product_id,owner_id,primary_asset_key,destinations,revision from core.workspace_product_preparations;
revoke all on core.workspace_product_preparation_sources from public,anon,authenticated,service_role;
create or replace function core.owner_item_recovery_rows(input_owner uuid,input_reference bigint,input_before bigint,input_limit integer)
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
 left join core.workspace_product_preparation_sources prep on s.kind='product' and prep.product_id=s.id and prep.owner_id=s.owner_id
 where s.owner_id=input_owner and (input_reference is null or r.spill_reference=input_reference)
 and (input_before is null or r.spill_reference<input_before)
 order by r.spill_reference desc limit case when input_limit between 1 and 21 then input_limit else 0 end;
$$;
revoke all on function core.owner_item_recovery_rows(uuid,bigint,bigint,integer) from public,anon,authenticated,service_role;
create function api.resolve_current_owner_product_destinations(input_reference bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context jsonb; owner_uuid uuid; result jsonb;
begin
 context:=api.resolve_current_owner_home_context();
 if context->>'status' is distinct from 'success' or input_reference is null or input_reference not between 1 and 9007199254740991 then return jsonb_build_object('status','unavailable');end if;
 owner_uuid:=(api.resolve_current_owner_state()->>'owner_id')::uuid;
 select context||jsonb_build_object('reference',r.spill_reference,'source_revision',s.revision,
 'preparation_revision',p.revision,'destinations',coalesce(p.destinations,'[]'::jsonb),'has_primary_image',p.primary_asset_key is not null)
 into result from core.spill_item_identity_registry r join core.workspace_item_sources s on s.id=r.item_id and s.owner_id=r.owner_id and s.kind='product'
 left join core.workspace_product_preparation_sources p on p.product_id=r.item_id and p.owner_id=r.owner_id
 where r.owner_id=owner_uuid and r.item_type='product' and r.spill_reference=input_reference;
 if result is null or octet_length(result::text)>65536 then return jsonb_build_object('status','unavailable');end if;
 return result;
end;$$;
revoke all on function api.resolve_current_owner_product_destinations(bigint) from public,anon,authenticated,service_role;
create function api.save_current_owner_product_destinations(input_working jsonb)
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
 if not(input_working ?& array['reference','base_source_revision','base_preparation_revision','destinations'])
 or exists(select 1 from jsonb_object_keys(input_working) k where k not in('reference','base_source_revision','base_preparation_revision','destinations'))
 or jsonb_typeof(input_working->'reference') is distinct from 'number'
 or jsonb_typeof(input_working->'base_source_revision') is distinct from 'number'
 or jsonb_typeof(input_working->'base_preparation_revision') not in('number','null') then return jsonb_build_object('status','invalid_working');end if;
 reference:=(input_working->>'reference')::numeric;source_base:=(input_working->>'base_source_revision')::numeric;preparation_base:=(input_working->>'base_preparation_revision')::numeric;
 if reference not between 1 and 9007199254740991 or trunc(reference)<>reference
 or source_base not between 1 and 9007199254740991 or trunc(source_base)<>source_base
 or (preparation_base is not null and (preparation_base not between 1 and 9007199254740991 or trunc(preparation_base)<>preparation_base)) then return jsonb_build_object('status','invalid_working');end if;
 if not core.product_destinations_valid(input_working->'destinations') then return jsonb_build_object('status','invalid_destinations');end if;
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
  insert into core.workspace_product_preparations(product_id,owner_id,destinations,revision) values(item.item_id,owner_uuid,input_working->'destinations',next_revision)
  on conflict(product_id) do update set destinations=excluded.destinations,revision=excluded.revision;
 else
  insert into core.product_preparations(product_id,owner_id,destinations,revision) values(item.item_id,owner_uuid,input_working->'destinations',next_revision)
  on conflict(product_id) do update set destinations=excluded.destinations,revision=excluded.revision;
 end if;
 return jsonb_build_object('status','success','reference',item.spill_reference,'source_revision',source_revision,'preparation_revision',next_revision,'destinations',input_working->'destinations');
end;$$;
revoke all on function api.save_current_owner_product_destinations(jsonb) from public,anon,authenticated,service_role;
create function api.execute_owner_product_destinations_server(input_subject uuid,input_operation text,input_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare previous_claims text:=current_setting('request.jwt.claims',true);previous_sub text:=current_setting('request.jwt.claim.sub',true);result jsonb;reference numeric;
begin
 if input_subject is null or jsonb_typeof(input_payload) is distinct from 'object' or input_operation is null then return jsonb_build_object('status','unavailable');end if;
 if input_operation='resolve_current_owner_product_destinations' then
  if not(input_payload ? 'input_reference') or input_payload-'input_reference'<>'{}'::jsonb or jsonb_typeof(input_payload->'input_reference') is distinct from 'number' then return jsonb_build_object('status','unavailable');end if;
  reference:=(input_payload->>'input_reference')::numeric;
  if reference not between 1 and 9007199254740991 or trunc(reference)<>reference then return jsonb_build_object('status','unavailable');end if;
 elsif input_operation='save_current_owner_product_destinations' then
  if not(input_payload ? 'input_working') or input_payload-'input_working'<>'{}'::jsonb then return jsonb_build_object('status','unavailable');end if;
 else return jsonb_build_object('status','unavailable');end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',input_subject,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',input_subject::text,true);
 if input_operation='resolve_current_owner_product_destinations' then result:=api.resolve_current_owner_product_destinations(reference::bigint);
 else result:=api.save_current_owner_product_destinations(input_payload->'input_working');end if;
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);return result;
exception when others then
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);raise;
end;$$;
revoke all on function api.execute_owner_product_destinations_server(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function api.execute_owner_product_destinations_server(uuid,text,jsonb) to service_role;
commit;

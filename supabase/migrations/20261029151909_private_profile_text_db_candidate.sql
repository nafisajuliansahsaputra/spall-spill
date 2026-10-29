begin;
-- Match ECMAScript String.trim explicitly, independent of DB locale.
create function core.identity_candidate_trim(value text) returns text
language sql immutable strict set search_path='' as $$
 select btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
revoke all on function core.identity_candidate_trim(text) from public,anon,authenticated,service_role;
create function api.prepare_current_owner_identity_profile_text_candidate(input_candidate jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare
 actor uuid := auth.uid();
 current_owner uuid;
 bound_owner uuid;
 account core.owner_account_state;
 completed timestamptz;
 receipt core.identity_working_review_receipts%rowtype;
 snapshot jsonb;
 profile jsonb;
 block jsonb;
 issues jsonb := '[]';
 blocks jsonb := '[]';
 name text;
 bio text;
 content text;
 code text;
 candidate jsonb;
begin
 if actor is null then return jsonb_build_object('status','unauthenticated'); end if;
 select o.id,o.account_state,o.onboarding_completed_at into current_owner,account,completed
   from core.owner_auth_bindings b join core.owners o on o.id=b.owner_id where b.auth_user_id=actor for update of o;
 if not found then return jsonb_build_object('status','owner_missing'); end if;
 select b.owner_id into bound_owner from core.owner_auth_bindings b where b.auth_user_id=actor for update;
 if not found or bound_owner is distinct from current_owner then return jsonb_build_object('status','unavailable'); end if;
 if account<>'active' or completed is null then return jsonb_build_object('status','owner_not_eligible'); end if;
 if api.resolve_current_owner_home_context()->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable'); end if;
 if jsonb_typeof(input_candidate) is distinct from 'object' then return jsonb_build_object('status','invalid_candidate_request'); end if;
 if not(input_candidate ?& array['action','receipt_id','snapshot_hash'])
   or exists(select 1 from jsonb_object_keys(input_candidate) k where k not in('action','receipt_id','snapshot_hash'))
   or input_candidate->>'action' is distinct from 'prepare_identity_profile_text_candidate'
   or jsonb_typeof(input_candidate->'receipt_id') is distinct from 'string'
   or char_length(input_candidate->>'receipt_id')<>36
   or input_candidate->>'receipt_id'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or jsonb_typeof(input_candidate->'snapshot_hash') is distinct from 'string'
   or char_length(input_candidate->>'snapshot_hash')<>64
   or input_candidate->>'snapshot_hash'!~'^[0-9a-f]{64}$'
 then return jsonb_build_object('status','invalid_candidate_request'); end if;
 select * into receipt from core.identity_working_review_receipts where owner_id=current_owner for update;
 if not found or receipt.receipt_id::text is distinct from input_candidate->>'receipt_id'
   or receipt.snapshot_hash is distinct from input_candidate->>'snapshot_hash'
 then return jsonb_build_object('status','stale_review'); end if;
 if receipt.expires_at<=clock_timestamp() then return jsonb_build_object('status','review_expired'); end if;
 snapshot := api.resolve_current_owner_identity_review_snapshot('{"expected_collection_revision":null,"after_position":null}');
 if snapshot->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable'); end if;
 if snapshot->>'snapshot_hash' is distinct from receipt.snapshot_hash then return jsonb_build_object('status','stale_review'); end if;
 profile := case when snapshot->'profile_text_working'='null'::jsonb then snapshot->'profile_working' else snapshot->'profile_text_working' end;
 name := core.identity_candidate_trim(coalesce(profile->>'display_name',''));
 bio := nullif(core.identity_candidate_trim(replace(replace(coalesce(profile->>'bio',''),E'\r\n',E'\n'),E'\r',E'\n')),'');
 if char_length(name) not between 1 and 80 or name ~ U&'[\0001-\001F\007F-\009F\2028\2029]' then
   issues := issues||jsonb_build_array(jsonb_build_object('scope','profile','code','display_name_invalid')); end if;
 if char_length(bio)>300 or bio ~ U&'[\0001-\0009\000B-\001F\007F-\009F]' then
   issues := issues||jsonb_build_array(jsonb_build_object('scope','profile','code','bio_invalid')); end if;
 if snapshot->>'profile_text_state'='source_changed' then
   issues := issues||jsonb_build_array(jsonb_build_object('scope','profile','code','source_review_required')); end if;
 if snapshot#>>'{profile_working,profile_asset_key}' is not null then
   issues := issues||jsonb_build_array(jsonb_build_object('scope','profile','code','profile_media_publication_pending')); end if;
 if snapshot->'connection_source_working' is distinct from 'null'::jsonb then
   issues := issues||jsonb_build_array(jsonb_build_object('scope','source_connection','code','connection_publication_preparation_pending')); end if;
 for block in select value from jsonb_array_elements(coalesce(snapshot#>'{collection,blocks}','[]')) loop
   if block->'is_visible' is distinct from 'true'::jsonb then continue; end if;
   code := null;
   if block->'working'='null'::jsonb then code := 'payload_missing';
   elsif block->>'kind'='text' then
     content := block#>>'{working,text}';
     if content is null or core.identity_candidate_trim(content)='' or char_length(content)>16384
       or content ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F]'
     then code := 'text_invalid';
     else blocks := blocks||jsonb_build_array(jsonb_build_object('kind','text','text',content)); end if;
   else code := case block->>'kind'
     when 'social' then 'link_publication_preparation_pending' when 'generic_link' then 'link_publication_preparation_pending'
     when 'contact' then 'contact_publication_policy_pending' when 'media' then 'media_publication_preparation_pending'
     when 'spill_cta' then 'spill_cta_publication_eligibility_pending' else 'payload_missing' end;
   end if;
   if code is not null then issues := issues||jsonb_build_array(jsonb_build_object('scope','block','block_id',block->>'block_id','code',code)); end if;
 end loop;
 if snapshot->>'current_handle' is null or char_length(snapshot->>'current_handle') not between 3 and 30
   or snapshot->>'current_handle' is distinct from core.identity_candidate_trim(snapshot->>'current_handle')
   or snapshot->>'current_handle'!~'^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
   or snapshot#>>'{layout_working,starter_key}' is null or snapshot#>>'{layout_working,starter_key}' not in('clean','social_focus','featured','business')
 then return jsonb_build_object('status','unavailable'); end if;
 if jsonb_array_length(issues)=0 then
   candidate := jsonb_build_object('current_handle',snapshot->>'current_handle','display_name',name,'bio',bio,
     'starter_key',snapshot#>>'{layout_working,starter_key}','blocks',blocks);
 end if;
 -- Long waits/validation must never turn an expired receipt into a success.
 if receipt.expires_at<=clock_timestamp() then return jsonb_build_object('status','review_expired'); end if;
 return jsonb_build_object('status','success','receipt_id',receipt.receipt_id,'snapshot_hash',receipt.snapshot_hash,
   'expires_at',receipt.expires_at,'review_format','identity_working_review_v1','publication_validation','profile_text_subset',
   'assessment',case when candidate is null then 'blocked' else 'candidate_validated' end,'candidate',candidate,'issues',issues);
end;
$$;
revoke all on function api.prepare_current_owner_identity_profile_text_candidate(jsonb) from public,anon,authenticated,service_role;
comment on function api.prepare_current_owner_identity_profile_text_candidate(jsonb) is
 'Dormant receipt-bound private Profile/Text subset validation. Owner-first locks, full graph hash and wallclock expiry. No publication writes, transports or execution grants.';
commit;

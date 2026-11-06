begin;
-- Fixed public-only gateway. No viewer identity can expand its projection.
create function api.execute_public_identity_server(input_operation text, input_handle text, input_binding text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb; binding text;
begin
  if input_operation is null or input_operation not in ('read','open')
    or (input_operation='read' and input_binding is not null)
    or (input_operation='open' and (input_binding is null or input_binding !~ '^[a-f0-9]{64}$')) then
    return jsonb_build_object('status','unavailable');
  end if;
  payload := api.resolve_public_identity(input_handle);
  if payload->>'status' is distinct from 'success' then return jsonb_build_object('status','unavailable'); end if;
  binding := encode(extensions.digest(payload::text,'sha256'),'hex');
  if input_operation='open' then
    if input_binding is distinct from binding or payload->'connection'->>'available' is distinct from 'true'
      or payload->'connection'->>'destination_url' is null then return jsonb_build_object('status','unavailable'); end if;
    return jsonb_build_object('status','success','destination_url',payload->'connection'->>'destination_url');
  end if;
  if payload->'connection' <> 'null'::jsonb then
    payload := jsonb_set(payload,'{connection}',((payload->'connection') - 'destination_url') || jsonb_build_object('binding',binding));
  end if;
  return payload;
end;
$$;
revoke all on function api.execute_public_identity_server(text,text,text) from public, anon, authenticated, service_role;
grant execute on function api.execute_public_identity_server(text,text,text) to service_role;
comment on function api.execute_public_identity_server(text,text,text) is
 'Fixed server-only Published Identity read / fresh snapshot-bound legacy Connection navigation. No raw or original-reader browser grants. Application admission mandatory.';
commit;

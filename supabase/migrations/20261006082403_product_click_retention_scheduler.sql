begin;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
revoke all on schema cron from public, anon, authenticated, service_role;

create function core.run_product_click_retention_tick()
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare intents_deleted integer; history_deleted integer; retention_job bigint;
begin
  if not pg_try_advisory_xact_lock(1936744812,1) then
    return jsonb_build_object('status','busy','intents_deleted',0,'history_deleted',0);
  end if;
  intents_deleted := api.cleanup_product_click_intents_server(500);
  select jobid into retention_job from cron.job
    where jobname='spall-product-click-retention-v1' and username='postgres';
  with expired as (
    select runid from cron.job_run_details where jobid=retention_job
      and status in ('succeeded','failed') and end_time<clock_timestamp()-interval '7 days'
    order by end_time,runid limit 500 for update skip locked
  ) delete from cron.job_run_details d using expired e where d.runid=e.runid;
  get diagnostics history_deleted = row_count;
  return jsonb_build_object('status','success','intents_deleted',intents_deleted,'history_deleted',history_deleted);
end;
$$;
revoke all on function core.run_product_click_retention_tick() from public, anon, authenticated, service_role;
do $$ begin
  if exists(select 1 from cron.job where jobname='spall-product-click-retention-v1') then
    raise exception 'Reserved Product retention job already exists';
  end if;
end; $$;
select cron.alter_job(cron.schedule('spall-product-click-retention-v1','* * * * *',
  'set statement_timeout = ''5s''; set lock_timeout = ''1s''; select core.run_product_click_retention_tick();'),active:=false);
comment on function core.run_product_click_retention_tick() is
  'Withheld database-only tick: try-lock, one bounded expired intent cleanup and own terminal cron history pruning. Registered cron job remains inactive; no production/public enabling.';
commit;

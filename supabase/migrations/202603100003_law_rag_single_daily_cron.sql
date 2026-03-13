create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-laws-rag-daily') then
    perform cron.unschedule('sync-laws-rag-daily');
  end if;

  if exists (select 1 from cron.job where jobname = 'process-rag-law-jobs-half-hour') then
    perform cron.unschedule('process-rag-law-jobs-half-hour');
  end if;
end;
$$;

select cron.schedule(
  'sync-laws-rag-daily',
  '10 2 * * *',
  $$
  select public.invoke_internal_edge_function(
    'sync-laws-rag',
    jsonb_build_object('force', false, 'max_laws', 1),
    300000
  );
  $$
);

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.get_runtime_secret(p_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets as ds
  where ds.name = p_name
  order by ds.updated_at desc nulls last, ds.created_at desc
  limit 1
$$;

revoke all on function public.get_runtime_secret(text) from public, anon, authenticated;
grant execute on function public.get_runtime_secret(text) to service_role;

create or replace function public.invoke_internal_edge_function(
  p_function_name text,
  p_body jsonb default '{}'::jsonb,
  p_timeout_milliseconds integer default 300000
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_edge_secret text;
begin
  v_project_url := public.get_runtime_secret('project_url');
  v_edge_secret := public.get_runtime_secret('rag_edge_secret');

  if v_project_url is null or v_project_url = '' then
    raise exception 'Missing project_url secret';
  end if;

  if v_edge_secret is null or v_edge_secret = '' then
    raise exception 'Missing rag_edge_secret secret';
  end if;

  return net.http_post(
    url := v_project_url || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-edge-secret', v_edge_secret
    ),
    body := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := coalesce(p_timeout_milliseconds, 300000)
  );
end;
$$;

revoke all on function public.invoke_internal_edge_function(text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.invoke_internal_edge_function(text, jsonb, integer) to service_role;

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

select cron.schedule(
  'process-rag-law-jobs-half-hour',
  '*/30 * * * *',
  $$
  select public.invoke_internal_edge_function(
    'process-rag-law-jobs',
    jsonb_build_object('limit', 1, 'max_chunks', 12),
    300000
  );
  $$
);

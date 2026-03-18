-- Legacy BOE cleanup playbook (safe-by-default)
-- Date: 2026-03-16
--
-- Default behavior:
-- - Runs diagnostics
-- - Creates backups only when corresponding flags are enabled
-- - Does NOT drop anything unless you explicitly flip flags to true

begin;

-- 1) Inventory: candidate legacy tables
select
  t.table_schema,
  t.table_name,
  c.reltuples::bigint as estimated_rows
from information_schema.tables t
left join pg_class c
  on c.relname = t.table_name
left join pg_namespace n
  on n.oid = c.relnamespace
 and n.nspname = t.table_schema
where t.table_schema = 'public'
  and t.table_name in ('boe_sync_log', 'leyes_boe', 'law_aliases')
order by t.table_name;

-- 2) Objects that depend on candidate tables (views/materialized views/tables/etc.)
with target_tables as (
  select c.oid, c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('boe_sync_log', 'leyes_boe', 'law_aliases')
)
select
  tt.relname as target_table,
  dn.nspname as dependent_schema,
  dc.relname as dependent_object,
  dc.relkind as dependent_kind
from pg_depend d
join target_tables tt on tt.oid = d.refobjid
join pg_class dc on dc.oid = d.objid
join pg_namespace dn on dn.oid = dc.relnamespace
where d.deptype in ('n', 'a', 'i')
order by 1, 2, 3;

-- 3) Functions that mention candidate tables in their definition
select
  n.nspname as function_schema,
  p.proname as function_name,
  p.oid::regprocedure::text as function_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and (
    pg_get_functiondef(p.oid) ilike '%boe_sync_log%'
    or pg_get_functiondef(p.oid) ilike '%leyes_boe%'
    or pg_get_functiondef(p.oid) ilike '%law_aliases%'
  )
order by 1, 2;

-- 4) BOE legacy cleanup (safe-by-default flags)
do $$
declare
  drop_boe_sync_log boolean := false; -- set true to drop public.boe_sync_log
  drop_leyes_boe boolean := false;    -- set true to drop public.leyes_boe if it exists
  drop_law_aliases boolean := false;  -- set true ONLY if resolve_law_alias and related flows are retired

  boe_fn_refs int := 0;
  leyes_fn_refs int := 0;
  aliases_fn_refs int := 0;
  backup_name text;
begin
  -- boe_sync_log
  if to_regclass('public.boe_sync_log') is not null then
    select count(*) into boe_fn_refs
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%boe_sync_log%';

    backup_name := format('boe_sync_log_backup_%s', to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS'));
    execute format('create table public.%I as table public.boe_sync_log with data', backup_name);
    raise notice 'Backup created for boe_sync_log: %', backup_name;

    if drop_boe_sync_log then
      if boe_fn_refs > 0 then
        raise exception 'Abort drop boe_sync_log: % function(s) still reference it', boe_fn_refs;
      end if;
      execute 'drop table public.boe_sync_log';
      raise notice 'Dropped public.boe_sync_log';
    else
      raise notice 'Skipped drop for public.boe_sync_log (drop_boe_sync_log=false)';
    end if;
  else
    raise notice 'public.boe_sync_log does not exist';
  end if;

  -- leyes_boe
  if to_regclass('public.leyes_boe') is not null then
    select count(*) into leyes_fn_refs
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%leyes_boe%';

    backup_name := format('leyes_boe_backup_%s', to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS'));
    execute format('create table public.%I as table public.leyes_boe with data', backup_name);
    raise notice 'Backup created for leyes_boe: %', backup_name;

    if drop_leyes_boe then
      if leyes_fn_refs > 0 then
        raise exception 'Abort drop leyes_boe: % function(s) still reference it', leyes_fn_refs;
      end if;
      execute 'drop table public.leyes_boe';
      raise notice 'Dropped public.leyes_boe';
    else
      raise notice 'Skipped drop for public.leyes_boe (drop_leyes_boe=false)';
    end if;
  else
    raise notice 'public.leyes_boe does not exist';
  end if;

  -- law_aliases (likely active if resolve_law_alias exists)
  if to_regclass('public.law_aliases') is not null then
    select count(*) into aliases_fn_refs
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%law_aliases%';

    if drop_law_aliases then
      if aliases_fn_refs > 0 then
        raise exception 'Abort drop law_aliases: % function(s) still reference it', aliases_fn_refs;
      end if;
      backup_name := format('law_aliases_backup_%s', to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS'));
      execute format('create table public.%I as table public.law_aliases with data', backup_name);
      raise notice 'Backup created for law_aliases: %', backup_name;

      execute 'drop table public.law_aliases';
      raise notice 'Dropped public.law_aliases';
    else
      raise notice 'Skipped drop for public.law_aliases (drop_law_aliases=false)';
    end if;
  else
    raise notice 'public.law_aliases does not exist';
  end if;
end $$;

commit;


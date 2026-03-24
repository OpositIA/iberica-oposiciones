begin;

-- Table to track BOE publications detected by the daily scanner.
-- One row per (boe_id, opposition_id) pair: tracks what was found,
-- what type of publication it is, and whether it changed the syllabus.
create table if not exists public.boe_daily_publications (
  id bigserial primary key,
  boe_id text not null,
  watchlist_id bigint references public.opposition_watchlist(id) on delete set null,
  opposition_id text references public.oppositions(id) on delete set null,
  title text not null,
  section_name text,
  department_name text,
  epigraph_name text,
  xml_url text,
  html_url text,
  published_at date,
  publication_type text not null default 'unknown',
  has_syllabus boolean not null default false,
  syllabus_changed boolean not null default false,
  syllabus_id bigint references public.opposition_syllabi(id) on delete set null,
  detection_details jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint boe_daily_pub_type_chk
    check (publication_type in (
      'convocatoria', 'bases', 'temario', 'plazas',
      'correccion', 'nombramiento', 'plazo', 'other', 'unknown'
    )),
  constraint boe_daily_pub_boe_opposition_uniq
    unique (boe_id, opposition_id)
);

create index if not exists boe_daily_pub_opposition_idx
  on public.boe_daily_publications(opposition_id, created_at desc);

create index if not exists boe_daily_pub_type_idx
  on public.boe_daily_publications(publication_type);

create index if not exists boe_daily_pub_published_at_idx
  on public.boe_daily_publications(published_at desc nulls last);

create index if not exists boe_daily_pub_syllabus_changed_idx
  on public.boe_daily_publications(syllabus_changed)
  where syllabus_changed = true;

-- RLS: internal tracking table, service_role only
alter table public.boe_daily_publications enable row level security;

-- Cron: scan BOE daily at 22:30 UTC (23:30 CET / 00:30 CEST)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'scan-boe-daily') then
    perform cron.unschedule('scan-boe-daily');
  end if;
end;
$$;

select cron.schedule(
  'scan-boe-daily',
  '30 22 * * *',
  $$
  select public.invoke_internal_edge_function(
    'scan-boe-daily',
    jsonb_build_object('dry_run', false),
    300000
  );
  $$
);

commit;

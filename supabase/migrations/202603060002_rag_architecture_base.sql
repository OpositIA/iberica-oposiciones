begin;

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.opposition_syllabi (
  id bigserial primary key,
  opposition_id text not null references public.oppositions(id) on delete cascade,
  boe_id text not null,
  source_url text not null,
  published_at date,
  extracted_at timestamptz not null default now(),
  sha256 text not null,
  raw_text text not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opposition_syllabi_sha256_chk check (char_length(sha256) = 64),
  constraint opposition_syllabi_raw_text_chk check (btrim(raw_text) <> ''),
  constraint opposition_syllabi_opposition_sha256_uniq unique (opposition_id, sha256)
);

alter table public.opposition_syllabi
  add column if not exists is_current boolean not null default true;

alter table public.opposition_topics
  add column if not exists syllabus_id bigint,
  add column if not exists topic_title text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'opposition_topics_syllabus_id_fkey'
      and conrelid = 'public.opposition_topics'::regclass
  ) then
    alter table public.opposition_topics
      add constraint opposition_topics_syllabus_id_fkey
      foreign key (syllabus_id)
      references public.opposition_syllabi(id)
      on delete cascade;
  end if;
end $$;

alter table public.opposition_subtopics
  add column if not exists syllabus_id bigint,
  add column if not exists topic_number integer,
  add column if not exists subtopic_title text,
  add column if not exists section_title text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'opposition_subtopics_syllabus_id_fkey'
      and conrelid = 'public.opposition_subtopics'::regclass
  ) then
    alter table public.opposition_subtopics
      add constraint opposition_subtopics_syllabus_id_fkey
      foreign key (syllabus_id)
      references public.opposition_syllabi(id)
      on delete cascade;
  end if;
end $$;

alter table public.opposition_subtopics
  drop constraint if exists opposition_subtopics_topic_number_chk;

alter table public.opposition_subtopics
  add constraint opposition_subtopics_topic_number_chk
  check (topic_number is null or topic_number > 0);

drop index if exists public.opposition_topics_unique_code_idx;
drop index if exists public.opposition_topics_unique_order_idx;

create unique index if not exists opposition_topics_legacy_code_uniq_idx
  on public.opposition_topics(opposition_id, topic_code)
  where syllabus_id is null;

create unique index if not exists opposition_topics_legacy_order_uniq_idx
  on public.opposition_topics(opposition_id, order_index, topic_code)
  where syllabus_id is null;

create unique index if not exists opposition_topics_syllabus_code_uniq_idx
  on public.opposition_topics(syllabus_id, topic_code)
  where syllabus_id is not null;

create index if not exists opposition_topics_syllabus_order_idx
  on public.opposition_topics(syllabus_id, order_index);

create index if not exists opposition_subtopics_syllabus_idx
  on public.opposition_subtopics(syllabus_id);

create index if not exists opposition_subtopics_syllabus_topic_number_idx
  on public.opposition_subtopics(syllabus_id, topic_number);

create unique index if not exists opposition_subtopics_syllabus_code_uniq_idx
  on public.opposition_subtopics(syllabus_id, subtopic_code)
  where syllabus_id is not null;

create index if not exists opposition_syllabi_opposition_current_idx
  on public.opposition_syllabi(opposition_id, is_current, published_at desc, extracted_at desc);

create index if not exists opposition_syllabi_boe_id_idx
  on public.opposition_syllabi(boe_id);

create table if not exists public.opposition_watchlist (
  id bigserial primary key,
  opposition_id text not null references public.oppositions(id) on delete cascade,
  label text not null,
  search_terms text[] not null default '{}'::text[],
  exclude_terms text[] not null default '{}'::text[],
  direct_boe_id text,
  direct_xml_url text,
  search_days_back integer not null default 7,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opposition_watchlist_search_days_back_chk
    check (search_days_back between 1 and 3650),
  constraint opposition_watchlist_input_chk
    check (
      coalesce(array_length(search_terms, 1), 0) > 0
      or direct_boe_id is not null
      or direct_xml_url is not null
    ),
  constraint opposition_watchlist_label_uniq unique (opposition_id, label)
);

create index if not exists opposition_watchlist_active_idx
  on public.opposition_watchlist(opposition_id, is_active);

create table if not exists public.law_watchlist (
  id bigserial primary key,
  boe_id text not null unique,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists law_watchlist_active_idx
  on public.law_watchlist(is_active, boe_id);

create table if not exists public.law_sync_log (
  boe_id text primary key,
  titulo_ley text,
  fecha_actualizacion text,
  fecha_iso date,
  url_norma text,
  eli text,
  chunks_total integer not null default 0,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint law_sync_log_chunks_total_chk check (chunks_total >= 0)
);

create index if not exists law_sync_log_fecha_iso_idx
  on public.law_sync_log(fecha_iso desc nulls last);

create index if not exists law_sync_log_last_sync_at_idx
  on public.law_sync_log(last_sync_at desc nulls last);

create table if not exists public.rag_sources (
  id bigserial primary key,
  source_type text not null,
  opposition_id text references public.oppositions(id) on delete set null,
  syllabus_id bigint references public.opposition_syllabi(id) on delete cascade,
  law_boe_id text,
  title text not null,
  source_url text not null,
  source_hash text not null,
  is_current boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rag_sources_source_type_chk
    check (source_type in ('syllabus', 'law')),
  constraint rag_sources_source_hash_chk
    check (char_length(source_hash) = 64),
  constraint rag_sources_target_chk
    check (
      (source_type = 'syllabus' and syllabus_id is not null and law_boe_id is null)
      or (source_type = 'law' and law_boe_id is not null)
    )
);

create unique index if not exists rag_sources_syllabus_hash_uniq_idx
  on public.rag_sources(syllabus_id, source_hash)
  where source_type = 'syllabus';

create unique index if not exists rag_sources_law_hash_uniq_idx
  on public.rag_sources(law_boe_id, source_hash)
  where source_type = 'law';

create index if not exists rag_sources_type_current_idx
  on public.rag_sources(source_type, is_current, created_at desc);

create index if not exists rag_sources_opposition_idx
  on public.rag_sources(opposition_id);

create index if not exists rag_sources_syllabus_idx
  on public.rag_sources(syllabus_id);

create index if not exists rag_sources_metadata_gin_idx
  on public.rag_sources using gin (metadata);

create table if not exists public.rag_chunks (
  id bigserial primary key,
  rag_source_id bigint not null references public.rag_sources(id) on delete cascade,
  opposition_id text references public.oppositions(id) on delete set null,
  syllabus_id bigint references public.opposition_syllabi(id) on delete set null,
  source_type text not null,
  chunk_index integer not null,
  title text,
  content text not null,
  content_hash text not null,
  embedding extensions.vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rag_chunks_source_type_chk
    check (source_type in ('syllabus', 'law')),
  constraint rag_chunks_content_hash_chk
    check (char_length(content_hash) = 64),
  constraint rag_chunks_content_chk
    check (btrim(content) <> ''),
  constraint rag_chunks_chunk_index_chk
    check (chunk_index >= 0),
  constraint rag_chunks_target_chk
    check (
      (source_type = 'syllabus' and syllabus_id is not null)
      or (source_type = 'law')
    ),
  constraint rag_chunks_source_chunk_uniq unique (rag_source_id, chunk_index)
);

create index if not exists rag_chunks_source_current_idx
  on public.rag_chunks(source_type, is_current, chunk_index);

create index if not exists rag_chunks_opposition_idx
  on public.rag_chunks(opposition_id);

create index if not exists rag_chunks_syllabus_idx
  on public.rag_chunks(syllabus_id);

create index if not exists rag_chunks_content_hash_idx
  on public.rag_chunks(content_hash);

create index if not exists rag_chunks_metadata_gin_idx
  on public.rag_chunks using gin (metadata);

create index if not exists rag_chunks_content_tsv_idx
  on public.rag_chunks using gin (to_tsvector('spanish', coalesce(title, '') || ' ' || content));

create index if not exists rag_chunks_embedding_hnsw_idx
  on public.rag_chunks using hnsw (embedding vector_cosine_ops);

create table if not exists public.rag_reindex_jobs (
  id bigserial primary key,
  source_type text not null,
  opposition_id text references public.oppositions(id) on delete set null,
  syllabus_id bigint references public.opposition_syllabi(id) on delete set null,
  rag_source_id bigint references public.rag_sources(id) on delete set null,
  law_boe_id text,
  status text not null default 'pending',
  reason text not null,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rag_reindex_jobs_source_type_chk
    check (source_type in ('syllabus', 'law')),
  constraint rag_reindex_jobs_status_chk
    check (status in ('pending', 'processing', 'done', 'error'))
);

create index if not exists rag_reindex_jobs_status_idx
  on public.rag_reindex_jobs(status, created_at);

create index if not exists rag_reindex_jobs_target_idx
  on public.rag_reindex_jobs(source_type, opposition_id, syllabus_id, law_boe_id);

alter table public.opposition_syllabi enable row level security;
alter table public.opposition_watchlist enable row level security;
alter table public.law_watchlist enable row level security;
alter table public.law_sync_log enable row level security;
alter table public.rag_sources enable row level security;
alter table public.rag_chunks enable row level security;
alter table public.rag_reindex_jobs enable row level security;

drop policy if exists "Public can read active opposition syllabi" on public.opposition_syllabi;
create policy "Public can read active opposition syllabi"
on public.opposition_syllabi
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.oppositions o
    where o.id = opposition_syllabi.opposition_id
      and o.is_active = true
  )
);

grant select on public.opposition_syllabi to anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.enforce_current_opposition_syllabus()
returns trigger
language plpgsql
as $$
begin
  if new.is_current then
    update public.opposition_syllabi
    set is_current = false,
        updated_at = now()
    where opposition_id = new.opposition_id
      and id <> new.id
      and is_current = true;

    update public.rag_sources rs
    set is_current = false,
        updated_at = now()
    where rs.source_type = 'syllabus'
      and rs.syllabus_id in (
        select s.id
        from public.opposition_syllabi s
        where s.opposition_id = new.opposition_id
          and s.id <> new.id
      )
      and rs.is_current = true;

    update public.rag_chunks rc
    set is_current = false,
        updated_at = now()
    where rc.source_type = 'syllabus'
      and rc.syllabus_id in (
        select s.id
        from public.opposition_syllabi s
        where s.opposition_id = new.opposition_id
          and s.id <> new.id
      )
      and rc.is_current = true;
  end if;

  return new;
end;
$$;

create or replace function public.set_current_opposition_syllabus(p_syllabus_id bigint)
returns public.opposition_syllabi
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.opposition_syllabi;
begin
  select *
  into v_target
  from public.opposition_syllabi
  where id = p_syllabus_id
  for update;

  if not found then
    raise exception 'opposition_syllabus % not found', p_syllabus_id;
  end if;

  update public.opposition_syllabi
  set is_current = false,
      updated_at = now()
  where opposition_id = v_target.opposition_id
    and id <> v_target.id
    and is_current = true;

  update public.opposition_syllabi
  set is_current = true,
      updated_at = now()
  where id = v_target.id;

  return (
    select s
    from public.opposition_syllabi s
    where s.id = v_target.id
  );
end;
$$;

create or replace function public.enforce_current_rag_source()
returns trigger
language plpgsql
as $$
begin
  if new.is_current then
    if new.source_type = 'syllabus' then
      update public.rag_sources
      set is_current = false,
          updated_at = now()
      where source_type = 'syllabus'
        and syllabus_id = new.syllabus_id
        and id <> new.id
        and is_current = true;

      update public.rag_chunks
      set is_current = false,
          updated_at = now()
      where rag_source_id in (
        select id
        from public.rag_sources
        where source_type = 'syllabus'
          and syllabus_id = new.syllabus_id
          and id <> new.id
      )
        and is_current = true;

      update public.rag_chunks
      set is_current = true,
          updated_at = now()
      where rag_source_id = new.id
        and is_current = false;

    elsif new.source_type = 'law' then
      update public.rag_sources
      set is_current = false,
          updated_at = now()
      where source_type = 'law'
        and law_boe_id = new.law_boe_id
        and id <> new.id
        and is_current = true;

      update public.rag_chunks
      set is_current = false,
          updated_at = now()
      where rag_source_id in (
        select id
        from public.rag_sources
        where source_type = 'law'
          and law_boe_id = new.law_boe_id
          and id <> new.id
      )
        and is_current = true;

      update public.rag_chunks
      set is_current = true,
          updated_at = now()
      where rag_source_id = new.id
        and is_current = false;
    end if;
  else
    update public.rag_chunks
    set is_current = false,
        updated_at = now()
    where rag_source_id = new.id
      and is_current = true;
  end if;

  return new;
end;
$$;

create or replace function public.set_current_rag_source(p_rag_source_id bigint)
returns public.rag_sources
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.rag_sources;
begin
  select *
  into v_target
  from public.rag_sources
  where id = p_rag_source_id
  for update;

  if not found then
    raise exception 'rag_source % not found', p_rag_source_id;
  end if;

  update public.rag_sources
  set is_current = true,
      updated_at = now()
  where id = v_target.id;

  return (
    select rs
    from public.rag_sources rs
    where rs.id = v_target.id
  );
end;
$$;

create or replace function public.sync_rag_chunk_from_source()
returns trigger
language plpgsql
as $$
declare
  v_source public.rag_sources;
begin
  select *
  into v_source
  from public.rag_sources
  where id = new.rag_source_id;

  if not found then
    raise exception 'rag_source % not found for chunk', new.rag_source_id;
  end if;

  new.source_type := v_source.source_type;
  new.opposition_id := v_source.opposition_id;
  new.syllabus_id := v_source.syllabus_id;
  new.is_current := v_source.is_current;

  return new;
end;
$$;

drop trigger if exists trg_opposition_syllabi_set_updated_at on public.opposition_syllabi;
create trigger trg_opposition_syllabi_set_updated_at
before update on public.opposition_syllabi
for each row
execute function public.set_updated_at();

drop trigger if exists trg_opposition_syllabi_current on public.opposition_syllabi;
create trigger trg_opposition_syllabi_current
after insert or update of is_current on public.opposition_syllabi
for each row
when (new.is_current = true)
execute function public.enforce_current_opposition_syllabus();

drop trigger if exists trg_opposition_watchlist_set_updated_at on public.opposition_watchlist;
create trigger trg_opposition_watchlist_set_updated_at
before update on public.opposition_watchlist
for each row
execute function public.set_updated_at();

drop trigger if exists trg_law_watchlist_set_updated_at on public.law_watchlist;
create trigger trg_law_watchlist_set_updated_at
before update on public.law_watchlist
for each row
execute function public.set_updated_at();

drop trigger if exists trg_law_sync_log_set_updated_at on public.law_sync_log;
create trigger trg_law_sync_log_set_updated_at
before update on public.law_sync_log
for each row
execute function public.set_updated_at();

drop trigger if exists trg_rag_sources_set_updated_at on public.rag_sources;
create trigger trg_rag_sources_set_updated_at
before update on public.rag_sources
for each row
execute function public.set_updated_at();

drop trigger if exists trg_rag_sources_current on public.rag_sources;
create trigger trg_rag_sources_current
after insert or update of is_current on public.rag_sources
for each row
execute function public.enforce_current_rag_source();

drop trigger if exists trg_rag_chunks_sync_from_source on public.rag_chunks;
create trigger trg_rag_chunks_sync_from_source
before insert or update of rag_source_id on public.rag_chunks
for each row
execute function public.sync_rag_chunk_from_source();

drop trigger if exists trg_rag_chunks_set_updated_at on public.rag_chunks;
create trigger trg_rag_chunks_set_updated_at
before update on public.rag_chunks
for each row
execute function public.set_updated_at();

drop trigger if exists trg_rag_reindex_jobs_set_updated_at on public.rag_reindex_jobs;
create trigger trg_rag_reindex_jobs_set_updated_at
before update on public.rag_reindex_jobs
for each row
execute function public.set_updated_at();

commit;

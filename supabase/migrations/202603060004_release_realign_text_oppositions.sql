begin;

do $$
begin
  if to_regclass('public.opposition_syllabi') is not null then
    alter table public.opposition_syllabi
      add column if not exists is_current boolean not null default true;

    alter table public.opposition_syllabi
      drop constraint if exists opposition_syllabi_opposition_id_fkey;

    alter table public.opposition_syllabi
      alter column opposition_id type text using opposition_id::text;

    alter table public.opposition_syllabi
      add constraint opposition_syllabi_opposition_id_fkey
      foreign key (opposition_id)
      references public.oppositions(id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if to_regclass('public.opposition_watchlist') is not null then
    alter table public.opposition_watchlist
      drop constraint if exists opposition_watchlist_opposition_id_fkey;

    alter table public.opposition_watchlist
      alter column opposition_id type text using opposition_id::text;

    alter table public.opposition_watchlist
      add constraint opposition_watchlist_opposition_id_fkey
      foreign key (opposition_id)
      references public.oppositions(id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if to_regclass('public.rag_sources') is not null then
    alter table public.rag_sources
      drop constraint if exists rag_sources_opposition_id_fkey;

    alter table public.rag_sources
      alter column opposition_id type text using opposition_id::text;

    alter table public.rag_sources
      add constraint rag_sources_opposition_id_fkey
      foreign key (opposition_id)
      references public.oppositions(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.rag_chunks') is not null then
    alter table public.rag_chunks
      drop constraint if exists rag_chunks_opposition_id_fkey;

    alter table public.rag_chunks
      alter column opposition_id type text using opposition_id::text;

    alter table public.rag_chunks
      add constraint rag_chunks_opposition_id_fkey
      foreign key (opposition_id)
      references public.oppositions(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.rag_reindex_jobs') is not null then
    alter table public.rag_reindex_jobs
      drop constraint if exists rag_reindex_jobs_opposition_id_fkey;

    alter table public.rag_reindex_jobs
      alter column opposition_id type text using opposition_id::text;

    alter table public.rag_reindex_jobs
      add constraint rag_reindex_jobs_opposition_id_fkey
      foreign key (opposition_id)
      references public.oppositions(id)
      on delete set null;
  end if;
end $$;

alter table public.opposition_topics
  drop constraint if exists opposition_topics_opposition_id_int_fkey;

drop index if exists public.opposition_topics_opposition_id_int_idx;

alter table public.opposition_topics
  drop column if exists opposition_id_int;

drop trigger if exists trg_opposition_topics_sync_ids on public.opposition_topics;
drop function if exists public.sync_opposition_topics_ids();

drop trigger if exists set_opposition_syllabi_updated_at on public.opposition_syllabi;
drop trigger if exists trg_opposition_syllabi_set_updated_at on public.opposition_syllabi;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_opposition_syllabi_set_updated_at
before update on public.opposition_syllabi
for each row
execute function public.set_updated_at();

commit;

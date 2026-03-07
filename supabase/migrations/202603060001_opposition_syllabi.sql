begin;

create table if not exists public.opposition_syllabi (
  id bigserial primary key,
  opposition_id text not null references public.oppositions(id) on delete cascade,
  boe_id text not null,
  source_url text not null,
  published_at date,
  extracted_at timestamptz not null default now(),
  sha256 text not null,
  raw_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opposition_syllabi_sha256_length_chk check (char_length(sha256) = 64),
  constraint opposition_syllabi_opposition_id_sha256_key unique (opposition_id, sha256)
);

create index if not exists opposition_syllabi_opposition_id_idx
  on public.opposition_syllabi(opposition_id);

create index if not exists opposition_syllabi_opposition_extracted_idx
  on public.opposition_syllabi(opposition_id, extracted_at desc);

create index if not exists opposition_syllabi_boe_id_idx
  on public.opposition_syllabi(boe_id);

create index if not exists opposition_syllabi_published_at_idx
  on public.opposition_syllabi(published_at desc nulls last);

alter table public.opposition_topics
  add column if not exists syllabus_id bigint references public.opposition_syllabi(id) on delete cascade,
  add column if not exists topic_title text;

alter table public.opposition_subtopics
  add column if not exists syllabus_id bigint references public.opposition_syllabi(id) on delete cascade,
  add column if not exists topic_number integer,
  add column if not exists subtopic_title text,
  add column if not exists section_title text;

alter table public.opposition_subtopics
  drop constraint if exists opposition_subtopics_topic_number_chk;

alter table public.opposition_subtopics
  add constraint opposition_subtopics_topic_number_chk
  check (topic_number is null or topic_number > 0);

drop index if exists public.opposition_topics_unique_code_idx;
drop index if exists public.opposition_topics_unique_order_idx;

create unique index if not exists opposition_topics_unique_legacy_code_idx
  on public.opposition_topics(opposition_id, topic_code)
  where syllabus_id is null;

create unique index if not exists opposition_topics_unique_legacy_order_idx
  on public.opposition_topics(opposition_id, order_index, topic_code)
  where syllabus_id is null;

create unique index if not exists opposition_topics_unique_syllabus_code_idx
  on public.opposition_topics(syllabus_id, topic_code)
  where syllabus_id is not null;

create unique index if not exists opposition_topics_unique_syllabus_order_idx
  on public.opposition_topics(syllabus_id, order_index, topic_code)
  where syllabus_id is not null;

create index if not exists opposition_topics_syllabus_id_idx
  on public.opposition_topics(syllabus_id);

create index if not exists opposition_topics_syllabus_order_idx
  on public.opposition_topics(syllabus_id, order_index);

create index if not exists opposition_subtopics_syllabus_id_idx
  on public.opposition_subtopics(syllabus_id);

create index if not exists opposition_subtopics_syllabus_topic_number_idx
  on public.opposition_subtopics(syllabus_id, topic_number);

create unique index if not exists opposition_subtopics_unique_syllabus_code_idx
  on public.opposition_subtopics(syllabus_id, subtopic_code)
  where syllabus_id is not null;

alter table public.opposition_syllabi enable row level security;

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

drop trigger if exists set_opposition_syllabi_updated_at on public.opposition_syllabi;
create trigger set_opposition_syllabi_updated_at
before update on public.opposition_syllabi
for each row
execute function public.set_profiles_updated_at();

commit;

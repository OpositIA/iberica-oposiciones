begin;

-- 1. Create dedicated table for test exam configs (one per syllabus)
create table if not exists public.opposition_test_exam_configs (
  id            bigint generated always as identity primary key,
  syllabus_id   bigint not null references public.opposition_syllabi(id) on delete cascade,
  opposition_id text   not null references public.oppositions(id) on delete cascade,

  exercise_label       text not null,
  system_scope         text,
  question_count       int,
  options_count        int,
  correct_answer_value numeric,
  wrong_answer_penalty numeric,
  blank_answer_penalty numeric,
  score_min            numeric,
  score_max            numeric,
  passing_score        numeric,
  duration_minutes     int,
  notes                text,
  source_excerpt       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint uq_test_exam_config_syllabus unique (syllabus_id)
);

-- Index for fast lookup by opposition
create index if not exists idx_test_exam_config_opposition
  on public.opposition_test_exam_configs(opposition_id);

-- RLS
alter table public.opposition_test_exam_configs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'opposition_test_exam_configs' and policyname = 'Public read access'
  ) then
    create policy "Public read access"
      on public.opposition_test_exam_configs for select
      using (true);
  end if;
end $$;

-- Drop old columns from opposition_syllabi (data already migrated or re-inserted manually)
alter table public.opposition_syllabi
  drop constraint if exists opposition_syllabi_test_exam_configs_type_chk,
  drop constraint if exists opposition_syllabi_primary_test_exam_config_type_chk;

alter table public.opposition_syllabi
  drop column if exists test_exam_configs,
  drop column if exists primary_test_exam_config;

commit;

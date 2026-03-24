begin;

alter table public.opposition_syllabi
  add column if not exists document_title text,
  add column if not exists test_exam_configs jsonb not null default '[]'::jsonb,
  add column if not exists primary_test_exam_config jsonb,
  add column if not exists extraction_provider text,
  add column if not exists extraction_model text,
  add column if not exists extraction_notes jsonb not null default '{}'::jsonb;

alter table public.opposition_syllabi
  drop constraint if exists opposition_syllabi_test_exam_configs_type_chk;

alter table public.opposition_syllabi
  add constraint opposition_syllabi_test_exam_configs_type_chk
  check (jsonb_typeof(test_exam_configs) = 'array');

alter table public.opposition_syllabi
  drop constraint if exists opposition_syllabi_primary_test_exam_config_type_chk;

alter table public.opposition_syllabi
  add constraint opposition_syllabi_primary_test_exam_config_type_chk
  check (
    primary_test_exam_config is null
    or jsonb_typeof(primary_test_exam_config) = 'object'
  );

alter table public.opposition_syllabi
  drop constraint if exists opposition_syllabi_extraction_notes_type_chk;

alter table public.opposition_syllabi
  add constraint opposition_syllabi_extraction_notes_type_chk
  check (jsonb_typeof(extraction_notes) = 'object');

commit;

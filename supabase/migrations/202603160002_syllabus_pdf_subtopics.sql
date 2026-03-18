drop function if exists public.get_current_paid_syllabus_topic_files(text);

drop trigger if exists trg_opposition_topic_files_set_updated_at on public.opposition_topic_files;

alter table if exists public.opposition_topic_files
  rename to opposition_subtopic_files;

alter table if exists public.opposition_subtopic_files
  rename column topic_code to subtopic_code;

alter table public.opposition_subtopic_files
  add column if not exists subtopic_id bigint references public.opposition_subtopics(id) on delete cascade;

alter table public.opposition_subtopic_files
  alter column subtopic_id set not null;

alter table public.opposition_subtopic_files
  drop constraint if exists opposition_topic_files_syllabus_topic_path_uniq;

alter table public.opposition_subtopic_files
  add constraint opposition_subtopic_files_syllabus_subtopic_path_uniq
  unique (syllabus_id, subtopic_id, storage_path);

alter table public.opposition_subtopic_files
  drop constraint if exists opposition_topic_files_topic_code_chk;

alter table public.opposition_subtopic_files
  add constraint opposition_subtopic_files_subtopic_code_chk
  check (btrim(subtopic_code) <> '');

drop index if exists opposition_topic_files_syllabus_topic_idx;
drop index if exists opposition_topic_files_opposition_idx;

create index if not exists opposition_subtopic_files_syllabus_subtopic_idx
  on public.opposition_subtopic_files(syllabus_id, subtopic_id, sort_order, created_at);

create index if not exists opposition_subtopic_files_opposition_idx
  on public.opposition_subtopic_files(opposition_id, is_active, created_at desc);

create index if not exists opposition_subtopic_files_subtopic_code_idx
  on public.opposition_subtopic_files(subtopic_code, is_active);

create or replace function public.get_current_paid_syllabus_subtopic_files(
  p_opposition_id text
)
returns table(
  id bigint,
  subtopic_id bigint,
  subtopic_code text,
  file_name text,
  file_title text,
  mime_type text,
  file_size_bytes bigint,
  sort_order integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := auth.role();
  v_is_paid boolean := false;
begin
  if v_actor is null then
    if coalesce(v_role, '') <> 'service_role' then
      raise exception 'Not authorized';
    end if;
  else
    select plan.is_paid
    into v_is_paid
    from public.get_user_plan_state_internal(v_actor) as plan;

    if coalesce(v_is_paid, false) = false then
      return;
    end if;
  end if;

  return query
  select
    f.id,
    f.subtopic_id,
    f.subtopic_code,
    f.file_name,
    f.file_title,
    f.mime_type,
    f.file_size_bytes,
    f.sort_order
  from public.opposition_subtopic_files f
  join public.opposition_syllabi s on s.id = f.syllabus_id
  where f.opposition_id = p_opposition_id
    and f.is_active = true
    and s.is_current = true
  order by f.subtopic_id asc, f.sort_order asc, f.file_name asc;
end;
$$;

revoke all on function public.get_current_paid_syllabus_subtopic_files(text) from public;
grant execute on function public.get_current_paid_syllabus_subtopic_files(text) to authenticated;
grant execute on function public.get_current_paid_syllabus_subtopic_files(text) to service_role;

drop trigger if exists trg_opposition_subtopic_files_set_updated_at on public.opposition_subtopic_files;
create trigger trg_opposition_subtopic_files_set_updated_at
before update on public.opposition_subtopic_files
for each row
execute function public.set_updated_at();

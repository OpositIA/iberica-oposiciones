insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'syllabus-pdfs',
  'syllabus-pdfs',
  false,
  52428800,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.opposition_topic_files (
  id bigserial primary key,
  opposition_id text not null references public.oppositions(id) on delete cascade,
  syllabus_id bigint not null references public.opposition_syllabi(id) on delete cascade,
  topic_code text not null,
  file_name text not null,
  file_title text,
  storage_bucket text not null default 'syllabus-pdfs',
  storage_path text not null,
  mime_type text not null default 'application/pdf',
  file_size_bytes bigint,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opposition_topic_files_bucket_chk
    check (storage_bucket = 'syllabus-pdfs'),
  constraint opposition_topic_files_topic_code_chk
    check (btrim(topic_code) <> ''),
  constraint opposition_topic_files_file_name_chk
    check (btrim(file_name) <> ''),
  constraint opposition_topic_files_storage_path_chk
    check (btrim(storage_path) <> ''),
  constraint opposition_topic_files_mime_type_chk
    check (mime_type = 'application/pdf'),
  constraint opposition_topic_files_file_size_chk
    check (file_size_bytes is null or file_size_bytes > 0),
  constraint opposition_topic_files_sort_order_chk
    check (sort_order >= 0),
  constraint opposition_topic_files_syllabus_topic_path_uniq
    unique (syllabus_id, topic_code, storage_path)
);

create index if not exists opposition_topic_files_syllabus_topic_idx
  on public.opposition_topic_files(syllabus_id, topic_code, sort_order, created_at);

create index if not exists opposition_topic_files_opposition_idx
  on public.opposition_topic_files(opposition_id, is_active, created_at desc);

alter table public.opposition_topic_files enable row level security;

create or replace function public.get_current_paid_syllabus_topic_files(
  p_opposition_id text
)
returns table(
  id bigint,
  topic_code text,
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
    f.topic_code,
    f.file_name,
    f.file_title,
    f.mime_type,
    f.file_size_bytes,
    f.sort_order
  from public.opposition_topic_files f
  join public.opposition_syllabi s on s.id = f.syllabus_id
  where f.opposition_id = p_opposition_id
    and f.is_active = true
    and s.is_current = true
  order by f.topic_code asc, f.sort_order asc, f.file_name asc;
end;
$$;

revoke all on function public.get_current_paid_syllabus_topic_files(text) from public;
grant execute on function public.get_current_paid_syllabus_topic_files(text) to authenticated;
grant execute on function public.get_current_paid_syllabus_topic_files(text) to service_role;

drop trigger if exists trg_opposition_topic_files_set_updated_at on public.opposition_topic_files;
create trigger trg_opposition_topic_files_set_updated_at
before update on public.opposition_topic_files
for each row
execute function public.set_updated_at();

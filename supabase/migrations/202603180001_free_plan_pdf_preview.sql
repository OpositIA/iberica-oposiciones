create or replace function public.get_current_syllabus_subtopic_files(
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
begin
  if v_actor is null and coalesce(v_role, '') <> 'service_role' then
    raise exception 'Not authorized';
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

revoke all on function public.get_current_syllabus_subtopic_files(text) from public;
grant execute on function public.get_current_syllabus_subtopic_files(text) to authenticated;
grant execute on function public.get_current_syllabus_subtopic_files(text) to service_role;

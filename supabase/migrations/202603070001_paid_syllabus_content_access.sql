create or replace function public.get_current_paid_syllabus_content(
  p_opposition_id text
)
returns table(
  raw_text text,
  source_url text,
  published_at date
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
    s.raw_text,
    s.source_url,
    s.published_at
  from public.opposition_syllabi s
  where s.opposition_id = p_opposition_id
    and s.is_current = true
  order by s.published_at desc nulls last, s.extracted_at desc
  limit 1;
end;
$$;

revoke all on function public.get_current_paid_syllabus_content(text) from public;
grant execute on function public.get_current_paid_syllabus_content(text) to authenticated;
grant execute on function public.get_current_paid_syllabus_content(text) to service_role;

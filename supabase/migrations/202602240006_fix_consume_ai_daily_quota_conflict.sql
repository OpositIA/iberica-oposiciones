create or replace function public.consume_ai_daily_quota(
  p_user_id uuid,
  p_limit integer default null,
  p_tz text default 'Europe/Madrid'
)
returns table(
  allowed boolean,
  remaining integer,
  used integer,
  "limit" integer,
  day date
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
  v_role text := auth.role();
  v_day date := (timezone(p_tz, now()))::date;
  v_used integer;
  v_allowed boolean := false;
  v_effective_limit integer;
begin
  v_effective_limit := coalesce(p_limit, public.get_ai_daily_limit(p_user_id));

  if v_effective_limit < 1 then
    raise exception 'p_limit must be >= 1';
  end if;

  if v_actor is null then
    if coalesce(v_role, '') <> 'service_role' then
      raise exception 'Not authorized';
    end if;
  else
    p_user_id := v_actor;
  end if;

  insert into public.ai_daily_usage (user_id, day, requests_used)
  values (p_user_id, v_day, 0)
  on conflict (user_id, day) do nothing;

  update public.ai_daily_usage as d
  set requests_used = d.requests_used + 1,
      updated_at = now()
  where d.user_id = p_user_id
    and d.day = v_day
    and d.requests_used < v_effective_limit
  returning d.requests_used into v_used;

  if found then
    v_allowed := true;
  else
    select d.requests_used
    into v_used
    from public.ai_daily_usage as d
    where d.user_id = p_user_id
      and d.day = v_day;
  end if;

  return query
  select
    v_allowed,
    greatest(v_effective_limit - coalesce(v_used, 0), 0),
    coalesce(v_used, 0),
    v_effective_limit,
    v_day;
end;
$$;

revoke all on function public.consume_ai_daily_quota(uuid, integer, text) from public;
grant execute on function public.consume_ai_daily_quota(uuid, integer, text) to authenticated;
grant execute on function public.consume_ai_daily_quota(uuid, integer, text) to service_role;

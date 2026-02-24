create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests_used integer not null default 0 check (requests_used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists ai_daily_usage_day_idx
  on public.ai_daily_usage (day desc);

alter table public.ai_daily_usage enable row level security;

drop policy if exists "Users can view their own ai daily usage" on public.ai_daily_usage;
create policy "Users can view their own ai daily usage"
on public.ai_daily_usage
for select
using (auth.uid() = user_id);

create or replace function public.consume_ai_daily_quota(
  p_user_id uuid,
  p_limit integer default 20,
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
declare
  v_actor uuid := auth.uid();
  v_role text := auth.role();
  v_day date := (timezone(p_tz, now()))::date;
  v_used integer;
  v_allowed boolean := false;
begin
  if p_limit < 1 then
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

  update public.ai_daily_usage
  set requests_used = requests_used + 1,
      updated_at = now()
  where user_id = p_user_id
    and day = v_day
    and requests_used < p_limit
  returning requests_used into v_used;

  if found then
    v_allowed := true;
  else
    select requests_used
    into v_used
    from public.ai_daily_usage
    where user_id = p_user_id
      and day = v_day;
  end if;

  return query
  select
    v_allowed,
    greatest(p_limit - coalesce(v_used, 0), 0),
    coalesce(v_used, 0),
    p_limit,
    v_day;
end;
$$;

revoke all on function public.consume_ai_daily_quota(uuid, integer, text) from public;
grant execute on function public.consume_ai_daily_quota(uuid, integer, text) to authenticated;
grant execute on function public.consume_ai_daily_quota(uuid, integer, text) to service_role;

create table if not exists public.ai_quota_settings (
  key text primary key,
  value_int integer not null check (value_int >= 1),
  updated_at timestamptz not null default now()
);

insert into public.ai_quota_settings (key, value_int)
values
  ('paid_plan_daily_limit', 10),
  ('default_daily_limit', 10)
on conflict (key) do update
set value_int = excluded.value_int,
    updated_at = now();

revoke all on table public.ai_quota_settings from public;
revoke all on table public.ai_quota_settings from anon;
revoke all on table public.ai_quota_settings from authenticated;

create or replace function public.get_ai_daily_limit(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := auth.role();
  v_meta jsonb := '{}'::jsonb;
  v_plan text := '';
  v_status text := '';
  v_is_paid boolean := false;
  v_limit integer;
begin
  if v_actor is null then
    if coalesce(v_role, '') <> 'service_role' then
      raise exception 'Not authorized';
    end if;
  else
    p_user_id := v_actor;
  end if;

  select coalesce(raw_user_meta_data, '{}'::jsonb)
  into v_meta
  from auth.users
  where id = p_user_id;

  v_plan := lower(
    coalesce(
      v_meta ->> 'plan',
      v_meta ->> 'plan_name',
      v_meta ->> 'subscription_plan',
      ''
    )
  );
  v_status := lower(
    coalesce(
      v_meta ->> 'subscription_status',
      v_meta ->> 'billing_status',
      ''
    )
  );

  v_is_paid :=
    lower(coalesce(v_meta ->> 'is_paid', '')) in ('true', '1', 'yes')
    or v_plan in ('pro', 'profesional', 'elite', 'paid', 'pago')
    or v_status in ('active', 'trialing', 'paid');

  select value_int
  into v_limit
  from public.ai_quota_settings
  where key = case when v_is_paid then 'paid_plan_daily_limit' else 'default_daily_limit' end;

  return coalesce(v_limit, 10);
end;
$$;

create or replace function public.get_ai_daily_quota(
  p_user_id uuid,
  p_tz text default 'Europe/Madrid'
)
returns table(
  used integer,
  "limit" integer,
  remaining integer,
  day date,
  is_paid boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := auth.role();
  v_day date := (timezone(p_tz, now()))::date;
  v_used integer := 0;
  v_limit integer := 10;
  v_meta jsonb := '{}'::jsonb;
  v_is_paid boolean := false;
begin
  if v_actor is null then
    if coalesce(v_role, '') <> 'service_role' then
      raise exception 'Not authorized';
    end if;
  else
    p_user_id := v_actor;
  end if;

  v_limit := public.get_ai_daily_limit(p_user_id);

  select coalesce(requests_used, 0)
  into v_used
  from public.ai_daily_usage
  where user_id = p_user_id
    and day = v_day;

  select coalesce(raw_user_meta_data, '{}'::jsonb)
  into v_meta
  from auth.users
  where id = p_user_id;

  v_is_paid :=
    lower(coalesce(v_meta ->> 'is_paid', '')) in ('true', '1', 'yes')
    or lower(coalesce(v_meta ->> 'plan', v_meta ->> 'plan_name', v_meta ->> 'subscription_plan', ''))
      in ('pro', 'profesional', 'elite', 'paid', 'pago')
    or lower(coalesce(v_meta ->> 'subscription_status', v_meta ->> 'billing_status', ''))
      in ('active', 'trialing', 'paid');

  return query
  select
    v_used,
    v_limit,
    greatest(v_limit - v_used, 0),
    v_day,
    v_is_paid;
end;
$$;

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

  update public.ai_daily_usage
  set requests_used = requests_used + 1,
      updated_at = now()
  where user_id = p_user_id
    and day = v_day
    and requests_used < v_effective_limit
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
    greatest(v_effective_limit - coalesce(v_used, 0), 0),
    coalesce(v_used, 0),
    v_effective_limit,
    v_day;
end;
$$;

revoke all on function public.get_ai_daily_limit(uuid) from public;
grant execute on function public.get_ai_daily_limit(uuid) to authenticated;
grant execute on function public.get_ai_daily_limit(uuid) to service_role;

revoke all on function public.get_ai_daily_quota(uuid, text) from public;
grant execute on function public.get_ai_daily_quota(uuid, text) to authenticated;
grant execute on function public.get_ai_daily_quota(uuid, text) to service_role;

revoke all on function public.consume_ai_daily_quota(uuid, integer, text) from public;
grant execute on function public.consume_ai_daily_quota(uuid, integer, text) to authenticated;
grant execute on function public.consume_ai_daily_quota(uuid, integer, text) to service_role;

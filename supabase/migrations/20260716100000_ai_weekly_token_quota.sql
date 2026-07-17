-- Cuota semanal de IA por tokens ponderados (entrada x1, salida x2).
-- Sustituye la cuota diaria por numero de preguntas: cada peticion descuenta
-- los tokens reales que consume, de modo que preguntas cortas gastan menos.
--
-- Limite por defecto: 2.500.000 tokens ponderados/semana.
-- Con deepseek/deepseek-v4-flash (0,09 $/M entrada, 0,18 $/M salida) el token
-- ponderado cuesta 0,09 $/M, asi que el gasto maximo por usuario es
-- 2,5M x 0,09 $/M x 4,345 semanas/mes = 0,98 $/mes (~0,90 EUR/mes).
-- La semana empieza el lunes (date_trunc('week')) en la zona horaria indicada.

create table if not exists public.ai_weekly_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  tokens_used bigint not null default 0 check (tokens_used >= 0),
  requests_used integer not null default 0 check (requests_used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create index if not exists ai_weekly_usage_week_idx
  on public.ai_weekly_usage (week_start desc);

alter table public.ai_weekly_usage enable row level security;

drop policy if exists "Users can view their own ai weekly usage" on public.ai_weekly_usage;
create policy "Users can view their own ai weekly usage"
on public.ai_weekly_usage
for select
using (auth.uid() = user_id);

-- Limites configurables sin desplegar codigo (misma tabla que la cuota diaria).
-- "do nothing" para no pisar valores ajustados a mano si se re-ejecuta.
insert into public.ai_quota_settings (key, value_int)
values
  ('default_weekly_token_limit', 2500000),
  ('paid_weekly_token_limit', 2500000)
on conflict (key) do nothing;

create or replace function public.get_ai_weekly_token_limit(
  p_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := auth.role();
  v_meta jsonb := '{}'::jsonb;
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

  v_is_paid :=
    lower(coalesce(v_meta ->> 'is_paid', '')) in ('true', '1', 'yes')
    or lower(coalesce(v_meta ->> 'plan', v_meta ->> 'plan_name', v_meta ->> 'subscription_plan', ''))
      in ('pro', 'profesional', 'elite', 'paid', 'pago')
    or lower(coalesce(v_meta ->> 'subscription_status', v_meta ->> 'billing_status', ''))
      in ('active', 'trialing', 'paid');

  select value_int
  into v_limit
  from public.ai_quota_settings
  where key = case
    when v_is_paid then 'paid_weekly_token_limit'
    else 'default_weekly_token_limit'
  end;

  return coalesce(v_limit, 2500000)::bigint;
end;
$$;

create or replace function public.get_ai_weekly_quota(
  p_user_id uuid,
  p_tz text default 'Europe/Madrid'
)
returns table(
  allowed boolean,
  used bigint,
  "limit" bigint,
  remaining bigint,
  percent_used numeric,
  week_start date,
  is_paid boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := auth.role();
  v_week date := (date_trunc('week', timezone(p_tz, now())))::date;
  v_used bigint := 0;
  v_limit bigint;
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

  v_limit := public.get_ai_weekly_token_limit(p_user_id);

  select coalesce(u.tokens_used, 0)
  into v_used
  from public.ai_weekly_usage as u
  where u.user_id = p_user_id
    and u.week_start = v_week;

  v_used := coalesce(v_used, 0);

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
    v_used < v_limit,
    v_used,
    v_limit,
    greatest(v_limit - v_used, 0),
    least(100, round(v_used * 100.0 / greatest(v_limit, 1), 1)),
    v_week,
    v_is_paid;
end;
$$;

-- Registra el consumo real de una peticion (solo backend con service_role).
create or replace function public.record_ai_weekly_usage(
  p_user_id uuid,
  p_tokens bigint,
  p_tz text default 'Europe/Madrid'
)
returns table(
  allowed boolean,
  used bigint,
  "limit" bigint,
  remaining bigint,
  percent_used numeric,
  week_start date
)
language plpgsql
security definer
set search_path = public
as $$
-- Las columnas de RETURNS TABLE (p.ej. week_start) son variables PL/pgSQL y
-- chocan con las columnas homónimas del INSERT/ON CONFLICT sin esta directiva.
#variable_conflict use_column
declare
  v_role text := auth.role();
  v_week date := (date_trunc('week', timezone(p_tz, now())))::date;
  v_tokens bigint := greatest(coalesce(p_tokens, 0), 0);
  v_used bigint := 0;
  v_limit bigint;
begin
  if coalesce(v_role, '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  v_limit := public.get_ai_weekly_token_limit(p_user_id);

  insert into public.ai_weekly_usage as u
    (user_id, week_start, tokens_used, requests_used)
  values (p_user_id, v_week, v_tokens, 1)
  on conflict (user_id, week_start) do update
  set tokens_used = u.tokens_used + excluded.tokens_used,
      requests_used = u.requests_used + 1,
      updated_at = now()
  returning u.tokens_used into v_used;

  return query
  select
    v_used < v_limit,
    v_used,
    v_limit,
    greatest(v_limit - v_used, 0),
    least(100, round(v_used * 100.0 / greatest(v_limit, 1), 1)),
    v_week;
end;
$$;

revoke all on function public.get_ai_weekly_token_limit(uuid) from public;
grant execute on function public.get_ai_weekly_token_limit(uuid) to authenticated;
grant execute on function public.get_ai_weekly_token_limit(uuid) to service_role;

revoke all on function public.get_ai_weekly_quota(uuid, text) from public;
grant execute on function public.get_ai_weekly_quota(uuid, text) to authenticated;
grant execute on function public.get_ai_weekly_quota(uuid, text) to service_role;

-- Ojo: los default privileges de Supabase conceden EXECUTE a authenticated/anon
-- al crear la función; "from public" no basta, hay que revocarlos explícitamente.
revoke all on function public.record_ai_weekly_usage(uuid, bigint, text) from public;
revoke all on function public.record_ai_weekly_usage(uuid, bigint, text) from authenticated;
revoke all on function public.record_ai_weekly_usage(uuid, bigint, text) from anon;
grant execute on function public.record_ai_weekly_usage(uuid, bigint, text) to service_role;

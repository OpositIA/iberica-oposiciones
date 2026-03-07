create table if not exists public.subscription_plans (
  code text primary key,
  name text not null,
  tier text not null check (tier in ('free', 'pro')),
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'EUR',
  description text,
  ai_daily_limit integer not null check (ai_daily_limit between 1 and 500),
  quick_test_question_limit integer not null check (quick_test_question_limit between 1 and 100),
  is_active boolean not null default true,
  is_public boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscription_plans_single_default_idx
  on public.subscription_plans (is_default)
  where is_default;

drop trigger if exists set_subscription_plans_updated_at on public.subscription_plans;
create trigger set_subscription_plans_updated_at
before update on public.subscription_plans
for each row execute procedure public.set_timestamp_updated_at();

alter table public.subscription_plans enable row level security;

drop policy if exists "Public can read active subscription plans" on public.subscription_plans;
create policy "Public can read active subscription plans"
on public.subscription_plans
for select
using (is_public and is_active);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_code text not null references public.subscription_plans (code) on delete restrict,
  status text not null check (status in ('active', 'trialing', 'pending', 'canceled', 'expired', 'past_due')),
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  provider text not null default 'manual',
  provider_reference text,
  selected_at timestamptz not null default now(),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_subscriptions_user_status_idx
  on public.user_subscriptions (user_id, status, created_at desc);

create unique index if not exists user_subscriptions_one_live_per_user_idx
  on public.user_subscriptions (user_id)
  where status in ('active', 'trialing', 'pending');

drop trigger if exists set_user_subscriptions_updated_at on public.user_subscriptions;
create trigger set_user_subscriptions_updated_at
before update on public.user_subscriptions
for each row execute procedure public.set_timestamp_updated_at();

alter table public.user_subscriptions enable row level security;

drop policy if exists "Users can read own subscriptions" on public.user_subscriptions;
create policy "Users can read own subscriptions"
on public.user_subscriptions
for select
using (auth.uid() = user_id);

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text,
  percent_off integer not null check (percent_off between 1 and 100),
  duration_months integer check (duration_months is null or duration_months > 0),
  applicable_plan_code text references public.subscription_plans (code) on delete set null,
  applicable_billing_interval text check (
    applicable_billing_interval is null
    or applicable_billing_interval in ('monthly', 'yearly')
  ),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.normalize_discount_code(value text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(btrim(coalesce(value, '')), '[^A-Za-z0-9_-]+', '', 'g'));
$$;

create unique index if not exists discount_codes_normalized_code_idx
  on public.discount_codes (public.normalize_discount_code(code));

drop trigger if exists set_discount_codes_updated_at on public.discount_codes;
create trigger set_discount_codes_updated_at
before update on public.discount_codes
for each row execute procedure public.set_timestamp_updated_at();

alter table public.discount_codes enable row level security;

create table if not exists public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references public.discount_codes (id) on delete cascade,
  subscription_id uuid not null references public.user_subscriptions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  percent_off integer not null check (percent_off between 1 and 100),
  duration_months integer check (duration_months is null or duration_months > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists discount_redemptions_user_code_idx
  on public.discount_redemptions (user_id, discount_code_id);

create index if not exists discount_redemptions_subscription_idx
  on public.discount_redemptions (subscription_id, starts_at desc);

alter table public.discount_redemptions enable row level security;

drop policy if exists "Users can read own discount redemptions" on public.discount_redemptions;
create policy "Users can read own discount redemptions"
on public.discount_redemptions
for select
using (auth.uid() = user_id);

insert into public.subscription_plans (
  code,
  name,
  tier,
  billing_interval,
  price_cents,
  currency,
  description,
  ai_daily_limit,
  quick_test_question_limit,
  is_active,
  is_public,
  is_default,
  sort_order
)
values
  (
    'free-monthly',
    'Gratis',
    'free',
    'monthly',
    0,
    'EUR',
    'Plan gratuito con limites diarios para IA y tests rapidos.',
    3,
    20,
    true,
    true,
    true,
    10
  ),
  (
    'pro-monthly',
    'Pro Mensual',
    'pro',
    'monthly',
    1900,
    'EUR',
    'Plan mensual con acceso ampliado a IA y tests rapidos.',
    20,
    100,
    true,
    true,
    false,
    20
  )
on conflict (code) do update
set
  name = excluded.name,
  tier = excluded.tier,
  billing_interval = excluded.billing_interval,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  description = excluded.description,
  ai_daily_limit = excluded.ai_daily_limit,
  quick_test_question_limit = excluded.quick_test_question_limit,
  is_active = excluded.is_active,
  is_public = excluded.is_public,
  is_default = excluded.is_default,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function public.is_legacy_paid_user(metadata jsonb)
returns boolean
language sql
immutable
as $$
  select
    lower(coalesce(metadata ->> 'is_paid', '')) in ('true', '1', 'yes')
    or lower(coalesce(metadata ->> 'plan', metadata ->> 'plan_name', metadata ->> 'subscription_plan', ''))
      in ('pro', 'profesional', 'elite', 'paid', 'pago', 'pro-monthly')
    or lower(coalesce(metadata ->> 'subscription_status', metadata ->> 'billing_status', ''))
      in ('active', 'trialing', 'paid');
$$;

create or replace function public.sync_user_subscription_metadata(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
begin
  select
    sp.code,
    sp.name,
    sp.tier,
    sp.billing_interval,
    us.status
  into v_plan
  from public.subscription_plans sp
  join public.user_subscriptions us
    on us.plan_code = sp.code
  where us.user_id = p_user_id
    and us.status in ('active', 'trialing', 'pending')
  order by
    case us.status
      when 'active' then 0
      when 'trialing' then 1
      else 2
    end,
    us.selected_at desc,
    us.created_at desc
  limit 1;

  if not found then
    select
      sp.code,
      sp.name,
      sp.tier,
      sp.billing_interval,
      'active'::text as status
    into v_plan
    from public.subscription_plans sp
    where sp.code = 'free-monthly'
    limit 1;
  end if;

  if not found then
    return;
  end if;

  update auth.users
  set raw_user_meta_data =
    coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'plan', v_plan.tier,
      'plan_name', v_plan.name,
      'subscription_plan', v_plan.code,
      'selected_plan_code', v_plan.code,
      'billing_interval', v_plan.billing_interval,
      'subscription_status', v_plan.status,
      'is_paid', (v_plan.tier <> 'free')
    )
  where id = p_user_id;
end;
$$;

create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested_plan_code text := lower(
    coalesce(
      nullif(btrim(coalesce(metadata ->> 'selected_plan_code', '')), ''),
      nullif(btrim(coalesce(metadata ->> 'subscription_plan', '')), ''),
      case
        when public.is_legacy_paid_user(metadata) then 'pro-monthly'
        else 'free-monthly'
      end
    )
  );
  selected_plan public.subscription_plans%rowtype;
  current_period_end timestamptz;
begin
  select *
  into selected_plan
  from public.subscription_plans
  where code = requested_plan_code
    and is_active
  limit 1;

  if not found then
    select *
    into selected_plan
    from public.subscription_plans
    where code = 'free-monthly'
    limit 1;
  end if;

  if not found then
    return new;
  end if;

  if exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = new.id
      and us.status in ('active', 'trialing', 'pending')
  ) then
    perform public.sync_user_subscription_metadata(new.id);
    return new;
  end if;

  current_period_end :=
    case selected_plan.billing_interval
      when 'monthly' then
        case when selected_plan.price_cents > 0 then now() + interval '1 month' else null end
      when 'yearly' then
        case when selected_plan.price_cents > 0 then now() + interval '1 year' else null end
      else null
    end;

  insert into public.user_subscriptions (
    user_id,
    plan_code,
    status,
    billing_interval,
    provider,
    selected_at,
    current_period_start,
    current_period_end,
    metadata
  )
  values (
    new.id,
    selected_plan.code,
    'active',
    selected_plan.billing_interval,
    'manual',
    now(),
    now(),
    current_period_end,
    jsonb_build_object('source', 'signup')
  );

  perform public.sync_user_subscription_metadata(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
after insert on auth.users
for each row
execute function public.handle_new_user_subscription();

insert into public.user_subscriptions (
  user_id,
  plan_code,
  status,
  billing_interval,
  provider,
  selected_at,
  current_period_start,
  current_period_end,
  metadata
)
select
  u.id,
  resolved.plan_code,
  'active',
  resolved.billing_interval,
  'manual',
  now(),
  now(),
  case
    when resolved.billing_interval = 'monthly' and resolved.price_cents > 0 then now() + interval '1 month'
    when resolved.billing_interval = 'yearly' and resolved.price_cents > 0 then now() + interval '1 year'
    else null
  end,
  jsonb_build_object('source', 'backfill')
from auth.users u
join lateral (
  select
    sp.code as plan_code,
    sp.billing_interval,
    sp.price_cents
  from public.subscription_plans sp
  where sp.code = case
    when public.is_legacy_paid_user(coalesce(u.raw_user_meta_data, '{}'::jsonb))
      then 'pro-monthly'
    else 'free-monthly'
  end
  limit 1
) as resolved on true
where not exists (
  select 1
  from public.user_subscriptions us
  where us.user_id = u.id
    and us.status in ('active', 'trialing', 'pending')
);

select public.sync_user_subscription_metadata(u.id)
from auth.users u;

create or replace function public.get_user_plan_state_internal(
  p_user_id uuid,
  p_tz text default 'Europe/Madrid'
)
returns table(
  plan_code text,
  plan_name text,
  tier text,
  billing_interval text,
  subscription_status text,
  is_paid boolean,
  ai_daily_limit integer,
  quick_test_question_limit integer,
  ai_used integer,
  ai_remaining integer,
  day date,
  price_cents integer,
  effective_price_cents integer,
  currency text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  discount_code text,
  discount_percent integer,
  discount_ends_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (timezone(p_tz, now()))::date;
  v_plan record;
  v_used integer := 0;
  v_discount record;
  v_effective_price integer := 0;
begin
  select
    sp.code,
    sp.name,
    sp.tier,
    sp.billing_interval,
    sp.ai_daily_limit,
    sp.quick_test_question_limit,
    sp.price_cents,
    sp.currency,
    us.id as subscription_id,
    us.status,
    us.current_period_end,
    us.cancel_at_period_end
  into v_plan
  from public.subscription_plans sp
  join public.user_subscriptions us
    on us.plan_code = sp.code
  where us.user_id = p_user_id
    and us.status in ('active', 'trialing', 'pending')
  order by
    case us.status
      when 'active' then 0
      when 'trialing' then 1
      else 2
    end,
    us.selected_at desc,
    us.created_at desc
  limit 1;

  if not found then
    select
      sp.code,
      sp.name,
      sp.tier,
      sp.billing_interval,
      sp.ai_daily_limit,
      sp.quick_test_question_limit,
      sp.price_cents,
      sp.currency,
      null::uuid as subscription_id,
      'active'::text as status,
      null::timestamptz as current_period_end,
      false as cancel_at_period_end
    into v_plan
    from public.subscription_plans sp
    where sp.code = 'free-monthly'
    limit 1;
  end if;

  select coalesce(d.requests_used, 0)
  into v_used
  from public.ai_daily_usage d
  where d.user_id = p_user_id
    and d.day = v_day;

  if v_plan.subscription_id is not null then
    select
      dc.code,
      dr.percent_off,
      dr.ends_at
    into v_discount
    from public.discount_redemptions dr
    join public.discount_codes dc
      on dc.id = dr.discount_code_id
    where dr.subscription_id = v_plan.subscription_id
      and dr.starts_at <= now()
      and (dr.ends_at is null or dr.ends_at >= now())
    order by dr.created_at desc
    limit 1;
  end if;

  v_effective_price := coalesce(v_plan.price_cents, 0);
  if v_discount.percent_off is not null then
    v_effective_price :=
      greatest(
        0,
        floor((coalesce(v_plan.price_cents, 0) * (100 - v_discount.percent_off)) / 100.0)
      )::integer;
  end if;

  return query
  select
    v_plan.code,
    v_plan.name,
    v_plan.tier,
    v_plan.billing_interval,
    v_plan.status,
    (v_plan.tier <> 'free'),
    v_plan.ai_daily_limit,
    v_plan.quick_test_question_limit,
    v_used,
    greatest(v_plan.ai_daily_limit - v_used, 0),
    v_day,
    coalesce(v_plan.price_cents, 0),
    v_effective_price,
    v_plan.currency,
    v_plan.current_period_end,
    coalesce(v_plan.cancel_at_period_end, false),
    v_discount.code,
    v_discount.percent_off,
    v_discount.ends_at;
end;
$$;

create or replace function public.get_user_plan_state(
  p_user_id uuid,
  p_tz text default 'Europe/Madrid'
)
returns table(
  plan_code text,
  plan_name text,
  tier text,
  billing_interval text,
  subscription_status text,
  is_paid boolean,
  ai_daily_limit integer,
  quick_test_question_limit integer,
  ai_used integer,
  ai_remaining integer,
  day date,
  price_cents integer,
  effective_price_cents integer,
  currency text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  discount_code text,
  discount_percent integer,
  discount_ends_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := auth.role();
begin
  if v_actor is null then
    if coalesce(v_role, '') <> 'service_role' then
      raise exception 'Not authorized';
    end if;
  else
    p_user_id := v_actor;
  end if;

  return query
  select *
  from public.get_user_plan_state_internal(p_user_id, p_tz);
end;
$$;

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
  v_limit integer := 3;
begin
  if v_actor is null then
    if coalesce(v_role, '') <> 'service_role' then
      raise exception 'Not authorized';
    end if;
  else
    p_user_id := v_actor;
  end if;

  select ai_daily_limit
  into v_limit
  from public.get_user_plan_state_internal(p_user_id);

  return coalesce(v_limit, 3);
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
begin
  if v_actor is null then
    if coalesce(v_role, '') <> 'service_role' then
      raise exception 'Not authorized';
    end if;
  else
    p_user_id := v_actor;
  end if;

  return query
  select
    plan.ai_used,
    plan.ai_daily_limit,
    plan.ai_remaining,
    plan.day,
    plan.is_paid
  from public.get_user_plan_state_internal(p_user_id, p_tz) as plan;
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

create or replace function public.get_quick_test_question_limit_internal(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := 20;
begin
  select quick_test_question_limit
  into v_limit
  from public.get_user_plan_state_internal(p_user_id);

  return coalesce(v_limit, 20);
end;
$$;

create or replace function public.get_quick_test_question_limit(
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
begin
  if v_actor is null then
    if coalesce(v_role, '') <> 'service_role' then
      raise exception 'Not authorized';
    end if;
  else
    p_user_id := v_actor;
  end if;

  return public.get_quick_test_question_limit_internal(p_user_id);
end;
$$;

create or replace function public.enforce_quick_test_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := public.get_quick_test_question_limit_internal(new.user_id);
begin
  if coalesce(new.question_count, 0) > v_limit then
    raise exception 'quick_test_question_limit_exceeded'
      using detail = format('question_count=%s limit=%s', coalesce(new.question_count, 0), v_limit),
            hint = 'Upgrade your plan to increase the quick test question limit.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_quick_test_plan_limits on public.quick_tests;
create trigger enforce_quick_test_plan_limits
before insert or update on public.quick_tests
for each row
execute function public.enforce_quick_test_plan_limits();

create or replace function public.change_user_subscription_plan(
  p_plan_code text,
  p_tz text default 'Europe/Madrid'
)
returns table(
  plan_code text,
  plan_name text,
  tier text,
  billing_interval text,
  subscription_status text,
  is_paid boolean,
  ai_daily_limit integer,
  quick_test_question_limit integer,
  ai_used integer,
  ai_remaining integer,
  day date,
  price_cents integer,
  effective_price_cents integer,
  currency text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  discount_code text,
  discount_percent integer,
  discount_ends_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan public.subscription_plans%rowtype;
  v_current_period_end timestamptz;
begin
  if v_actor is null then
    raise exception 'Not authorized';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where code = lower(btrim(coalesce(p_plan_code, '')))
    and is_active
    and is_public
  limit 1;

  if not found then
    raise exception 'subscription_plan_not_found';
  end if;

  update public.user_subscriptions
  set
    status = 'canceled',
    canceled_at = now(),
    ended_at = now(),
    cancel_at_period_end = false,
    updated_at = now()
  where user_id = v_actor
    and status in ('active', 'trialing', 'pending');

  v_current_period_end :=
    case v_plan.billing_interval
      when 'monthly' then
        case when v_plan.price_cents > 0 then now() + interval '1 month' else null end
      when 'yearly' then
        case when v_plan.price_cents > 0 then now() + interval '1 year' else null end
      else null
    end;

  insert into public.user_subscriptions (
    user_id,
    plan_code,
    status,
    billing_interval,
    provider,
    selected_at,
    current_period_start,
    current_period_end,
    metadata
  )
  values (
    v_actor,
    v_plan.code,
    'active',
    v_plan.billing_interval,
    'manual',
    now(),
    now(),
    v_current_period_end,
    jsonb_build_object('source', 'self-service-plan-change')
  );

  perform public.sync_user_subscription_metadata(v_actor);

  return query
  select *
  from public.get_user_plan_state_internal(v_actor, p_tz);
end;
$$;

create or replace function public.apply_discount_code(
  p_code text,
  p_tz text default 'Europe/Madrid'
)
returns table(
  plan_code text,
  plan_name text,
  tier text,
  billing_interval text,
  subscription_status text,
  is_paid boolean,
  ai_daily_limit integer,
  quick_test_question_limit integer,
  ai_used integer,
  ai_remaining integer,
  day date,
  price_cents integer,
  effective_price_cents integer,
  currency text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  discount_code text,
  discount_percent integer,
  discount_ends_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_code public.discount_codes%rowtype;
  v_subscription record;
  v_redemption_count integer := 0;
  v_normalized_code text := public.normalize_discount_code(p_code);
begin
  if v_actor is null then
    raise exception 'Not authorized';
  end if;

  select *
  into v_code
  from public.discount_codes dc
  where public.normalize_discount_code(dc.code) = v_normalized_code
    and dc.is_active
    and (dc.starts_at is null or dc.starts_at <= v_now)
    and (dc.ends_at is null or dc.ends_at >= v_now)
  limit 1;

  if not found then
    raise exception 'discount_code_not_found';
  end if;

  select count(*)
  into v_redemption_count
  from public.discount_redemptions dr
  where dr.discount_code_id = v_code.id;

  if v_code.max_redemptions is not null and v_redemption_count >= v_code.max_redemptions then
    raise exception 'discount_code_limit_reached';
  end if;

  if exists (
    select 1
    from public.discount_redemptions dr
    where dr.user_id = v_actor
      and dr.discount_code_id = v_code.id
  ) then
    raise exception 'discount_code_already_used';
  end if;

  select
    us.id,
    us.plan_code,
    us.billing_interval
  into v_subscription
  from public.user_subscriptions us
  join public.subscription_plans sp
    on sp.code = us.plan_code
  where us.user_id = v_actor
    and us.status in ('active', 'trialing', 'pending')
    and sp.tier <> 'free'
  order by
    case us.status
      when 'active' then 0
      when 'trialing' then 1
      else 2
    end,
    us.selected_at desc,
    us.created_at desc
  limit 1;

  if not found then
    raise exception 'discount_requires_paid_plan';
  end if;

  if v_code.applicable_plan_code is not null and v_code.applicable_plan_code <> v_subscription.plan_code then
    raise exception 'discount_code_plan_mismatch';
  end if;

  if v_code.applicable_billing_interval is not null and v_code.applicable_billing_interval <> v_subscription.billing_interval then
    raise exception 'discount_code_interval_mismatch';
  end if;

  insert into public.discount_redemptions (
    discount_code_id,
    subscription_id,
    user_id,
    percent_off,
    duration_months,
    starts_at,
    ends_at
  )
  values (
    v_code.id,
    v_subscription.id,
    v_actor,
    v_code.percent_off,
    v_code.duration_months,
    v_now,
    case
      when v_code.duration_months is null then null
      else v_now + make_interval(months => v_code.duration_months)
    end
  );

  perform public.sync_user_subscription_metadata(v_actor);

  return query
  select *
  from public.get_user_plan_state_internal(v_actor, p_tz);
end;
$$;

revoke all on function public.sync_user_subscription_metadata(uuid) from public;
revoke all on function public.handle_new_user_subscription() from public;
revoke all on function public.get_user_plan_state_internal(uuid, text) from public;
revoke all on function public.get_quick_test_question_limit_internal(uuid) from public;
revoke all on function public.enforce_quick_test_plan_limits() from public;

revoke all on function public.get_user_plan_state(uuid, text) from public;
grant execute on function public.get_user_plan_state(uuid, text) to authenticated;
grant execute on function public.get_user_plan_state(uuid, text) to service_role;

revoke all on function public.get_ai_daily_limit(uuid) from public;
grant execute on function public.get_ai_daily_limit(uuid) to authenticated;
grant execute on function public.get_ai_daily_limit(uuid) to service_role;

revoke all on function public.get_ai_daily_quota(uuid, text) from public;
grant execute on function public.get_ai_daily_quota(uuid, text) to authenticated;
grant execute on function public.get_ai_daily_quota(uuid, text) to service_role;

revoke all on function public.consume_ai_daily_quota(uuid, integer, text) from public;
grant execute on function public.consume_ai_daily_quota(uuid, integer, text) to authenticated;
grant execute on function public.consume_ai_daily_quota(uuid, integer, text) to service_role;

revoke all on function public.get_quick_test_question_limit(uuid) from public;
grant execute on function public.get_quick_test_question_limit(uuid) to authenticated;
grant execute on function public.get_quick_test_question_limit(uuid) to service_role;

revoke all on function public.change_user_subscription_plan(text, text) from public;
grant execute on function public.change_user_subscription_plan(text, text) to authenticated;
grant execute on function public.change_user_subscription_plan(text, text) to service_role;

revoke all on function public.apply_discount_code(text, text) from public;
grant execute on function public.apply_discount_code(text, text) to authenticated;
grant execute on function public.apply_discount_code(text, text) to service_role;

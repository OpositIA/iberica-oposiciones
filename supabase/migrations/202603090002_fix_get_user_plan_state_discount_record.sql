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
  v_discount_code text := null;
  v_discount_percent integer := null;
  v_discount_ends_at timestamptz := null;
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
    us.cancel_at_period_end,
    coalesce(us.metadata, '{}'::jsonb) as metadata
  into v_plan
  from public.subscription_plans sp
  join public.user_subscriptions us
    on us.plan_code = sp.code
  where us.user_id = p_user_id
    and (
      us.status in ('active', 'trialing', 'pending')
      or public.subscription_has_paid_access(us.status, us.metadata)
    )
  order by
    case us.status
      when 'active' then 0
      when 'trialing' then 1
      when 'past_due' then 2
      else 3
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
      false as cancel_at_period_end,
      '{}'::jsonb as metadata
    into v_plan
    from public.subscription_plans sp
    where sp.is_active
      and sp.is_public
      and sp.tier = 'free'
    order by
      case when sp.code = 'free-monthly' then 0 else 1 end,
      sp.sort_order asc,
      sp.code asc
    limit 1;

    if not found then
      return;
    end if;
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
    into
      v_discount_code,
      v_discount_percent,
      v_discount_ends_at
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
  if v_discount_percent is not null then
    v_effective_price :=
      greatest(
        0,
        floor((coalesce(v_plan.price_cents, 0) * (100 - v_discount_percent)) / 100.0)
      )::integer;
  end if;

  return query
  select
    v_plan.code,
    v_plan.name,
    v_plan.tier,
    v_plan.billing_interval,
    v_plan.status,
    (
      v_plan.tier <> 'free'
      and public.subscription_has_paid_access(v_plan.status, v_plan.metadata)
    ),
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
    v_discount_code,
    v_discount_percent,
    v_discount_ends_at;
end;
$$;

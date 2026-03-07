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
  v_metadata jsonb := coalesce(
    (
      select raw_user_meta_data
      from auth.users
      where id = p_user_id
    ),
    '{}'::jsonb
  );
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
    update auth.users
    set raw_user_meta_data =
      (
        v_metadata
        - 'plan'
        - 'plan_name'
        - 'subscription_plan'
        - 'selected_plan_code'
        - 'billing_interval'
        - 'is_paid'
      )
      || jsonb_build_object(
        'subscription_status', 'pending_selection',
        'is_paid', false
      )
    where id = p_user_id;

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
      nullif(btrim(coalesce(metadata ->> 'subscription_plan', '')), '')
    )
  );
  selected_plan public.subscription_plans%rowtype;
  current_period_end timestamptz;
begin
  if requested_plan_code = '' then
    requested_plan_code := null;
  end if;

  if requested_plan_code is null and public.is_legacy_paid_user(metadata) then
    requested_plan_code := 'pro-monthly';
  end if;

  if requested_plan_code is null then
    perform public.sync_user_subscription_metadata(new.id);
    return new;
  end if;

  select *
  into selected_plan
  from public.subscription_plans
  where code = requested_plan_code
    and is_active
  limit 1;

  if not found then
    perform public.sync_user_subscription_metadata(new.id);
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
    return;
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
  v_limit integer := 0;
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

  return coalesce(v_limit, 0);
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
  v_limit integer := 0;
begin
  select quick_test_question_limit
  into v_limit
  from public.get_user_plan_state_internal(p_user_id);

  return coalesce(v_limit, 0);
end;
$$;


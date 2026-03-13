create or replace function public.subscription_has_paid_access(
  p_status text,
  p_metadata jsonb default '{}'::jsonb,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
stable
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_metadata jsonb := case
    when jsonb_typeof(p_metadata) = 'object' then p_metadata
    else '{}'::jsonb
  end;
  v_grace_until timestamptz := null;
begin
  if v_status in ('active', 'trialing') then
    return true;
  end if;

  if v_status <> 'past_due' then
    return false;
  end if;

  begin
    v_grace_until := nullif(btrim(coalesce(v_metadata ->> 'billing_grace_until', '')), '')::timestamptz;
  exception
    when others then
      v_grace_until := null;
  end;

  return v_grace_until is not null and v_grace_until > coalesce(p_now, now());
end;
$$;

create or replace function public.merge_stripe_subscription_metadata(
  p_existing jsonb default '{}'::jsonb,
  p_incoming jsonb default '{}'::jsonb,
  p_status text default 'pending'
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_existing jsonb := case
    when jsonb_typeof(p_existing) = 'object' then p_existing
    else '{}'::jsonb
  end;
  v_incoming jsonb := case
    when jsonb_typeof(p_incoming) = 'object' then p_incoming
    else '{}'::jsonb
  end;
  v_status text := lower(btrim(coalesce(p_status, 'pending')));
  v_event_type text := nullif(btrim(coalesce(v_incoming ->> 'stripe_event_type', '')), '');
  v_now timestamptz := now();
  v_failed_at timestamptz := null;
  v_grace_until timestamptz := null;
  v_retry_attempts integer := 0;
  v_base jsonb;
begin
  begin
    v_failed_at := nullif(btrim(coalesce(v_existing ->> 'billing_failed_at', '')), '')::timestamptz;
  exception
    when others then
      v_failed_at := null;
  end;

  begin
    v_grace_until := nullif(btrim(coalesce(v_existing ->> 'billing_grace_until', '')), '')::timestamptz;
  exception
    when others then
      v_grace_until := null;
  end;

  begin
    v_retry_attempts := greatest(
      coalesce(nullif(btrim(coalesce(v_existing ->> 'billing_retry_attempts', '')), '')::integer, 0),
      0
    );
  exception
    when others then
      v_retry_attempts := 0;
  end;

  v_base := jsonb_strip_nulls(
    (
      v_existing
      - 'billing_failed_at'
      - 'billing_grace_until'
      - 'billing_retry_attempts'
      - 'billing_retry_window_days'
    )
    || v_incoming
  );

  if v_status <> 'past_due' then
    return v_base;
  end if;

  if v_event_type = 'invoice.payment_failed' then
    if v_failed_at is null then
      v_failed_at := v_now;
    end if;

    if v_grace_until is null or v_grace_until < v_failed_at + interval '3 days' then
      v_grace_until := v_failed_at + interval '3 days';
    end if;

    v_retry_attempts := v_retry_attempts + 1;
  end if;

  if v_grace_until is null then
    return v_base;
  end if;

  if v_failed_at is null then
    v_failed_at := v_grace_until - interval '3 days';
  end if;

  return jsonb_strip_nulls(
    v_base
    || jsonb_build_object(
      'billing_failed_at', v_failed_at,
      'billing_grace_until', v_grace_until,
      'billing_retry_attempts', v_retry_attempts,
      'billing_retry_window_days', 3
    )
  );
end;
$$;

create or replace function public.upsert_user_subscription_from_stripe(
  p_user_id uuid,
  p_plan_code text,
  p_stripe_subscription_id text,
  p_stripe_customer_id text default null,
  p_subscription_status text default 'pending',
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_canceled_at timestamptz default null,
  p_ended_at timestamptz default null,
  p_checkout_session_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_subscription_id text := nullif(btrim(coalesce(p_stripe_subscription_id, '')), '');
  v_customer_id text := nullif(btrim(coalesce(p_stripe_customer_id, '')), '');
  v_checkout_session_id text := nullif(btrim(coalesce(p_checkout_session_id, '')), '');
  v_status text := public.map_stripe_subscription_status(p_subscription_status);
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_row_id uuid;
begin
  if p_user_id is null then
    raise exception 'stripe_user_id_required';
  end if;

  if v_subscription_id is null then
    raise exception 'stripe_subscription_id_required';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where code = lower(btrim(coalesce(p_plan_code, '')))
    and is_active
  limit 1;

  if not found then
    raise exception 'subscription_plan_not_found';
  end if;

  if jsonb_typeof(v_metadata) is distinct from 'object' then
    v_metadata := '{}'::jsonb;
  end if;

  update public.user_subscriptions
  set
    status = 'canceled',
    canceled_at = coalesce(canceled_at, now()),
    ended_at = coalesce(ended_at, now()),
    cancel_at_period_end = false,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'stripe-webhook',
        'stripe_replaced_by', v_subscription_id
      ),
    updated_at = now()
  where user_id = p_user_id
    and status in ('active', 'trialing', 'pending', 'past_due')
    and coalesce(provider_reference, '') <> v_subscription_id;

  update public.user_subscriptions as us
  set
    user_id = p_user_id,
    plan_code = v_plan.code,
    status = v_status,
    billing_interval = v_plan.billing_interval,
    provider = 'stripe',
    provider_reference = v_subscription_id,
    selected_at = coalesce(us.selected_at, now()),
    current_period_start = coalesce(p_current_period_start, us.current_period_start, now()),
    current_period_end = p_current_period_end,
    cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
    canceled_at = case
      when v_status = 'canceled' then coalesce(p_canceled_at, now())
      else p_canceled_at
    end,
    ended_at = case
      when v_status in ('canceled', 'expired') then coalesce(p_ended_at, now())
      else p_ended_at
    end,
    metadata = public.merge_stripe_subscription_metadata(
      coalesce(us.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'stripe-webhook',
        'stripe_status', v_status,
        'stripe_subscription_id', v_subscription_id,
        'stripe_customer_id', v_customer_id,
        'stripe_checkout_session_id', v_checkout_session_id,
        'stripe_synced_at', now()
      ),
      v_metadata,
      v_status
    ),
    updated_at = now()
  where us.provider_reference = v_subscription_id
  returning us.id into v_row_id;

  if v_row_id is null then
    insert into public.user_subscriptions (
      user_id,
      plan_code,
      status,
      billing_interval,
      provider,
      provider_reference,
      selected_at,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      canceled_at,
      ended_at,
      metadata
    )
    values (
      p_user_id,
      v_plan.code,
      v_status,
      v_plan.billing_interval,
      'stripe',
      v_subscription_id,
      now(),
      coalesce(p_current_period_start, now()),
      p_current_period_end,
      coalesce(p_cancel_at_period_end, false),
      case
        when v_status = 'canceled' then coalesce(p_canceled_at, now())
        else p_canceled_at
      end,
      case
        when v_status in ('canceled', 'expired') then coalesce(p_ended_at, now())
        else p_ended_at
      end,
      public.merge_stripe_subscription_metadata(
        jsonb_build_object(
          'source', 'stripe-webhook',
          'stripe_status', v_status,
          'stripe_subscription_id', v_subscription_id,
          'stripe_customer_id', v_customer_id,
          'stripe_checkout_session_id', v_checkout_session_id,
          'stripe_synced_at', now()
        ),
        v_metadata,
        v_status
      )
    )
    returning id into v_row_id;
  end if;

  perform public.sync_user_subscription_metadata(p_user_id);
  return v_row_id;
end;
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
    us.status,
    us.metadata
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
      'is_paid', (
        v_plan.tier <> 'free'
        and public.subscription_has_paid_access(v_plan.status, v_plan.metadata)
      )
    )
  where id = p_user_id;
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
    us.cancel_at_period_end,
    us.metadata
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
    v_discount.code,
    v_discount.percent_off,
    v_discount.ends_at;
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
    and (
      us.status in ('active', 'trialing', 'pending')
      or public.subscription_has_paid_access(us.status, us.metadata, v_now)
    )
    and sp.tier <> 'free'
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

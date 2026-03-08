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
    and us.status in ('active', 'trialing', 'pending', 'past_due')
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
      false as cancel_at_period_end
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
      and v_plan.status in ('active', 'trialing', 'past_due')
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

create or replace function public.claim_question_bank_questions(
  p_user_id uuid,
  p_opposition_id text,
  p_topic_id text,
  p_question_count integer,
  p_locale text default 'es',
  p_include_draft boolean default true,
  p_topic_label text default null
)
returns table(
  bank_question_id bigint,
  opposition_name text,
  topic_id text,
  topic_label text,
  difficulty text,
  locale text,
  question text,
  options jsonb,
  correct_option_id text,
  explanation text,
  citations jsonb,
  model text
)
language plpgsql
set search_path = public
as $$
declare
  v_target int;
  v_topic_label text := nullif(btrim(coalesce(p_topic_label, '')), '');
begin
  v_target := greatest(1, least(100, coalesce(p_question_count, 1)));

  return query
  with fresh as (
    select q.id
    from public.question_bank_questions q
    where q.opposition_id = p_opposition_id
      and q.topic_id = p_topic_id
      and (v_topic_label is null or btrim(q.topic_label) = v_topic_label)
      and q.locale = p_locale
      and (
        q.status in ('validated', 'published')
        or (coalesce(p_include_draft, true) and q.status = 'draft')
      )
      and not exists (
        select 1
        from public.question_bank_question_claims c
        where c.user_id = p_user_id
          and c.question_id = q.id
      )
    order by random()
    for update skip locked
    limit v_target
  ),
  fallback as (
    select q.id
    from public.question_bank_questions q
    where q.opposition_id = p_opposition_id
      and q.topic_id = p_topic_id
      and (v_topic_label is null or btrim(q.topic_label) = v_topic_label)
      and q.locale = p_locale
      and (
        q.status in ('validated', 'published')
        or (coalesce(p_include_draft, true) and q.status = 'draft')
      )
      and not exists (
        select 1
        from fresh f
        where f.id = q.id
      )
    order by random()
    limit greatest(v_target - (select count(*) from fresh), 0)
  ),
  picked as (
    select id from fresh
    union all
    select id from fallback
  ),
  _claims as (
    insert into public.question_bank_question_claims (question_id, user_id)
    select id, p_user_id
    from picked
    on conflict (user_id, question_id) do nothing
    returning question_id
  )
  select
    q.id as bank_question_id,
    q.opposition_name,
    q.topic_id,
    q.topic_label,
    q.difficulty,
    q.locale,
    q.question,
    q.options,
    q.correct_option_id,
    q.explanation,
    q.citations,
    q.model
  from public.question_bank_questions q
  join picked p on p.id = q.id
  order by random();
end;
$$;

revoke all on function public.claim_question_bank_questions(
  uuid,
  text,
  text,
  integer,
  text,
  boolean,
  text
) from public;
revoke all on function public.claim_question_bank_questions(
  uuid,
  text,
  text,
  integer,
  text,
  boolean,
  text
) from anon, authenticated;
grant execute on function public.claim_question_bank_questions(
  uuid,
  text,
  text,
  integer,
  text,
  boolean,
  text
) to service_role;

create or replace function public.enforce_quick_test_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
begin
  select *
  into v_plan
  from public.get_user_plan_state_internal(new.user_id);

  if coalesce(v_plan.tier, 'free') = 'free'
    or not coalesce(v_plan.is_paid, false) then
    raise exception 'quick_test_requires_paid_plan'
      using hint = 'Upgrade to Pro to create or reuse quick tests.';
  end if;

  if coalesce(new.question_count, 0) > coalesce(v_plan.quick_test_question_limit, 0) then
    raise exception 'quick_test_question_limit_exceeded'
      using detail = format(
        'question_count=%s limit=%s',
        coalesce(new.question_count, 0),
        coalesce(v_plan.quick_test_question_limit, 0)
      ),
      hint = 'Upgrade your plan to increase the quick test question limit.';
  end if;

  return new;
end;
$$;

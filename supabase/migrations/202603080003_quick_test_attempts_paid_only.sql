create or replace function public.enforce_quick_test_attempts_paid_plan()
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
      using hint = 'Upgrade to Pro to take or resume quick tests.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_quick_test_attempts_paid_plan on public.quick_test_attempts;

create trigger enforce_quick_test_attempts_paid_plan
before insert or update on public.quick_test_attempts
for each row
execute function public.enforce_quick_test_attempts_paid_plan();

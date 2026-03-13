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
begin
  -- Immediate access revocation policy on failed renewals:
  -- only active/trialing keep paid access.
  return v_status in ('active', 'trialing');
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
  v_retry_deadline timestamptz := null;
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
      - 'billing_retry_schedule_days'
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
    v_retry_attempts := v_retry_attempts + 1;
  end if;

  if v_failed_at is null then
    return v_base;
  end if;

  -- Day 0 fail + retries day 1, 3 and 5.
  v_retry_deadline := v_failed_at + interval '5 days';

  return jsonb_strip_nulls(
    v_base
    || jsonb_build_object(
      'billing_failed_at', v_failed_at,
      'billing_grace_until', v_retry_deadline,
      'billing_retry_attempts', v_retry_attempts,
      'billing_retry_window_days', 5,
      'billing_retry_schedule_days', jsonb_build_array(1, 3, 5)
    )
  );
end;
$$;

create table if not exists public.syllabus_download_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opposition_id text not null references public.oppositions(id) on delete cascade,
  syllabus_id bigint not null references public.opposition_syllabi(id) on delete cascade,
  provider text not null default 'stripe',
  status text not null default 'completed',
  amount_cents integer not null default 2999,
  currency text not null default 'EUR',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  metadata jsonb not null default '{}'::jsonb,
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint syllabus_download_purchases_provider_chk
    check (provider in ('stripe')),
  constraint syllabus_download_purchases_status_chk
    check (status in ('completed')),
  constraint syllabus_download_purchases_amount_chk
    check (amount_cents > 0),
  constraint syllabus_download_purchases_currency_chk
    check (upper(currency) = 'EUR')
);

create unique index if not exists syllabus_download_purchases_user_syllabus_uidx
  on public.syllabus_download_purchases (user_id, syllabus_id);

create unique index if not exists syllabus_download_purchases_checkout_session_uidx
  on public.syllabus_download_purchases (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists syllabus_download_purchases_payment_intent_uidx
  on public.syllabus_download_purchases (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists syllabus_download_purchases_user_idx
  on public.syllabus_download_purchases (user_id, purchased_at desc);

create index if not exists syllabus_download_purchases_opposition_idx
  on public.syllabus_download_purchases (opposition_id, purchased_at desc);

alter table public.syllabus_download_purchases enable row level security;

drop policy if exists "Users can read own syllabus download purchases" on public.syllabus_download_purchases;
create policy "Users can read own syllabus download purchases"
on public.syllabus_download_purchases
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.user_owns_syllabus_download(
  p_user_id uuid,
  p_syllabus_id bigint
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.syllabus_download_purchases sdp
    where sdp.user_id = p_user_id
      and sdp.syllabus_id = p_syllabus_id
      and sdp.status = 'completed'
  );
$$;

revoke all on function public.user_owns_syllabus_download(uuid, bigint) from public;
grant execute on function public.user_owns_syllabus_download(uuid, bigint) to authenticated;
grant execute on function public.user_owns_syllabus_download(uuid, bigint) to service_role;

create or replace function public.get_current_syllabus_download_offer(
  p_subtopic_file_id bigint
)
returns table(
  opposition_id text,
  syllabus_id bigint,
  syllabus_boe_id text,
  syllabus_published_at date,
  syllabus_extracted_at timestamptz,
  total_pdf_count bigint,
  block_count bigint,
  is_purchased boolean,
  price_cents integer,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := auth.role();
  v_current_syllabus_id bigint;
begin
  if v_actor is null and coalesce(v_role, '') <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  select s.id
  into v_current_syllabus_id
  from public.opposition_subtopic_files f
  join public.opposition_syllabi s on s.id = f.syllabus_id
  where f.id = p_subtopic_file_id
    and f.is_active = true
    and s.is_current = true
  limit 1;

  if v_current_syllabus_id is null then
    return;
  end if;

  return query
  with target_syllabus as (
    select
      s.id,
      s.opposition_id,
      s.boe_id,
      s.published_at,
      s.extracted_at
    from public.opposition_syllabi s
    where s.id = v_current_syllabus_id
      and s.is_current = true
  ),
  file_stats as (
    select
      count(*)::bigint as total_pdf_count,
      count(distinct st.opposition_topic_id)::bigint as block_count
    from public.opposition_subtopic_files f
    join public.opposition_subtopics st on st.id = f.subtopic_id
    where f.syllabus_id = v_current_syllabus_id
      and f.is_active = true
  )
  select
    ts.opposition_id,
    ts.id as syllabus_id,
    ts.boe_id as syllabus_boe_id,
    ts.published_at as syllabus_published_at,
    ts.extracted_at as syllabus_extracted_at,
    coalesce(fs.total_pdf_count, 0::bigint) as total_pdf_count,
    coalesce(fs.block_count, 0::bigint) as block_count,
    case
      when v_actor is null then false
      else public.user_owns_syllabus_download(v_actor, ts.id)
    end as is_purchased,
    2999 as price_cents,
    'EUR'::text as currency
  from target_syllabus ts
  cross join file_stats fs;
end;
$$;

revoke all on function public.get_current_syllabus_download_offer(bigint) from public;
grant execute on function public.get_current_syllabus_download_offer(bigint) to authenticated;
grant execute on function public.get_current_syllabus_download_offer(bigint) to service_role;

drop trigger if exists trg_syllabus_download_purchases_set_updated_at on public.syllabus_download_purchases;
create trigger trg_syllabus_download_purchases_set_updated_at
before update on public.syllabus_download_purchases
for each row
execute function public.set_updated_at();

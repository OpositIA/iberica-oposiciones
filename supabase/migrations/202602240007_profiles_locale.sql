create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  full_name text,
  age smallint,
  preferred_opposition text,
  years_preparing integer,
  weekly_target_hours integer not null default 16,
  tests_per_week integer,
  main_challenge text,
  avatar_url text,
  locale text not null default 'es' check (locale in ('es', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_age_check check (age is null or (age between 16 and 75)),
  constraint profiles_years_preparing_check check (
    years_preparing is null
    or (years_preparing between 0 and 40)
  ),
  constraint profiles_weekly_target_hours_check check (weekly_target_hours between 1 and 80),
  constraint profiles_tests_per_week_check check (
    tests_per_week is null
    or (tests_per_week between 1 and 14)
  )
);

create or replace function public.safe_to_int(value text)
returns integer
language sql
immutable
as $$
  select case
    when value is null then null
    when btrim(value) ~ '^-?\d+$' then btrim(value)::integer
    else null
  end;
$$;

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile row" on public.profiles;
create policy "Users can read own profile row"
on public.profiles
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own profile row" on public.profiles;
create policy "Users can insert own profile row"
on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own profile row" on public.profiles;
create policy "Users can update own profile row"
on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  next_first_name text := nullif(btrim(coalesce(metadata->>'first_name', '')), '');
  next_last_name text := nullif(btrim(coalesce(metadata->>'last_name', '')), '');
  next_full_name text := nullif(btrim(coalesce(metadata->>'full_name', '')), '');
  next_locale text := coalesce(nullif(btrim(coalesce(metadata->>'locale', '')), ''), 'es');
  next_age integer := public.safe_to_int(metadata->>'age');
  next_years_preparing integer := public.safe_to_int(metadata->>'years_preparing');
  next_weekly_target_hours integer := coalesce(public.safe_to_int(metadata->>'weekly_target_hours'), 16);
  next_tests_per_week integer := public.safe_to_int(metadata->>'tests_per_week');
begin
  if next_locale not in ('es', 'en') then
    next_locale := 'es';
  end if;

  if next_weekly_target_hours < 1 or next_weekly_target_hours > 80 then
    next_weekly_target_hours := 16;
  end if;

  if next_age is not null and (next_age < 16 or next_age > 75) then
    next_age := null;
  end if;

  if next_years_preparing is not null and (next_years_preparing < 0 or next_years_preparing > 40) then
    next_years_preparing := null;
  end if;

  if next_tests_per_week is not null and (next_tests_per_week < 1 or next_tests_per_week > 14) then
    next_tests_per_week := null;
  end if;

  if next_full_name is null then
    next_full_name := nullif(btrim(concat_ws(' ', next_first_name, next_last_name)), '');
  end if;

  insert into public.profiles (
    user_id,
    email,
    first_name,
    last_name,
    full_name,
    age,
    preferred_opposition,
    years_preparing,
    weekly_target_hours,
    tests_per_week,
    main_challenge,
    avatar_url,
    locale
  )
  values (
    new.id,
    new.email,
    next_first_name,
    next_last_name,
    next_full_name,
    next_age,
    nullif(btrim(coalesce(metadata->>'preferred_opposition', '')), ''),
    next_years_preparing,
    next_weekly_target_hours,
    next_tests_per_week,
    nullif(btrim(coalesce(metadata->>'main_challenge', '')), ''),
    nullif(btrim(coalesce(metadata->>'avatar_url', '')), ''),
    next_locale
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    full_name = excluded.full_name,
    age = excluded.age,
    preferred_opposition = excluded.preferred_opposition,
    years_preparing = excluded.years_preparing,
    weekly_target_hours = excluded.weekly_target_hours,
    tests_per_week = excluded.tests_per_week,
    main_challenge = excluded.main_challenge,
    avatar_url = excluded.avatar_url,
    locale = excluded.locale,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

insert into public.profiles (
  user_id,
  email,
  first_name,
  last_name,
  full_name,
  age,
  preferred_opposition,
  years_preparing,
  weekly_target_hours,
  tests_per_week,
  main_challenge,
  avatar_url,
  locale
)
select
  u.id,
  u.email,
  nullif(btrim(coalesce(m.metadata->>'first_name', '')), ''),
  nullif(btrim(coalesce(m.metadata->>'last_name', '')), ''),
  coalesce(
    nullif(btrim(coalesce(m.metadata->>'full_name', '')), ''),
    nullif(
      btrim(
        concat_ws(
          ' ',
          nullif(btrim(coalesce(m.metadata->>'first_name', '')), ''),
          nullif(btrim(coalesce(m.metadata->>'last_name', '')), '')
        )
      ),
      ''
    )
  ),
  case
    when public.safe_to_int(m.metadata->>'age') between 16 and 75
      then public.safe_to_int(m.metadata->>'age')
    else null
  end,
  nullif(btrim(coalesce(m.metadata->>'preferred_opposition', '')), ''),
  case
    when public.safe_to_int(m.metadata->>'years_preparing') between 0 and 40
      then public.safe_to_int(m.metadata->>'years_preparing')
    else null
  end,
  case
    when public.safe_to_int(m.metadata->>'weekly_target_hours') between 1 and 80
      then public.safe_to_int(m.metadata->>'weekly_target_hours')
    else 16
  end,
  case
    when public.safe_to_int(m.metadata->>'tests_per_week') between 1 and 14
      then public.safe_to_int(m.metadata->>'tests_per_week')
    else null
  end,
  nullif(btrim(coalesce(m.metadata->>'main_challenge', '')), ''),
  nullif(btrim(coalesce(m.metadata->>'avatar_url', '')), ''),
  case
    when coalesce(nullif(btrim(coalesce(m.metadata->>'locale', '')), ''), 'es') in ('es', 'en')
      then coalesce(nullif(btrim(coalesce(m.metadata->>'locale', '')), ''), 'es')
    else 'es'
  end
from auth.users u
cross join lateral (
  select coalesce(u.raw_user_meta_data, '{}'::jsonb) as metadata
) m
on conflict (user_id) do update
set
  email = excluded.email,
  first_name = coalesce(excluded.first_name, public.profiles.first_name),
  last_name = coalesce(excluded.last_name, public.profiles.last_name),
  full_name = coalesce(excluded.full_name, public.profiles.full_name),
  age = coalesce(excluded.age, public.profiles.age),
  preferred_opposition = coalesce(excluded.preferred_opposition, public.profiles.preferred_opposition),
  years_preparing = coalesce(excluded.years_preparing, public.profiles.years_preparing),
  weekly_target_hours = coalesce(excluded.weekly_target_hours, public.profiles.weekly_target_hours),
  tests_per_week = coalesce(excluded.tests_per_week, public.profiles.tests_per_week),
  main_challenge = coalesce(excluded.main_challenge, public.profiles.main_challenge),
  avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
  locale = coalesce(excluded.locale, public.profiles.locale),
  updated_at = now();

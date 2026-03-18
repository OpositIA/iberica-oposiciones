create or replace function public.safe_to_date(value text)
returns date
language plpgsql
immutable
as $$
declare
  normalized_value text := nullif(btrim(coalesce(value, '')), '');
  parsed_date date;
begin
  if normalized_value is null then
    return null;
  end if;

  if normalized_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;

  parsed_date := normalized_value::date;
  if to_char(parsed_date, 'YYYY-MM-DD') <> normalized_value then
    return null;
  end if;

  return parsed_date;
exception
  when others then
    return null;
end;
$$;

alter table public.profiles
  add column if not exists date_of_birth date;

update public.profiles
set
  date_of_birth = public.safe_to_date(u.raw_user_meta_data->>'date_of_birth'),
  updated_at = now()
from auth.users u
where u.id = public.profiles.user_id
  and public.profiles.date_of_birth is null
  and public.safe_to_date(u.raw_user_meta_data->>'date_of_birth') is not null;

alter table public.profiles
  drop constraint if exists profiles_age_check,
  drop constraint if exists profiles_years_preparing_check,
  drop constraint if exists profiles_weekly_target_hours_check,
  drop constraint if exists profiles_tests_per_week_check;

alter table public.profiles
  drop column if exists age,
  drop column if exists years_preparing,
  drop column if exists weekly_target_hours,
  drop column if exists tests_per_week,
  drop column if exists main_challenge;

alter table public.profiles
  drop constraint if exists profiles_date_of_birth_check;

alter table public.profiles
  add constraint profiles_date_of_birth_check check (
    date_of_birth is null
    or date_of_birth >= date '1900-01-01'
  );

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
  next_date_of_birth date := public.safe_to_date(metadata->>'date_of_birth');
  next_preferred_opposition text := nullif(btrim(coalesce(metadata->>'preferred_opposition', '')), '');
  next_preferred_opposition_id text := nullif(btrim(coalesce(metadata->>'preferred_opposition_id', '')), '');
begin
  if next_locale not in ('es', 'en') then
    next_locale := 'es';
  end if;

  if next_date_of_birth is not null and next_date_of_birth < date '1900-01-01' then
    next_date_of_birth := null;
  end if;

  if next_full_name is null then
    next_full_name := nullif(btrim(concat_ws(' ', next_first_name, next_last_name)), '');
  end if;

  if next_preferred_opposition_id is null then
    next_preferred_opposition_id := public.map_preferred_opposition_to_id(next_preferred_opposition);
  end if;

  if next_preferred_opposition_id is not null and not exists (
    select 1
    from public.oppositions o
    where o.id = next_preferred_opposition_id
  ) then
    next_preferred_opposition_id := null;
  end if;

  if next_preferred_opposition is null and next_preferred_opposition_id is not null then
    next_preferred_opposition := next_preferred_opposition_id;
  end if;

  insert into public.profiles (
    user_id,
    email,
    first_name,
    last_name,
    full_name,
    date_of_birth,
    preferred_opposition,
    preferred_opposition_id,
    avatar_url,
    locale
  )
  values (
    new.id,
    new.email,
    next_first_name,
    next_last_name,
    next_full_name,
    next_date_of_birth,
    next_preferred_opposition,
    next_preferred_opposition_id,
    nullif(btrim(coalesce(metadata->>'avatar_url', '')), ''),
    next_locale
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    full_name = excluded.full_name,
    date_of_birth = excluded.date_of_birth,
    preferred_opposition = excluded.preferred_opposition,
    preferred_opposition_id = excluded.preferred_opposition_id,
    avatar_url = excluded.avatar_url,
    locale = excluded.locale,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.is_signup_email_available(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  if normalized_email is null then
    return false;
  end if;

  return not exists (
    select 1
    from auth.users u
    where lower(nullif(btrim(coalesce(u.email, '')), '')) = normalized_email
  );
end;
$$;

revoke all on function public.is_signup_email_available(text) from public;
grant execute on function public.is_signup_email_available(text)
to anon, authenticated, service_role;

-- Regulariza datos heredados de auth.users.raw_user_meta_data hacia public.profiles.
-- Solo rellena campos faltantes en profiles para no pisar datos ya editados por el usuario.

with metadata_source as (
  select
    u.id as user_id,
    nullif(btrim(coalesce(u.email, '')), '') as auth_email,
    coalesce(u.raw_user_meta_data, '{}'::jsonb) as metadata
  from auth.users u
),
metadata_parsed as (
  select
    s.user_id,
    s.auth_email,
    nullif(btrim(coalesce(s.metadata->>'first_name', '')), '') as first_name,
    nullif(btrim(coalesce(s.metadata->>'last_name', '')), '') as last_name,
    coalesce(
      nullif(btrim(coalesce(s.metadata->>'full_name', '')), ''),
      nullif(
        btrim(
          concat_ws(
            ' ',
            nullif(btrim(coalesce(s.metadata->>'first_name', '')), ''),
            nullif(btrim(coalesce(s.metadata->>'last_name', '')), '')
          )
        ),
        ''
      )
    ) as full_name,
    case
      when public.safe_to_int(s.metadata->>'age') between 16 and 75
        then public.safe_to_int(s.metadata->>'age')
      else null
    end as age,
    nullif(btrim(coalesce(s.metadata->>'preferred_opposition', '')), '') as preferred_opposition,
    case
      when public.safe_to_int(s.metadata->>'years_preparing') between 0 and 40
        then public.safe_to_int(s.metadata->>'years_preparing')
      else null
    end as years_preparing,
    case
      when public.safe_to_int(s.metadata->>'weekly_target_hours') between 1 and 80
        then public.safe_to_int(s.metadata->>'weekly_target_hours')
      else 16
    end as weekly_target_hours,
    case
      when public.safe_to_int(s.metadata->>'tests_per_week') between 1 and 14
        then public.safe_to_int(s.metadata->>'tests_per_week')
      else null
    end as tests_per_week,
    nullif(btrim(coalesce(s.metadata->>'main_challenge', '')), '') as main_challenge,
    nullif(btrim(coalesce(s.metadata->>'avatar_url', '')), '') as avatar_url,
    case
      when coalesce(nullif(btrim(coalesce(s.metadata->>'locale', '')), ''), 'es') in ('es', 'en')
        then coalesce(nullif(btrim(coalesce(s.metadata->>'locale', '')), ''), 'es')
      else 'es'
    end as locale
  from metadata_source s
)
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
  m.user_id,
  m.auth_email,
  m.first_name,
  m.last_name,
  m.full_name,
  m.age,
  m.preferred_opposition,
  m.years_preparing,
  coalesce(m.weekly_target_hours, 16),
  m.tests_per_week,
  m.main_challenge,
  m.avatar_url,
  m.locale
from metadata_parsed m
where not exists (
  select 1
  from public.profiles p
  where p.user_id = m.user_id
)
on conflict (user_id) do nothing;

with metadata_source as (
  select
    u.id as user_id,
    nullif(btrim(coalesce(u.email, '')), '') as auth_email,
    coalesce(u.raw_user_meta_data, '{}'::jsonb) as metadata
  from auth.users u
),
metadata_parsed as (
  select
    s.user_id,
    s.auth_email,
    nullif(btrim(coalesce(s.metadata->>'first_name', '')), '') as first_name,
    nullif(btrim(coalesce(s.metadata->>'last_name', '')), '') as last_name,
    coalesce(
      nullif(btrim(coalesce(s.metadata->>'full_name', '')), ''),
      nullif(
        btrim(
          concat_ws(
            ' ',
            nullif(btrim(coalesce(s.metadata->>'first_name', '')), ''),
            nullif(btrim(coalesce(s.metadata->>'last_name', '')), '')
          )
        ),
        ''
      )
    ) as full_name,
    case
      when public.safe_to_int(s.metadata->>'age') between 16 and 75
        then public.safe_to_int(s.metadata->>'age')
      else null
    end as age,
    nullif(btrim(coalesce(s.metadata->>'preferred_opposition', '')), '') as preferred_opposition,
    case
      when public.safe_to_int(s.metadata->>'years_preparing') between 0 and 40
        then public.safe_to_int(s.metadata->>'years_preparing')
      else null
    end as years_preparing,
    case
      when public.safe_to_int(s.metadata->>'tests_per_week') between 1 and 14
        then public.safe_to_int(s.metadata->>'tests_per_week')
      else null
    end as tests_per_week,
    nullif(btrim(coalesce(s.metadata->>'main_challenge', '')), '') as main_challenge,
    nullif(btrim(coalesce(s.metadata->>'avatar_url', '')), '') as avatar_url,
    case
      when coalesce(nullif(btrim(coalesce(s.metadata->>'locale', '')), ''), 'es') in ('es', 'en')
        then coalesce(nullif(btrim(coalesce(s.metadata->>'locale', '')), ''), 'es')
      else 'es'
    end as locale
  from metadata_source s
)
update public.profiles p
set
  email = coalesce(nullif(btrim(coalesce(p.email, '')), ''), m.auth_email),
  first_name = coalesce(nullif(btrim(coalesce(p.first_name, '')), ''), m.first_name),
  last_name = coalesce(nullif(btrim(coalesce(p.last_name, '')), ''), m.last_name),
  full_name = coalesce(
    nullif(btrim(coalesce(p.full_name, '')), ''),
    m.full_name,
    nullif(
      btrim(
        concat_ws(
          ' ',
          coalesce(nullif(btrim(coalesce(p.first_name, '')), ''), m.first_name),
          coalesce(nullif(btrim(coalesce(p.last_name, '')), ''), m.last_name)
        )
      ),
      ''
    )
  ),
  age = coalesce(p.age, m.age),
  preferred_opposition = coalesce(
    nullif(btrim(coalesce(p.preferred_opposition, '')), ''),
    m.preferred_opposition
  ),
  years_preparing = coalesce(p.years_preparing, m.years_preparing),
  tests_per_week = coalesce(p.tests_per_week, m.tests_per_week),
  main_challenge = coalesce(
    nullif(btrim(coalesce(p.main_challenge, '')), ''),
    m.main_challenge
  ),
  avatar_url = coalesce(nullif(btrim(coalesce(p.avatar_url, '')), ''), m.avatar_url),
  locale = coalesce(nullif(btrim(coalesce(p.locale, '')), ''), m.locale),
  updated_at = now()
from metadata_parsed m
where p.user_id = m.user_id
  and (
    (nullif(btrim(coalesce(p.email, '')), '') is null and m.auth_email is not null)
    or (nullif(btrim(coalesce(p.first_name, '')), '') is null and m.first_name is not null)
    or (nullif(btrim(coalesce(p.last_name, '')), '') is null and m.last_name is not null)
    or (nullif(btrim(coalesce(p.full_name, '')), '') is null and m.full_name is not null)
    or (p.age is null and m.age is not null)
    or (
      nullif(btrim(coalesce(p.preferred_opposition, '')), '') is null
      and m.preferred_opposition is not null
    )
    or (p.years_preparing is null and m.years_preparing is not null)
    or (p.tests_per_week is null and m.tests_per_week is not null)
    or (
      nullif(btrim(coalesce(p.main_challenge, '')), '') is null
      and m.main_challenge is not null
    )
    or (nullif(btrim(coalesce(p.avatar_url, '')), '') is null and m.avatar_url is not null)
    or (nullif(btrim(coalesce(p.locale, '')), '') is null and m.locale is not null)
  );

create table if not exists public.oppositions (
  id text primary key,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.oppositions
  drop column if exists display_name_es,
  drop column if exists display_name_en,
  drop column if exists body_es,
  drop column if exists body_en;

create table if not exists public.opposition_topics (
  id bigserial primary key,
  opposition_id text not null references public.oppositions(id) on delete cascade,
  topic_code text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.opposition_topics
  add column if not exists topic_code text;

update public.opposition_topics
set topic_code = coalesce(nullif(btrim(topic_code), ''), 'topic-' || id::text)
where topic_code is null or btrim(topic_code) = '';

alter table public.opposition_topics
  alter column topic_code set not null;

alter table public.opposition_topics
  drop column if exists title_es,
  drop column if exists title_en;

create index if not exists opposition_topics_opposition_id_idx
  on public.opposition_topics(opposition_id);

create index if not exists opposition_topics_order_index_idx
  on public.opposition_topics(opposition_id, order_index);

create unique index if not exists opposition_topics_unique_order_idx
  on public.opposition_topics(opposition_id, order_index, topic_code);

create unique index if not exists opposition_topics_unique_code_idx
  on public.opposition_topics(opposition_id, topic_code);

insert into public.oppositions (
  id,
  sort_order,
  is_active
)
values
  ('cuerpo-general-auxiliar-age', 10, true),
  ('administrativo-estado', 20, true),
  ('gestion-procesal', 30, true),
  ('tramitacion-procesal', 40, true),
  ('auxilio-judicial', 50, true),
  ('inspectores-hacienda', 60, true),
  ('tecnicos-hacienda', 70, true),
  ('agente-hacienda', 80, true),
  ('policia-nacional', 90, true),
  ('guardia-civil', 100, true),
  ('gestion-administracion-civil-estado', 110, true),
  ('superior-administradores-civiles-estado', 120, true)
on conflict (id) do update
set
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

alter table public.profiles
  add column if not exists preferred_opposition_id text references public.oppositions(id) on delete set null;

create index if not exists profiles_preferred_opposition_id_idx
  on public.profiles(preferred_opposition_id);

create or replace function public.normalize_profile_text(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(btrim(coalesce(value, ''))), '\s+', ' ', 'g');
$$;

create or replace function public.map_preferred_opposition_to_id(value text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text := public.normalize_profile_text(value);
begin
  if normalized = '' then
    return null;
  end if;

  case normalized
    when 'cuerpo-general-auxiliar-age' then return 'cuerpo-general-auxiliar-age';
    when 'cuerpo general auxiliar age (c2)' then return 'cuerpo-general-auxiliar-age';
    when 'cuerpo general auxiliar age' then return 'cuerpo-general-auxiliar-age';
    when 'auxiliar administrativo del estado' then return 'cuerpo-general-auxiliar-age';
    when 'auxiliar age c2' then return 'cuerpo-general-auxiliar-age';

    when 'administrativo-estado' then return 'administrativo-estado';
    when 'cuerpo general administrativo age (c1)' then return 'administrativo-estado';
    when 'cuerpo general administrativo age' then return 'administrativo-estado';
    when 'administrativo del estado' then return 'administrativo-estado';
    when 'state administrative officer' then return 'administrativo-estado';

    when 'gestion-procesal' then return 'gestion-procesal';
    when 'gestion procesal (a2, justicia)' then return 'gestion-procesal';
    when 'gestión procesal (a2, justicia)' then return 'gestion-procesal';
    when 'gestion procesal' then return 'gestion-procesal';
    when 'gestión procesal' then return 'gestion-procesal';

    when 'tramitacion-procesal' then return 'tramitacion-procesal';
    when 'tramitacion procesal (c1, justicia)' then return 'tramitacion-procesal';
    when 'tramitación procesal (c1, justicia)' then return 'tramitacion-procesal';
    when 'tramitacion procesal' then return 'tramitacion-procesal';
    when 'tramitación procesal' then return 'tramitacion-procesal';
    when 'procedural processing' then return 'tramitacion-procesal';

    when 'auxilio-judicial' then return 'auxilio-judicial';
    when 'auxilio judicial (c2, justicia)' then return 'auxilio-judicial';
    when 'auxilio judicial' then return 'auxilio-judicial';
    when 'judicial assistance' then return 'auxilio-judicial';

    when 'inspectores-hacienda' then return 'inspectores-hacienda';
    when 'inspectores de hacienda (a1)' then return 'inspectores-hacienda';
    when 'inspectores de hacienda' then return 'inspectores-hacienda';
    when 'inspector de hacienda' then return 'inspectores-hacienda';

    when 'tecnicos-hacienda' then return 'tecnicos-hacienda';
    when 'tecnicos de hacienda (a2)' then return 'tecnicos-hacienda';
    when 'técnicos de hacienda (a2)' then return 'tecnicos-hacienda';
    when 'tecnicos de hacienda' then return 'tecnicos-hacienda';
    when 'técnicos de hacienda' then return 'tecnicos-hacienda';

    when 'agente-hacienda' then return 'agente-hacienda';
    when 'agente de hacienda' then return 'agente-hacienda';
    when 'agentes de hacienda publica (c1)' then return 'agente-hacienda';
    when 'agentes de hacienda pública (c1)' then return 'agente-hacienda';
    when 'agentes de hacienda publica' then return 'agente-hacienda';
    when 'agentes de hacienda pública' then return 'agente-hacienda';
    when 'tax agency officer' then return 'agente-hacienda';

    when 'policia-nacional' then return 'policia-nacional';
    when 'policia nacional (basica y ejecutiva)' then return 'policia-nacional';
    when 'policía nacional (básica y ejecutiva)' then return 'policia-nacional';
    when 'policia nacional' then return 'policia-nacional';
    when 'policía nacional' then return 'policia-nacional';

    when 'guardia-civil' then return 'guardia-civil';
    when 'guardia civil (cabos y guardias)' then return 'guardia-civil';
    when 'guardia civil' then return 'guardia-civil';

    when 'gestion-administracion-civil-estado' then return 'gestion-administracion-civil-estado';
    when 'cuerpo de gestion de la administracion civil del estado (a2 age)' then return 'gestion-administracion-civil-estado';
    when 'cuerpo de gestión de la administración civil del estado (a2 age)' then return 'gestion-administracion-civil-estado';
    when 'gestion de la administracion civil del estado' then return 'gestion-administracion-civil-estado';
    when 'gestión de la administración civil del estado' then return 'gestion-administracion-civil-estado';

    when 'superior-administradores-civiles-estado' then return 'superior-administradores-civiles-estado';
    when 'cuerpo superior de administradores civiles del estado (a1 age)' then return 'superior-administradores-civiles-estado';
    when 'cuerpo superior de administradores civiles del estado' then return 'superior-administradores-civiles-estado';
    else
      return null;
  end case;
end;
$$;

update public.profiles p
set preferred_opposition_id = public.map_preferred_opposition_to_id(p.preferred_opposition)
where p.preferred_opposition_id is null;

update public.profiles p
set preferred_opposition = p.preferred_opposition_id
where p.preferred_opposition_id is not null
  and (p.preferred_opposition is null or btrim(p.preferred_opposition) = '');

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
  next_preferred_opposition text := nullif(btrim(coalesce(metadata->>'preferred_opposition', '')), '');
  next_preferred_opposition_id text := nullif(btrim(coalesce(metadata->>'preferred_opposition_id', '')), '');
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
    age,
    preferred_opposition,
    preferred_opposition_id,
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
    next_preferred_opposition,
    next_preferred_opposition_id,
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
    preferred_opposition_id = excluded.preferred_opposition_id,
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

alter table public.oppositions enable row level security;
alter table public.opposition_topics enable row level security;

drop policy if exists "Public can read active oppositions" on public.oppositions;
create policy "Public can read active oppositions"
on public.oppositions
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Public can read active opposition topics" on public.opposition_topics;
create policy "Public can read active opposition topics"
on public.opposition_topics
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.oppositions o
    where o.id = opposition_topics.opposition_id
      and o.is_active = true
  )
);

grant select on public.oppositions to anon, authenticated;
grant select on public.opposition_topics to anon, authenticated;

drop trigger if exists set_oppositions_updated_at on public.oppositions;
create trigger set_oppositions_updated_at
before update on public.oppositions
for each row
execute function public.set_profiles_updated_at();

drop trigger if exists set_opposition_topics_updated_at on public.opposition_topics;
create trigger set_opposition_topics_updated_at
before update on public.opposition_topics
for each row
execute function public.set_profiles_updated_at();

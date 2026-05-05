alter table public.profiles
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_reason text,
  add column if not exists deleted_auth_email text;

comment on column public.profiles.is_deleted is
  'Soft-delete marker. Deleted profiles cannot be used to access the app again.';
comment on column public.profiles.deleted_at is
  'Timestamp when the profile was soft-deleted.';
comment on column public.profiles.deletion_reason is
  'Optional reason selected by the user when requesting irreversible account deletion.';
comment on column public.profiles.deleted_auth_email is
  'Anonymized auth email assigned during deletion to release the original email for new signup.';

create index if not exists profiles_active_email_idx
  on public.profiles (lower(email))
  where is_deleted = false and email is not null;

create index if not exists profiles_deleted_idx
  on public.profiles (is_deleted, deleted_at)
  where is_deleted = true;

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
    left join public.profiles p on p.user_id = u.id
    where lower(nullif(btrim(coalesce(u.email, '')), '')) = normalized_email
      and coalesce(p.is_deleted, false) = false
  );
end;
$$;

revoke all on function public.is_signup_email_available(text) from public;
grant execute on function public.is_signup_email_available(text)
  to anon, authenticated;

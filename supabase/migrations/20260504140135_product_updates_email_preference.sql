alter table public.profiles
  add column if not exists product_updates_email_enabled boolean not null default true;

comment on column public.profiles.product_updates_email_enabled is
  'User opt-in flag for product update emails. Only users with true should receive product/news emails.';

create index if not exists profiles_product_updates_email_enabled_idx
  on public.profiles (product_updates_email_enabled)
  where product_updates_email_enabled = true;

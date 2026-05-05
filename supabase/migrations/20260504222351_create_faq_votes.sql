create table if not exists public.faq_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  faq_id text not null,
  vote text not null check (vote in ('up', 'down')),
  created_at timestamptz not null default now(),
  primary key (user_id, faq_id)
);

alter table public.faq_votes enable row level security;

drop policy if exists "Users can read own faq votes" on public.faq_votes;
create policy "Users can read own faq votes"
  on public.faq_votes
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own faq votes" on public.faq_votes;
create policy "Users can insert own faq votes"
  on public.faq_votes
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own faq votes" on public.faq_votes;
create policy "Users can update own faq votes"
  on public.faq_votes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own faq votes" on public.faq_votes;
create policy "Users can delete own faq votes"
  on public.faq_votes
  for delete
  using (auth.uid() = user_id);
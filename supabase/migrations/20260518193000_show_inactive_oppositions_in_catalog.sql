drop policy if exists "Public can read active oppositions"
on public.oppositions;

create policy "Public can read oppositions catalog"
on public.oppositions
for select
to anon, authenticated
using (true);

drop policy if exists "Users can receive own support ticket broadcasts"
on realtime.messages;

create policy "Users can receive own support ticket broadcasts"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) ~ '^support-ticket:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.support_tickets t
    where t.id = replace((select realtime.topic()), 'support-ticket:', '')::uuid
      and t.user_id = (select auth.uid())
  )
);

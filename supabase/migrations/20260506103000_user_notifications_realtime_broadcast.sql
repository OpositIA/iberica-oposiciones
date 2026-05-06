create or replace function public.broadcast_user_notification_realtime_changes()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_user_id uuid;
begin
  v_user_id := coalesce(new.user_id, old.user_id);

  if v_user_id is not null then
    perform realtime.broadcast_changes(
      'user-notifications:' || v_user_id::text,
      tg_op,
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old
    );
  end if;

  return null;
end;
$$;

drop trigger if exists broadcast_user_notifications_realtime_changes
on public.user_notifications;
create trigger broadcast_user_notifications_realtime_changes
after insert or update or delete on public.user_notifications
for each row
execute function public.broadcast_user_notification_realtime_changes();

drop policy if exists "Users can receive own notification broadcasts"
on realtime.messages;

create policy "Users can receive own notification broadcasts"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) ~ '^user-notifications:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and replace((select realtime.topic()), 'user-notifications:', '')::uuid = (select auth.uid())
);

create or replace function public.broadcast_support_ticket_realtime_changes()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_ticket_id uuid;
  v_user_id uuid;
begin
  if tg_table_name = 'support_tickets' then
    v_ticket_id := coalesce(new.id, old.id);
    v_user_id := coalesce(new.user_id, old.user_id);
  else
    v_ticket_id := coalesce(new.ticket_id, old.ticket_id);

    select t.user_id
    into v_user_id
    from public.support_tickets t
    where t.id = v_ticket_id;
  end if;

  if v_ticket_id is not null then
    perform realtime.broadcast_changes(
      'support-ticket:' || v_ticket_id::text,
      tg_op,
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old
    );
  end if;

  if v_user_id is not null then
    perform realtime.broadcast_changes(
      'support-tickets:' || v_user_id::text,
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

drop policy if exists "Users can receive own support ticket list broadcasts"
on realtime.messages;

create policy "Users can receive own support ticket list broadcasts"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) ~ '^support-tickets:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and replace((select realtime.topic()), 'support-tickets:', '')::uuid = (select auth.uid())
);

grant select on table public.support_ticket_attachments to authenticated;

create or replace function public.broadcast_support_ticket_realtime_changes()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_ticket_id uuid;
begin
  if tg_table_name = 'support_tickets' then
    v_ticket_id := coalesce(new.id, old.id);
  else
    v_ticket_id := coalesce(new.ticket_id, old.ticket_id);
  end if;

  if v_ticket_id is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'support-ticket:' || v_ticket_id::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );

  return null;
end;
$$;

drop trigger if exists broadcast_support_tickets_realtime_changes
on public.support_tickets;
create trigger broadcast_support_tickets_realtime_changes
after insert or update or delete on public.support_tickets
for each row
execute function public.broadcast_support_ticket_realtime_changes();

drop trigger if exists broadcast_support_ticket_messages_realtime_changes
on public.support_ticket_messages;
create trigger broadcast_support_ticket_messages_realtime_changes
after insert or update or delete on public.support_ticket_messages
for each row
execute function public.broadcast_support_ticket_realtime_changes();

drop trigger if exists broadcast_support_ticket_attachments_realtime_changes
on public.support_ticket_attachments;
create trigger broadcast_support_ticket_attachments_realtime_changes
after insert or update or delete on public.support_ticket_attachments
for each row
execute function public.broadcast_support_ticket_realtime_changes();

drop policy if exists "Users can receive own support ticket broadcasts"
on realtime.messages;
create policy "Users can receive own support ticket broadcasts"
on realtime.messages
for select
to authenticated
using (
  private
  and extension = 'broadcast'
  and topic ~ '^support-ticket:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.support_tickets t
    where t.id = replace(topic, 'support-ticket:', '')::uuid
      and t.user_id = auth.uid()
  )
);

alter table public.profiles
  add column if not exists support_ticket_reply_email_enabled boolean not null default true;

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('support_ticket_reply')),
  entity_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint user_notifications_payload_object_chk
    check (jsonb_typeof(payload) = 'object')
);

create index if not exists user_notifications_user_unread_created_idx
  on public.user_notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create unique index if not exists user_notifications_support_reply_message_unique
  on public.user_notifications ((payload->>'message_id'))
  where type = 'support_ticket_reply';

alter table public.user_notifications enable row level security;

drop policy if exists "Users can read own notifications" on public.user_notifications;
create policy "Users can read own notifications"
on public.user_notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can update own notifications" on public.user_notifications;
create policy "Users can update own notifications"
on public.user_notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on table public.user_notifications from anon, authenticated;
grant select, update on table public.user_notifications to authenticated;
grant select, insert, update, delete on table public.user_notifications to service_role;

create or replace function public.create_support_reply_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets%rowtype;
begin
  if new.author_role <> 'staff' or not new.customer_visible then
    return new;
  end if;

  select *
  into v_ticket
  from public.support_tickets
  where id = new.ticket_id;

  if v_ticket.id is null then
    return new;
  end if;

  insert into public.user_notifications (
    user_id,
    type,
    entity_id,
    payload
  )
  values (
    v_ticket.user_id,
    'support_ticket_reply',
    v_ticket.id,
    jsonb_build_object(
      'message_id', new.id::text,
      'ticket_id', v_ticket.id::text,
      'ticket_code', v_ticket.ticket_code,
      'ticket_subject', v_ticket.subject
    )
  )
  on conflict ((payload->>'message_id'))
  where type = 'support_ticket_reply'
  do nothing;

  return new;
end;
$$;

drop trigger if exists create_support_reply_notification
on public.support_ticket_messages;
create trigger create_support_reply_notification
after insert on public.support_ticket_messages
for each row
execute function public.create_support_reply_notification();

revoke all on function public.create_support_reply_notification() from public;
grant execute on function public.create_support_reply_notification()
  to service_role;

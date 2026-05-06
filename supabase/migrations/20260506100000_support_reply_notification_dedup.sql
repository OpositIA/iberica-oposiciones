create table if not exists public.support_ticket_reply_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery_day date not null,
  created_at timestamptz not null default now(),
  constraint support_ticket_reply_email_deliveries_daily_unique
    unique (ticket_id, user_id, delivery_day)
);

create index if not exists support_ticket_reply_email_deliveries_user_day_idx
  on public.support_ticket_reply_email_deliveries (user_id, delivery_day desc);

alter table public.support_ticket_reply_email_deliveries enable row level security;

revoke all on table public.support_ticket_reply_email_deliveries
  from anon, authenticated;
grant select, insert, delete on table public.support_ticket_reply_email_deliveries
  to service_role;

delete from public.user_notifications
where type = 'support_ticket_reply'
  and read_at is not null;

delete from public.user_notifications notification
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id, type, entity_id
        order by created_at desc, id desc
      ) as row_number
    from public.user_notifications
    where type = 'support_ticket_reply'
      and entity_id is not null
  ) ranked
  where ranked.row_number > 1
) duplicate
where notification.id = duplicate.id;

create unique index if not exists user_notifications_support_reply_ticket_unique
  on public.user_notifications (user_id, type, entity_id)
  where type = 'support_ticket_reply'
    and entity_id is not null
    and read_at is null;

drop policy if exists "Users can delete own notifications" on public.user_notifications;
create policy "Users can delete own notifications"
on public.user_notifications
for delete
to authenticated
using (auth.uid() = user_id);

grant select, update, delete on table public.user_notifications to authenticated;

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
  on conflict (user_id, type, entity_id)
  where type = 'support_ticket_reply'
    and entity_id is not null
    and read_at is null
  do nothing;

  return new;
end;
$$;

create or replace function public.mark_support_ticket_read(
  p_ticket_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated boolean;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  update public.support_tickets
  set
    user_last_read_at = now(),
    updated_at = now()
  where id = p_ticket_id
    and user_id = v_user_id;

  v_updated := found;

  if v_updated then
    delete from public.user_notifications
    where user_id = v_user_id
      and type = 'support_ticket_reply'
      and entity_id = p_ticket_id;
  end if;

  return v_updated;
end;
$$;

revoke all on function public.create_support_reply_notification() from public;
grant execute on function public.create_support_reply_notification()
  to service_role;

revoke all on function public.mark_support_ticket_read(uuid) from public;
grant execute on function public.mark_support_ticket_read(uuid)
  to authenticated, service_role;

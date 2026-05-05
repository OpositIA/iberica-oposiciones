create table if not exists public.support_user_ticket_sequences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_value integer not null default 0 check (last_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_number integer not null check (ticket_number >= 1),
  ticket_code text generated always as (
    'OP-' || lpad(ticket_number::text, 4, '0')
  ) stored,
  category text not null check (
    category in ('account', 'billing', 'tests', 'ai', 'technical')
  ),
  issue_type text null check (
    issue_type is null
    or issue_type in ('question', 'incident', 'access', 'payment', 'content')
  ),
  subject text not null check (char_length(subject) between 3 and 160),
  status text not null default 'open' check (
    status in ('open', 'awaiting_user', 'resolved')
  ),
  source_channel text not null default 'web' check (
    source_channel in ('web', 'telegram', 'email', 'system')
  ),
  request_context jsonb not null default '{}'::jsonb,
  rating smallint null check (rating between 1 and 5),
  last_message_at timestamptz not null default now(),
  last_user_message_at timestamptz null,
  last_staff_message_at timestamptz null,
  user_last_read_at timestamptz null,
  staff_last_read_at timestamptz null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_user_ticket_number_unique unique (user_id, ticket_number)
);

create table if not exists public.support_ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_user_id uuid null references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('user', 'staff', 'system')),
  source_channel text not null default 'web' check (
    source_channel in ('web', 'telegram', 'email', 'system')
  ),
  body text not null check (char_length(body) between 1 and 4000),
  metadata jsonb not null default '{}'::jsonb,
  customer_visible boolean not null default true,
  telegram_chat_id bigint null,
  telegram_message_id bigint null,
  telegram_thread_id bigint null,
  created_at timestamptz not null default now()
);

create table if not exists public.support_telegram_threads (
  ticket_id uuid primary key references public.support_tickets(id) on delete cascade,
  telegram_chat_id bigint not null,
  telegram_thread_id bigint not null,
  telegram_topic_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_telegram_threads_chat_thread_unique unique (
    telegram_chat_id,
    telegram_thread_id
  )
);

create table if not exists public.support_telegram_webhook_events (
  update_id bigint primary key,
  ticket_id uuid null references public.support_tickets(id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_user_last_message_idx
  on public.support_tickets (user_id, last_message_at desc, created_at desc);

create index if not exists support_tickets_status_last_message_idx
  on public.support_tickets (status, last_message_at desc)
  where status <> 'resolved';

create index if not exists support_ticket_messages_ticket_created_idx
  on public.support_ticket_messages (ticket_id, created_at asc, id asc);

create index if not exists support_ticket_messages_ticket_desc_idx
  on public.support_ticket_messages (ticket_id, created_at desc, id desc);

create unique index if not exists support_ticket_messages_telegram_message_unique
  on public.support_ticket_messages (telegram_chat_id, telegram_message_id)
  where telegram_chat_id is not null
    and telegram_message_id is not null;

create or replace function public.set_support_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_support_user_ticket_sequences_updated_at
on public.support_user_ticket_sequences;
create trigger set_support_user_ticket_sequences_updated_at
before update on public.support_user_ticket_sequences
for each row
execute function public.set_support_updated_at();

drop trigger if exists set_support_tickets_updated_at on public.support_tickets;
create trigger set_support_tickets_updated_at
before update on public.support_tickets
for each row
execute function public.set_support_updated_at();

drop trigger if exists set_support_telegram_threads_updated_at
on public.support_telegram_threads;
create trigger set_support_telegram_threads_updated_at
before update on public.support_telegram_threads
for each row
execute function public.set_support_updated_at();

create or replace function public.touch_support_ticket_from_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.author_role = 'user' then
    update public.support_tickets
    set
      last_message_at = new.created_at,
      last_user_message_at = new.created_at,
      user_last_read_at = coalesce(user_last_read_at, new.created_at),
      status = case
        when status = 'resolved' then 'open'
        else status
      end,
      resolved_at = case
        when status = 'resolved' then null
        else resolved_at
      end,
      updated_at = now()
    where id = new.ticket_id;
  elsif new.author_role = 'staff' then
    update public.support_tickets
    set
      last_message_at = new.created_at,
      last_staff_message_at = new.created_at,
      status = 'awaiting_user',
      updated_at = now()
    where id = new.ticket_id;
  else
    update public.support_tickets
    set
      last_message_at = new.created_at,
      updated_at = now()
    where id = new.ticket_id;
  end if;

  return new;
end;
$$;

drop trigger if exists touch_support_ticket_from_message
on public.support_ticket_messages;
create trigger touch_support_ticket_from_message
after insert on public.support_ticket_messages
for each row
execute function public.touch_support_ticket_from_message();

alter table public.support_user_ticket_sequences enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_telegram_threads enable row level security;
alter table public.support_telegram_webhook_events enable row level security;

drop policy if exists "Users can read own support tickets" on public.support_tickets;
create policy "Users can read own support tickets"
on public.support_tickets
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own support messages" on public.support_ticket_messages;
create policy "Users can read own support messages"
on public.support_ticket_messages
for select
using (
  customer_visible
  and exists (
    select 1
    from public.support_tickets t
    where t.id = support_ticket_messages.ticket_id
      and t.user_id = auth.uid()
  )
);

revoke all on table public.support_user_ticket_sequences from anon, authenticated;
revoke all on table public.support_tickets from anon;
revoke all on table public.support_ticket_messages from anon;
revoke all on table public.support_telegram_threads from anon, authenticated;
revoke all on table public.support_telegram_webhook_events from anon, authenticated;

grant select on table public.support_tickets to authenticated;
grant select on table public.support_ticket_messages to authenticated;

grant select, insert, update, delete on table public.support_user_ticket_sequences to service_role;
grant select, insert, update, delete on table public.support_tickets to service_role;
grant select, insert, update, delete on table public.support_ticket_messages to service_role;
grant select, insert, update, delete on table public.support_telegram_threads to service_role;
grant select, insert, update, delete on table public.support_telegram_webhook_events to service_role;

do $$
declare
  v_message_seq text;
begin
  v_message_seq := pg_get_serial_sequence('public.support_ticket_messages', 'id');
  if v_message_seq is not null then
    execute format('revoke all on sequence %s from anon, authenticated', v_message_seq);
    execute format('grant usage, select on sequence %s to service_role', v_message_seq);
  end if;
end $$;

create or replace function public.create_support_ticket(
  p_category text,
  p_subject text,
  p_message text,
  p_issue_type text default null,
  p_source_channel text default 'web',
  p_request_context jsonb default '{}'::jsonb
)
returns table (
  ticket_id uuid,
  ticket_code text,
  subject text,
  category text,
  status text,
  created_at timestamptz,
  last_message_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_issue_type text := nullif(btrim(coalesce(p_issue_type, '')), '');
  v_source_channel text := lower(nullif(btrim(coalesce(p_source_channel, '')), ''));
  v_request_context jsonb := coalesce(p_request_context, '{}'::jsonb);
  v_ticket_number integer;
  v_ticket public.support_tickets%rowtype;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if v_category not in ('account', 'billing', 'tests', 'ai', 'technical') then
    raise exception 'Invalid support category';
  end if;

  if v_issue_type is not null
    and v_issue_type not in ('question', 'incident', 'access', 'payment', 'content')
  then
    raise exception 'Invalid support issue type';
  end if;

  if v_source_channel not in ('web', 'telegram', 'email', 'system') then
    v_source_channel := 'web';
  end if;

  if v_subject is null or char_length(v_subject) < 3 or char_length(v_subject) > 160 then
    raise exception 'Invalid support ticket subject';
  end if;

  if v_message is null or char_length(v_message) > 4000 then
    raise exception 'Invalid support ticket body';
  end if;

  insert into public.support_user_ticket_sequences (user_id, last_value)
  values (v_user_id, 1)
  on conflict (user_id) do update
  set last_value = public.support_user_ticket_sequences.last_value + 1,
      updated_at = now()
  returning last_value into v_ticket_number;

  insert into public.support_tickets (
    user_id,
    ticket_number,
    category,
    issue_type,
    subject,
    status,
    source_channel,
    request_context,
    last_message_at,
    last_user_message_at,
    user_last_read_at
  )
  values (
    v_user_id,
    v_ticket_number,
    v_category,
    v_issue_type,
    v_subject,
    'open',
    v_source_channel,
    v_request_context,
    now(),
    now(),
    now()
  )
  returning * into v_ticket;

  insert into public.support_ticket_messages (
    ticket_id,
    author_user_id,
    author_role,
    source_channel,
    body,
    metadata,
    customer_visible
  )
  values (
    v_ticket.id,
    v_user_id,
    'user',
    v_source_channel,
    v_message,
    jsonb_build_object('event', 'ticket_created'),
    true
  );

  return query
  select
    v_ticket.id,
    v_ticket.ticket_code,
    v_ticket.subject,
    v_ticket.category,
    v_ticket.status,
    v_ticket.created_at,
    v_ticket.last_message_at;
end;
$$;

create or replace function public.get_my_support_tickets()
returns table (
  ticket_id uuid,
  ticket_code text,
  subject text,
  category text,
  status text,
  rating smallint,
  message_count bigint,
  unread boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with auth_user as (
    select auth.uid() as user_id
  )
  select
    t.id as ticket_id,
    t.ticket_code,
    t.subject,
    t.category,
    t.status,
    t.rating,
    count(m.id)::bigint as message_count,
    coalesce(t.last_staff_message_at, '-infinity'::timestamptz)
      > coalesce(t.user_last_read_at, '-infinity'::timestamptz) as unread,
    t.created_at,
    t.updated_at,
    t.last_message_at
  from public.support_tickets t
  join auth_user au on au.user_id = t.user_id
  left join public.support_ticket_messages m
    on m.ticket_id = t.id
    and m.customer_visible
  group by t.id
  order by t.last_message_at desc, t.created_at desc;
$$;

create or replace function public.get_my_support_ticket_detail(
  p_ticket_id uuid
)
returns table (
  ticket_id uuid,
  ticket_code text,
  subject text,
  category text,
  status text,
  rating smallint,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  resolved_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    t.id as ticket_id,
    t.ticket_code,
    t.subject,
    t.category,
    t.status,
    t.rating,
    t.created_at,
    t.updated_at,
    t.last_message_at,
    t.resolved_at
  from public.support_tickets t
  where t.id = p_ticket_id
    and t.user_id = auth.uid();
$$;

create or replace function public.get_my_support_ticket_messages(
  p_ticket_id uuid
)
returns table (
  message_id bigint,
  ticket_id uuid,
  author_role text,
  body text,
  source_channel text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    m.id as message_id,
    m.ticket_id,
    m.author_role,
    m.body,
    m.source_channel,
    m.created_at
  from public.support_ticket_messages m
  where m.ticket_id = p_ticket_id
    and m.customer_visible
    and exists (
      select 1
      from public.support_tickets t
      where t.id = m.ticket_id
        and t.user_id = auth.uid()
    )
  order by m.created_at asc, m.id asc;
$$;

create or replace function public.reply_to_support_ticket(
  p_ticket_id uuid,
  p_message text,
  p_source_channel text default 'web'
)
returns table (
  message_id bigint,
  ticket_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_source_channel text := lower(nullif(btrim(coalesce(p_source_channel, '')), ''));
  v_message_id bigint;
  v_created_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1
    from public.support_tickets t
    where t.id = p_ticket_id
      and t.user_id = v_user_id
  ) then
    raise exception 'Support ticket not found';
  end if;

  if v_source_channel not in ('web', 'telegram', 'email', 'system') then
    v_source_channel := 'web';
  end if;

  if v_message is null or char_length(v_message) > 4000 then
    raise exception 'Invalid support reply body';
  end if;

  insert into public.support_ticket_messages (
    ticket_id,
    author_user_id,
    author_role,
    source_channel,
    body
  )
  values (
    p_ticket_id,
    v_user_id,
    'user',
    v_source_channel,
    v_message
  )
  returning id, created_at
  into v_message_id, v_created_at;

  return query
  select v_message_id, p_ticket_id, v_created_at;
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

  return found;
end;
$$;

create or replace function public.resolve_my_support_ticket(
  p_ticket_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  update public.support_tickets
  set
    status = 'resolved',
    resolved_at = now(),
    updated_at = now()
  where id = p_ticket_id
    and user_id = v_user_id;

  return found;
end;
$$;

revoke all on function public.create_support_ticket(text, text, text, text, text, jsonb) from public;
revoke all on function public.get_my_support_tickets() from public;
revoke all on function public.get_my_support_ticket_detail(uuid) from public;
revoke all on function public.get_my_support_ticket_messages(uuid) from public;
revoke all on function public.reply_to_support_ticket(uuid, text, text) from public;
revoke all on function public.mark_support_ticket_read(uuid) from public;
revoke all on function public.resolve_my_support_ticket(uuid) from public;

grant execute on function public.create_support_ticket(text, text, text, text, text, jsonb)
  to authenticated, service_role;
grant execute on function public.get_my_support_tickets()
  to authenticated, service_role;
grant execute on function public.get_my_support_ticket_detail(uuid)
  to authenticated, service_role;
grant execute on function public.get_my_support_ticket_messages(uuid)
  to authenticated, service_role;
grant execute on function public.reply_to_support_ticket(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.mark_support_ticket_read(uuid)
  to authenticated, service_role;
grant execute on function public.resolve_my_support_ticket(uuid)
  to authenticated, service_role;

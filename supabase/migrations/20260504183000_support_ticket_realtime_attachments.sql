insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-ticket-attachments',
  'support-ticket-attachments',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  message_id bigint not null references public.support_ticket_messages(id) on delete cascade,
  uploader_user_id uuid null references auth.users(id) on delete set null,
  storage_bucket text not null default 'support-ticket-attachments',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint null,
  image_width integer null,
  image_height integer null,
  source_channel text not null default 'web' check (
    source_channel in ('web', 'telegram', 'email', 'system')
  ),
  telegram_file_id text null,
  telegram_message_id bigint null,
  created_at timestamptz not null default now(),
  constraint support_ticket_attachments_bucket_chk
    check (storage_bucket = 'support-ticket-attachments'),
  constraint support_ticket_attachments_storage_path_chk
    check (btrim(storage_path) <> ''),
  constraint support_ticket_attachments_file_name_chk
    check (btrim(file_name) <> ''),
  constraint support_ticket_attachments_mime_type_chk
    check (mime_type in ('image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif')),
  constraint support_ticket_attachments_file_size_chk
    check (file_size_bytes is null or file_size_bytes > 0),
  constraint support_ticket_attachments_image_width_chk
    check (image_width is null or image_width > 0),
  constraint support_ticket_attachments_image_height_chk
    check (image_height is null or image_height > 0),
  constraint support_ticket_attachments_storage_path_unique
    unique (storage_bucket, storage_path)
);

create index if not exists support_ticket_attachments_ticket_created_idx
  on public.support_ticket_attachments (ticket_id, created_at asc, id asc);

create index if not exists support_ticket_attachments_message_idx
  on public.support_ticket_attachments (message_id, created_at asc, id asc);

alter table public.support_ticket_attachments enable row level security;

drop policy if exists "Users can read own support attachments" on public.support_ticket_attachments;
create policy "Users can read own support attachments"
on public.support_ticket_attachments
for select
using (
  exists (
    select 1
    from public.support_tickets t
    where t.id = support_ticket_attachments.ticket_id
      and t.user_id = auth.uid()
  )
);

revoke all on table public.support_ticket_attachments from anon, authenticated;
grant select, insert, update, delete on table public.support_ticket_attachments to service_role;

drop policy if exists "Users can read own support ticket attachments objects" on storage.objects;
create policy "Users can read own support ticket attachments objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'support-ticket-attachments'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload own support ticket attachments objects" on storage.objects;
create policy "Users can upload own support ticket attachments objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'support-ticket-attachments'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own support ticket attachments objects" on storage.objects;
create policy "Users can update own support ticket attachments objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'support-ticket-attachments'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'support-ticket-attachments'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own support ticket attachments objects" on storage.objects;
create policy "Users can delete own support ticket attachments objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'support-ticket-attachments'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

alter table public.support_ticket_messages
  alter column body set default '';

alter table public.support_ticket_messages
  drop constraint if exists support_ticket_messages_body_check;

alter table public.support_ticket_messages
  add constraint support_ticket_messages_body_check
  check (char_length(body) <= 4000);

drop function if exists public.reply_to_support_ticket(uuid, text, text);
create or replace function public.reply_to_support_ticket(
  p_ticket_id uuid,
  p_message text,
  p_source_channel text default 'web',
  p_attachments jsonb default '[]'::jsonb
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
  v_message text := coalesce(btrim(coalesce(p_message, '')), '');
  v_source_channel text := lower(nullif(btrim(coalesce(p_source_channel, '')), ''));
  v_message_id bigint;
  v_created_at timestamptz;
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_attachment_count integer := 0;
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

  if jsonb_typeof(v_attachments) <> 'array' then
    raise exception 'Invalid support attachments payload';
  end if;

  v_attachment_count := jsonb_array_length(v_attachments);
  if v_attachment_count > 6 then
    raise exception 'Too many support attachments';
  end if;

  if char_length(v_message) > 4000 then
    raise exception 'Invalid support reply body';
  end if;

  if char_length(v_message) = 0 and v_attachment_count = 0 then
    raise exception 'Support reply cannot be empty';
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
  returning
    support_ticket_messages.id,
    support_ticket_messages.created_at
  into v_message_id, v_created_at;

  if v_attachment_count > 0 then
    insert into public.support_ticket_attachments (
      ticket_id,
      message_id,
      uploader_user_id,
      storage_bucket,
      storage_path,
      file_name,
      mime_type,
      file_size_bytes,
      image_width,
      image_height,
      source_channel
    )
    select
      p_ticket_id,
      v_message_id,
      v_user_id,
      'support-ticket-attachments',
      item->>'storage_path',
      coalesce(nullif(btrim(item->>'file_name'), ''), 'imagen'),
      item->>'mime_type',
      case
        when coalesce(item->>'file_size_bytes', '') ~ '^\d+$'
          then (item->>'file_size_bytes')::bigint
        else null
      end,
      case
        when coalesce(item->>'image_width', '') ~ '^\d+$'
          then (item->>'image_width')::integer
        else null
      end,
      case
        when coalesce(item->>'image_height', '') ~ '^\d+$'
          then (item->>'image_height')::integer
        else null
      end,
      v_source_channel
    from jsonb_array_elements(v_attachments) as item
    where coalesce(item->>'storage_path', '') <> ''
      and coalesce(item->>'mime_type', '') in ('image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif')
      and split_part(item->>'storage_path', '/', 1) = v_user_id::text
      and exists (
        select 1
        from storage.objects o
        where o.bucket_id = 'support-ticket-attachments'
          and o.name = item->>'storage_path'
      );
  end if;

  return query
  select v_message_id, p_ticket_id, v_created_at;
end;
$$;

drop function if exists public.get_my_support_ticket_messages(uuid);
create or replace function public.get_my_support_ticket_messages(
  p_ticket_id uuid
)
returns table (
  message_id bigint,
  ticket_id uuid,
  author_role text,
  body text,
  source_channel text,
  created_at timestamptz,
  attachments jsonb
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
    m.created_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'storage_bucket', a.storage_bucket,
          'storage_path', a.storage_path,
          'file_name', a.file_name,
          'mime_type', a.mime_type,
          'file_size_bytes', a.file_size_bytes,
          'image_width', a.image_width,
          'image_height', a.image_height,
          'created_at', a.created_at
        )
        order by a.created_at asc, a.id asc
      ) filter (where a.id is not null),
      '[]'::jsonb
    ) as attachments
  from public.support_ticket_messages m
  left join public.support_ticket_attachments a
    on a.message_id = m.id
  where m.ticket_id = p_ticket_id
    and m.customer_visible
    and exists (
      select 1
      from public.support_tickets t
      where t.id = m.ticket_id
        and t.user_id = auth.uid()
    )
  group by m.id
  order by m.created_at asc, m.id asc;
$$;

revoke all on function public.reply_to_support_ticket(uuid, text, text, jsonb) from public;
grant execute on function public.reply_to_support_ticket(uuid, text, text, jsonb)
  to authenticated, service_role;

revoke all on function public.get_my_support_ticket_messages(uuid) from public;
grant execute on function public.get_my_support_ticket_messages(uuid)
  to authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_tickets'
  ) then
    alter publication supabase_realtime add table public.support_tickets;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_ticket_messages'
  ) then
    alter publication supabase_realtime add table public.support_ticket_messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_ticket_attachments'
  ) then
    alter publication supabase_realtime add table public.support_ticket_attachments;
  end if;
exception
  when undefined_object then
    null;
end $$;

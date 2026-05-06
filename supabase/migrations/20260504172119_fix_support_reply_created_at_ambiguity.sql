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
  v_inserted_attachment_count integer := 0;
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

    get diagnostics v_inserted_attachment_count = row_count;

    if v_inserted_attachment_count <> v_attachment_count then
      raise exception 'Invalid support attachments';
    end if;
  end if;

  return query
  select v_message_id, p_ticket_id, v_created_at;
end;
$$;

revoke all on function public.reply_to_support_ticket(uuid, text, text, jsonb) from public;
grant execute on function public.reply_to_support_ticket(uuid, text, text, jsonb)
  to authenticated, service_role;

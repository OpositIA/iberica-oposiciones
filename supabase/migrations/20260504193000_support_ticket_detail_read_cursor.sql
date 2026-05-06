drop function if exists public.get_my_support_ticket_detail(uuid);

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
  user_last_read_at timestamptz,
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
    t.user_last_read_at,
    t.resolved_at
  from public.support_tickets t
  where t.id = p_ticket_id
    and t.user_id = auth.uid();
$$;

revoke all on function public.get_my_support_ticket_detail(uuid) from public;
grant execute on function public.get_my_support_ticket_detail(uuid)
  to authenticated, service_role;

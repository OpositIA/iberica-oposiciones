alter table public.ai_conversations
  add column if not exists pinned boolean not null default false;

create index if not exists ai_conversations_user_pinned_last_message_idx
  on public.ai_conversations (user_id, pinned desc, last_message_at desc);

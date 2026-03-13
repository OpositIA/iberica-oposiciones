import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

const ASSISTANT_QUERY_STALE_MS = 60 * 1000;
const ASSISTANT_QUERY_GC_MS = 15 * 60 * 1000;

export const assistantQueryConfig = {
  staleTime: ASSISTANT_QUERY_STALE_MS,
  gcTime: ASSISTANT_QUERY_GC_MS
};

export const assistantQueryKeys = {
  conversations: (userId: string) =>
    ["assistant", "conversations", userId] as const,
  dailyQuota: (userId: string) => ["assistant", "daily-quota", userId] as const,
  messages: (conversationId: string) =>
    ["assistant", "messages", conversationId] as const
};

export type AssistantConversationRow = Pick<
  Tables<"ai_conversations">,
  "id" | "title" | "created_at" | "last_message_at" | "pinned"
>;

export type AssistantMessageRow = Pick<
  Tables<"ai_messages">,
  "id" | "role" | "content" | "created_at"
>;

export type AssistantDailyQuotaRow = {
  day: string;
  is_paid: boolean;
  limit: number;
  remaining: number;
  used: number;
};

export const fetchAssistantConversations = async (
  userId: string
): Promise<AssistantConversationRow[]> => {
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id, title, created_at, last_message_at, pinned")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("pinned", { ascending: false })
    .order("last_message_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as AssistantConversationRow[];
};

export const fetchAssistantDailyQuota = async (
  userId: string,
  timezone: string
): Promise<AssistantDailyQuotaRow | null> => {
  const { data, error } = await supabase.rpc("get_ai_daily_quota", {
    p_user_id: userId,
    p_tz: timezone
  });

  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;

  return {
    day: String(row.day),
    is_paid: Boolean(row.is_paid),
    limit:
      typeof row.limit === "number" && Number.isFinite(row.limit)
        ? Math.floor(row.limit)
        : 0,
    remaining:
      typeof row.remaining === "number" && Number.isFinite(row.remaining)
        ? Math.max(0, Math.floor(row.remaining))
        : 0,
    used:
      typeof row.used === "number" && Number.isFinite(row.used)
        ? Math.max(0, Math.floor(row.used))
        : 0
  };
};

export const fetchAssistantMessages = async (
  conversationId: string,
  pageSize: number
): Promise<AssistantMessageRow[]> => {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("id", { ascending: false })
    .limit(pageSize);

  if (error) throw error;
  return (data ?? []) as AssistantMessageRow[];
};

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

const ASSISTANT_QUERY_STALE_MS = 60 * 1000;
const ASSISTANT_QUERY_GC_MS = 15 * 60 * 1000;

export const assistantQueryConfig = {
  staleTime: ASSISTANT_QUERY_STALE_MS,
  gcTime: ASSISTANT_QUERY_GC_MS,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false
};

export const assistantQueryKeys = {
  conversationList: (userId: string) =>
    ["assistant", "conversations", userId] as const,
  conversations: (userId: string, limit: number, offset: number) =>
    ["assistant", "conversations", userId, limit, offset] as const,
  weeklyQuota: (userId: string) =>
    ["assistant", "weekly-quota", userId] as const,
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

export type AssistantWeeklyQuotaRow = {
  week: string;
  is_paid: boolean;
  allowed: boolean;
  limit: number;
  remaining: number;
  used: number;
  percentUsed: number;
};

export type AssistantConversationsPage = {
  rows: AssistantConversationRow[];
  totalCount: number;
};

export const fetchAssistantConversations = async (params: {
  userId: string;
  limit: number;
  offset?: number;
}): Promise<AssistantConversationsPage> => {
  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.max(1, params.limit);
  const { data, error, count } = await supabase
    .from("ai_conversations")
    .select("id, title, created_at, last_message_at, pinned", {
      count: "exact"
    })
    .eq("user_id", params.userId)
    .eq("archived", false)
    .order("pinned", { ascending: false })
    .order("last_message_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const rows = (data ?? []) as AssistantConversationRow[];

  return {
    rows,
    totalCount: typeof count === "number" ? count : offset + rows.length
  };
};

export const fetchAssistantWeeklyQuota = async (
  userId: string,
  timezone: string
): Promise<AssistantWeeklyQuotaRow | null> => {
  const { data, error } = await supabase.rpc("get_ai_weekly_quota", {
    p_user_id: userId,
    p_tz: timezone
  });

  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;

  const limit =
    typeof row.limit === "number" && Number.isFinite(row.limit)
      ? Math.floor(row.limit)
      : 0;
  const used =
    typeof row.used === "number" && Number.isFinite(row.used)
      ? Math.max(0, Math.floor(row.used))
      : 0;
  const percentUsed =
    typeof row.percent_used === "number" && Number.isFinite(row.percent_used)
      ? Math.min(100, Math.max(0, row.percent_used))
      : limit > 0
        ? Math.min(100, Math.round((used / limit) * 1000) / 10)
        : 0;

  return {
    week: String(row.week_start),
    is_paid: Boolean(row.is_paid),
    allowed: typeof row.allowed === "boolean" ? row.allowed : used < limit,
    limit,
    remaining:
      typeof row.remaining === "number" && Number.isFinite(row.remaining)
        ? Math.max(0, Math.floor(row.remaining))
        : Math.max(limit - used, 0),
    used,
    percentUsed
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

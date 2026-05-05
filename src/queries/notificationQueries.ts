import { supabase } from "@/integrations/supabase/client";
import { sanitizeCode, sanitizeSingleLineText } from "@/lib/inputSanitization";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type UserNotification = {
  id: string;
  type: "support_ticket_reply";
  entityId: string | null;
  ticketCode: string;
  ticketSubject: string;
  readAt: string | null;
  createdAt: string;
};

type NotificationPayload = {
  ticket_code?: unknown;
  ticket_subject?: unknown;
};

export const notificationQueryKeys = {
  list: (userId: string | null | undefined) =>
    ["notifications", "list", userId ?? "guest"] as const
};

const normalizeNotification = (row: {
  id: string;
  type: string;
  entity_id: string | null;
  payload: unknown;
  read_at: string | null;
  created_at: string;
}): UserNotification | null => {
  if (row.type !== "support_ticket_reply") return null;

  const payload =
    row.payload && typeof row.payload === "object"
      ? (row.payload as NotificationPayload)
      : {};

  return {
    id: row.id,
    type: "support_ticket_reply",
    entityId: sanitizeCode(row.entity_id, 120) || null,
    ticketCode: sanitizeSingleLineText(payload.ticket_code, 40),
    ticketSubject: sanitizeSingleLineText(payload.ticket_subject, 160),
    readAt: row.read_at,
    createdAt: row.created_at
  };
};

export const fetchMyNotifications = async (): Promise<UserNotification[]> => {
  const { data, error } = await supabase
    .from("user_notifications")
    .select("id, type, entity_id, payload, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) throw error;

  return (data ?? [])
    .map(normalizeNotification)
    .filter((notification): notification is UserNotification =>
      Boolean(notification)
    );
};

export const markNotificationRead = async (notificationId: string) => {
  const sanitizedId = sanitizeCode(notificationId, 120);
  if (!sanitizedId) return;

  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", sanitizedId)
    .is("read_at", null);

  if (error) throw error;
};

export const markAllNotificationsRead = async () => {
  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) throw error;
};

export const useNotificationsQuery = (
  userId: string | null | undefined,
  enabled = true
) =>
  useQuery({
    queryKey: notificationQueryKeys.list(userId),
    queryFn: fetchMyNotifications,
    enabled: Boolean(userId) && enabled,
    refetchInterval: 30_000,
    staleTime: 15_000
  });

export const useMarkNotificationReadMutation = (
  userId: string | null | undefined
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.list(userId)
      });
    }
  });
};

export const useMarkAllNotificationsReadMutation = (
  userId: string | null | undefined
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.list(userId)
      });
    }
  });
};

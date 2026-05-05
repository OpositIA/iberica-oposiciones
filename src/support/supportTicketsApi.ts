import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  SupportContactCategory,
  SupportContactIssueType
} from "@/support/supportForms";

export type SupportTicketStatus = "open" | "awaiting_user" | "resolved";

export type SupportTicketSummary = {
  id: string;
  code: string;
  subject: string;
  category: SupportContactCategory;
  status: SupportTicketStatus;
  rating: number | null;
  messageCount: number;
  unread: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type SupportTicketDetail = {
  id: string;
  code: string;
  subject: string;
  category: SupportContactCategory;
  status: SupportTicketStatus;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  userLastReadAt: string | null;
  resolvedAt: string | null;
};

export type SupportTicketMessage = {
  id: number;
  ticketId: string;
  authorRole: "user" | "staff" | "system";
  body: string;
  sourceChannel: "web" | "telegram" | "email" | "system";
  createdAt: string;
  attachments: SupportTicketAttachment[];
};

export type SupportTicketAttachment = {
  id: string;
  storageBucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number | null;
  imageWidth: number | null;
  imageHeight: number | null;
  createdAt: string;
  signedUrl: string | null;
};

export type CreateSupportTicketInput = {
  category: SupportContactCategory;
  subject: string;
  message: string;
  issueType?: SupportContactIssueType | "";
  requestContext?: Json;
};

export type SupportTicketAttachmentUpload = {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  imageWidth: number | null;
  imageHeight: number | null;
};

const ensureSingleRow = <T>(rows: T[] | null, errorCode: string): T => {
  if (!rows?.length) throw new Error(errorCode);
  return rows[0];
};

export const supportTicketsQueryKeys = {
  list: (userId: string | null | undefined) =>
    ["support", "tickets", userId ?? "guest"] as const,
  detail: (ticketId: string | null | undefined) =>
    ["support", "ticket-detail", ticketId ?? "none"] as const,
  messages: (ticketId: string | null | undefined) =>
    ["support", "ticket-messages", ticketId ?? "none"] as const
};

const SUPPORT_ATTACHMENTS_BUCKET = "support-ticket-attachments";

const normalizeAttachmentRows = (
  value: Json | null | undefined
): SupportTicketAttachment[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, Json>;
    const id = typeof row.id === "string" ? row.id : "";
    const storageBucket =
      typeof row.storage_bucket === "string" ? row.storage_bucket : "";
    const storagePath =
      typeof row.storage_path === "string" ? row.storage_path : "";
    const fileName = typeof row.file_name === "string" ? row.file_name : "";
    const mimeType = typeof row.mime_type === "string" ? row.mime_type : "";
    const fileSizeBytes =
      typeof row.file_size_bytes === "number" ? row.file_size_bytes : null;
    const imageWidth =
      typeof row.image_width === "number" ? row.image_width : null;
    const imageHeight =
      typeof row.image_height === "number" ? row.image_height : null;
    const createdAt =
      typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString();

    if (!id || !storageBucket || !storagePath || !fileName || !mimeType)
      return [];

    return [
      {
        id,
        storageBucket,
        storagePath,
        fileName,
        mimeType,
        fileSizeBytes,
        imageWidth,
        imageHeight,
        createdAt,
        signedUrl: null
      }
    ];
  });
};

const addSignedUrlsToAttachments = async (
  messages: SupportTicketMessage[]
): Promise<SupportTicketMessage[]> => {
  const bucketPaths = new Map<string, string[]>();

  for (const message of messages) {
    for (const attachment of message.attachments) {
      const paths = bucketPaths.get(attachment.storageBucket) ?? [];
      if (!paths.includes(attachment.storagePath))
        paths.push(attachment.storagePath);
      bucketPaths.set(attachment.storageBucket, paths);
    }
  }

  const signedUrlMap = new Map<string, string>();
  await Promise.all(
    Array.from(bucketPaths.entries()).map(async ([bucket, paths]) => {
      if (!paths.length) return;
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, 60 * 60);

      if (error || !data) return;

      data.forEach((item, index) => {
        if (item.signedUrl)
          signedUrlMap.set(`${bucket}:${paths[index]}`, item.signedUrl);
      });
    })
  );

  return messages.map((message) => ({
    ...message,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      signedUrl:
        signedUrlMap.get(
          `${attachment.storageBucket}:${attachment.storagePath}`
        ) ?? null
    }))
  }));
};

const sanitizeAttachmentFileName = (fileName: string) =>
  fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);

const readImageDimensions = (file: File) =>
  new Promise<{ width: number | null; height: number | null }>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
  });

export const createSupportTicket = async (
  input: CreateSupportTicketInput
): Promise<SupportTicketDetail> => {
  const { data, error } = await supabase.rpc("create_support_ticket", {
    p_category: input.category,
    p_subject: input.subject,
    p_message: input.message,
    p_issue_type: input.issueType || null,
    p_source_channel: "web",
    p_request_context: input.requestContext ?? {}
  });

  if (error) throw error;

  const row = ensureSingleRow(data, "support_ticket_create_failed");
  return {
    id: row.ticket_id,
    code: row.ticket_code,
    subject: row.subject,
    category: row.category as SupportContactCategory,
    status: row.status as SupportTicketStatus,
    rating: null,
    createdAt: row.created_at,
    updatedAt: row.last_message_at,
    lastMessageAt: row.last_message_at,
    userLastReadAt: row.last_message_at,
    resolvedAt: null
  };
};

export const syncSupportTicketToTelegram = async (
  ticketId: string
): Promise<void> => {
  const { error } = await supabase.functions.invoke("support-telegram", {
    body: {
      action: "sync-ticket",
      ticket_id: ticketId
    }
  });

  if (error) throw error;
};

export const fetchMySupportTickets = async (): Promise<
  SupportTicketSummary[]
> => {
  const { data, error } = await supabase.rpc("get_my_support_tickets");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.ticket_id,
    code: row.ticket_code,
    subject: row.subject,
    category: row.category as SupportContactCategory,
    status: row.status as SupportTicketStatus,
    rating: row.rating ?? null,
    messageCount: Number(row.message_count ?? 0),
    unread: Boolean(row.unread),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at
  }));
};

export const fetchMySupportTicketDetail = async (
  ticketId: string
): Promise<SupportTicketDetail | null> => {
  const { data, error } = await supabase.rpc("get_my_support_ticket_detail", {
    p_ticket_id: ticketId
  });

  if (error) throw error;
  if (!data?.length) return null;

  const row = data[0];
  return {
    id: row.ticket_id,
    code: row.ticket_code,
    subject: row.subject,
    category: row.category as SupportContactCategory,
    status: row.status as SupportTicketStatus,
    rating: row.rating ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    userLastReadAt: row.user_last_read_at ?? null,
    resolvedAt: row.resolved_at
  };
};

export const fetchMySupportTicketMessages = async (
  ticketId: string
): Promise<SupportTicketMessage[]> => {
  const { data, error } = await supabase.rpc("get_my_support_ticket_messages", {
    p_ticket_id: ticketId
  });

  if (error) throw error;

  const normalizedMessages = (data ?? []).map((row) => ({
    id: Number(row.message_id),
    ticketId: row.ticket_id,
    authorRole: row.author_role,
    body: row.body,
    sourceChannel: row.source_channel,
    createdAt: row.created_at,
    attachments: normalizeAttachmentRows(row.attachments)
  }));

  return addSignedUrlsToAttachments(normalizedMessages);
};

export const replyToSupportTicket = async (
  ticketId: string,
  message: string,
  attachments: SupportTicketAttachmentUpload[] = []
): Promise<void> => {
  const { error } = await supabase.rpc("reply_to_support_ticket", {
    p_ticket_id: ticketId,
    p_message: message,
    p_source_channel: "web",
    p_attachments: attachments.map((attachment) => ({
      storage_path: attachment.storagePath,
      file_name: attachment.fileName,
      mime_type: attachment.mimeType,
      file_size_bytes: attachment.fileSizeBytes,
      image_width: attachment.imageWidth,
      image_height: attachment.imageHeight
    }))
  });

  if (error) throw error;
};

export const uploadSupportTicketImages = async ({
  userId,
  ticketId,
  files
}: {
  userId: string;
  ticketId: string;
  files: File[];
}): Promise<SupportTicketAttachmentUpload[]> => {
  const uploads = await Promise.all(
    files.map(async (file) => {
      const safeName = sanitizeAttachmentFileName(file.name || "imagen");
      const storagePath = `${userId}/${ticketId}/${crypto.randomUUID()}-${safeName}`;
      const { width, height } = await readImageDimensions(file);
      const { error } = await supabase.storage
        .from(SUPPORT_ATTACHMENTS_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type
        });

      if (error) throw error;

      return {
        storagePath,
        fileName: file.name || safeName,
        mimeType: file.type,
        fileSizeBytes: file.size,
        imageWidth: width,
        imageHeight: height
      };
    })
  );

  return uploads;
};

export const removeSupportTicketImages = async (
  storagePaths: string[]
): Promise<void> => {
  if (!storagePaths.length) return;

  const { error } = await supabase.storage
    .from(SUPPORT_ATTACHMENTS_BUCKET)
    .remove(storagePaths);

  if (error) throw error;
};

export const markSupportTicketRead = async (
  ticketId: string
): Promise<void> => {
  const { error } = await supabase.rpc("mark_support_ticket_read", {
    p_ticket_id: ticketId
  });

  if (error) throw error;
};

export const resolveMySupportTicket = async (
  ticketId: string
): Promise<void> => {
  const { error } = await supabase.rpc("resolve_my_support_ticket", {
    p_ticket_id: ticketId
  });

  if (error) throw error;
};

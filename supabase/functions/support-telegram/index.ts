/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  parseJsonBody,
  sanitizeCode,
  sanitizeMultilineText,
  sanitizeSingleLineText
} from "../_shared/inputSanitization.ts";

type SyncRequestPayload = {
  action?: string;
  ticket_id?: string;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramTopicResult = {
  message_thread_id: number;
  name: string;
};

type TelegramMessageResult = {
  message_id: number;
  message_thread_id?: number;
};

type TelegramFileResult = {
  file_id: string;
  file_path: string;
  file_size?: number;
};

type SupportTicketRow = {
  id: string;
  user_id: string;
  ticket_code: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
};

type SupportThreadRow = {
  ticket_id: string;
  telegram_chat_id: number;
  telegram_thread_id: number;
  telegram_topic_name: string;
};

type SupportMessageRow = {
  id: number;
  body: string;
  created_at: string;
};

type SupportAttachmentRow = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number | null;
  image_width: number | null;
  image_height: number | null;
};

type ProfileRow = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  locale: string | null;
  support_ticket_reply_email_enabled: boolean | null;
};

type TelegramPhotoSize = {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
};

type TelegramIncomingMessage = {
  message_id?: number;
  message_thread_id?: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  chat?: {
    id?: number;
  };
  from?: {
    is_bot?: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
};

type TelegramWebhookUpdate = {
  update_id?: number;
  message?: TelegramIncomingMessage;
  edited_message?: TelegramIncomingMessage;
};

const SUPPORT_ATTACHMENTS_BUCKET = "support-ticket-attachments";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });

const getEnv = (key: string) => Deno.env.get(key)?.trim() ?? "";

const requireEnv = (key: string) => {
  const value = getEnv(key);
  if (!value) throw new Error(`missing_env:${key}`);
  return value;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const buildSupportTicketReplyEmailHtml = ({
  locale,
  ticket,
  ticketUrl
}: {
  locale: string;
  ticket: SupportTicketRow;
  ticketUrl: string;
}) => {
  const isEnglish = locale.toLowerCase().startsWith("en");
  const copy = isEnglish
    ? {
        preview: "The team has replied to your support ticket.",
        eyebrow: "Support reply",
        title: "Your ticket has a new reply",
        paragraphOne: `The team has replied to ticket ${ticket.ticket_code} about "${ticket.subject}".`,
        paragraphTwo:
          "Open the ticket chat to review the reply and continue the conversation if you need to add more information.",
        action: "Open ticket",
        fallbackTitle: "Fallback link",
        fallback:
          "If the button does not work, copy this link and paste it into your browser.",
        security:
          "You receive this email because support notifications are enabled. You can change this preference from your profile.",
        footerPrimary:
          "We keep your request in the same thread so all context stays organized.",
        footerSecondary:
          "Internal notifications will also appear in your dashboard bell.",
        strapline: "Preparation with focus, clarity, and consistency."
      }
    : {
        preview: "El equipo ha respondido a tu ticket de soporte.",
        eyebrow: "Respuesta de soporte",
        title: "Tu ticket tiene una nueva respuesta",
        paragraphOne: `El equipo ha respondido al ticket ${ticket.ticket_code} sobre "${ticket.subject}".`,
        paragraphTwo:
          "Puedes abrir el chat del ticket para revisar la respuesta y continuar la conversacion si necesitas aportar mas informacion.",
        action: "Abrir ticket",
        fallbackTitle: "Enlace alternativo",
        fallback:
          "Si el boton no funciona, copia este enlace y pegalo en tu navegador.",
        security:
          "Recibes este correo porque tienes activadas las notificaciones de soporte. Puedes cambiar esta preferencia desde tu perfil.",
        footerPrimary:
          "Seguimos tu consulta desde el mismo hilo para mantener todo el contexto ordenado.",
        footerSecondary:
          "Las notificaciones internas tambien apareceran en tu campana del panel.",
        strapline: "Preparacion con foco, claridad y continuidad."
      };

  return `<!doctype html>
<html lang="${isEnglish ? "en" : "es"}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 12px;background:#f8fafc;color:#0f172a;font-family:Mulish,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${escapeHtml(copy.preview)}</div>
<div style="max-width:620px;margin:0 auto;">
<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:28px;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,.10);">
<div style="background:#111827;padding:28px 32px 24px;">
<p style="display:inline-block;border-radius:999px;border:1px solid rgba(249,115,22,.24);background:rgba(249,115,22,.14);color:#fed7aa;font-size:11px;font-weight:700;letter-spacing:.18em;line-height:1;margin:0 0 18px;padding:10px 14px;text-transform:uppercase;">${escapeHtml(copy.eyebrow)}</p>
<p style="color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-style:italic;font-weight:700;letter-spacing:-.02em;line-height:1.1;margin:0;">Iberica Oposiciones</p>
<p style="color:#cbd5e1;font-size:13px;line-height:22px;margin:8px 0 0;">${escapeHtml(copy.strapline)}</p>
</div>
<div style="padding:32px;">
<h1 style="color:#0f172a;font-family:Georgia,'Times New Roman',serif;font-size:34px;font-style:italic;font-weight:700;letter-spacing:-.03em;line-height:1.12;margin:0 0 18px;">${escapeHtml(copy.title)}</h1>
<p style="color:#475569;font-size:15px;line-height:27px;margin:0 0 14px;">${escapeHtml(copy.paragraphOne)}</p>
<p style="color:#475569;font-size:15px;line-height:27px;margin:0 0 14px;">${escapeHtml(copy.paragraphTwo)}</p>
<div style="padding:12px 0 10px;"><a href="${escapeHtml(ticketUrl)}" style="display:inline-block;background:#f97316;border-radius:999px;color:#ffffff;font-size:15px;font-weight:700;line-height:1;padding:15px 26px;text-decoration:none;">${escapeHtml(copy.action)}</a></div>
<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:20px;margin:18px 0 0;padding:18px 20px;">
<p style="color:#0f172a;font-size:12px;font-weight:700;letter-spacing:.14em;line-height:1.2;margin:0 0 10px;text-transform:uppercase;">${escapeHtml(copy.fallbackTitle)}</p>
<p style="color:#475569;font-size:15px;line-height:27px;margin:0 0 10px;">${escapeHtml(copy.fallback)}</p>
<a href="${escapeHtml(ticketUrl)}" style="color:#0284c7;font-size:13px;line-height:22px;text-decoration:underline;word-break:break-all;">${escapeHtml(ticketUrl)}</a>
</div>
<p style="color:#64748b;font-size:12px;line-height:20px;margin:18px 0 0;">${escapeHtml(copy.security)}</p>
</div>
<div style="border-top:1px solid #e2e8f0;padding:20px 32px 28px;">
<p style="color:#64748b;font-size:12px;line-height:20px;margin:0 0 10px;">${escapeHtml(copy.footerPrimary)}</p>
<p style="color:#64748b;font-size:12px;line-height:20px;margin:0;">${escapeHtml(copy.footerSecondary)}</p>
</div>
</div>
</div>
</body>
</html>`;
};

const formatCategoryLabel = (category: string) => {
  switch (category) {
    case "account":
      return "Cuenta";
    case "billing":
      return "Facturación";
    case "tests":
      return "Tests";
    case "ai":
      return "AsistenteIA";
    case "technical":
      return "Otro asunto";
    default:
      return "Soporte";
  }
};

const formatProfileName = (profile: ProfileRow | null) => {
  const firstName = sanitizeSingleLineText(profile?.first_name, 80);
  const lastName = sanitizeSingleLineText(profile?.last_name, 120);
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || "Usuario";
};

const normalizeAttachmentFileName = (fileName: string) =>
  sanitizeSingleLineText(fileName, 120)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");

const createAnonClient = (
  supabaseUrl: string,
  supabaseAnonKey: string,
  req: Request
) =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") ?? ""
      }
    }
  });

const createServiceClient = (
  supabaseUrl: string,
  supabaseServiceRoleKey: string
) =>
  createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

const telegramRequest = async <T>(
  method: string,
  payload: Record<string, unknown>
): Promise<T> => {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !data.ok || !data.result) {
    throw new Error(
      sanitizeSingleLineText(
        data.description || `${method}_telegram_request_failed`,
        300
      ) || `${method}_telegram_request_failed`
    );
  }

  return data.result;
};

const getTelegramFileDownloadUrl = async (fileId: string) => {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const file = await telegramRequest<TelegramFileResult>("getFile", {
    file_id: fileId
  });

  return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
};

const fetchOwnedTicket = async ({
  serviceClient,
  ticketId,
  userId
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  ticketId: string;
  userId: string;
}) => {
  const { data, error } = await serviceClient
    .from("support_tickets")
    .select("id, user_id, ticket_code, subject, category, status, created_at")
    .eq("id", ticketId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`support_ticket_lookup_failed:${error.message}`);
  return (data ?? null) as SupportTicketRow | null;
};

const fetchTicketByThread = async ({
  serviceClient,
  telegramChatId,
  telegramThreadId
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  telegramChatId: number;
  telegramThreadId: number;
}) => {
  const { data, error } = await serviceClient
    .from("support_telegram_threads")
    .select(
      "ticket_id, telegram_chat_id, telegram_thread_id, telegram_topic_name"
    )
    .eq("telegram_chat_id", telegramChatId)
    .eq("telegram_thread_id", telegramThreadId)
    .maybeSingle();

  if (error) throw new Error(`support_thread_lookup_failed:${error.message}`);
  return (data ?? null) as SupportThreadRow | null;
};

const fetchThreadByTicketId = async ({
  serviceClient,
  ticketId
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  ticketId: string;
}) => {
  const { data, error } = await serviceClient
    .from("support_telegram_threads")
    .select(
      "ticket_id, telegram_chat_id, telegram_thread_id, telegram_topic_name"
    )
    .eq("ticket_id", ticketId)
    .maybeSingle();

  if (error) throw new Error(`support_thread_lookup_failed:${error.message}`);
  return (data ?? null) as SupportThreadRow | null;
};

const fetchProfile = async ({
  serviceClient,
  userId
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  userId: string;
}) => {
  const { data, error } = await serviceClient
    .from("profiles")
    .select(
      "email, first_name, last_name, locale, support_ticket_reply_email_enabled"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`support_profile_lookup_failed:${error.message}`);
  return (data ?? null) as ProfileRow | null;
};

const sendSupportTicketReplyEmail = async ({
  ticket,
  profile
}: {
  ticket: SupportTicketRow;
  profile: ProfileRow | null;
}) => {
  const apiKey = getEnv("BREVO_API_KEY");
  const recipient = sanitizeSingleLineText(profile?.email, 180);

  if (!apiKey || !recipient) return;
  if (profile?.support_ticket_reply_email_enabled === false) return;

  const siteUrl = (
    getEnv("SITE_URL") ||
    getEnv("PUBLIC_SITE_URL") ||
    "https://ibericaoposiciones.com"
  ).replace(/\/+$/, "");
  const ticketUrl = `${siteUrl}/soporte?tab=tickets&ticket=${encodeURIComponent(
    ticket.id
  )}`;
  const locale = sanitizeSingleLineText(profile?.locale, 12) || "es";
  const isEnglish = locale.toLowerCase().startsWith("en");
  const subject = isEnglish
    ? `New reply on ticket ${ticket.ticket_code}`
    : `Nueva respuesta en el ticket ${ticket.ticket_code}`;
  const from =
    getEnv("SUPPORT_EMAIL_FROM") ||
    "Iberica Oposiciones <soporte@ibericaoposiciones.com>";
  const senderMatch = from.match(/^(.*)<([^<>]+)>$/);
  const sender = senderMatch
    ? {
        name: sanitizeSingleLineText(senderMatch[1], 120),
        email: sanitizeSingleLineText(senderMatch[2], 180)
      }
    : {
        name: "Iberica Oposiciones",
        email: sanitizeSingleLineText(from, 180)
      };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sender,
      to: [{ email: recipient }],
      subject,
      htmlContent: buildSupportTicketReplyEmailHtml({
        locale,
        ticket,
        ticketUrl
      })
    })
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `support_reply_email_failed:${sanitizeSingleLineText(responseText, 300)}`
    );
  }
};

const createTelegramTopicForTicket = async ({
  serviceClient,
  ticket,
  profile
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  ticket: SupportTicketRow;
  profile: ProfileRow | null;
}) => {
  const supportChatId = Number.parseInt(
    requireEnv("TELEGRAM_SUPPORT_CHAT_ID"),
    10
  );
  if (!Number.isFinite(supportChatId)) {
    throw new Error("invalid_env:TELEGRAM_SUPPORT_CHAT_ID");
  }

  const topicName = sanitizeSingleLineText(
    `${ticket.ticket_code} · ${ticket.subject}`,
    128
  );
  const topic = await telegramRequest<TelegramTopicResult>("createForumTopic", {
    chat_id: supportChatId,
    name: topicName
  });

  const { error: insertError } = await serviceClient
    .from("support_telegram_threads")
    .upsert(
      {
        ticket_id: ticket.id,
        telegram_chat_id: supportChatId,
        telegram_thread_id: topic.message_thread_id,
        telegram_topic_name: topic.name
      },
      { onConflict: "ticket_id" }
    );

  if (insertError) {
    throw new Error(`support_thread_create_failed:${insertError.message}`);
  }

  const introText = [
    `Nuevo ticket ${ticket.ticket_code}`,
    `Asunto: ${ticket.subject}`,
    `Categoría: ${formatCategoryLabel(ticket.category)}`,
    `Usuario: ${formatProfileName(profile)}`,
    `Email: ${sanitizeSingleLineText(profile?.email, 180) || "sin email"}`,
    `Estado: ${ticket.status}`,
    `Creado: ${new Date(ticket.created_at).toLocaleString("es-ES")}`
  ].join("\n");

  await telegramRequest<TelegramMessageResult>("sendMessage", {
    chat_id: supportChatId,
    message_thread_id: topic.message_thread_id,
    text: introText
  });

  return {
    ticket_id: ticket.id,
    telegram_chat_id: supportChatId,
    telegram_thread_id: topic.message_thread_id,
    telegram_topic_name: topic.name
  } satisfies SupportThreadRow;
};

const ensureTicketThread = async ({
  serviceClient,
  ticket
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  ticket: SupportTicketRow;
}) => {
  const existingThread = await fetchThreadByTicketId({
    serviceClient,
    ticketId: ticket.id
  });
  if (existingThread) return existingThread;

  const profile = await fetchProfile({
    serviceClient,
    userId: ticket.user_id
  });
  return createTelegramTopicForTicket({
    serviceClient,
    ticket,
    profile
  });
};

const fetchPendingOutgoingMessages = async ({
  serviceClient,
  ticketId
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  ticketId: string;
}) => {
  const { data, error } = await serviceClient
    .from("support_ticket_messages")
    .select("id, body, created_at")
    .eq("ticket_id", ticketId)
    .eq("author_role", "user")
    .eq("source_channel", "web")
    .is("telegram_message_id", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(`support_messages_lookup_failed:${error.message}`);
  return (data ?? []) as SupportMessageRow[];
};

const fetchMessageAttachments = async ({
  serviceClient,
  messageId
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  messageId: number;
}) => {
  const { data, error } = await serviceClient
    .from("support_ticket_attachments")
    .select(
      "id, storage_bucket, storage_path, file_name, mime_type, file_size_bytes, image_width, image_height"
    )
    .eq("message_id", messageId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`support_attachments_lookup_failed:${error.message}`);
  }

  return (data ?? []) as SupportAttachmentRow[];
};

const markMessageSyncedToTelegram = async ({
  serviceClient,
  messageId,
  telegramChatId,
  telegramThreadId,
  telegramMessageId
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  messageId: number;
  telegramChatId: number;
  telegramThreadId: number;
  telegramMessageId: number;
}) => {
  const { error } = await serviceClient
    .from("support_ticket_messages")
    .update({
      telegram_chat_id: telegramChatId,
      telegram_thread_id: telegramThreadId,
      telegram_message_id: telegramMessageId
    })
    .eq("id", messageId);

  if (error) {
    throw new Error(`support_message_sync_update_failed:${error.message}`);
  }
};

const markAttachmentSyncedToTelegram = async ({
  serviceClient,
  attachmentId,
  telegramMessageId
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  attachmentId: string;
  telegramMessageId: number;
}) => {
  const { error } = await serviceClient
    .from("support_ticket_attachments")
    .update({
      telegram_message_id: telegramMessageId
    })
    .eq("id", attachmentId);

  if (error) {
    throw new Error(`support_attachment_sync_update_failed:${error.message}`);
  }
};

const createAttachmentSignedUrl = async ({
  serviceClient,
  attachment
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  attachment: SupportAttachmentRow;
}) => {
  const { data, error } = await serviceClient.storage
    .from(attachment.storage_bucket)
    .createSignedUrl(attachment.storage_path, 60 * 10);

  if (error || !data?.signedUrl) {
    throw new Error("support_attachment_signed_url_failed");
  }

  return data.signedUrl;
};

const syncPendingMessagesToTelegram = async ({
  serviceClient,
  ticket,
  thread
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  ticket: SupportTicketRow;
  thread: SupportThreadRow;
}) => {
  const pendingMessages = await fetchPendingOutgoingMessages({
    serviceClient,
    ticketId: ticket.id
  });

  for (const message of pendingMessages) {
    const attachments = await fetchMessageAttachments({
      serviceClient,
      messageId: message.id
    });
    const body = sanitizeMultilineText(message.body, 4000);
    let firstTelegramMessageId: number | null = null;

    if (attachments.length > 0) {
      const caption =
        body.length > 0 && body.length <= 900
          ? `${ticket.ticket_code}\n\n${body}`
          : undefined;

      for (let index = 0; index < attachments.length; index += 1) {
        const attachment = attachments[index];
        const signedUrl = await createAttachmentSignedUrl({
          serviceClient,
          attachment
        });

        const sentPhoto = await telegramRequest<TelegramMessageResult>(
          "sendPhoto",
          {
            chat_id: thread.telegram_chat_id,
            message_thread_id: thread.telegram_thread_id,
            photo: signedUrl,
            caption: index === 0 ? caption : undefined
          }
        );

        if (firstTelegramMessageId === null) {
          firstTelegramMessageId = sentPhoto.message_id;
        }

        await markAttachmentSyncedToTelegram({
          serviceClient,
          attachmentId: attachment.id,
          telegramMessageId: sentPhoto.message_id
        });
      }

      if (body.length > 900) {
        const sentText = await telegramRequest<TelegramMessageResult>(
          "sendMessage",
          {
            chat_id: thread.telegram_chat_id,
            message_thread_id: thread.telegram_thread_id,
            text: `${ticket.ticket_code}\n\n${body}`
          }
        );

        if (firstTelegramMessageId === null) {
          firstTelegramMessageId = sentText.message_id;
        }
      }
    } else if (body) {
      const sentText = await telegramRequest<TelegramMessageResult>(
        "sendMessage",
        {
          chat_id: thread.telegram_chat_id,
          message_thread_id: thread.telegram_thread_id,
          text: `${ticket.ticket_code}\n\n${body}`
        }
      );
      firstTelegramMessageId = sentText.message_id;
    }

    if (firstTelegramMessageId !== null) {
      await markMessageSyncedToTelegram({
        serviceClient,
        messageId: message.id,
        telegramChatId: thread.telegram_chat_id,
        telegramThreadId: thread.telegram_thread_id,
        telegramMessageId: firstTelegramMessageId
      });
    }
  }
};

const handleAuthenticatedSync = async (req: Request) => {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const authClient = createAnonClient(supabaseUrl, supabaseAnonKey, req);
  const serviceClient = createServiceClient(
    supabaseUrl,
    supabaseServiceRoleKey
  );

  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);

  const payload = await parseJsonBody<SyncRequestPayload>(req);
  const action = sanitizeSingleLineText(payload.action, 60) || "sync-ticket";
  const ticketId = sanitizeCode(payload.ticket_id, 80);
  if (!ticketId) return json({ error: "ticket_id_required" }, 400);

  if (action !== "sync-ticket") return json({ error: "invalid_action" }, 400);

  const ticket = await fetchOwnedTicket({
    serviceClient,
    ticketId,
    userId: authData.user.id
  });
  if (!ticket) return json({ error: "support_ticket_not_found" }, 404);

  const thread = await ensureTicketThread({
    serviceClient,
    ticket
  });

  await syncPendingMessagesToTelegram({
    serviceClient,
    ticket,
    thread
  });

  return json({
    ok: true,
    ticket_id: ticket.id,
    ticket_code: ticket.ticket_code,
    telegram_chat_id: thread.telegram_chat_id,
    telegram_thread_id: thread.telegram_thread_id
  });
};

const insertWebhookEvent = async ({
  serviceClient,
  updateId,
  payload
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  updateId: number;
  payload: TelegramWebhookUpdate;
}) => {
  const { data: existing, error: existingError } = await serviceClient
    .from("support_telegram_webhook_events")
    .select("update_id, processed_at")
    .eq("update_id", updateId)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `support_webhook_event_lookup_failed:${existingError.message}`
    );
  }
  if (existing) return false;

  const { error } = await serviceClient
    .from("support_telegram_webhook_events")
    .insert({
      update_id: updateId,
      payload
    });
  if (error) {
    throw new Error(`support_webhook_event_insert_failed:${error.message}`);
  }
  return true;
};

const markWebhookEventProcessed = async ({
  serviceClient,
  updateId,
  ticketId
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  updateId: number;
  ticketId?: string | null;
}) => {
  const { error } = await serviceClient
    .from("support_telegram_webhook_events")
    .update({
      processed_at: new Date().toISOString(),
      ticket_id: ticketId ?? null
    })
    .eq("update_id", updateId);

  if (error) {
    throw new Error(`support_webhook_event_update_failed:${error.message}`);
  }
};

const insertStaffMessage = async ({
  serviceClient,
  ticketId,
  updateId,
  body,
  telegramChatId,
  telegramMessageId,
  telegramThreadId,
  authorName,
  username
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  ticketId: string;
  updateId: number;
  body: string;
  telegramChatId: number;
  telegramMessageId: number;
  telegramThreadId: number;
  authorName: string;
  username: string | null;
}) => {
  const { data, error } = await serviceClient
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticketId,
      author_role: "staff",
      source_channel: "telegram",
      body,
      metadata: {
        update_id: updateId,
        telegram_author_name: authorName,
        telegram_username: username
      },
      customer_visible: true,
      telegram_chat_id: telegramChatId,
      telegram_message_id: telegramMessageId,
      telegram_thread_id: telegramThreadId
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`support_message_insert_failed:${error.message}`);
  }

  return Number(data.id);
};

const uploadTelegramPhotoToStorage = async ({
  serviceClient,
  ticket,
  photo
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  ticket: SupportTicketRow;
  photo: TelegramPhotoSize;
}) => {
  const downloadUrl = await getTelegramFileDownloadUrl(photo.file_id);
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error("telegram_photo_download_failed");
  }

  const buffer = await response.arrayBuffer();
  const path = `${ticket.user_id}/${ticket.id}/${crypto.randomUUID()}-telegram.jpg`;
  const { error } = await serviceClient.storage
    .from(SUPPORT_ATTACHMENTS_BUCKET)
    .upload(path, buffer, {
      contentType: "image/jpeg",
      upsert: false
    });

  if (error) {
    throw new Error(`support_attachment_upload_failed:${error.message}`);
  }

  return {
    path,
    fileSizeBytes:
      typeof photo.file_size === "number" && Number.isFinite(photo.file_size)
        ? photo.file_size
        : null
  };
};

const insertStaffAttachment = async ({
  serviceClient,
  ticketId,
  messageId,
  uploaderUserId,
  storagePath,
  telegramFileId,
  telegramMessageId,
  photo
}: {
  serviceClient: ReturnType<typeof createServiceClient>;
  ticketId: string;
  messageId: number;
  uploaderUserId: string;
  storagePath: string;
  telegramFileId: string;
  telegramMessageId: number;
  photo: TelegramPhotoSize;
}) => {
  const { error } = await serviceClient
    .from("support_ticket_attachments")
    .insert({
      ticket_id: ticketId,
      message_id: messageId,
      uploader_user_id: uploaderUserId,
      storage_bucket: SUPPORT_ATTACHMENTS_BUCKET,
      storage_path: storagePath,
      file_name: normalizeAttachmentFileName(
        `telegram-${telegramMessageId}.jpg`
      ),
      mime_type: "image/jpeg",
      file_size_bytes:
        typeof photo.file_size === "number" && Number.isFinite(photo.file_size)
          ? photo.file_size
          : null,
      image_width: photo.width,
      image_height: photo.height,
      source_channel: "telegram",
      telegram_file_id: telegramFileId,
      telegram_message_id: telegramMessageId
    });

  if (error) {
    throw new Error(`support_attachment_insert_failed:${error.message}`);
  }
};

const handleTelegramWebhook = async (req: Request) => {
  const secretHeader = req.headers
    .get("x-telegram-bot-api-secret-token")
    ?.trim();
  const expectedSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET");
  if (!secretHeader || secretHeader !== expectedSecret) {
    return json({ error: "Forbidden" }, 403);
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const serviceClient = createServiceClient(
    supabaseUrl,
    supabaseServiceRoleKey
  );

  const payload = await parseJsonBody<TelegramWebhookUpdate>(req);
  const updateId = Number.parseInt(String(payload.update_id ?? ""), 10);
  if (!Number.isFinite(updateId))
    return json({ ok: true, ignored: "missing_update_id" });

  const inserted = await insertWebhookEvent({
    serviceClient,
    updateId,
    payload
  });
  if (!inserted) return json({ ok: true, duplicate: true });

  const telegramMessage = payload.message ?? payload.edited_message;
  if (!telegramMessage) {
    await markWebhookEventProcessed({ serviceClient, updateId });
    return json({ ok: true, ignored: "no_message" });
  }

  if (telegramMessage.from?.is_bot) {
    await markWebhookEventProcessed({ serviceClient, updateId });
    return json({ ok: true, ignored: "bot_message" });
  }

  const telegramChatId =
    typeof telegramMessage.chat?.id === "number"
      ? telegramMessage.chat.id
      : null;
  const telegramThreadId =
    typeof telegramMessage.message_thread_id === "number"
      ? telegramMessage.message_thread_id
      : null;
  const telegramMessageId =
    typeof telegramMessage.message_id === "number"
      ? telegramMessage.message_id
      : null;
  const body = sanitizeMultilineText(
    telegramMessage.text ?? telegramMessage.caption ?? "",
    4000
  );
  const hasPhoto =
    Array.isArray(telegramMessage.photo) && telegramMessage.photo.length > 0;

  if (!telegramChatId || !telegramThreadId || !telegramMessageId) {
    await markWebhookEventProcessed({ serviceClient, updateId });
    return json({ ok: true, ignored: "missing_thread" });
  }

  if (!body && !hasPhoto) {
    await markWebhookEventProcessed({ serviceClient, updateId });
    return json({ ok: true, ignored: "empty_message" });
  }

  const thread = await fetchTicketByThread({
    serviceClient,
    telegramChatId,
    telegramThreadId
  });
  if (!thread) {
    await markWebhookEventProcessed({ serviceClient, updateId });
    return json({ ok: true, ignored: "thread_not_registered" });
  }

  const { data: existingMessage, error: existingMessageError } =
    await serviceClient
      .from("support_ticket_messages")
      .select("id")
      .eq("telegram_chat_id", telegramChatId)
      .eq("telegram_message_id", telegramMessageId)
      .maybeSingle();

  if (existingMessageError) {
    throw new Error(
      `support_message_duplicate_check_failed:${existingMessageError.message}`
    );
  }

  if (!existingMessage) {
    const from = telegramMessage.from;
    const authorName = sanitizeSingleLineText(
      `${from?.first_name ?? ""} ${from?.last_name ?? ""}`.trim() ||
        from?.username ||
        "staff",
      160
    );
    const username = sanitizeSingleLineText(from?.username, 80) || null;

    const { data: ticketData, error: ticketError } = await serviceClient
      .from("support_tickets")
      .select("id, user_id, ticket_code, subject, category, status, created_at")
      .eq("id", thread.ticket_id)
      .single();

    if (ticketError) {
      throw new Error(`support_ticket_lookup_failed:${ticketError.message}`);
    }

    const ticket = ticketData as SupportTicketRow;
    const messageId = await insertStaffMessage({
      serviceClient,
      ticketId: thread.ticket_id,
      updateId,
      body,
      telegramChatId,
      telegramMessageId,
      telegramThreadId,
      authorName,
      username
    });

    if (hasPhoto) {
      const largestPhoto = [...(telegramMessage.photo ?? [])].sort(
        (left, right) =>
          (right.file_size ?? right.width * right.height) -
          (left.file_size ?? left.width * left.height)
      )[0];

      const uploadedPhoto = await uploadTelegramPhotoToStorage({
        serviceClient,
        ticket,
        photo: largestPhoto
      });

      await insertStaffAttachment({
        serviceClient,
        ticketId: thread.ticket_id,
        messageId,
        uploaderUserId: ticket.user_id,
        storagePath: uploadedPhoto.path,
        telegramFileId: largestPhoto.file_id,
        telegramMessageId,
        photo: largestPhoto
      });
    }

    const profile = await fetchProfile({
      serviceClient,
      userId: ticket.user_id
    });
    await sendSupportTicketReplyEmail({ ticket, profile }).catch((error) => {
      console.error(
        "support_reply_email_failed",
        error instanceof Error ? error.message : String(error)
      );
    });
  }

  await markWebhookEventProcessed({
    serviceClient,
    updateId,
    ticketId: thread.ticket_id
  });

  return json({
    ok: true,
    ticket_id: thread.ticket_id,
    telegram_message_id: telegramMessageId
  });
};

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const telegramSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (telegramSecret) {
      return await handleTelegramWebhook(req);
    }

    return await handleAuthenticatedSync(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(
      { error: sanitizeSingleLineText(message, 500) || "unknown_error" },
      500
    );
  }
});

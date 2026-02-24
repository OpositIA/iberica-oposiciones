import { useAuth } from "@/auth/AuthProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import { useToast } from "@/hooks/use-toast";
import { normalizeLocale, toIntlLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { AuthSessionError, secureApiFetch } from "@/lib/secureFetch";
import {
  AlertTriangle,
  BookOpen,
  Ellipsis,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  User
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  time: string;
  dbMessageId?: number;
  createdAt?: string;
};

type ConversationItem = {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
};

type GeminiHistoryItem = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};

type DailyQuotaResult = {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
};

const DAILY_USAGE_TIMEZONE = "Europe/Madrid";
const MESSAGES_PAGE_SIZE = 8;

const mapConversation = (
  row: Tables<"ai_conversations">
): ConversationItem => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  lastMessageAt: row.last_message_at
});

const mapDbMessageToChatMessage = (
  row: Pick<Tables<"ai_messages">, "id" | "role" | "content" | "created_at">,
  formatHora: (value?: string | Date) => string
): ChatMessage => ({
  id: `db-${row.id}`,
  role: (row.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
  content: row.content,
  time: formatHora(row.created_at),
  dbMessageId: row.id,
  createdAt: row.created_at
});

const AssistantIA = () => {
  const { t, i18n } = useTranslation(["assistant"]);
  const { toast } = useToast();
  const { user, isAuthReady } = useAuth();
  const [inputChat, setInputChat] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [estadoEscrituraIdx, setEstadoEscrituraIdx] = useState(0);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<
    string | null
  >(null);
  const [conversationPendingDelete, setConversationPendingDelete] =
    useState<ConversationItem | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [mensajes, setMensajes] = useState<ChatMessage[]>([]);
  const [dailyUsedRequests, setDailyUsedRequests] = useState(0);
  const [dailyRequestLimit, setDailyRequestLimit] = useState(0);
  const [isLoadingDailyUsage, setIsLoadingDailyUsage] = useState(true);
  const isRestoringPrependScrollRef = useRef(false);
  const prependPreviousScrollHeightRef = useRef(0);
  const prependPreviousScrollTopRef = useRef(0);
  const shouldStickToBottomRef = useRef(true);

  const locale = normalizeLocale(i18n.resolvedLanguage);
  const intlLocale = toIntlLocale(locale);
  const estadosEscrituraIA = useMemo(
    () => t("assistant:typingStates", { returnObjects: true }) as string[],
    [t]
  );

  const remainingDailyRequests = Math.max(
    dailyRequestLimit - dailyUsedRequests,
    0
  );
  const isDailyLimitReached =
    Boolean(currentUserId) &&
    !isLoadingDailyUsage &&
    remainingDailyRequests <= 0;
  const dailyUsagePercent =
    dailyRequestLimit > 0
      ? Math.min((dailyUsedRequests / dailyRequestLimit) * 100, 100)
      : 0;

  const formatHora = useCallback(
    (value?: string | Date) =>
      new Date(value ?? Date.now()).toLocaleTimeString(intlLocale, {
        hour: "2-digit",
        minute: "2-digit"
      }),
    [intlLocale]
  );

  const formatFechaHistorial = useCallback(
    (value: string) =>
      new Date(value).toLocaleDateString(intlLocale, {
        day: "2-digit",
        month: "short"
      }),
    [intlLocale]
  );

  const truncateTitle = useCallback(
    (value: string, max = 42) => {
      const clean = value.replace(/\s+/g, " ").trim();
      if (!clean) return t("assistant:newChat");
      return clean.length > max ? `${clean.slice(0, max)}...` : clean;
    },
    [t]
  );

  const getConversations = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("id, title, created_at, last_message_at")
        .eq("user_id", userId)
        .eq("archived", false)
        .order("last_message_at", { ascending: false });

      if (error) {
        toast({
          variant: "destructive",
          title: t("assistant:toasts.loadHistoryFailedTitle"),
          description: error.message
        });
        return null;
      }

      return (data ?? []).map(mapConversation);
    },
    [t, toast]
  );

  const createConversationRecord = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from("ai_conversations")
        .insert({ user_id: userId, title: t("assistant:newChat") })
        .select("id, title, created_at, last_message_at")
        .single();

      if (error || !data) {
        toast({
          variant: "destructive",
          title: t("assistant:toasts.createChatFailedTitle"),
          description:
            error?.message ?? t("assistant:toasts.createChatFailedDescription")
        });
        return null;
      }

      return mapConversation(data as Tables<"ai_conversations">);
    },
    [t, toast]
  );

  const refreshConversations = useCallback(async () => {
    if (!currentUserId) return;
    const data = await getConversations(currentUserId);
    if (data) setConversations(data);
  }, [currentUserId, getConversations]);

  const refreshDailyUsage = useCallback(async (userId: string) => {
    setIsLoadingDailyUsage(true);
    const { data, error } = await supabase.rpc("get_ai_daily_quota", {
      p_user_id: userId,
      p_tz: DAILY_USAGE_TIMEZONE
    });

    const row = data?.[0];
    if (error || !row) {
      setDailyRequestLimit((prev) => (prev > 0 ? prev : 10));
      setIsLoadingDailyUsage(false);
      return;
    }

    const nextLimit =
      typeof row.limit === "number" &&
      Number.isFinite(row.limit) &&
      row.limit > 0
        ? Math.floor(row.limit)
        : 0;
    const nextUsed =
      typeof row.used === "number" && Number.isFinite(row.used)
        ? Math.max(0, Math.floor(row.used))
        : 0;

    setDailyRequestLimit(nextLimit);
    setDailyUsedRequests(nextUsed);
    setIsLoadingDailyUsage(false);
  }, []);

  const consumeDailyQuota = useCallback(
    async (userId: string): Promise<DailyQuotaResult | null> => {
      const { data, error } = await supabase.rpc("consume_ai_daily_quota", {
        p_user_id: userId,
        p_tz: DAILY_USAGE_TIMEZONE
      });

      const row = data?.[0];
      if (error || !row) {
        toast({
          variant: "destructive",
          title: t("assistant:toasts.validateDailyLimitFailedTitle"),
          description:
            error?.message ??
            t("assistant:toasts.validateDailyLimitFailedDescription")
        });
        return null;
      }

      const nextLimit =
        typeof row.limit === "number" &&
        Number.isFinite(row.limit) &&
        row.limit > 0
          ? Math.floor(row.limit)
          : 0;
      const nextUsed =
        typeof row.used === "number" && Number.isFinite(row.used)
          ? Math.max(0, Math.floor(row.used))
          : 0;
      const nextRemaining =
        typeof row.remaining === "number" && Number.isFinite(row.remaining)
          ? Math.max(0, Math.floor(row.remaining))
          : Math.max(nextLimit - nextUsed, 0);

      setDailyRequestLimit(nextLimit);
      setDailyUsedRequests(nextUsed);

      return {
        allowed: Boolean(row.allowed),
        used: nextUsed,
        limit: nextLimit,
        remaining: nextRemaining
      };
    },
    [t, toast]
  );

  const loadMessages = useCallback(
    async (conversationId: string) => {
      setIsLoadingMessages(true);
      setIsLoadingOlderMessages(false);
      setHasMoreMessages(false);

      const { data, error } = await supabase
        .from("ai_messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("id", { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);

      if (error) {
        toast({
          variant: "destructive",
          title: t("assistant:toasts.loadConversationFailedTitle"),
          description: error.message
        });
        setMensajes([]);
        setIsLoadingMessages(false);
        return;
      }

      const rows = data ?? [];
      const mapped = rows
        .slice()
        .reverse()
        .map((row) => mapDbMessageToChatMessage(row, formatHora));

      setMensajes(mapped);
      setHasMoreMessages(rows.length === MESSAGES_PAGE_SIZE);
      setIsLoadingMessages(false);
      shouldStickToBottomRef.current = true;
      requestAnimationFrame(() => {
        const node = chatContainerRef.current;
        if (!node) return;
        node.scrollTop = node.scrollHeight;
      });
    },
    [formatHora, t, toast]
  );

  const loadOlderMessages = useCallback(async () => {
    if (
      !activeConversationId ||
      isLoadingMessages ||
      isLoadingOlderMessages ||
      !hasMoreMessages
    )
      return;

    const oldestDbMessageId = mensajes[0]?.dbMessageId;
    if (typeof oldestDbMessageId !== "number") {
      setHasMoreMessages(false);
      return;
    }

    const node = chatContainerRef.current;
    if (node) {
      prependPreviousScrollHeightRef.current = node.scrollHeight;
      prependPreviousScrollTopRef.current = node.scrollTop;
      isRestoringPrependScrollRef.current = true;
    }

    setIsLoadingOlderMessages(true);
    const { data, error } = await supabase
      .from("ai_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", activeConversationId)
      .lt("id", oldestDbMessageId)
      .order("id", { ascending: false })
      .limit(MESSAGES_PAGE_SIZE);

    if (error) {
      toast({
        variant: "destructive",
        title: t("assistant:toasts.loadOlderMessagesFailedTitle", {
          defaultValue: "No se pudieron cargar mensajes anteriores"
        }),
        description: error.message
      });
      setIsLoadingOlderMessages(false);
      isRestoringPrependScrollRef.current = false;
      return;
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      setHasMoreMessages(false);
      setIsLoadingOlderMessages(false);
      isRestoringPrependScrollRef.current = false;
      return;
    }

    const mappedOlder = rows
      .slice()
      .reverse()
      .map((row) => mapDbMessageToChatMessage(row, formatHora));
    setMensajes((prev) => [...mappedOlder, ...prev]);
    setHasMoreMessages(rows.length === MESSAGES_PAGE_SIZE);
    setIsLoadingOlderMessages(false);
  }, [
    activeConversationId,
    formatHora,
    hasMoreMessages,
    isLoadingMessages,
    isLoadingOlderMessages,
    mensajes,
    t,
    toast
  ]);

  useEffect(() => {
    if (!isAuthReady) return;

    const userId = user?.id ?? null;
    setCurrentUserId(userId);

    if (!userId) {
      setConversations([]);
      setActiveConversationId(null);
      setMensajes([]);
      setHasMoreMessages(false);
      setIsLoadingOlderMessages(false);
      setDailyUsedRequests(0);
      setDailyRequestLimit(0);
      setIsLoadingDailyUsage(false);
      setIsLoadingConversations(false);
      return;
    }

    let isCancelled = false;

    const bootstrap = async () => {
      setIsLoadingConversations(true);
      const loadedConversations = await getConversations(userId);
      if (isCancelled) return;

      if (!loadedConversations) {
        setIsLoadingConversations(false);
        return;
      }

      if (loadedConversations.length === 0) {
        const created = await createConversationRecord(userId);
        if (isCancelled) return;
        if (created) {
          setConversations([created]);
          setActiveConversationId(created.id);
        }
        setIsLoadingConversations(false);
        return;
      }

      setConversations(loadedConversations);
      setActiveConversationId(loadedConversations[0].id);
      setIsLoadingConversations(false);
    };

    void bootstrap();
    void refreshDailyUsage(userId);

    return () => {
      isCancelled = true;
    };
  }, [
    createConversationRecord,
    getConversations,
    isAuthReady,
    refreshDailyUsage,
    user?.id
  ]);

  useEffect(() => {
    if (!activeConversationId) {
      setMensajes([]);
      setHasMoreMessages(false);
      setIsLoadingOlderMessages(false);
      return;
    }

    void loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    if (!isSendingChat) {
      setEstadoEscrituraIdx(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setEstadoEscrituraIdx((prev) => (prev + 1) % estadosEscrituraIA.length);
    }, 1800);

    return () => window.clearInterval(intervalId);
  }, [estadosEscrituraIA.length, isSendingChat]);

  useEffect(() => {
    const node = chatContainerRef.current;
    if (!node) return;

    if (isRestoringPrependScrollRef.current) {
      const nextScrollTop =
        prependPreviousScrollTopRef.current +
        (node.scrollHeight - prependPreviousScrollHeightRef.current);
      node.scrollTop = Math.max(nextScrollTop, 0);
      isRestoringPrependScrollRef.current = false;
      return;
    }

    if (shouldStickToBottomRef.current || isSendingChat) {
      node.scrollTop = node.scrollHeight;
    }
  }, [mensajes, isSendingChat, estadoEscrituraIdx, isLoadingMessages]);

  const extraerTextoRespuesta = (payload: unknown) => {
    if (!payload || typeof payload !== "object") return "";

    const data = payload as Record<string, unknown>;
    const stringFields = ["message", "reply", "response", "text", "content"];
    for (const field of stringFields) {
      const value = data[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }

    const choices = data.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const firstChoice = choices[0] as
        | { message?: { content?: unknown }; text?: unknown }
        | undefined;
      if (typeof firstChoice?.message?.content === "string")
        return firstChoice.message.content.trim();

      if (typeof firstChoice?.text === "string") return firstChoice.text.trim();
    }

    return "";
  };

  const renderInlineMarkdown = (text: string, keyPrefix: string) =>
    text
      .split(/(\*\*[^*]+\*\*)/g)
      .filter(Boolean)
      .map((segment, index) => {
        const strongMatch = segment.match(/^\*\*(.+)\*\*$/);
        if (strongMatch) {
          return (
            <strong
              key={`${keyPrefix}-strong-${index}`}
              className="font-semibold"
            >
              {strongMatch[1]}
            </strong>
          );
        }

        return <span key={`${keyPrefix}-text-${index}`}>{segment}</span>;
      });

  const renderAssistantContent = (content: string, keyPrefix: string) => {
    const lines = content.split(/\r?\n/);
    const blocks: JSX.Element[] = [];
    let bulletItems: string[] = [];

    const flushBulletItems = (lineIndex: number) => {
      if (bulletItems.length === 0) return;

      blocks.push(
        <ul
          key={`${keyPrefix}-list-${lineIndex}`}
          className="list-disc pl-5 space-y-1"
        >
          {bulletItems.map((item, itemIndex) => (
            <li
              key={`${keyPrefix}-item-${lineIndex}-${itemIndex}`}
              className="text-sm leading-relaxed"
            >
              {renderInlineMarkdown(
                item,
                `${keyPrefix}-item-content-${lineIndex}-${itemIndex}`
              )}
            </li>
          ))}
        </ul>
      );
      bulletItems = [];
    };

    lines.forEach((rawLine, lineIndex) => {
      const line = rawLine.trim();

      if (!line) {
        flushBulletItems(lineIndex);
        return;
      }

      const bulletMatch = line.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        bulletItems.push(bulletMatch[1]);
        return;
      }

      flushBulletItems(lineIndex);

      const h3Match = line.match(/^###\s+(.+)$/);
      if (h3Match) {
        blocks.push(
          <h3
            key={`${keyPrefix}-h3-${lineIndex}`}
            className="text-sm font-semibold tracking-wide mt-2"
          >
            {renderInlineMarkdown(
              h3Match[1],
              `${keyPrefix}-h3-content-${lineIndex}`
            )}
          </h3>
        );
        return;
      }

      const h4Match = line.match(/^####\s+(.+)$/);
      if (h4Match) {
        blocks.push(
          <h4
            key={`${keyPrefix}-h4-${lineIndex}`}
            className="text-sm font-semibold text-muted-foreground"
          >
            {renderInlineMarkdown(
              h4Match[1],
              `${keyPrefix}-h4-content-${lineIndex}`
            )}
          </h4>
        );
        return;
      }

      blocks.push(
        <p
          key={`${keyPrefix}-p-${lineIndex}`}
          className="text-sm leading-relaxed"
        >
          {renderInlineMarkdown(line, `${keyPrefix}-p-content-${lineIndex}`)}
        </p>
      );
    });

    flushBulletItems(lines.length + 1);

    if (blocks.length === 0) {
      return (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
      );
    }

    return <div className="space-y-2">{blocks}</div>;
  };

  const isDefaultConversationTitle = (value: string) => {
    const trimmed = value.trim();
    const knownTitles = new Set([
      t("assistant:newChat"),
      i18n.getFixedT("es")("assistant:newChat"),
      i18n.getFixedT("en")("assistant:newChat")
    ]);
    return !trimmed || knownTitles.has(trimmed);
  };

  const isConversationEmpty = useCallback(
    (conversation: ConversationItem) => {
      const createdAtMs = Date.parse(conversation.createdAt);
      const lastMessageAtMs = Date.parse(conversation.lastMessageAt);
      const hasNoMessagesByTimestamps =
        !Number.isNaN(createdAtMs) &&
        !Number.isNaN(lastMessageAtMs) &&
        Math.abs(lastMessageAtMs - createdAtMs) < 1000;
      return (
        isDefaultConversationTitle(conversation.title) || hasNoMessagesByTimestamps
      );
    },
    [isDefaultConversationTitle]
  );

  const moveConversationToTop = useCallback((conversationId: string) => {
    setConversations((prev) => {
      const found = prev.find((conversation) => conversation.id === conversationId);
      if (!found) return prev;
      return [
        found,
        ...prev.filter((conversation) => conversation.id !== conversationId)
      ];
    });
  }, []);

  const getExistingEmptyConversation = useCallback(
    (list: ConversationItem[]) => list.find(isConversationEmpty) ?? null,
    [isConversationEmpty]
  );

  const onCreateConversation = async () => {
    if (!currentUserId || isCreatingConversation) return;

    const existingEmpty = getExistingEmptyConversation(conversations);
    if (existingEmpty) {
      moveConversationToTop(existingEmpty.id);
      setActiveConversationId(existingEmpty.id);
      setInputChat("");
      return;
    }

    setIsCreatingConversation(true);
    const created = await createConversationRecord(currentUserId);
    setIsCreatingConversation(false);

    if (!created) return;

    setConversations((prev) => [
      created,
      ...prev.filter((item) => item.id !== created.id)
    ]);
    setActiveConversationId(created.id);
    setInputChat("");
    setMensajes([]);
  };

  const onRequestDeleteConversation = (conversation: ConversationItem) => {
    if (!currentUserId || deletingConversationId || isSendingChat) return;
    setConversationPendingDelete(conversation);
  };

  const onDeleteConversation = async () => {
    const conversationId = conversationPendingDelete?.id;
    if (!currentUserId || !conversationId || deletingConversationId || isSendingChat)
      return;

    setDeletingConversationId(conversationId);
    const { error } = await supabase
      .from("ai_conversations")
      .delete()
      .eq("id", conversationId)
      .eq("user_id", currentUserId);

    if (error) {
      toast({
        variant: "destructive",
        title: t("assistant:toasts.deleteChatFailedTitle", {
          defaultValue: "No se pudo borrar el chat"
        }),
        description: error.message
      });
      setDeletingConversationId(null);
      return;
    }

    const remainingConversations = conversations.filter(
      (conversation) => conversation.id !== conversationId
    );
    setConversations(remainingConversations);

    if (activeConversationId === conversationId) {
      if (remainingConversations.length > 0) {
        setActiveConversationId(remainingConversations[0].id);
      } else {
        setActiveConversationId(null);
        setMensajes([]);
        const created = await createConversationRecord(currentUserId);
        if (created) {
          setConversations([created]);
          setActiveConversationId(created.id);
        }
      }
    }

    setConversationPendingDelete(null);
    setDeletingConversationId(null);
  };

  const isDeleteDialogBusy =
    Boolean(conversationPendingDelete) &&
    deletingConversationId === conversationPendingDelete?.id;

  const onDeleteDialogOpenChange = (open: boolean) => {
    if (isDeleteDialogBusy) return;
    if (!open) setConversationPendingDelete(null);
  };

  const onSelectConversation = (conversationId: string) => {
    if (isSendingChat) return;
    setActiveConversationId(conversationId);
  };

  const handleChatScroll = useCallback(() => {
    const node = chatContainerRef.current;
    if (!node) return;

    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 72;

    if (
      node.scrollTop <= 64 &&
      hasMoreMessages &&
      !isLoadingMessages &&
      !isLoadingOlderMessages
    ) {
      void loadOlderMessages();
    }
  }, [hasMoreMessages, isLoadingMessages, isLoadingOlderMessages, loadOlderMessages]);

  const onSubmitChat = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const texto = inputChat.trim();
    if (!texto || isSendingChat || !currentUserId) return;
    if (isDailyLimitReached) {
      toast({
        variant: "destructive",
        title: t("assistant:toasts.dailyLimitReachedTitle"),
        description: t("assistant:toasts.dailyLimitReachedDescription", {
          used: dailyUsedRequests,
          limit: dailyRequestLimit
        })
      });
      return;
    }

    const quota = await consumeDailyQuota(currentUserId);
    if (!quota) return;
    if (!quota.allowed) {
      toast({
        variant: "destructive",
        title: t("assistant:toasts.dailyLimitReachedTitle"),
        description: t("assistant:toasts.dailyLimitReachedDescription", {
          used: quota.used,
          limit: quota.limit
        })
      });
      return;
    }

    let conversationId = activeConversationId;

    if (!conversationId) {
      const existingEmpty = getExistingEmptyConversation(conversations);
      if (existingEmpty) {
        moveConversationToTop(existingEmpty.id);
        setActiveConversationId(existingEmpty.id);
        conversationId = existingEmpty.id;
      } else {
        const created = await createConversationRecord(currentUserId);
        if (!created) return;
        setConversations((prev) => [
          created,
          ...prev.filter((item) => item.id !== created.id)
        ]);
        setActiveConversationId(created.id);
        conversationId = created.id;
      }
    }

    const currentConversationTitle =
      conversations.find((conv) => conv.id === conversationId)?.title ?? "";
    const shouldRenameConversation = isDefaultConversationTitle(
      currentConversationTitle
    );

    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: texto,
      time: formatHora()
    };

    setMensajes((prev) => [...prev, userMessage]);
    setInputChat("");
    setIsSendingChat(true);

    try {
      const { error: userMessageError } = await supabase
        .from("ai_messages")
        .insert({
          conversation_id: conversationId,
          user_id: currentUserId,
          role: "user",
          content: texto
        });

      if (userMessageError) {
        throw new Error(
          t("assistant:errors.saveUserMessageFailed", {
            message: userMessageError.message
          })
        );
      }

      if (shouldRenameConversation) {
        const newTitle = truncateTitle(texto, 48);
        const { error: renameError } = await supabase
          .from("ai_conversations")
          .update({ title: newTitle })
          .eq("id", conversationId)
          .eq("user_id", currentUserId);

        if (!renameError) {
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === conversationId ? { ...conv, title: newTitle } : conv
            )
          );
        }
      }

      const mensajesConContexto = [...mensajes, userMessage];
      const history: GeminiHistoryItem[] = mensajesConContexto
        .filter((m) => m.content.trim().length > 0)
        .slice(-20)
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        }));

      const response = await secureApiFetch(
        "http://localhost:3001/api/gemini-chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ message: texto, history })
        }
      );

      const payload = await response.json().catch(() => ({}));
      const assistantText = extraerTextoRespuesta(payload);
      const usage = payload as { used?: unknown; limit?: unknown };

      if (typeof usage.used === "number" && Number.isFinite(usage.used))
        setDailyUsedRequests(Math.max(0, Math.floor(usage.used)));
      if (
        typeof usage.limit === "number" &&
        Number.isFinite(usage.limit) &&
        usage.limit > 0
      )
        setDailyRequestLimit(Math.floor(usage.limit));

      if (!response.ok) {
        if (response.status === 429) {
          const usedAtLimit =
            typeof usage.used === "number" && Number.isFinite(usage.used)
              ? Math.max(0, Math.floor(usage.used))
              : dailyRequestLimit;
          setDailyUsedRequests(usedAtLimit);
          if (
            typeof usage.limit === "number" &&
            Number.isFinite(usage.limit) &&
            usage.limit > 0
          )
            setDailyRequestLimit(Math.floor(usage.limit));
          throw new Error(t("assistant:errors.dailyLimitReached"));
        }
        throw new Error(
          assistantText || t("assistant:errors.assistantResponseFailed")
        );
      }

      const assistantFinalText =
        assistantText || t("assistant:errors.responseFormat");

      const { error: assistantMessageError } = await supabase
        .from("ai_messages")
        .insert({
          conversation_id: conversationId,
          user_id: currentUserId,
          role: "assistant",
          content: assistantFinalText
        });

      if (assistantMessageError) {
        throw new Error(
          t("assistant:errors.saveAssistantMessageFailed", {
            message: assistantMessageError.message
          })
        );
      }

      setMensajes((prev) => [
        ...prev,
        {
          id: `local-assistant-${Date.now()}`,
          role: "assistant",
          content: assistantFinalText,
          time: formatHora()
        }
      ]);

      void refreshConversations();
      void refreshDailyUsage(currentUserId);
    } catch (error) {
      const message = (() => {
        if (error instanceof AuthSessionError)
          return t("assistant:errors.invalidSession");
        if (error instanceof Error) return error.message;
        return t("assistant:errors.connection");
      })();

      setMensajes((prev) => [
        ...prev,
        {
          id: `local-error-${Date.now()}`,
          role: "assistant",
          content: t("assistant:errors.prefix", { message }),
          time: formatHora()
        }
      ]);
      void refreshDailyUsage(currentUserId);
    } finally {
      setIsSendingChat(false);
    }
  };

  return (
    <div className="grid h-[74vh] max-h-[74vh] min-h-0 items-stretch gap-4 lg:-ml-4 lg:grid-cols-[18.5rem_minmax(0,1fr)]">
      <aside className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background/95 shadow-[0_26px_60px_-38px_rgba(0,0,0,0.42)]">
        <div className="pointer-events-none absolute -top-14 -left-14 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="border-b border-border/70 bg-gradient-to-br from-primary/10 via-background to-background px-4 py-4">
          <div className="mb-2">
            <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
              {t("assistant:sidebar.history")}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-foreground">
              {t("assistant:sidebar.conversations")}
            </h2>
          </div>
        </div>

        <div className="flex-1 min-h-0 space-y-2 overflow-y-auto p-3">
          {isLoadingConversations ? (
            <p className="py-3 text-sm text-muted-foreground">
              {t("assistant:sidebar.loadingChats")}
            </p>
          ) : conversations.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              {t("assistant:sidebar.emptyChats")}
            </p>
          ) : (
            conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;
              const isDeletingThis = deletingConversationId === conversation.id;
              return (
                <div
                  key={conversation.id}
                  className={`group w-full rounded-2xl border px-3 py-2.5 text-left transition-all ${
                    isActive
                      ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_10px_30px_-25px_rgba(255,119,0,0.95)]"
                      : "border-border/80 bg-background/90 text-foreground hover:-translate-y-[1px] hover:border-primary/30 hover:bg-secondary"
                  } ${isSendingChat ? "opacity-70" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectConversation(conversation.id)}
                      disabled={isSendingChat}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isActive ? "bg-primary" : "bg-muted-foreground/40"
                          }`}
                        />
                        <p className="truncate text-sm font-medium">
                          {conversation.title || t("assistant:newChat")}
                        </p>
                      </div>
                      <p className="mt-1 pl-3.5 text-[11px] text-muted-foreground">
                        {formatFechaHistorial(conversation.lastMessageAt)}
                      </p>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={Boolean(deletingConversationId) || isSendingChat}
                          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-all hover:bg-secondary disabled:opacity-60 ${
                            isDeletingThis
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          }`}
                          aria-label={t("assistant:sidebar.chatOptions", {
                            defaultValue: "Opciones del chat"
                          })}
                          title={t("assistant:sidebar.chatOptions", {
                            defaultValue: "Opciones del chat"
                          })}
                        >
                          {isDeletingThis ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Ellipsis className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem
                          onClick={() => onRequestDeleteConversation(conversation)}
                          className="text-foreground focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
                        >
                          {t("assistant:sidebar.deleteChat", {
                            defaultValue: "Eliminar"
                          })}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-auto border-t border-border/70 bg-background/85 p-3 backdrop-blur">
          <button
            type="button"
            onClick={onCreateConversation}
            disabled={
              isCreatingConversation || isLoadingConversations || !currentUserId
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-3 text-xs font-semibold tracking-widest uppercase text-primary-foreground shadow-[0_16px_30px_-20px_rgba(255,119,0,0.95)] transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isCreatingConversation ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t("assistant:sidebar.newChat")}
          </button>
        </div>
      </aside>

      <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background/95 p-5 shadow-[0_26px_60px_-38px_rgba(0,0,0,0.42)] md:p-6">
        <div className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
        <div className="min-w-0 flex-1 min-h-0 flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="w-full">
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
                {t("assistant:header.badge")}
              </p>
              <h1 className="text-2xl font-serif text-foreground">
                {t("assistant:header.title")}
              </h1>
              <div
                className={`mt-3 rounded-2xl border px-3 py-2 ${isDailyLimitReached ? "border-destructive/40 bg-destructive/10" : "border-border/70 bg-secondary/40"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {t("assistant:header.dailyLimit")}
                  </p>
                  <p
                    className={`text-xs font-semibold ${isDailyLimitReached ? "text-destructive" : "text-foreground"}`}
                  >
                    {isLoadingDailyUsage
                      ? "..."
                      : `${dailyUsedRequests}/${dailyRequestLimit}`}
                  </p>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/70">
                  <div
                    className={`h-full transition-all ${isDailyLimitReached ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${dailyUsagePercent}%` }}
                  />
                </div>
                <p
                  className={`mt-2 text-[11px] ${isDailyLimitReached ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {isLoadingDailyUsage
                    ? t("assistant:header.checkingUsage")
                    : isDailyLimitReached
                      ? t("assistant:header.limitReached")
                      : t("assistant:header.remaining", {
                          count: remainingDailyRequests
                        })}
                </p>
              </div>
            </div>
          </div>

          <div
            ref={chatContainerRef}
            onScroll={handleChatScroll}
            className="flex-1 min-h-0 space-y-3 overflow-y-auto rounded-3xl border border-border/70 bg-gradient-to-b from-secondary/30 via-secondary/15 to-background p-4"
          >
            {isLoadingMessages ? (
              <div className="flex h-full min-h-72 items-center justify-center text-sm text-muted-foreground">
                {t("assistant:chat.loadingConversation")}
              </div>
            ) : (
              <>
                {isLoadingOlderMessages && mensajes.length > 0 && (
                  <div className="flex items-center justify-center py-1 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    {t("assistant:chat.loadingOlderMessages", {
                      defaultValue: "Cargando mensajes anteriores..."
                    })}
                  </div>
                )}
                {mensajes.length === 0 && (
                  <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background shadow-sm">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {t("assistant:chat.emptyTitle")}
                    </p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      {t("assistant:chat.emptyDescription")}
                    </p>
                  </div>
                )}
                {mensajes.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[88%] rounded-3xl p-3 ${
                      m.role === "assistant"
                        ? "border border-border/70 bg-background text-foreground shadow-sm"
                        : "ml-auto bg-primary text-primary-foreground shadow-[0_12px_24px_-18px_rgba(255,119,0,0.95)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {m.role === "assistant" ? (
                        <MessageCircle className="h-3.5 w-3.5" />
                      ) : (
                        <User className="h-3.5 w-3.5" />
                      )}
                      <span className="text-[11px] uppercase tracking-widest opacity-70">
                        {m.role === "assistant"
                          ? t("assistant:chat.assistantLabel")
                          : t("assistant:chat.userLabel")}
                      </span>
                      <span className="text-[11px] opacity-70 ml-auto">
                        {m.time}
                      </span>
                    </div>
                    {m.role === "assistant" ? (
                      renderAssistantContent(m.content, `assistant-msg-${m.id}`)
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {m.content}
                      </p>
                    )}
                  </div>
                ))}
                {isSendingChat && (
                  <div className="max-w-[88%] rounded-3xl border border-border/70 bg-background p-3 text-foreground shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span className="text-[11px] uppercase tracking-widest opacity-70">
                        {t("assistant:chat.assistantLabel")}
                      </span>
                      <span className="text-[11px] opacity-70 ml-auto">
                        {t("assistant:chat.writing")}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed animate-pulse">
                      {estadosEscrituraIA[estadoEscrituraIdx]}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <form onSubmit={onSubmitChat} className="mt-4 flex gap-2">
            <div
              className={`flex flex-1 items-center rounded-3xl border bg-background px-3 shadow-sm ${
                isDailyLimitReached ? "border-destructive/40" : "border-border"
              }`}
            >
              <input
                value={inputChat}
                onChange={(e) => setInputChat(e.target.value)}
                placeholder={
                  isDailyLimitReached
                    ? t("assistant:input.placeholderLimitReached")
                    : t("assistant:input.placeholder")
                }
                disabled={isDailyLimitReached}
                className="w-full bg-transparent py-3 text-sm focus:outline-none"
              />
              {isDailyLimitReached && (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
            </div>
            <button
              type="submit"
              disabled={isSendingChat || !currentUserId || isDailyLimitReached}
              className="inline-flex items-center gap-2 rounded-3xl bg-primary px-4 py-3 text-xs font-semibold tracking-widest uppercase text-primary-foreground shadow-[0_16px_30px_-20px_rgba(255,119,0,0.95)] transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {isSendingChat
                ? t("assistant:input.waiting")
                : t("assistant:input.send")}
            </button>
          </form>
        </div>
      </section>

      <ConfirmActionDialog
        open={Boolean(conversationPendingDelete)}
        onOpenChange={onDeleteDialogOpenChange}
        title={t("assistant:sidebar.deleteDialogTitle", {
          defaultValue: "Eliminar conversacion"
        })}
        description={t("assistant:sidebar.deleteDialogDescription", {
          title: conversationPendingDelete?.title || t("assistant:newChat"),
          defaultValue:
            'Se eliminara "{{title}}" con todos sus mensajes. Esta accion no se puede deshacer.'
        })}
        confirmLabel={t("assistant:sidebar.deleteChat", {
          defaultValue: "Eliminar"
        })}
        cancelLabel={t("assistant:sidebar.cancelDelete", {
          defaultValue: "Cancelar"
        })}
        confirmStyle="destructive"
        isLoading={isDeleteDialogBusy}
        onConfirm={onDeleteConversation}
      />
    </div>
  );
};

export default AssistantIA;

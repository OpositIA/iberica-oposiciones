import { useAuth } from "@/auth/AuthProvider";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import CustomButton from "@/components/ui/custom-button";
import CustomInput from "@/components/ui/custom-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { normalizeLocale, toIntlLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { AuthSessionError, secureApiFetch } from "@/lib/secureFetch";
import { runSingleFlight } from "@/lib/singleFlight";
import {
  AlertTriangle,
  BookOpen,
  Ellipsis,
  ExternalLink,
  GitBranch,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  User
} from "lucide-react";
import {
  FormEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  WheelEvent
} from "react";
import { useTranslation } from "react-i18next";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  conceptMap?: ConceptMapData;
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

type ConceptMapNode = {
  id: string;
  label: string;
  level: number;
};

type ConceptMapEdge = {
  from: string;
  to: string;
  label: string;
};

type ConceptMapData = {
  title: string;
  nodes: ConceptMapNode[];
  edges: ConceptMapEdge[];
};

type AssistantContentParseResult = {
  text: string;
  conceptMap: ConceptMapData | null;
};

type MindMapLayoutNode = {
  id: string;
  label: string;
  level: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type MindMapLayoutEdge = {
  key: string;
  from: string;
  to: string;
  label: string;
  path: string;
};

const DAILY_USAGE_TIMEZONE = "Europe/Madrid";
const MESSAGES_PAGE_SIZE = 8;
const CONCEPT_MAP_STORAGE_PREFIX = "__CONCEPT_MAP__:";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const humanizeNodeId = (value: string) => {
  const normalized = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return value;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const parseJson = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const normalizeConceptMapData = (input: unknown): ConceptMapData | null => {
  if (!isRecord(input)) return null;

  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const nodeMap = new Map<string, ConceptMapNode>();

  rawNodes.forEach((rawNode) => {
    if (!isRecord(rawNode)) return;

    const id = typeof rawNode.id === "string" ? rawNode.id.trim() : "";
    if (!id || nodeMap.has(id)) return;

    const label =
      typeof rawNode.label === "string" && rawNode.label.trim()
        ? rawNode.label.trim()
        : humanizeNodeId(id);

    const rawLevel = rawNode.level;
    const parsedLevel =
      typeof rawLevel === "number"
        ? rawLevel
        : Number.parseInt(String(rawLevel ?? "0"), 10);
    const level = Number.isFinite(parsedLevel) ? Math.max(0, parsedLevel) : 0;

    nodeMap.set(id, { id, label, level });
  });

  const nodes = Array.from(nodeMap.values());
  if (nodes.length === 0) return null;

  const rawEdges = Array.isArray(input.edges) ? input.edges : [];
  const seenEdgeKeys = new Set<string>();
  const edges: ConceptMapEdge[] = [];

  rawEdges.forEach((rawEdge) => {
    if (!isRecord(rawEdge)) return;

    const from = typeof rawEdge.from === "string" ? rawEdge.from.trim() : "";
    const to = typeof rawEdge.to === "string" ? rawEdge.to.trim() : "";
    if (!from || !to) return;
    if (!nodeMap.has(from) || !nodeMap.has(to)) return;

    const label = typeof rawEdge.label === "string" ? rawEdge.label.trim() : "";
    const edgeKey = `${from}->${to}|${label}`;
    if (seenEdgeKeys.has(edgeKey)) return;
    seenEdgeKeys.add(edgeKey);
    edges.push({ from, to, label });
  });

  const rootNode = nodes.reduce((current, candidate) =>
    candidate.level < current.level ? candidate : current
  );

  const title =
    typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : rootNode.label || "Mapa mental";

  return {
    title,
    nodes,
    edges
  };
};

const extractConceptMapFromPayload = (
  payload: unknown
): ConceptMapData | null => {
  const tryNormalize = (candidate: unknown): ConceptMapData | null => {
    if (typeof candidate === "string") {
      const parsed = parseJson(candidate);
      if (parsed) {
        const normalizedParsed = normalizeConceptMapData(parsed);
        if (normalizedParsed) return normalizedParsed;

        if (isRecord(parsed)) {
          const nested = normalizeConceptMapData(parsed.message);
          if (nested) return nested;
        }
      }
      return null;
    }

    const normalized = normalizeConceptMapData(candidate);
    if (normalized) return normalized;

    if (isRecord(candidate)) {
      const nested = normalizeConceptMapData(candidate.message);
      if (nested) return nested;
    }

    return null;
  };

  if (!isRecord(payload)) return null;

  const candidates: unknown[] = [
    payload.message,
    payload.conceptMap,
    payload.mindMap,
    payload.mentalMap,
    payload.map,
    payload
  ];

  const choices = payload.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const firstChoice = choices[0];
    if (isRecord(firstChoice)) {
      candidates.push(firstChoice.text);
      if (isRecord(firstChoice.message))
        candidates.push(firstChoice.message.content);
    }
  }

  for (const candidate of candidates) {
    const normalized = tryNormalize(candidate);
    if (normalized) return normalized;
  }

  return null;
};

const serializeConceptMapForStorage = (conceptMap: ConceptMapData) =>
  `${CONCEPT_MAP_STORAGE_PREFIX}${JSON.stringify(conceptMap)}`;

const parseAssistantContentFromStorage = (
  content: string
): AssistantContentParseResult => {
  if (!content.startsWith(CONCEPT_MAP_STORAGE_PREFIX))
    return { text: content, conceptMap: null };

  const rawConceptMap = content.slice(CONCEPT_MAP_STORAGE_PREFIX.length);
  const parsedConceptMap = normalizeConceptMapData(parseJson(rawConceptMap));
  if (!parsedConceptMap) return { text: content, conceptMap: null };

  return {
    text: parsedConceptMap.title,
    conceptMap: parsedConceptMap
  };
};

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
): ChatMessage => {
  const parsedAssistantContent =
    row.role === "assistant"
      ? parseAssistantContentFromStorage(row.content)
      : { text: row.content, conceptMap: null };

  return {
    id: `db-${row.id}`,
    role: (row.role === "assistant" ? "assistant" : "user") as
      | "assistant"
      | "user",
    content: parsedAssistantContent.text,
    conceptMap: parsedAssistantContent.conceptMap ?? undefined,
    time: formatHora(row.created_at),
    dbMessageId: row.id,
    createdAt: row.created_at
  };
};

const AssistantIA = () => {
  const { t, i18n } = useTranslation(["assistant"]);
  const { toast } = useToast();
  const { user, isAuthReady, session } = useAuth();
  const [inputChat, setInputChat] = useState("");
  const [isMindMapEnabled, setIsMindMapEnabled] = useState(false);
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
  const [pendingAssistantMode, setPendingAssistantMode] = useState<
    "text" | "concept-map"
  >("text");
  const [conceptMapDialogMessageId, setConceptMapDialogMessageId] = useState<
    string | null
  >(null);
  const [selectedConceptMapNodeId, setSelectedConceptMapNodeId] = useState<
    string | null
  >(null);
  const [mindMapZoom, setMindMapZoom] = useState(1);
  const [isMindMapDragging, setIsMindMapDragging] = useState(false);
  const mindMapViewportRef = useRef<HTMLDivElement | null>(null);
  const mindMapDragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
    moved: false
  });
  const mindMapSuppressNodeClickRef = useRef(false);
  const mindMapSuppressTimerRef = useRef<number | null>(null);
  const isRestoringPrependScrollRef = useRef(false);
  const prependPreviousScrollHeightRef = useRef(0);
  const prependPreviousScrollTopRef = useRef(0);
  const shouldStickToBottomRef = useRef(true);
  const bootstrappedUserIdRef = useRef<string | null>(null);
  const lastLoadedConversationIdRef = useRef<string | null>(null);

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
    async (userId: string) =>
      runSingleFlight(
        `assistant:get-conversations:${userId}`,
        async () => {
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
        { reuseResultForMs: 1500 }
      ),
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
    const { data, error } = await runSingleFlight(
      `assistant:daily-usage:${userId}`,
      () =>
        supabase.rpc("get_ai_daily_quota", {
          p_user_id: userId,
          p_tz: DAILY_USAGE_TIMEZONE
        }),
      { reuseResultForMs: 1000 }
    );

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

      const { data, error } = await runSingleFlight(
        `assistant:load-messages:${conversationId}`,
        () =>
          supabase
            .from("ai_messages")
            .select("id, role, content, created_at")
            .eq("conversation_id", conversationId)
            .order("id", { ascending: false })
            .limit(MESSAGES_PAGE_SIZE),
        { reuseResultForMs: 1000 }
      );

      if (error) {
        toast({
          variant: "destructive",
          title: t("assistant:toasts.loadConversationFailedTitle"),
          description: error.message
        });
        lastLoadedConversationIdRef.current = null;
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
      lastLoadedConversationIdRef.current = conversationId;
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
      bootstrappedUserIdRef.current = null;
      lastLoadedConversationIdRef.current = null;
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

    if (bootstrappedUserIdRef.current === userId) return;

    bootstrappedUserIdRef.current = userId;

    let isCancelled = false;

    const bootstrap = async () => {
      setIsLoadingConversations(true);
      const loadedConversations = await getConversations(userId);
      if (isCancelled) return;

      if (!loadedConversations) {
        bootstrappedUserIdRef.current = null;
        setIsLoadingConversations(false);
        return;
      }

      if (loadedConversations.length === 0) {
        const created = await createConversationRecord(userId);
        if (isCancelled) return;
        if (created) {
          setConversations([created]);
          setActiveConversationId(created.id);
        } else bootstrappedUserIdRef.current = null;

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
      lastLoadedConversationIdRef.current = null;
      setMensajes([]);
      setHasMoreMessages(false);
      setIsLoadingOlderMessages(false);
      return;
    }

    if (lastLoadedConversationIdRef.current === activeConversationId) return;

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

    if (shouldStickToBottomRef.current || isSendingChat)
      node.scrollTop = node.scrollHeight;
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

  const renderConceptMapMessage = (message: ChatMessage) => {
    if (!message.conceptMap) return null;

    return (
      <div className="rounded-2xl border border-border/70 bg-secondary/30 p-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-primary">
            <GitBranch className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {message.conceptMap.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("assistant:chat.conceptMapReady", {
                defaultValue: "Mapa mental listo para explorar."
              })}
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground/90">
              {t("assistant:chat.conceptMapStats", {
                nodes: message.conceptMap.nodes.length,
                edges: message.conceptMap.edges.length,
                defaultValue:
                  "{{nodes}} nodos \u00b7 {{edges}} conexiones principales"
              })}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CustomButton
            type="button"
            onClick={() => openConceptMapDialog(message)}
            styleType="menu"
            size="sm"
            radius="xl"
            className="border-border/70"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("assistant:chat.viewConceptMap", {
              defaultValue: "Ver mapa mental"
            })}
          </CustomButton>
        </div>
      </div>
    );
  };

  const isDefaultConversationTitle = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      const knownTitles = new Set([
        t("assistant:newChat"),
        i18n.getFixedT("es")("assistant:newChat"),
        i18n.getFixedT("en")("assistant:newChat")
      ]);
      return !trimmed || knownTitles.has(trimmed);
    },
    [i18n, t]
  );

  const isConversationEmpty = useCallback(
    (conversation: ConversationItem) => {
      const createdAtMs = Date.parse(conversation.createdAt);
      const lastMessageAtMs = Date.parse(conversation.lastMessageAt);
      const hasNoMessagesByTimestamps =
        !Number.isNaN(createdAtMs) &&
        !Number.isNaN(lastMessageAtMs) &&
        Math.abs(lastMessageAtMs - createdAtMs) < 1000;
      return (
        isDefaultConversationTitle(conversation.title) ||
        hasNoMessagesByTimestamps
      );
    },
    [isDefaultConversationTitle]
  );

  const moveConversationToTop = useCallback((conversationId: string) => {
    setConversations((prev) => {
      const found = prev.find(
        (conversation) => conversation.id === conversationId
      );
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
    if (
      !currentUserId ||
      !conversationId ||
      deletingConversationId ||
      isSendingChat
    )
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
      if (remainingConversations.length > 0)
        setActiveConversationId(remainingConversations[0].id);
      else {
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

    const distanceToBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 72;

    if (
      node.scrollTop <= 64 &&
      hasMoreMessages &&
      !isLoadingMessages &&
      !isLoadingOlderMessages
    )
      void loadOlderMessages();
  }, [
    hasMoreMessages,
    isLoadingMessages,
    isLoadingOlderMessages,
    loadOlderMessages
  ]);

  const conceptMapDialogMessage = useMemo(
    () =>
      mensajes.find((message) => message.id === conceptMapDialogMessageId) ??
      null,
    [conceptMapDialogMessageId, mensajes]
  );

  const conceptMapDialogData = conceptMapDialogMessage?.conceptMap ?? null;
  const isConceptMapDialogOpen = Boolean(conceptMapDialogData);

  const conceptMapGraph = useMemo(() => {
    if (!conceptMapDialogData) return null;

    const nodeById = new Map(
      conceptMapDialogData.nodes.map((node) => [node.id, node])
    );
    const childrenById = new Map<string, ConceptMapEdge[]>();
    const parentsById = new Map<string, ConceptMapEdge[]>();

    nodeById.forEach((_value, nodeId) => {
      childrenById.set(nodeId, []);
      parentsById.set(nodeId, []);
    });

    conceptMapDialogData.edges.forEach((edge) => {
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) return;
      childrenById.get(edge.from)?.push(edge);
      parentsById.get(edge.to)?.push(edge);
    });

    return {
      nodeById,
      childrenById,
      parentsById
    };
  }, [conceptMapDialogData]);

  const conceptMapRootNodeIds = useMemo(() => {
    if (!conceptMapDialogData || !conceptMapGraph) return [];

    const incomingNodes = new Set<string>();
    conceptMapDialogData.edges.forEach((edge) => {
      incomingNodes.add(edge.to);
    });

    const roots = conceptMapDialogData.nodes
      .filter((node) => !incomingNodes.has(node.id))
      .map((node) => node.id);

    if (roots.length > 0) return roots;

    const fallbackRoot = conceptMapDialogData.nodes.reduce(
      (current, candidate) =>
        candidate.level < current.level ? candidate : current
    );

    if (conceptMapGraph.nodeById.has(fallbackRoot.id)) return [fallbackRoot.id];
    return [];
  }, [conceptMapDialogData, conceptMapGraph]);

  const conceptMapLayout = useMemo(() => {
    if (!conceptMapDialogData || !conceptMapGraph) return null;

    const validNodes = conceptMapDialogData.nodes.filter((node) =>
      conceptMapGraph.nodeById.has(node.id)
    );
    if (validNodes.length === 0) return null;

    const fallbackBaseLevel = validNodes.reduce(
      (current, candidate) => Math.min(current, candidate.level),
      Number.POSITIVE_INFINITY
    );
    const baseLevel = Number.isFinite(fallbackBaseLevel)
      ? fallbackBaseLevel
      : 0;

    const levels = Array.from(
      new Set(validNodes.map((node) => Math.max(0, node.level - baseLevel)))
    ).sort((a, b) => a - b);

    if (levels.length === 0) levels.push(0);

    const nodesByLevel = new Map<number, ConceptMapNode[]>();
    levels.forEach((level) => nodesByLevel.set(level, []));

    validNodes.forEach((node) => {
      const normalizedLevel = Math.max(0, node.level - baseLevel);
      if (!nodesByLevel.has(normalizedLevel))
        nodesByLevel.set(normalizedLevel, []);
      nodesByLevel.get(normalizedLevel)?.push(node);
    });

    const levelOrder = new Map<string, number>();
    const layoutNodes = new Map<string, MindMapLayoutNode>();
    const rowGap = 140;
    const colGap = 340;
    const paddingX = 86;
    const paddingY = 56;
    const maxNodesInLevel = Math.max(
      ...Array.from(nodesByLevel.values()).map((items) => items.length),
      1
    );
    const height = Math.max(
      680,
      paddingY * 2 + (maxNodesInLevel - 1) * rowGap + 84
    );

    levels.forEach((level, levelIdx) => {
      const bucket = [...(nodesByLevel.get(level) ?? [])];
      if (bucket.length === 0) return;

      bucket.sort((a, b) => {
        const parentsA = conceptMapGraph.parentsById.get(a.id) ?? [];
        const parentsB = conceptMapGraph.parentsById.get(b.id) ?? [];

        const avgRank = (parents: ConceptMapEdge[]) => {
          const parentRanks = parents
            .map((edge) => levelOrder.get(edge.from))
            .filter((value): value is number => typeof value === "number");
          if (parentRanks.length === 0) return Number.POSITIVE_INFINITY;
          return (
            parentRanks.reduce((sum, value) => sum + value, 0) /
            parentRanks.length
          );
        };

        const rankA = avgRank(parentsA);
        const rankB = avgRank(parentsB);
        if (Number.isFinite(rankA) && Number.isFinite(rankB) && rankA !== rankB)
          return rankA - rankB;
        if (Number.isFinite(rankA) && !Number.isFinite(rankB)) return -1;
        if (!Number.isFinite(rankA) && Number.isFinite(rankB)) return 1;
        return a.label.localeCompare(b.label, locale);
      });

      const levelTrackHeight = (bucket.length - 1) * rowGap;
      const levelStartY = Math.max((height - levelTrackHeight) / 2, paddingY);

      bucket.forEach((node, index) => {
        const nodeWidth = Math.min(
          312,
          node.level === 0 ? 256 : node.level === 1 ? 236 : 216
        );
        const nodeHeight =
          node.level === 0 ? 62 : node.label.length > 40 ? 62 : 56;
        const x = paddingX + levelIdx * colGap;
        const y = levelStartY + index * rowGap - nodeHeight / 2;

        levelOrder.set(node.id, index);
        layoutNodes.set(node.id, {
          id: node.id,
          label: node.label,
          level: node.level,
          x,
          y,
          width: nodeWidth,
          height: nodeHeight
        });
      });
    });

    const edges: MindMapLayoutEdge[] = [];
    conceptMapDialogData.edges.forEach((edge, edgeIdx) => {
      const fromNode = layoutNodes.get(edge.from);
      const toNode = layoutNodes.get(edge.to);
      if (!fromNode || !toNode) return;

      const x1 = fromNode.x + fromNode.width;
      const y1 = fromNode.y + fromNode.height / 2;
      const x2 = toNode.x;
      const y2 = toNode.y + toNode.height / 2;
      const controlOffset = Math.max(58, Math.abs(x2 - x1) * 0.36);
      const path = `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;

      edges.push({
        key: `${edge.from}-${edge.to}-${edge.label}-${edgeIdx}`,
        from: edge.from,
        to: edge.to,
        label: edge.label,
        path
      });
    });

    const maxRight = Math.max(
      ...Array.from(layoutNodes.values()).map((node) => node.x + node.width),
      900
    );
    const width = Math.max(1120, maxRight + paddingX + 240);

    return {
      width,
      height,
      nodes: Array.from(layoutNodes.values()),
      edges,
      nodeById: layoutNodes
    };
  }, [conceptMapDialogData, conceptMapGraph, locale]);

  const selectedMindMapRelatedNodeIds = useMemo(() => {
    const selectedNodeId = selectedConceptMapNodeId;
    if (!selectedNodeId || !conceptMapGraph) return new Set<string>();

    const related = new Set<string>([selectedNodeId]);
    (conceptMapGraph.parentsById.get(selectedNodeId) ?? []).forEach((edge) =>
      related.add(edge.from)
    );
    (conceptMapGraph.childrenById.get(selectedNodeId) ?? []).forEach((edge) =>
      related.add(edge.to)
    );

    return related;
  }, [conceptMapGraph, selectedConceptMapNodeId]);

  const openConceptMapDialog = useCallback((message: ChatMessage) => {
    const conceptMap = message.conceptMap;
    if (!conceptMap) return;

    const incomingNodes = new Set<string>();
    conceptMap.edges.forEach((edge) => incomingNodes.add(edge.to));

    const rootNode =
      conceptMap.nodes.find((node) => !incomingNodes.has(node.id)) ??
      conceptMap.nodes.reduce((current, candidate) =>
        candidate.level < current.level ? candidate : current
      );

    setMindMapZoom(1);
    setSelectedConceptMapNodeId(rootNode.id);
    setConceptMapDialogMessageId(message.id);
  }, []);

  const onConceptMapDialogOpenChange = (open: boolean) => {
    if (open) return;
    setConceptMapDialogMessageId(null);
    setSelectedConceptMapNodeId(null);
    setMindMapZoom(1);
  };

  useEffect(() => {
    if (!conceptMapDialogMessageId) return;

    const messageStillExists = mensajes.some(
      (message) =>
        message.id === conceptMapDialogMessageId && Boolean(message.conceptMap)
    );

    if (!messageStillExists) {
      setConceptMapDialogMessageId(null);
      setSelectedConceptMapNodeId(null);
      setMindMapZoom(1);
    }
  }, [conceptMapDialogMessageId, mensajes]);

  useEffect(() => {
    if (!conceptMapDialogData || !conceptMapGraph) return;

    const fallbackNodeId =
      conceptMapRootNodeIds[0] ?? conceptMapDialogData.nodes[0]?.id ?? null;
    if (!fallbackNodeId) return;

    if (
      !selectedConceptMapNodeId ||
      !conceptMapGraph.nodeById.has(selectedConceptMapNodeId)
    )
      setSelectedConceptMapNodeId(fallbackNodeId);
  }, [
    conceptMapDialogData,
    conceptMapGraph,
    conceptMapRootNodeIds,
    selectedConceptMapNodeId
  ]);

  const centerMindMapNode = useCallback(
    (nodeId: string, behavior: ScrollBehavior = "smooth") => {
      if (!conceptMapLayout) return;
      const viewport = mindMapViewportRef.current;
      const node = conceptMapLayout.nodeById.get(nodeId);
      if (!viewport || !node) return;

      const targetX = (node.x + node.width / 2) * mindMapZoom;
      const targetY = (node.y + node.height / 2) * mindMapZoom;

      viewport.scrollTo({
        left: Math.max(0, targetX - viewport.clientWidth / 2),
        top: Math.max(0, targetY - viewport.clientHeight / 2),
        behavior
      });
    },
    [conceptMapLayout, mindMapZoom]
  );

  const onMindMapMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const viewport = mindMapViewportRef.current;
    if (!viewport) return;
    e.preventDefault();

    if (mindMapSuppressTimerRef.current) {
      window.clearTimeout(mindMapSuppressTimerRef.current);
      mindMapSuppressTimerRef.current = null;
    }
    mindMapSuppressNodeClickRef.current = false;

    mindMapDragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      moved: false
    };
    setIsMindMapDragging(true);
  };

  const onMindMapWheel = (e: WheelEvent<HTMLDivElement>) => {
    const viewport = mindMapViewportRef.current;
    if (!viewport || !conceptMapLayout) return;

    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    const currentZoom = mindMapZoom;
    const direction = e.deltaY < 0 ? 1 : -1;
    const nextZoom = Math.min(
      2.1,
      Math.max(0.55, Number((currentZoom + direction * 0.08).toFixed(3)))
    );
    if (nextZoom === currentZoom) return;

    const contentX = viewport.scrollLeft + pointerX;
    const contentY = viewport.scrollTop + pointerY;
    const worldX = contentX / currentZoom;
    const worldY = contentY / currentZoom;

    setMindMapZoom(nextZoom);

    requestAnimationFrame(() => {
      const targetX = worldX * nextZoom - pointerX;
      const targetY = worldY * nextZoom - pointerY;
      viewport.scrollLeft = Math.max(0, targetX);
      viewport.scrollTop = Math.max(0, targetY);
    });
  };

  useEffect(() => {
    const onWindowMouseMove = (e: globalThis.MouseEvent) => {
      const viewport = mindMapViewportRef.current;
      const dragState = mindMapDragRef.current;
      if (!viewport || !dragState.active) return;

      const deltaX = e.clientX - dragState.startX;
      const deltaY = e.clientY - dragState.startY;
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) dragState.moved = true;

      viewport.scrollLeft = dragState.scrollLeft - deltaX;
      viewport.scrollTop = dragState.scrollTop - deltaY;
    };

    const onWindowMouseUp = () => {
      const dragState = mindMapDragRef.current;
      if (!dragState.active) return;

      dragState.active = false;
      setIsMindMapDragging(false);

      if (dragState.moved) {
        mindMapSuppressNodeClickRef.current = true;
        mindMapSuppressTimerRef.current = window.setTimeout(() => {
          mindMapSuppressNodeClickRef.current = false;
          mindMapSuppressTimerRef.current = null;
        }, 120);
      }
    };

    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
      if (mindMapSuppressTimerRef.current) {
        window.clearTimeout(mindMapSuppressTimerRef.current);
        mindMapSuppressTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (
      !isConceptMapDialogOpen ||
      !selectedConceptMapNodeId ||
      !conceptMapLayout
    )
      return;
    const timeoutId = window.setTimeout(() => {
      centerMindMapNode(selectedConceptMapNodeId, "auto");
    }, 80);
    return () => window.clearTimeout(timeoutId);
  }, [
    centerMindMapNode,
    conceptMapLayout,
    isConceptMapDialogOpen,
    selectedConceptMapNodeId
  ]);

  const onSubmitChat = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const texto = inputChat.trim();
    const shouldRequestMindMap = isMindMapEnabled;
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
    setPendingAssistantMode(shouldRequestMindMap ? "concept-map" : "text");
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

      const accessToken = session?.access_token;
      if (!accessToken)
        throw new AuthSessionError("Sesion expirada. Vuelve a iniciar sesion.");

      const response = await secureApiFetch(
        "http://localhost:3001/api/gemini-chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            message: texto,
            history,
            ...(shouldRequestMindMap ? { mindMap: true } : {})
          })
        }
      );

      const payload = await response.json().catch(() => ({}));
      const assistantText = extraerTextoRespuesta(payload);
      const conceptMapFromPayload = extractConceptMapFromPayload(payload);
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

      const assistantFinalText = conceptMapFromPayload
        ? t("assistant:chat.conceptMapResponse", {
            title: conceptMapFromPayload.title,
            defaultValue: "He preparado el mapa mental: {{title}}"
          })
        : assistantText || t("assistant:errors.responseFormat");

      const assistantStoredContent = conceptMapFromPayload
        ? serializeConceptMapForStorage(conceptMapFromPayload)
        : assistantFinalText;

      const { error: assistantMessageError } = await supabase
        .from("ai_messages")
        .insert({
          conversation_id: conversationId,
          user_id: currentUserId,
          role: "assistant",
          content: assistantStoredContent
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
          conceptMap: conceptMapFromPayload ?? undefined,
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
      setPendingAssistantMode("text");
    }
  };

  return (
    <div className="grid h-[74vh] max-h-[74vh] min-h-0 items-stretch gap-4 lg:grid-cols-[18.5rem_minmax(0,1fr)]">
      <aside className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-[0_26px_60px_-38px_rgba(0,0,0,0.42)]">
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
                  role="button"
                  tabIndex={isSendingChat ? -1 : 0}
                  aria-disabled={isSendingChat}
                  onClick={() => {
                    if (isSendingChat) return;
                    onSelectConversation(conversation.id);
                  }}
                  onKeyDown={(event) => {
                    if (isSendingChat) return;
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelectConversation(conversation.id);
                  }}
                  className={`group w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                    isActive
                      ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_10px_30px_-25px_rgba(255,119,0,0.95)]"
                      : "border-border/80 bg-background/90 text-foreground hover:-translate-y-[1px] hover:border-primary/30 hover:bg-secondary"
                  } ${isSendingChat ? "cursor-default opacity-70" : "cursor-pointer"}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 text-left">
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
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                          }}
                          disabled={
                            Boolean(deletingConversationId) || isSendingChat
                          }
                          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 text-muted-foreground transition-all hover:bg-secondary disabled:opacity-60 ${
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
                          onClick={() =>
                            onRequestDeleteConversation(conversation)
                          }
                          className="text-foreground focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive cursor-pointer gap-2"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
          <CustomButton
            type="button"
            onClick={onCreateConversation}
            disabled={
              isCreatingConversation || isLoadingConversations || !currentUserId
            }
            styleType="primary"
            radius="xl"
            className="w-full px-3 py-3"
          >
            {isCreatingConversation ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t("assistant:sidebar.newChat")}
          </CustomButton>
        </div>
      </aside>

      <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 p-5 shadow-[0_26px_60px_-38px_rgba(0,0,0,0.42)] md:p-6">
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
            className="flex-1 min-h-0 space-y-3 overflow-y-auto rounded-2xl border border-border/70 bg-gradient-to-b from-secondary/30 via-secondary/15 to-background p-4"
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
                    className={`max-w-[88%] rounded-2xl p-3 ${
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
                      m.conceptMap ? (
                        renderConceptMapMessage(m)
                      ) : (
                        renderAssistantContent(
                          m.content,
                          `assistant-msg-${m.id}`
                        )
                      )
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {m.content}
                      </p>
                    )}
                  </div>
                ))}
                {isSendingChat && (
                  <div className="max-w-[88%] rounded-2xl border border-border/70 bg-background p-3 text-foreground shadow-sm">
                    {pendingAssistantMode === "concept-map" ? (
                      <div className="rounded-2xl border border-border/70 bg-secondary/30 p-3">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-primary">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </span>
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">
                              {t("assistant:chat.conceptMapGeneratingTitle", {
                                defaultValue: "Generando mapa mental"
                              })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t(
                                "assistant:chat.conceptMapGeneratingDescription",
                                {
                                  defaultValue:
                                    "Estoy organizando nodos y conexiones clave para mostrartelo en un diagrama interactivo."
                                }
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <form onSubmit={onSubmitChat} className="mt-4">
            <div
              className={`rounded-[1.55rem] border px-4 pt-3 pb-2 shadow-sm ${
                isDailyLimitReached
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border/80 bg-background"
              }`}
            >
              <CustomInput
                value={inputChat}
                onChange={(e) => setInputChat(e.target.value)}
                placeholder={
                  isDailyLimitReached
                    ? t("assistant:input.placeholderLimitReached")
                    : t("assistant:input.placeholder")
                }
                disabled={isDailyLimitReached}
                className="h-auto w-full border-0 bg-transparent px-0 py-2 text-[15px] shadow-none focus:ring-0 focus:ring-offset-0"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <CustomButton
                        type="button"
                        styleType="ghost"
                        size="iconSm"
                        radius="full"
                        className="border-border/70 text-muted-foreground disabled:opacity-60"
                        aria-label={t("assistant:input.quickActions", {
                          defaultValue: "Acciones rapidas"
                        })}
                        disabled={isDailyLimitReached}
                      >
                        <Plus className="h-4 w-4" />
                      </CustomButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      side="top"
                      className="w-48"
                    >
                      <DropdownMenuCheckboxItem
                        checked={isMindMapEnabled}
                        onCheckedChange={(checked) =>
                          setIsMindMapEnabled(checked === true)
                        }
                        disabled={isDailyLimitReached}
                        className="transition-colors hover:bg-black/10 data-[highlighted]:bg-black/10 data-[highlighted]:text-foreground focus:bg-black/10 focus:text-foreground"
                      >
                        {t("assistant:input.mindMap")}
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {isMindMapEnabled && (
                    <span className="inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-primary">
                      {t("assistant:input.mindMap")}
                    </span>
                  )}
                </div>

                <div className="ml-auto flex items-center gap-2">
                  {isDailyLimitReached && (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                  <CustomButton
                    type="submit"
                    disabled={
                      isSendingChat || !currentUserId || isDailyLimitReached
                    }
                    styleType="primary"
                    size="icon"
                    radius="full"
                    aria-label={
                      isSendingChat
                        ? t("assistant:input.waiting")
                        : t("assistant:input.send")
                    }
                  >
                    <Send className="h-4 w-4" />
                  </CustomButton>
                </div>
              </div>
            </div>
          </form>
        </div>
      </section>

      <Dialog
        open={isConceptMapDialogOpen}
        onOpenChange={onConceptMapDialogOpenChange}
      >
        <DialogContent className="h-[86vh] w-[95vw] max-w-[1100px] overflow-hidden rounded-2xl border border-border/70 bg-background/95 p-0 shadow-[0_40px_90px_-50px_rgba(0,0,0,0.55)]">
          {conceptMapDialogData && conceptMapGraph && (
            <div className="flex h-full flex-col">
              <DialogHeader className="border-b border-border/70 bg-gradient-to-r from-primary/12 via-background to-background px-6 py-4 text-left">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <GitBranch className="h-4 w-4 text-primary" />
                  {conceptMapDialogData.title}
                </DialogTitle>
                <DialogDescription className="text-xs uppercase tracking-widest text-muted-foreground">
                  {t("assistant:chat.conceptMapDialogDescription", {
                    nodes: conceptMapDialogData.nodes.length,
                    edges: conceptMapDialogData.edges.length,
                    defaultValue:
                      "{{nodes}} nodos y {{edges}} conexiones listas para explorar"
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="relative min-h-0 flex-1 overflow-hidden bg-gradient-to-br from-background via-secondary/20 to-background">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border)/0.45)_1px,transparent_0)] [background-size:18px_18px] opacity-45" />

                <div
                  ref={mindMapViewportRef}
                  className={`relative h-full overflow-auto p-5 select-none ${
                    isMindMapDragging ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  onMouseDown={onMindMapMouseDown}
                  onWheel={onMindMapWheel}
                >
                  {conceptMapLayout ? (
                    <div
                      className="relative transition-[width,height] duration-200"
                      style={{
                        width: `${conceptMapLayout.width * mindMapZoom}px`,
                        height: `${conceptMapLayout.height * mindMapZoom}px`
                      }}
                    >
                      <div
                        className="absolute top-0 left-0 origin-top-left"
                        style={{
                          width: `${conceptMapLayout.width}px`,
                          height: `${conceptMapLayout.height}px`,
                          transform: `scale(${mindMapZoom})`
                        }}
                      >
                        <svg
                          className="absolute inset-0"
                          width={conceptMapLayout.width}
                          height={conceptMapLayout.height}
                          viewBox={`0 0 ${conceptMapLayout.width} ${conceptMapLayout.height}`}
                          fill="none"
                        >
                          {conceptMapLayout.edges.map((edge) => {
                            const fromNode = conceptMapLayout.nodeById.get(
                              edge.from
                            );
                            const toNode = conceptMapLayout.nodeById.get(
                              edge.to
                            );
                            if (!fromNode || !toNode) return null;

                            const isSelectedEdge =
                              edge.from === selectedConceptMapNodeId ||
                              edge.to === selectedConceptMapNodeId;
                            const labelX =
                              fromNode.x +
                              fromNode.width +
                              (toNode.x - (fromNode.x + fromNode.width)) / 2;
                            const labelY =
                              (fromNode.y +
                                fromNode.height / 2 +
                                toNode.y +
                                toNode.height / 2) /
                              2;

                            return (
                              <g key={edge.key}>
                                <path
                                  d={edge.path}
                                  stroke={
                                    isSelectedEdge
                                      ? "hsl(var(--primary) / 0.9)"
                                      : "hsl(var(--muted-foreground) / 0.42)"
                                  }
                                  strokeWidth={isSelectedEdge ? 2.2 : 1.45}
                                  strokeLinecap="round"
                                />
                                {edge.label ? (
                                  <text
                                    x={labelX}
                                    y={labelY - 6}
                                    textAnchor="middle"
                                    className="fill-muted-foreground"
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 600,
                                      letterSpacing: "0.04em"
                                    }}
                                  >
                                    {edge.label}
                                  </text>
                                ) : null}
                              </g>
                            );
                          })}
                        </svg>

                        {conceptMapLayout.nodes.map((node) => {
                          const isSelected =
                            node.id === selectedConceptMapNodeId;
                          const isRelated =
                            !isSelected &&
                            selectedMindMapRelatedNodeIds.has(node.id);
                          const nodeToneClass =
                            node.level === 0
                              ? "border-primary/45 bg-primary/12 text-foreground"
                              : node.level === 1
                                ? "border-border/80 bg-background/95 text-foreground"
                                : "border-border/70 bg-background/85 text-foreground";

                          return (
                            <CustomButton
                              key={node.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                onMindMapMouseDown(
                                  e as unknown as MouseEvent<HTMLDivElement>
                                );
                              }}
                              onClick={() => {
                                if (mindMapSuppressNodeClickRef.current) return;
                                setSelectedConceptMapNodeId(node.id);
                              }}
                              styleType="unstyled"
                              size="none"
                              radius="none"
                              className={`absolute rounded-2xl border px-3 py-2 text-left shadow-[0_12px_30px_-22px_rgba(0,0,0,0.45)] transition-all ${
                                isSelected
                                  ? "scale-[1.02] border-primary bg-primary/15 ring-2 ring-primary/30"
                                  : isRelated
                                    ? "border-primary/35 bg-primary/10"
                                    : nodeToneClass
                              } hover:-translate-y-[1px] hover:border-primary/35`}
                              style={{
                                left: `${node.x}px`,
                                top: `${node.y}px`,
                                width: `${node.width}px`,
                                height: `${node.height}px`
                              }}
                            >
                              <span className="line-clamp-2 text-[12px] font-semibold leading-snug">
                                {node.label}
                              </span>
                            </CustomButton>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                      {t("assistant:chat.selectNodeHint", {
                        defaultValue:
                          "No hay nodos validos para visualizar el mapa mental."
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

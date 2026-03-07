import { useAuth } from "@/auth/AuthProvider";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import PlanUpgradeDialog from "@/components/PlanUpgradeDialog";
import CustomButton from "@/components/ui/custom-button";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { normalizeLocale, toIntlLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  sanitizeCode,
  sanitizeMultilineText,
  sanitizeSingleLineText
} from "@/lib/inputSanitization";
import {
  buildMindMapEdgePath,
  clampMindMapZoom,
  zoomMindMapAroundPoint,
  type MindMapViewportState
} from "@/lib/mindMapInteractions";
import { getPlanKey, isPaidPlan } from "@/lib/plans";
import { AuthSessionError, secureApiFetch } from "@/lib/secureFetch";
import {
  assistantQueryConfig,
  assistantQueryKeys,
  fetchAssistantConversations,
  fetchAssistantDailyQuota,
  fetchAssistantMessages,
  type AssistantConversationRow
} from "@/queries/assistantQueries";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  GitBranch,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  Send,
  Trash2,
  User
} from "lucide-react";
import {
  FormEvent,
  PointerEvent,
  KeyboardEvent as ReactKeyboardEvent,
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
};

type MindMapNodePosition = {
  x: number;
  y: number;
};

const DAILY_USAGE_TIMEZONE = "Europe/Madrid";
const MESSAGES_PAGE_SIZE = 8;
const CONCEPT_MAP_STORAGE_PREFIX = "__CONCEPT_MAP__:";
const ASK_ENDPOINT = `${
  import.meta.env.VITE_SUPABASE_URL ??
  "https://hxvckhyxfmfvdipahobv.supabase.co"
}/functions/v1/ask`;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

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

const isEditableEventTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select")
    return true;
  return target.isContentEditable;
};

const normalizeConceptMapData = (input: unknown): ConceptMapData | null => {
  if (!isRecord(input)) return null;

  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const nodeMap = new Map<string, ConceptMapNode>();

  rawNodes.forEach((rawNode) => {
    if (!isRecord(rawNode)) return;

    const id = sanitizeCode(rawNode.id, 120);
    if (!id || nodeMap.has(id)) return;

    const label =
      typeof rawNode.label === "string" &&
      sanitizeSingleLineText(rawNode.label, 160)
        ? sanitizeSingleLineText(rawNode.label, 160)
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

    const from = sanitizeCode(rawEdge.from, 120);
    const to = sanitizeCode(rawEdge.to, 120);
    if (!from || !to) return;
    if (!nodeMap.has(from) || !nodeMap.has(to)) return;

    const label = sanitizeSingleLineText(rawEdge.label, 160);
    const edgeKey = `${from}->${to}|${label}`;
    if (seenEdgeKeys.has(edgeKey)) return;
    seenEdgeKeys.add(edgeKey);
    edges.push({ from, to, label });
  });

  const rootNode = nodes.reduce((current, candidate) =>
    candidate.level < current.level ? candidate : current
  );

  const title =
    typeof input.title === "string" && sanitizeSingleLineText(input.title, 160)
      ? sanitizeSingleLineText(input.title, 160)
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
  row: Pick<
    Tables<"ai_conversations">,
    "id" | "title" | "created_at" | "last_message_at"
  >
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
      : { text: sanitizeMultilineText(row.content, 4000), conceptMap: null };

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
  const { t, i18n } = useTranslation(["assistant", "plans"]);
  const { toast } = useToast();
  const { user, isAuthReady, session } = useAuth();
  const queryClient = useQueryClient();
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
  const { data: planState } = useUserPlanStateQuery(user?.id);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const chatFormRef = useRef<HTMLFormElement | null>(null);
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
  const [expandedConceptMapNodeIds, setExpandedConceptMapNodeIds] = useState<
    string[]
  >([]);
  const [mindMapView, setMindMapView] = useState<MindMapViewportState>({
    zoom: 1,
    offsetX: 0,
    offsetY: 0
  });
  const [mindMapNodePositions, setMindMapNodePositions] = useState<
    Record<string, MindMapNodePosition>
  >({});
  const [isMindMapPanning, setIsMindMapPanning] = useState(false);
  const [isMindMapNodeDragging, setIsMindMapNodeDragging] = useState(false);
  const [isMindMapSpacePressed, setIsMindMapSpacePressed] = useState(false);
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);
  const mindMapViewportRef = useRef<HTMLDivElement | null>(null);
  const mindMapInteractionRef = useRef<
    | {
        mode: "pan";
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startOffsetX: number;
        startOffsetY: number;
        moved: boolean;
      }
    | {
        mode: "node-drag";
        pointerId: number;
        nodeId: string;
        startClientX: number;
        startClientY: number;
        startNodeX: number;
        startNodeY: number;
        moved: boolean;
      }
    | null
  >(null);
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
  const currentPlanKey = getPlanKey({
    code: planState?.plan_code,
    tier: planState?.tier
  });
  const isCurrentPlanPaid = isPaidPlan(planState);
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
  const dailyUsageFillPercent = isLoadingDailyUsage
    ? 4
    : Math.max(0, dailyUsagePercent);
  const dailyUsageProgressColor = isDailyLimitReached
    ? "hsl(var(--destructive))"
    : "hsl(var(--primary))";

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
      const clean = sanitizeSingleLineText(value, max * 2);
      if (!clean) return t("assistant:newChat");
      return clean.length > max ? `${clean.slice(0, max)}...` : clean;
    },
    [t]
  );

  const getConversations = useCallback(
    async (userId: string) => {
      try {
        const data = await queryClient.fetchQuery({
          queryKey: assistantQueryKeys.conversations(userId),
          queryFn: () => fetchAssistantConversations(userId),
          ...assistantQueryConfig
        });
        return data.map((row) => mapConversation(row));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("assistant:toasts.loadHistoryFailedDescription", {
                defaultValue: "No se pudo cargar el historial."
              });
        toast({
          variant: "destructive",
          title: t("assistant:toasts.loadHistoryFailedTitle"),
          description: message
        });
        return null;
      }
    },
    [queryClient, t, toast]
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

      const createdConversation = mapConversation(data);
      queryClient.setQueryData(
        assistantQueryKeys.conversations(userId),
        (prev: AssistantConversationRow[] | undefined) => {
          const mappedRow = data as AssistantConversationRow;
          if (!prev || prev.length === 0) return [mappedRow];
          const withoutExisting = prev.filter(
            (item) => item.id !== mappedRow.id
          );
          return [mappedRow, ...withoutExisting];
        }
      );

      return createdConversation;
    },
    [queryClient, t, toast]
  );

  const refreshConversations = useCallback(async () => {
    if (!currentUserId) return;
    await queryClient.invalidateQueries({
      queryKey: assistantQueryKeys.conversations(currentUserId)
    });
    const data = await getConversations(currentUserId);
    if (data) setConversations(data);
  }, [currentUserId, getConversations, queryClient]);

  const refreshDailyUsage = useCallback(
    async (userId: string) => {
      setIsLoadingDailyUsage(true);
      await queryClient.invalidateQueries({
        queryKey: assistantQueryKeys.dailyQuota(userId)
      });
      try {
        const row = await queryClient.fetchQuery({
          queryKey: assistantQueryKeys.dailyQuota(userId),
          queryFn: () => fetchAssistantDailyQuota(userId, DAILY_USAGE_TIMEZONE),
          ...assistantQueryConfig
        });

        if (!row) {
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
      } catch {
        setDailyRequestLimit((prev) => (prev > 0 ? prev : 10));
        setIsLoadingDailyUsage(false);
        return;
      }
    },
    [queryClient]
  );

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
      queryClient.setQueryData(assistantQueryKeys.dailyQuota(userId), {
        day: String(row.day ?? ""),
        is_paid: Boolean(planState?.is_paid),
        limit: nextLimit,
        remaining: nextRemaining,
        used: nextUsed
      });

      return {
        allowed: Boolean(row.allowed),
        used: nextUsed,
        limit: nextLimit,
        remaining: nextRemaining
      };
    },
    [planState?.is_paid, queryClient, t, toast]
  );

  const loadMessages = useCallback(
    async (conversationId: string) => {
      setIsLoadingMessages(true);
      setIsLoadingOlderMessages(false);
      setHasMoreMessages(false);
      try {
        const rows = await queryClient.fetchQuery({
          queryKey: assistantQueryKeys.messages(conversationId),
          queryFn: () =>
            fetchAssistantMessages(conversationId, MESSAGES_PAGE_SIZE),
          ...assistantQueryConfig
        });

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
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("assistant:errors.connection");
        toast({
          variant: "destructive",
          title: t("assistant:toasts.loadConversationFailedTitle"),
          description: message
        });
        lastLoadedConversationIdRef.current = null;
        setMensajes([]);
        setIsLoadingMessages(false);
      }
    },
    [formatHora, queryClient, t, toast]
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
      const sanitized = sanitizeMultilineText(value, 4000);
      if (sanitized) return sanitized;
    }

    const choices = data.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const firstChoice = choices[0] as
        | { message?: { content?: unknown }; text?: unknown }
        | undefined;
      const messageContent = sanitizeMultilineText(
        firstChoice?.message?.content,
        4000
      );
      if (messageContent) return messageContent;

      const choiceText = sanitizeMultilineText(firstChoice?.text, 4000);
      if (choiceText) return choiceText;
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
    let tableLines: string[] = [];

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

    const isTableCandidateLine = (line: string) => {
      if (!line.includes("|")) return false;
      const rawCells = line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
      return rawCells.length >= 2;
    };

    const parseTableCells = (line: string) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());

    const isMarkdownSeparatorRow = (row: string[]) =>
      row.length > 0 &&
      row.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));

    const flushTableLines = (lineIndex: number) => {
      if (tableLines.length === 0) return;

      const rows = tableLines
        .map(parseTableCells)
        .filter((row) => row.length > 0);
      tableLines = [];
      if (rows.length === 0) return;

      const hasHeaderSeparator =
        rows.length > 1 && isMarkdownSeparatorRow(rows[1]);
      const headerRow = hasHeaderSeparator ? rows[0] : null;
      const bodyRows = hasHeaderSeparator ? rows.slice(2) : rows;
      const totalColumns = Math.max(
        headerRow?.length ?? 0,
        ...bodyRows.map((row) => row.length),
        0
      );

      if (totalColumns === 0) return;

      const normalizeRow = (row: string[]) =>
        Array.from({ length: totalColumns }, (_, idx) => row[idx] ?? "");

      blocks.push(
        <div
          key={`${keyPrefix}-table-wrap-${lineIndex}`}
          className="overflow-x-auto rounded-lg border border-border/70"
        >
          <table className="min-w-full border-collapse text-sm">
            {headerRow ? (
              <thead className="bg-secondary/40">
                <tr>
                  {normalizeRow(headerRow).map((cell, cellIndex) => (
                    <th
                      key={`${keyPrefix}-th-${lineIndex}-${cellIndex}`}
                      className="border-b border-border/70 px-3 py-2 text-left font-semibold"
                    >
                      {renderInlineMarkdown(
                        cell,
                        `${keyPrefix}-th-content-${lineIndex}-${cellIndex}`
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr
                  key={`${keyPrefix}-tr-${lineIndex}-${rowIndex}`}
                  className="odd:bg-background even:bg-secondary/15"
                >
                  {normalizeRow(row).map((cell, cellIndex) => (
                    <td
                      key={`${keyPrefix}-td-${lineIndex}-${rowIndex}-${cellIndex}`}
                      className="border-t border-border/60 px-3 py-2 align-top"
                    >
                      {renderInlineMarkdown(
                        cell,
                        `${keyPrefix}-td-content-${lineIndex}-${rowIndex}-${cellIndex}`
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    lines.forEach((rawLine, lineIndex) => {
      const line = rawLine.trim();

      if (!line) {
        flushBulletItems(lineIndex);
        flushTableLines(lineIndex);
        return;
      }

      if (isTableCandidateLine(line)) {
        flushBulletItems(lineIndex);
        tableLines.push(line);
        return;
      }

      flushTableLines(lineIndex);

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
    flushTableLines(lines.length + 1);

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
    queryClient.setQueryData(assistantQueryKeys.messages(created.id), []);
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

    queryClient.removeQueries({
      queryKey: assistantQueryKeys.messages(conversationId)
    });
    await queryClient.invalidateQueries({
      queryKey: assistantQueryKeys.conversations(currentUserId)
    });

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

  const expandedConceptMapNodeIdSet = useMemo(
    () => new Set(expandedConceptMapNodeIds),
    [expandedConceptMapNodeIds]
  );

  const visibleConceptMapNodeIdSet = useMemo(() => {
    if (!conceptMapGraph || conceptMapRootNodeIds.length === 0)
      return new Set<string>();

    const visible = new Set<string>();
    const queue = [...conceptMapRootNodeIds];

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId || visible.has(nodeId)) continue;
      if (!conceptMapGraph.nodeById.has(nodeId)) continue;

      visible.add(nodeId);
      if (!expandedConceptMapNodeIdSet.has(nodeId)) continue;

      (conceptMapGraph.childrenById.get(nodeId) ?? []).forEach((edge) => {
        if (!visible.has(edge.to)) queue.push(edge.to);
      });
    }

    return visible;
  }, [conceptMapGraph, conceptMapRootNodeIds, expandedConceptMapNodeIdSet]);

  const conceptMapChildCountByNodeId = useMemo(() => {
    const map = new Map<string, number>();
    if (!conceptMapGraph) return map;

    conceptMapGraph.nodeById.forEach((_value, nodeId) => {
      map.set(nodeId, (conceptMapGraph.childrenById.get(nodeId) ?? []).length);
    });

    return map;
  }, [conceptMapGraph]);

  const toggleMindMapNodeExpansion = useCallback((nodeId: string) => {
    setExpandedConceptMapNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return Array.from(next);
    });
  }, []);

  const conceptMapLayout = useMemo(() => {
    if (!conceptMapDialogData || !conceptMapGraph) return null;

    const validNodes = conceptMapDialogData.nodes.filter(
      (node) =>
        conceptMapGraph.nodeById.has(node.id) &&
        visibleConceptMapNodeIdSet.has(node.id)
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

      edges.push({
        key: `${edge.from}-${edge.to}-${edge.label}-${edgeIdx}`,
        from: edge.from,
        to: edge.to,
        label: edge.label
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
  }, [
    conceptMapDialogData,
    conceptMapGraph,
    locale,
    visibleConceptMapNodeIdSet
  ]);

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

  const positionedMindMapNodes = useMemo(() => {
    if (!conceptMapLayout) return [];
    return conceptMapLayout.nodes.map((node) => {
      const override = mindMapNodePositions[node.id];
      return {
        ...node,
        x: override?.x ?? node.x,
        y: override?.y ?? node.y
      };
    });
  }, [conceptMapLayout, mindMapNodePositions]);

  const positionedMindMapNodeById = useMemo(() => {
    const map = new Map<string, MindMapLayoutNode>();
    positionedMindMapNodes.forEach((node) => {
      map.set(node.id, node);
    });
    return map;
  }, [positionedMindMapNodes]);

  const selectedMindMapNode = useMemo(() => {
    if (!selectedConceptMapNodeId) return null;
    return positionedMindMapNodeById.get(selectedConceptMapNodeId) ?? null;
  }, [positionedMindMapNodeById, selectedConceptMapNodeId]);

  const selectedMindMapNodeRelations = useMemo(() => {
    if (!selectedConceptMapNodeId || !conceptMapGraph)
      return { incoming: 0, outgoing: 0 };
    return {
      incoming: (
        conceptMapGraph.parentsById.get(selectedConceptMapNodeId) ?? []
      ).length,
      outgoing: (
        conceptMapGraph.childrenById.get(selectedConceptMapNodeId) ?? []
      ).length
    };
  }, [conceptMapGraph, selectedConceptMapNodeId]);

  useEffect(() => {
    if (!conceptMapLayout) {
      setMindMapNodePositions({});
      return;
    }

    const nextPositions: Record<string, MindMapNodePosition> = {};
    conceptMapLayout.nodes.forEach((node) => {
      nextPositions[node.id] = { x: node.x, y: node.y };
    });
    setMindMapNodePositions(nextPositions);
  }, [conceptMapLayout]);

  const openConceptMapDialog = useCallback((message: ChatMessage) => {
    const conceptMap = message.conceptMap;
    if (!conceptMap) return;

    const incomingNodes = new Set<string>();
    conceptMap.edges.forEach((edge) => incomingNodes.add(edge.to));

    const rootNodeIds = conceptMap.nodes
      .filter((node) => !incomingNodes.has(node.id))
      .map((node) => node.id);
    const rootNode =
      conceptMap.nodes.find((node) => rootNodeIds.includes(node.id)) ??
      conceptMap.nodes.reduce((current, candidate) =>
        candidate.level < current.level ? candidate : current
      );

    setMindMapView({ zoom: 1, offsetX: 0, offsetY: 0 });
    setSelectedConceptMapNodeId(rootNode.id);
    setExpandedConceptMapNodeIds(
      rootNodeIds.length > 0 ? rootNodeIds : [rootNode.id]
    );
    setConceptMapDialogMessageId(message.id);
  }, []);

  const onConceptMapDialogOpenChange = (open: boolean) => {
    if (open) return;
    setConceptMapDialogMessageId(null);
    setSelectedConceptMapNodeId(null);
    setExpandedConceptMapNodeIds([]);
    setMindMapView({ zoom: 1, offsetX: 0, offsetY: 0 });
    setMindMapNodePositions({});
    setIsMindMapPanning(false);
    setIsMindMapNodeDragging(false);
    setIsMindMapSpacePressed(false);
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
      setExpandedConceptMapNodeIds([]);
      setMindMapView({ zoom: 1, offsetX: 0, offsetY: 0 });
      setMindMapNodePositions({});
    }
  }, [conceptMapDialogMessageId, mensajes]);

  useEffect(() => {
    if (!conceptMapDialogData || !conceptMapGraph) return;

    const fallbackNodeId =
      conceptMapRootNodeIds[0] ?? conceptMapDialogData.nodes[0]?.id ?? null;
    if (!fallbackNodeId) return;

    if (
      !selectedConceptMapNodeId ||
      !conceptMapGraph.nodeById.has(selectedConceptMapNodeId) ||
      !visibleConceptMapNodeIdSet.has(selectedConceptMapNodeId)
    )
      setSelectedConceptMapNodeId(fallbackNodeId);
  }, [
    conceptMapDialogData,
    conceptMapGraph,
    conceptMapRootNodeIds,
    selectedConceptMapNodeId,
    visibleConceptMapNodeIdSet
  ]);

  useEffect(() => {
    if (!conceptMapGraph || conceptMapRootNodeIds.length === 0) return;
    if (expandedConceptMapNodeIds.length > 0) return;
    setExpandedConceptMapNodeIds(conceptMapRootNodeIds);
  }, [
    conceptMapGraph,
    conceptMapRootNodeIds,
    expandedConceptMapNodeIds.length
  ]);

  const centerMindMapNode = useCallback(
    (nodeId: string) => {
      const viewport = mindMapViewportRef.current;
      const node = positionedMindMapNodeById.get(nodeId);
      if (!viewport || !node) return;

      setMindMapView((prev) => ({
        ...prev,
        offsetX:
          viewport.clientWidth / 2 - (node.x + node.width / 2) * prev.zoom,
        offsetY:
          viewport.clientHeight / 2 - (node.y + node.height / 2) * prev.zoom
      }));
    },
    [positionedMindMapNodeById]
  );

  const triggerMindMapClickSuppression = useCallback(() => {
    if (mindMapSuppressTimerRef.current) {
      window.clearTimeout(mindMapSuppressTimerRef.current);
      mindMapSuppressTimerRef.current = null;
    }
    mindMapSuppressNodeClickRef.current = true;
    mindMapSuppressTimerRef.current = window.setTimeout(() => {
      mindMapSuppressNodeClickRef.current = false;
      mindMapSuppressTimerRef.current = null;
    }, 120);
  }, []);

  const startMindMapPan = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      const viewport = mindMapViewportRef.current;
      if (!viewport) return;
      mindMapInteractionRef.current = {
        mode: "pan",
        pointerId,
        startClientX: clientX,
        startClientY: clientY,
        startOffsetX: mindMapView.offsetX,
        startOffsetY: mindMapView.offsetY,
        moved: false
      };
      setIsMindMapPanning(true);
    },
    [mindMapView.offsetX, mindMapView.offsetY]
  );

  const onMindMapViewportPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const shouldStartPan =
      e.button === 1 || (e.button === 0 && isMindMapSpacePressed);
    if (!shouldStartPan) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore browsers that do not support pointer capture for this target.
    }

    startMindMapPan(e.pointerId, e.clientX, e.clientY);
  };

  const onMindMapNodePointerDown = (
    e: PointerEvent<HTMLDivElement>,
    nodeId: string
  ) => {
    if (e.button !== 0) return;

    if (isMindMapSpacePressed) {
      e.preventDefault();
      e.stopPropagation();
      const viewport = mindMapViewportRef.current;
      if (!viewport) return;
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch {
        // Ignore browsers that do not support pointer capture for this target.
      }
      startMindMapPan(e.pointerId, e.clientX, e.clientY);
      return;
    }

    const node = positionedMindMapNodeById.get(nodeId);
    if (!node) return;

    e.preventDefault();
    e.stopPropagation();
    setSelectedConceptMapNodeId(nodeId);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore browsers that do not support pointer capture for this target.
    }

    mindMapInteractionRef.current = {
      mode: "node-drag",
      pointerId: e.pointerId,
      nodeId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startNodeX: node.x,
      startNodeY: node.y,
      moved: false
    };
    setIsMindMapNodeDragging(true);
  };

  const zoomMindMapFromPointer = useCallback(
    (targetZoom: number, pointerX: number, pointerY: number) => {
      setMindMapView((prev) =>
        zoomMindMapAroundPoint({
          view: prev,
          targetZoom,
          anchorX: pointerX,
          anchorY: pointerY
        })
      );
    },
    []
  );

  const onMindMapWheel = useCallback(
    (e: globalThis.WheelEvent) => {
      const viewport = mindMapViewportRef.current;
      if (!viewport || !conceptMapLayout) return;

      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        const deltaFactor = Math.exp(-e.deltaY * 0.002);
        const nextZoom = clampMindMapZoom(mindMapView.zoom * deltaFactor);
        zoomMindMapFromPointer(nextZoom, pointerX, pointerY);
        return;
      }

      const deltaMultiplier =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.clientHeight : 1;
      setMindMapView((prev) => ({
        ...prev,
        offsetX: prev.offsetX - e.deltaX * deltaMultiplier,
        offsetY: prev.offsetY - e.deltaY * deltaMultiplier
      }));
    },
    [conceptMapLayout, mindMapView.zoom, zoomMindMapFromPointer]
  );

  const updateMindMapZoomFromButtons = useCallback(
    (delta: number) => {
      const viewport = mindMapViewportRef.current;
      if (!viewport) return;
      const nextZoom = clampMindMapZoom(mindMapView.zoom + delta);
      zoomMindMapFromPointer(
        nextZoom,
        viewport.clientWidth / 2,
        viewport.clientHeight / 2
      );
    },
    [mindMapView.zoom, zoomMindMapFromPointer]
  );

  useEffect(() => {
    const viewport = mindMapViewportRef.current;
    if (!viewport || !isConceptMapDialogOpen) return;

    viewport.addEventListener("wheel", onMindMapWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onMindMapWheel);
    };
  }, [isConceptMapDialogOpen, onMindMapWheel]);

  useEffect(() => {
    if (!isConceptMapDialogOpen) return;

    const onWindowKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (isEditableEventTarget(e.target)) return;
      e.preventDefault();
      setIsMindMapSpacePressed(true);
    };

    const onWindowKeyUp = (e: globalThis.KeyboardEvent) => {
      if (e.code !== "Space") return;
      setIsMindMapSpacePressed(false);
    };

    const onWindowBlur = () => {
      setIsMindMapSpacePressed(false);
    };

    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("keyup", onWindowKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [isConceptMapDialogOpen]);

  useEffect(() => {
    const onWindowPointerMove = (e: globalThis.PointerEvent) => {
      const interaction = mindMapInteractionRef.current;
      if (!interaction || interaction.pointerId !== e.pointerId) return;

      e.preventDefault();
      const deltaX = e.clientX - interaction.startClientX;
      const deltaY = e.clientY - interaction.startClientY;
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)
        interaction.moved = true;

      if (interaction.mode === "pan") {
        setMindMapView((prev) => ({
          ...prev,
          offsetX: interaction.startOffsetX + deltaX,
          offsetY: interaction.startOffsetY + deltaY
        }));
        return;
      }

      setMindMapNodePositions((prev) => ({
        ...prev,
        [interaction.nodeId]: {
          x: interaction.startNodeX + deltaX / mindMapView.zoom,
          y: interaction.startNodeY + deltaY / mindMapView.zoom
        }
      }));
    };

    const onWindowPointerUp = (e: globalThis.PointerEvent) => {
      const interaction = mindMapInteractionRef.current;
      if (!interaction || interaction.pointerId !== e.pointerId) return;

      if (interaction.moved) triggerMindMapClickSuppression();
      mindMapInteractionRef.current = null;
      setIsMindMapPanning(false);
      setIsMindMapNodeDragging(false);
    };

    window.addEventListener("pointermove", onWindowPointerMove, {
      passive: false
    });
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerUp);
      if (mindMapSuppressTimerRef.current) {
        window.clearTimeout(mindMapSuppressTimerRef.current);
        mindMapSuppressTimerRef.current = null;
      }
    };
  }, [mindMapView.zoom, triggerMindMapClickSuppression]);

  useEffect(() => {
    return () => {
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
      centerMindMapNode(selectedConceptMapNodeId);
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

    const texto = sanitizeMultilineText(inputChat, 4000);
    const shouldRequestMindMap = isMindMapEnabled;
    if (!texto || isSendingChat || !currentUserId) return;
    if (isDailyLimitReached) {
      if (!isCurrentPlanPaid) {
        setIsUpgradeDialogOpen(true);
        return;
      }

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
      if (!isCurrentPlanPaid) {
        setIsUpgradeDialogOpen(true);
        return;
      }

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
      await queryClient.invalidateQueries({
        queryKey: assistantQueryKeys.messages(conversationId)
      });

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
          await queryClient.invalidateQueries({
            queryKey: assistantQueryKeys.conversations(currentUserId)
          });
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

      const response = await secureApiFetch(ASK_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          message: texto,
          history,
          debug: true,
          ...(shouldRequestMindMap ? { mindMap: true } : {})
        })
      });

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
      if (
        typeof usage.used === "number" &&
        Number.isFinite(usage.used) &&
        typeof usage.limit === "number" &&
        Number.isFinite(usage.limit) &&
        usage.limit > 0
      ) {
        const normalizedUsed = Math.max(0, Math.floor(usage.used));
        const normalizedLimit = Math.floor(usage.limit);
        queryClient.setQueryData(assistantQueryKeys.dailyQuota(currentUserId), {
          day: "",
          is_paid: false,
          limit: normalizedLimit,
          remaining: Math.max(normalizedLimit - normalizedUsed, 0),
          used: normalizedUsed
        });
      }

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
      await queryClient.invalidateQueries({
        queryKey: assistantQueryKeys.messages(conversationId)
      });

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

  const onInputChatKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    chatFormRef.current?.requestSubmit();
  };

  return (
    <div className="grid h-[78vh] max-h-[78vh] min-h-0 items-stretch gap-4 lg:grid-cols-[18.5rem_minmax(0,1fr)] [@media(max-height:760px)]:h-[86vh] [@media(max-height:760px)]:max-h-[86vh]">
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
                      ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_10px_30px_-25px_hsl(var(--primary)/0.65)]"
                      : "border-border/80 bg-background/90 text-foreground hover:-translate-y-[1px] hover:border-primary/30 hover:bg-secondary"
                  } ${isSendingChat ? "cursor-default opacity-70" : "cursor-pointer"}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
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

      <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 p-4 shadow-[0_26px_60px_-38px_rgba(0,0,0,0.42)] md:p-5 [@media(max-height:760px)]:p-3">
        <div className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
        <div className="min-w-0 flex-1 min-h-0 flex flex-col">
          <div className="mb-4 flex items-start justify-between gap-4 [@media(max-height:760px)]:mb-2">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-semibold tracking-widest uppercase text-muted-foreground [@media(max-height:760px)]:hidden">
                {t("assistant:header.badge")}
              </p>
              <h1 className="text-2xl font-serif text-foreground [@media(max-height:760px)]:text-xl">
                {t("assistant:header.title")}
              </h1>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <span>{t(`plans:plans.${currentPlanKey}.name`)}</span>
                <span className="text-foreground/70">
                  {t("assistant:header.planSummary", {
                    limit: dailyRequestLimit || planState?.ai_daily_limit || 3
                  })}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end">
              <div
                className="relative grid h-16 w-16 place-items-center rounded-full border border-border/70 shadow-sm transition-[background] duration-300 [@media(max-height:760px)]:h-14 [@media(max-height:760px)]:w-14"
                style={{
                  background: `conic-gradient(${dailyUsageProgressColor} ${dailyUsageFillPercent}%, hsl(var(--border)) 0%)`
                }}
                role="img"
                aria-label={t("assistant:header.dailyLimit")}
                title={
                  isLoadingDailyUsage
                    ? t("assistant:header.checkingUsage")
                    : `${dailyUsedRequests}/${dailyRequestLimit}`
                }
              >
                <div className="absolute inset-[5px] rounded-full bg-background/95" />
                <div className="relative flex flex-col items-center leading-none">
                  <span
                    className={`text-[11px] font-semibold ${isDailyLimitReached ? "text-destructive" : "text-foreground"}`}
                  >
                    {isLoadingDailyUsage ? "..." : dailyUsedRequests}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    /{isLoadingDailyUsage ? "..." : dailyRequestLimit}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("assistant:header.dailyLimit")}
              </p>
            </div>
          </div>

          <div
            ref={chatContainerRef}
            onScroll={handleChatScroll}
            className="flex-1 min-h-0 space-y-3 overflow-y-auto rounded-2xl border border-border/70 bg-gradient-to-b from-secondary/30 via-secondary/15 to-background p-3 md:p-4"
          >
            {isLoadingMessages ? (
              <div className="flex h-full min-h-72 items-center justify-center text-sm text-muted-foreground [@media(max-height:760px)]:min-h-44">
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
                  <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center [@media(max-height:760px)]:min-h-44">
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
                        : "ml-auto bg-primary text-primary-foreground shadow-[0_12px_24px_-18px_hsl(var(--primary)/0.65)]"
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

          <form
            ref={chatFormRef}
            onSubmit={onSubmitChat}
            className="mt-3 [@media(max-height:760px)]:mt-2"
          >
            <div
              className={`rounded-[1.55rem] border px-4 pt-3 pb-2 shadow-sm ${
                isDailyLimitReached
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border/80 bg-background"
              }`}
            >
              <Textarea
                value={inputChat}
                onChange={(e) =>
                  setInputChat(sanitizeMultilineText(e.target.value, 4000))
                }
                onKeyDown={onInputChatKeyDown}
                placeholder={
                  isDailyLimitReached
                    ? t("assistant:input.placeholderLimitReached")
                    : t("assistant:input.placeholder")
                }
                disabled={isDailyLimitReached}
                rows={3}
                className="min-h-[76px] max-h-44 w-full resize-none overflow-y-auto overflow-x-hidden border-0 bg-transparent px-0 py-2 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
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
                        className="pl-2 transition-colors hover:bg-black/10 data-[highlighted]:bg-black/10 data-[highlighted]:text-foreground focus:bg-black/10 focus:text-foreground"
                      >
                        <span className="inline-flex items-center gap-2">
                          <GitBranch className="h-4 w-4" />
                          {t("assistant:input.mindMap")}
                        </span>
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
                    <>
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      {!isCurrentPlanPaid && (
                        <CustomButton
                          type="button"
                          styleType="ghost"
                          size="sm"
                          onClick={() => setIsUpgradeDialogOpen(true)}
                        >
                          {t("assistant:input.upgrade")}
                        </CustomButton>
                      )}
                    </>
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

      <PlanUpgradeDialog
        open={isUpgradeDialogOpen}
        onOpenChange={setIsUpgradeDialogOpen}
        feature="assistant"
        currentPlanName={t(`plans:plans.${currentPlanKey}.name`)}
        currentLimit={planState?.ai_daily_limit ?? dailyRequestLimit ?? 3}
        targetLimit={20}
      />

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
                <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-xl border border-border/80 bg-background/90 p-1.5 shadow-sm backdrop-blur">
                  <button
                    type="button"
                    onClick={() => updateMindMapZoomFromButtons(-0.12)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-background text-foreground transition hover:bg-secondary/70"
                    aria-label={t("assistant:chat.zoomOutMindMap")}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-[54px] text-center text-xs font-semibold text-muted-foreground">
                    {Math.round(mindMapView.zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => updateMindMapZoomFromButtons(0.12)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-background text-foreground transition hover:bg-secondary/70"
                    aria-label={t("assistant:chat.zoomInMindMap")}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedConceptMapNodeId) return;
                      centerMindMapNode(selectedConceptMapNodeId);
                    }}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-secondary/70"
                  >
                    {t("assistant:chat.centerMindMap")}
                  </button>
                </div>

                <div
                  ref={mindMapViewportRef}
                  className={`relative h-full overflow-hidden p-5 select-none touch-none ${
                    isMindMapPanning
                      ? "cursor-grabbing"
                      : isMindMapSpacePressed
                        ? "cursor-grab"
                        : isMindMapNodeDragging
                          ? "cursor-grabbing"
                          : "cursor-default"
                  }`}
                  onPointerDown={onMindMapViewportPointerDown}
                >
                  {conceptMapLayout ? (
                    <div
                      className="absolute left-0 top-0 origin-top-left will-change-transform"
                      style={{
                        width: `${conceptMapLayout.width}px`,
                        height: `${conceptMapLayout.height}px`,
                        transform: `translate3d(${mindMapView.offsetX}px, ${mindMapView.offsetY}px, 0) scale(${mindMapView.zoom})`
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
                          const fromNode = positionedMindMapNodeById.get(
                            edge.from
                          );
                          const toNode = positionedMindMapNodeById.get(edge.to);
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
                                d={buildMindMapEdgePath(fromNode, toNode)}
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

                      {positionedMindMapNodes.map((node) => {
                        const isSelected = node.id === selectedConceptMapNodeId;
                        const isRelated =
                          !isSelected &&
                          selectedMindMapRelatedNodeIds.has(node.id);
                        const childrenCount =
                          conceptMapChildCountByNodeId.get(node.id) ?? 0;
                        const hasChildren = childrenCount > 0;
                        const isExpanded = expandedConceptMapNodeIdSet.has(
                          node.id
                        );
                        const nodeToneClass =
                          node.level === 0
                            ? "border-primary/45 bg-primary/12 text-foreground"
                            : node.level === 1
                              ? "border-border/80 bg-background/95 text-foreground"
                              : "border-border/70 bg-background/85 text-foreground";

                        return (
                          <div
                            key={node.id}
                            onPointerDown={(e) =>
                              onMindMapNodePointerDown(e, node.id)
                            }
                            onClick={() => {
                              if (mindMapSuppressNodeClickRef.current) return;
                              setSelectedConceptMapNodeId(node.id);
                            }}
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
                            <span className="line-clamp-2 pr-7 text-[12px] font-semibold leading-snug">
                              {node.label}
                            </span>
                            {hasChildren ? (
                              <button
                                type="button"
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleMindMapNodeExpansion(node.id);
                                }}
                                className={`absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-md border text-[10px] transition ${
                                  isExpanded
                                    ? "border-primary/45 bg-primary/15 text-primary"
                                    : "border-border/70 bg-background/85 text-muted-foreground"
                                }`}
                                aria-label={
                                  isExpanded
                                    ? t("assistant:chat.collapseBranch", {
                                        defaultValue: "Ocultar siguiente nivel"
                                      })
                                    : t("assistant:chat.expandBranch", {
                                        defaultValue: "Mostrar siguiente nivel"
                                      })
                                }
                                title={
                                  isExpanded
                                    ? t("assistant:chat.collapseBranch", {
                                        defaultValue: "Ocultar siguiente nivel"
                                      })
                                    : t("assistant:chat.expandBranch", {
                                        defaultValue: "Mostrar siguiente nivel"
                                      })
                                }
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
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
                <div className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-lg border border-border/70 bg-background/90 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                  {t("assistant:chat.mindMapPanHint", {
                    defaultValue:
                      "Space + arrastrar para panear. Trackpad: dos dedos desplazan. Ctrl/Cmd + rueda para zoom."
                  })}
                </div>
                {selectedMindMapNode ? (
                  <aside className="pointer-events-none absolute bottom-4 right-4 z-20 max-w-[340px] rounded-xl border border-border/75 bg-background/95 p-3 shadow-lg backdrop-blur">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("assistant:chat.selectedNode")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {selectedMindMapNode.label}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("assistant:chat.selectedNodeLevel", {
                        level: selectedMindMapNode.level
                      })}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("assistant:chat.incomingRelations")}:{" "}
                      {selectedMindMapNodeRelations.incoming} ·{" "}
                      {t("assistant:chat.outgoingRelations")}:{" "}
                      {selectedMindMapNodeRelations.outgoing}
                    </p>
                  </aside>
                ) : null}
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

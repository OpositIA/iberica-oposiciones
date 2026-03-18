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
  sanitizeSingleLineText,
  sanitizeText
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
  ArrowDown,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Expand,
  ExternalLink,
  GitBranch,
  Loader2,
  MessageCircle,
  Minus,
  Pencil,
  Pin,
  Plus,
  Send,
  Trash2,
  User,
  X
} from "lucide-react";
import {
  FormEvent,
  PointerEvent,
  KeyboardEvent as ReactKeyboardEvent,
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
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
  pinned: boolean;
};

type AssistantTableData = {
  headerRow: string[] | null;
  bodyRows: string[][];
  totalColumns: number;
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

type NormalizedDailyQuota = {
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
const CONVERSATIONS_LOAD_TIMEOUT_MS = 12000;
const MESSAGES_LOAD_TIMEOUT_MS = 15000;
const CONCEPT_MAP_STORAGE_PREFIX = "__CONCEPT_MAP__:";
const ASK_ENDPOINT = `${
  import.meta.env.VITE_SUPABASE_URL ??
  "https://hxvckhyxfmfvdipahobv.supabase.co"
}/functions/v1/ask`;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const ASSISTANT_RESPONSE_MAX_CHARS = 12000;

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

const normalizeDailyQuota = (
  row:
    | {
        used?: unknown;
        limit?: unknown;
        remaining?: unknown;
        allowed?: unknown;
      }
    | null
    | undefined,
  fallbackLimit = 0
): NormalizedDailyQuota => {
  const nextLimit =
    typeof row?.limit === "number" &&
    Number.isFinite(row.limit) &&
    row.limit > 0
      ? Math.floor(row.limit)
      : Math.max(0, Math.floor(fallbackLimit));

  const nextUsed =
    typeof row?.used === "number" && Number.isFinite(row.used)
      ? Math.max(0, Math.floor(row.used))
      : 0;

  const reportedRemaining =
    typeof row?.remaining === "number" && Number.isFinite(row.remaining)
      ? Math.max(0, Math.floor(row.remaining))
      : null;

  const computedRemaining =
    nextLimit > 0 ? Math.max(nextLimit - nextUsed, 0) : 0;

  const nextRemaining =
    reportedRemaining === null
      ? computedRemaining
      : nextUsed < nextLimit && reportedRemaining === 0
        ? computedRemaining
        : reportedRemaining;

  const allowed =
    typeof row?.allowed === "boolean"
      ? row.allowed
      : nextLimit > 0
        ? nextUsed < nextLimit
        : nextRemaining > 0;

  return {
    allowed,
    used: nextUsed,
    limit: nextLimit,
    remaining: nextRemaining
  };
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
    "id" | "title" | "created_at" | "last_message_at" | "pinned"
  >
): ConversationItem => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  lastMessageAt: row.last_message_at,
  pinned: row.pinned
});

const compareConversationDates = (a: string, b: string) => {
  const aTime = Date.parse(a);
  const bTime = Date.parse(b);

  if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
  if (Number.isNaN(aTime)) return 1;
  if (Number.isNaN(bTime)) return -1;

  return bTime - aTime;
};

const sortConversationItems = (items: ConversationItem[]) =>
  items.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return compareConversationDates(a.lastMessageAt, b.lastMessageAt);
  });

const sortConversationRows = (rows: AssistantConversationRow[]) =>
  rows.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return compareConversationDates(a.last_message_at, b.last_message_at);
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
  const [pinningConversationId, setPinningConversationId] = useState<
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
  const inputTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mensajes, setMensajes] = useState<ChatMessage[]>([]);
  const [showScrollToLatestButton, setShowScrollToLatestButton] =
    useState(false);
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
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);
  const [tableDialogData, setTableDialogData] =
    useState<AssistantTableData | null>(null);
  const [editingConversationId, setEditingConversationId] = useState<
    string | null
  >(null);
  const [editingConversationTitle, setEditingConversationTitle] = useState("");
  const [sidebarHistoryHost, setSidebarHistoryHost] =
    useState<HTMLElement | null>(null);
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
  const loadMessagesRequestIdRef = useRef(0);

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
  const showInitialConversationsLoader =
    isLoadingConversations && conversations.length === 0;
  const showInitialMessagesLoader = isLoadingMessages && mensajes.length === 0;

  const resizeChatTextarea = useCallback(() => {
    const textarea = inputTextareaRef.current;
    if (!textarea) return;

    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 22;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const minHeight = lineHeight + paddingTop + paddingBottom;
    const maxHeight = lineHeight * 4 + paddingTop + paddingBottom;

    textarea.style.height = "auto";
    const nextHeight = Math.min(
      maxHeight,
      Math.max(minHeight, textarea.scrollHeight)
    );
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const syncSidebarHistoryHost = () => {
      setSidebarHistoryHost(
        document.getElementById("assistant-sidebar-history-slot")
      );
    };

    syncSidebarHistoryHost();
    window.addEventListener("resize", syncSidebarHistoryHost);

    return () => window.removeEventListener("resize", syncSidebarHistoryHost);
  }, []);

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
        let timeoutId: number | undefined;
        const data = await Promise.race([
          queryClient.fetchQuery({
            queryKey: assistantQueryKeys.conversations(userId),
            queryFn: () => fetchAssistantConversations(userId),
            ...assistantQueryConfig
          }),
          new Promise<never>((_resolve, reject) => {
            timeoutId = window.setTimeout(() => {
              reject(new Error("Timeout al cargar conversaciones"));
            }, CONVERSATIONS_LOAD_TIMEOUT_MS);
          })
        ]);
        if (timeoutId) window.clearTimeout(timeoutId);
        return sortConversationRows(data).map((row) => mapConversation(row));
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
        .select("id, title, created_at, last_message_at, pinned")
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
          return sortConversationRows([mappedRow, ...withoutExisting]);
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
    if (data) setConversations(sortConversationItems(data));
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

        const normalizedQuota = normalizeDailyQuota(
          row,
          planState?.ai_daily_limit ?? dailyRequestLimit
        );

        setDailyRequestLimit(normalizedQuota.limit);
        setDailyUsedRequests(normalizedQuota.used);
        setIsLoadingDailyUsage(false);
      } catch {
        setDailyRequestLimit((prev) => (prev > 0 ? prev : 10));
        setIsLoadingDailyUsage(false);
        return;
      }
    },
    [dailyRequestLimit, planState?.ai_daily_limit, queryClient]
  );

  const getDailyQuota = useCallback(
    async (userId: string): Promise<DailyQuotaResult | null> => {
      const { data, error } = await supabase.rpc("get_ai_daily_quota", {
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

      const normalizedQuota = normalizeDailyQuota(
        row,
        planState?.ai_daily_limit ?? dailyRequestLimit
      );

      setDailyRequestLimit(normalizedQuota.limit);
      setDailyUsedRequests(normalizedQuota.used);
      queryClient.setQueryData(assistantQueryKeys.dailyQuota(userId), {
        day: String(row.day ?? ""),
        is_paid: Boolean(row.is_paid),
        limit: normalizedQuota.limit,
        remaining: normalizedQuota.remaining,
        used: normalizedQuota.used
      });

      return normalizedQuota;
    },
    [dailyRequestLimit, planState?.ai_daily_limit, queryClient, t, toast]
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

      const normalizedQuota = normalizeDailyQuota(
        row,
        planState?.ai_daily_limit ?? dailyRequestLimit
      );

      setDailyRequestLimit(normalizedQuota.limit);
      setDailyUsedRequests(normalizedQuota.used);
      queryClient.setQueryData(assistantQueryKeys.dailyQuota(userId), {
        day: String(row.day ?? ""),
        is_paid: Boolean(planState?.is_paid),
        limit: normalizedQuota.limit,
        remaining: normalizedQuota.remaining,
        used: normalizedQuota.used
      });

      return {
        allowed:
          typeof row.allowed === "boolean"
            ? row.allowed
            : normalizedQuota.allowed,
        used: normalizedQuota.used,
        limit: normalizedQuota.limit,
        remaining: normalizedQuota.remaining
      };
    },
    [
      dailyRequestLimit,
      planState?.ai_daily_limit,
      planState?.is_paid,
      queryClient,
      t,
      toast
    ]
  );

  const loadMessages = useCallback(
    async (conversationId: string) => {
      const requestId = loadMessagesRequestIdRef.current + 1;
      loadMessagesRequestIdRef.current = requestId;
      setIsLoadingMessages(true);
      setIsLoadingOlderMessages(false);
      setHasMoreMessages(false);
      try {
        let timeoutId: number | undefined;
        const rows = await Promise.race([
          queryClient.fetchQuery({
            queryKey: assistantQueryKeys.messages(conversationId),
            queryFn: () =>
              fetchAssistantMessages(conversationId, MESSAGES_PAGE_SIZE),
            ...assistantQueryConfig
          }),
          new Promise<never>((_resolve, reject) => {
            timeoutId = window.setTimeout(() => {
              reject(new Error("Timeout al cargar mensajes"));
            }, MESSAGES_LOAD_TIMEOUT_MS);
          })
        ]);
        if (timeoutId) window.clearTimeout(timeoutId);

        if (loadMessagesRequestIdRef.current !== requestId) return;

        const mapped = rows
          .slice()
          .reverse()
          .map((row) => mapDbMessageToChatMessage(row, formatHora));

        setMensajes(mapped);
        setHasMoreMessages(rows.length === MESSAGES_PAGE_SIZE);
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
        if (loadMessagesRequestIdRef.current !== requestId) return;
        lastLoadedConversationIdRef.current = null;
        setMensajes([]);
      } finally {
        if (loadMessagesRequestIdRef.current === requestId)
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
      loadMessagesRequestIdRef.current += 1;
      bootstrappedUserIdRef.current = null;
      lastLoadedConversationIdRef.current = null;
      setConversations([]);
      setActiveConversationId(null);
      setMensajes([]);
      setHasMoreMessages(false);
      setIsLoadingMessages(false);
      setIsLoadingOlderMessages(false);
      setPinningConversationId(null);
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
          setConversations(sortConversationItems([created]));
          setActiveConversationId(created.id);
        } else bootstrappedUserIdRef.current = null;

        setIsLoadingConversations(false);
        return;
      }

      setConversations(sortConversationItems(loadedConversations));
      setActiveConversationId(loadedConversations[0].id);
      setIsLoadingConversations(false);
    };

    void bootstrap();

    return () => {
      isCancelled = true;
    };
  }, [createConversationRecord, getConversations, isAuthReady, user?.id]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user?.id) return;
    void refreshDailyUsage(user.id);
  }, [isAuthReady, refreshDailyUsage, user?.id]);

  useEffect(() => {
    if (!activeConversationId) {
      loadMessagesRequestIdRef.current += 1;
      lastLoadedConversationIdRef.current = null;
      setMensajes([]);
      setHasMoreMessages(false);
      setIsLoadingMessages(false);
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

  const syncChatScrollState = useCallback(() => {
    const node = chatContainerRef.current;
    if (!node) {
      setShowScrollToLatestButton(false);
      return;
    }

    const distanceToBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;
    const isNearBottom = distanceToBottom < 72;

    shouldStickToBottomRef.current = isNearBottom;
    setShowScrollToLatestButton(mensajes.length > 0 && !isNearBottom);
  }, [mensajes.length]);

  useEffect(() => {
    const node = chatContainerRef.current;
    if (!node) return;

    if (isRestoringPrependScrollRef.current) {
      const nextScrollTop =
        prependPreviousScrollTopRef.current +
        (node.scrollHeight - prependPreviousScrollHeightRef.current);
      node.scrollTop = Math.max(nextScrollTop, 0);
      isRestoringPrependScrollRef.current = false;
      syncChatScrollState();
      return;
    }

    if (shouldStickToBottomRef.current || isSendingChat)
      node.scrollTop = node.scrollHeight;
    syncChatScrollState();
  }, [
    mensajes,
    isSendingChat,
    estadoEscrituraIdx,
    isLoadingMessages,
    syncChatScrollState
  ]);

  useEffect(() => {
    resizeChatTextarea();
  }, [inputChat, resizeChatTextarea]);

  useEffect(() => {
    if (!isLoadingConversations) return;
    if (conversations.length === 0) return;
    setIsLoadingConversations(false);
  }, [conversations.length, isLoadingConversations]);

  useEffect(() => {
    if (!isLoadingMessages) return;
    if (mensajes.length === 0) return;
    setIsLoadingMessages(false);
  }, [isLoadingMessages, mensajes.length]);

  const extraerTextoRespuesta = (payload: unknown) => {
    if (!payload || typeof payload !== "object") return "";

    const data = payload as Record<string, unknown>;
    const stringFields = ["message", "reply", "response", "text", "content"];
    for (const field of stringFields) {
      const value = data[field];
      const sanitized = sanitizeMultilineText(
        value,
        ASSISTANT_RESPONSE_MAX_CHARS
      );
      if (sanitized) return sanitized;
    }

    const choices = data.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const firstChoice = choices[0] as
        | { message?: { content?: unknown }; text?: unknown }
        | undefined;
      const messageContent = sanitizeMultilineText(
        firstChoice?.message?.content,
        ASSISTANT_RESPONSE_MAX_CHARS
      );
      if (messageContent) return messageContent;

      const choiceText = sanitizeMultilineText(
        firstChoice?.text,
        ASSISTANT_RESPONSE_MAX_CHARS
      );
      if (choiceText) return choiceText;
    }

    return "";
  };

  const renderInlineMarkdown = (text: string, keyPrefix: string) =>
    text
      .split(/(\*\*[^*]+\*\*|<br\s*\/?>)/gi)
      .filter(Boolean)
      .map((segment, index) => {
        if (/^<br\s*\/?>$/i.test(segment))
          return <br key={`${keyPrefix}-br-${index}`} />;

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

  const renderAssistantTable = (
    tableData: AssistantTableData,
    keyPrefix: string,
    expanded = false
  ) => {
    const normalizeRow = (row: string[]) =>
      Array.from(
        { length: tableData.totalColumns },
        (_, idx) => row[idx] ?? ""
      );

    return (
      <div
        className={
          expanded
            ? "h-full overflow-auto rounded-xl border border-border/70 bg-background"
            : "overflow-x-auto rounded-lg border border-border/70"
        }
      >
        <table
          className={
            expanded
              ? "min-w-full border-collapse text-sm md:text-[15px]"
              : "min-w-full border-collapse text-sm"
          }
        >
          {tableData.headerRow ? (
            <thead
              className={
                expanded ? "sticky top-0 bg-secondary/70" : "bg-secondary/40"
              }
            >
              <tr>
                {normalizeRow(tableData.headerRow).map((cell, cellIndex) => (
                  <th
                    key={`${keyPrefix}-th-${cellIndex}`}
                    className={
                      expanded
                        ? "border-b border-border/70 px-4 py-3 text-left font-semibold"
                        : "border-b border-border/70 px-3 py-2 text-left font-semibold"
                    }
                  >
                    {renderInlineMarkdown(
                      cell,
                      `${keyPrefix}-th-content-${cellIndex}`
                    )}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {tableData.bodyRows.map((row, rowIndex) => (
              <tr
                key={`${keyPrefix}-tr-${rowIndex}`}
                className="odd:bg-background even:bg-secondary/15"
              >
                {normalizeRow(row).map((cell, cellIndex) => (
                  <td
                    key={`${keyPrefix}-td-${rowIndex}-${cellIndex}`}
                    className={
                      expanded
                        ? "border-t border-border/60 px-4 py-3 align-top"
                        : "border-t border-border/60 px-3 py-2 align-top"
                    }
                  >
                    {renderInlineMarkdown(
                      cell,
                      `${keyPrefix}-td-content-${rowIndex}-${cellIndex}`
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

  const extractAssistantTables = (content: string): AssistantTableData[] => {
    const lines = content.split(/\r?\n/);
    const tables: AssistantTableData[] = [];
    let tableLines: string[] = [];

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

    const flush = () => {
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
      tables.push({ headerRow, bodyRows, totalColumns });
    };

    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        flush();
        return;
      }

      if (isTableCandidateLine(line)) {
        tableLines.push(line);
        return;
      }

      flush();
    });

    flush();
    return tables;
  };

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
              className="text-[15px] leading-7"
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

      const tableData: AssistantTableData = {
        headerRow,
        bodyRows,
        totalColumns
      };

      blocks.push(
        <div key={`${keyPrefix}-table-wrap-${lineIndex}`}>
          {renderAssistantTable(tableData, `${keyPrefix}-table-${lineIndex}`)}
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

      const hrMatch = line.match(/^(-{3,}|\*{3,}|_{3,})$/);
      if (hrMatch) {
        blocks.push(
          <hr
            key={`${keyPrefix}-hr-${lineIndex}`}
            className="my-2 border-border/60"
          />
        );
        return;
      }

      const h1Match = line.match(/^#\s+(.+)$/);
      if (h1Match) {
        blocks.push(
          <h1
            key={`${keyPrefix}-h1-${lineIndex}`}
            className="mt-3 text-xl font-bold tracking-tight text-foreground"
          >
            {renderInlineMarkdown(
              h1Match[1],
              `${keyPrefix}-h1-content-${lineIndex}`
            )}
          </h1>
        );
        return;
      }

      const h2Match = line.match(/^##\s+(.+)$/);
      if (h2Match) {
        blocks.push(
          <h2
            key={`${keyPrefix}-h2-${lineIndex}`}
            className="mt-3 border-l-2 border-primary/55 pl-2 text-lg font-semibold tracking-tight text-foreground"
          >
            {renderInlineMarkdown(
              h2Match[1],
              `${keyPrefix}-h2-content-${lineIndex}`
            )}
          </h2>
        );
        return;
      }

      const h3Match = line.match(/^###\s+(.+)$/);
      if (h3Match) {
        blocks.push(
          <h3
            key={`${keyPrefix}-h3-${lineIndex}`}
            className="mt-2 text-base font-semibold tracking-wide text-foreground/95"
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
            className="mt-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
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
          className="text-[15px] leading-7 text-foreground/95"
        >
          {renderInlineMarkdown(line, `${keyPrefix}-p-content-${lineIndex}`)}
        </p>
      );
    });

    flushBulletItems(lines.length + 1);
    flushTableLines(lines.length + 1);

    if (blocks.length === 0) {
      return (
        <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/95">
          {content}
        </p>
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

  const moveConversationToSectionTop = useCallback((conversationId: string) => {
    setConversations((prev) => {
      const found = prev.find(
        (conversation) => conversation.id === conversationId
      );
      if (!found) return prev;

      const remaining = prev.filter(
        (conversation) => conversation.id !== conversationId
      );

      if (found.pinned) return [found, ...remaining];

      const firstUnpinnedIndex = remaining.findIndex(
        (conversation) => !conversation.pinned
      );

      if (firstUnpinnedIndex === -1) return [...remaining, found];

      return [
        ...remaining.slice(0, firstUnpinnedIndex),
        found,
        ...remaining.slice(firstUnpinnedIndex)
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
      moveConversationToSectionTop(existingEmpty.id);
      setActiveConversationId(existingEmpty.id);
      setInputChat("");
      return;
    }

    setIsCreatingConversation(true);
    const created = await createConversationRecord(currentUserId);
    setIsCreatingConversation(false);

    if (!created) return;

    setConversations((prev) =>
      sortConversationItems([
        created,
        ...prev.filter((item) => item.id !== created.id)
      ])
    );
    setActiveConversationId(created.id);
    setInputChat("");
    setMensajes([]);
    queryClient.setQueryData(assistantQueryKeys.messages(created.id), []);
  };

  const onRequestDeleteConversation = (conversation: ConversationItem) => {
    if (
      !currentUserId ||
      deletingConversationId ||
      pinningConversationId ||
      isSendingChat
    )
      return;
    setConversationPendingDelete(conversation);
  };

  const onDeleteConversation = async () => {
    const conversationId = conversationPendingDelete?.id;
    if (
      !currentUserId ||
      !conversationId ||
      deletingConversationId ||
      pinningConversationId ||
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

  const startEditingConversation = (conversation: ConversationItem) => {
    if (
      !currentUserId ||
      deletingConversationId ||
      pinningConversationId ||
      isSendingChat
    )
      return;
    setEditingConversationId(conversation.id);
    setEditingConversationTitle(conversation.title || "");
  };

  const cancelEditingConversation = () => {
    setEditingConversationId(null);
    setEditingConversationTitle("");
  };

  const saveConversationTitle = async (conversation: ConversationItem) => {
    if (!currentUserId) {
      cancelEditingConversation();
      return;
    }

    const nextTitle =
      sanitizeSingleLineText(editingConversationTitle, 80) ||
      t("assistant:newChat");
    const currentTitle = conversation.title || t("assistant:newChat");

    if (nextTitle === currentTitle) {
      cancelEditingConversation();
      return;
    }

    const { error } = await supabase
      .from("ai_conversations")
      .update({ title: nextTitle })
      .eq("id", conversation.id)
      .eq("user_id", currentUserId);

    if (error) {
      toast({
        variant: "destructive",
        title: t("assistant:toasts.renameChatFailedTitle", {
          defaultValue: "No se pudo renombrar el chat"
        }),
        description: error.message
      });
      return;
    }

    setConversations((prev) =>
      prev.map((item) =>
        item.id === conversation.id ? { ...item, title: nextTitle } : item
      )
    );
    queryClient.setQueryData(
      assistantQueryKeys.conversations(currentUserId),
      (prev: AssistantConversationRow[] | undefined) =>
        (prev ?? []).map((item) =>
          item.id === conversation.id ? { ...item, title: nextTitle } : item
        )
    );
    cancelEditingConversation();
  };

  const toggleConversationPinned = async (conversation: ConversationItem) => {
    if (
      !currentUserId ||
      deletingConversationId ||
      pinningConversationId ||
      isSendingChat
    )
      return;

    const nextPinned = !conversation.pinned;
    setPinningConversationId(conversation.id);

    const { error } = await supabase
      .from("ai_conversations")
      .update({ pinned: nextPinned })
      .eq("id", conversation.id)
      .eq("user_id", currentUserId);

    if (error) {
      toast({
        variant: "destructive",
        title: t("assistant:toasts.pinChatFailedTitle", {
          defaultValue: "No se pudo actualizar el chat fijado"
        }),
        description: error.message
      });
      setPinningConversationId(null);
      return;
    }

    setConversations((prev) =>
      sortConversationItems(
        prev.map((item) =>
          item.id === conversation.id ? { ...item, pinned: nextPinned } : item
        )
      )
    );
    queryClient.setQueryData(
      assistantQueryKeys.conversations(currentUserId),
      (prev: AssistantConversationRow[] | undefined) =>
        sortConversationRows(
          (prev ?? []).map((item) =>
            item.id === conversation.id ? { ...item, pinned: nextPinned } : item
          )
        )
    );
    setPinningConversationId(null);
  };

  const handleScrollToLatestMessage = useCallback(() => {
    const node = chatContainerRef.current;
    if (!node) return;

    shouldStickToBottomRef.current = true;
    setShowScrollToLatestButton(false);
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, []);

  const handleChatScroll = useCallback(() => {
    const node = chatContainerRef.current;
    if (!node) return;

    syncChatScrollState();

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
    loadOlderMessages,
    syncChatScrollState
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
    cancelAnimationFrame(mindMapAnimFrameRef.current);
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

  const mindMapAnimFrameRef = useRef(0);

  const fitMindMapToView = useCallback(
    (duration = 280) => {
      const viewport = mindMapViewportRef.current;
      if (!viewport || !conceptMapLayout || conceptMapLayout.nodes.length === 0)
        return;

      const padding = 60;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;

      // Bounding box of all visible nodes
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of positionedMindMapNodes) {
        if (node.x < minX) minX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.x + node.width > maxX) maxX = node.x + node.width;
        if (node.y + node.height > maxY) maxY = node.y + node.height;
      }

      const contentW = maxX - minX;
      const contentH = maxY - minY;
      if (contentW <= 0 || contentH <= 0) return;

      const targetZoom = clampMindMapZoom(
        Math.min(
          (vw - padding * 2) / contentW,
          (vh - padding * 2) / contentH,
          1.2
        )
      );
      const targetOffsetX =
        (vw - contentW * targetZoom) / 2 - minX * targetZoom;
      const targetOffsetY =
        (vh - contentH * targetZoom) / 2 - minY * targetZoom;

      // Animate from current to target
      cancelAnimationFrame(mindMapAnimFrameRef.current);

      const startTime = performance.now();

      setMindMapView((prev) => {
        const fromZoom = prev.zoom;
        const fromOX = prev.offsetX;
        const fromOY = prev.offsetY;

        const animate = (now: number) => {
          const elapsed = now - startTime;
          const t = Math.min(elapsed / duration, 1);
          // ease-out cubic
          const ease = 1 - Math.pow(1 - t, 3);

          const z = fromZoom + (targetZoom - fromZoom) * ease;
          const ox = fromOX + (targetOffsetX - fromOX) * ease;
          const oy = fromOY + (targetOffsetY - fromOY) * ease;

          setMindMapView({ zoom: z, offsetX: ox, offsetY: oy });

          if (t < 1)
            mindMapAnimFrameRef.current = requestAnimationFrame(animate);
        };

        mindMapAnimFrameRef.current = requestAnimationFrame(animate);
        return prev; // don't change yet, animation will handle it
      });
    },
    [conceptMapLayout, positionedMindMapNodes]
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
    const shouldStartPan = e.button === 0 || e.button === 1;
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

    e.preventDefault();
    e.stopPropagation();
    setSelectedConceptMapNodeId(nodeId);
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

      const deltaFactor = Math.exp(-e.deltaY * 0.003);
      const nextZoom = clampMindMapZoom(mindMapView.zoom * deltaFactor);
      zoomMindMapFromPointer(nextZoom, pointerX, pointerY);
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
    const onWindowPointerMove = (e: globalThis.PointerEvent) => {
      const interaction = mindMapInteractionRef.current;
      if (!interaction || interaction.pointerId !== e.pointerId) return;
      if (interaction.mode !== "pan") return;

      e.preventDefault();
      const deltaX = e.clientX - interaction.startClientX;
      const deltaY = e.clientY - interaction.startClientY;
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)
        interaction.moved = true;

      setMindMapView((prev) => ({
        ...prev,
        offsetX: interaction.startOffsetX + deltaX,
        offsetY: interaction.startOffsetY + deltaY
      }));
    };

    const onWindowPointerUp = (e: globalThis.PointerEvent) => {
      const interaction = mindMapInteractionRef.current;
      if (!interaction || interaction.pointerId !== e.pointerId) return;

      if (interaction.moved) triggerMindMapClickSuppression();
      mindMapInteractionRef.current = null;
      setIsMindMapPanning(false);
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
  }, [triggerMindMapClickSuppression]);

  useEffect(() => {
    return () => {
      if (mindMapSuppressTimerRef.current) {
        window.clearTimeout(mindMapSuppressTimerRef.current);
        mindMapSuppressTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isConceptMapDialogOpen || !conceptMapLayout) return;
    const timeoutId = window.setTimeout(() => {
      fitMindMapToView(300);
    }, 60);
    return () => window.clearTimeout(timeoutId);
  }, [isConceptMapDialogOpen, conceptMapLayout, fitMindMapToView]);

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

    const quota = await getDailyQuota(currentUserId);
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
        moveConversationToSectionTop(existingEmpty.id);
        setActiveConversationId(existingEmpty.id);
        conversationId = existingEmpty.id;
      } else {
        const created = await createConversationRecord(currentUserId);
        if (!created) return;
        setConversations((prev) =>
          sortConversationItems([
            created,
            ...prev.filter((item) => item.id !== created.id)
          ])
        );
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

      const history: GeminiHistoryItem[] = mensajes
        .filter((m) => m.content.trim().length > 0)
        .slice(-20)
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        }));

      const {
        data: { session: latestSession }
      } = await supabase.auth.getSession();
      const accessToken = latestSession?.access_token ?? session?.access_token;
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

      await consumeDailyQuota(currentUserId);

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

  const handleLockedTextareaInteraction = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      if (!isDailyLimitReached || isCurrentPlanPaid) return;
      event.preventDefault();
      setIsUpgradeDialogOpen(true);
    },
    [isCurrentPlanPaid, isDailyLimitReached]
  );

  const renderConversationHistoryItem = (conversation: ConversationItem) => {
    const isActive = conversation.id === activeConversationId;
    const isDeletingThis = deletingConversationId === conversation.id;
    const isPinningThis = pinningConversationId === conversation.id;
    const isEditingThis = editingConversationId === conversation.id;

    return (
      <div
        key={conversation.id}
        role="button"
        tabIndex={isSendingChat ? -1 : 0}
        aria-disabled={isSendingChat}
        onClick={() => {
          if (isSendingChat || isEditingThis) return;
          onSelectConversation(conversation.id);
        }}
        onKeyDown={(event) => {
          if (isSendingChat || isEditingThis) return;
          if (event.target !== event.currentTarget) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onSelectConversation(conversation.id);
        }}
        className={`group w-full rounded-xl px-2.5 py-1 text-left transition-all ${
          isActive
            ? "bg-primary text-primary-foreground shadow-[0_14px_30px_-24px_hsl(var(--primary)/0.85)]"
            : "bg-background/75 text-foreground hover:-translate-y-[1px] hover:bg-secondary/85"
        } ${isSendingChat ? "cursor-default opacity-70" : "cursor-pointer"}`}
      >
        <div className="flex items-center gap-2">
          {conversation.pinned ? (
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                isActive
                  ? "border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground"
                  : "border-primary/20 bg-primary/10 text-primary"
              }`}
              aria-label={t("assistant:sidebar.pinnedChat", {
                defaultValue: "Chat fijado"
              })}
              title={t("assistant:sidebar.pinnedChat", {
                defaultValue: "Chat fijado"
              })}
            >
              <Pin className="h-3 w-3" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {isEditingThis ? (
              <input
                value={editingConversationTitle}
                onChange={(event) =>
                  setEditingConversationTitle(
                    sanitizeSingleLineText(event.target.value, 80)
                  )
                }
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveConversationTitle(conversation);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEditingConversation();
                  }
                }}
                autoFocus
                className="w-full rounded-lg border border-primary/35 bg-background px-2 py-1 text-[12px] font-medium text-foreground outline-none"
              />
            ) : (
              <p
                className={`truncate text-[12px] font-medium leading-tight ${
                  isActive ? "text-primary-foreground" : "text-foreground"
                }`}
                title={conversation.title || t("assistant:newChat")}
              >
                {conversation.title || t("assistant:newChat")}
              </p>
            )}
          </div>

          {isEditingThis ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  cancelEditingConversation();
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label={t("common:cancel", {
                  defaultValue: "Cancelar"
                })}
              >
                <X className="h-2.5 w-2.5" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void saveConversationTitle(conversation);
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary/30 text-primary transition-colors hover:bg-primary/10"
                aria-label={t("common:save", {
                  defaultValue: "Guardar"
                })}
              >
                <Check className="h-2.5 w-2.5" />
              </button>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  disabled={
                    Boolean(deletingConversationId) ||
                    Boolean(pinningConversationId) ||
                    isSendingChat
                  }
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all ${
                    isActive
                      ? "border-primary-foreground/20 text-primary-foreground/85 hover:bg-primary-foreground/10"
                      : "border-border/70 text-muted-foreground hover:bg-secondary"
                  } ${isDeletingThis || isPinningThis ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
                  aria-label={t("assistant:sidebar.chatOptions", {
                    defaultValue: "Opciones del chat"
                  })}
                >
                  {isDeletingThis || isPinningThis ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <Ellipsis className="h-2.5 w-2.5" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem
                  onClick={() => {
                    void toggleConversationPinned(conversation);
                  }}
                  className="cursor-pointer gap-2"
                >
                  <Pin className="h-3.5 w-3.5" />
                  {conversation.pinned
                    ? t("assistant:sidebar.unpinChat", {
                        defaultValue: "Desfijar"
                      })
                    : t("assistant:sidebar.pinChat", {
                        defaultValue: "Fijar"
                      })}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => startEditingConversation(conversation)}
                  className="cursor-pointer gap-2"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("assistant:sidebar.renameChat", {
                    defaultValue: "Editar"
                  })}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onRequestDeleteConversation(conversation)}
                  className="cursor-pointer gap-2 text-foreground focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("assistant:sidebar.deleteChat", {
                    defaultValue: "Eliminar"
                  })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    );
  };

  const historySidebarPanel = (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="px-6 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Tus chats
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-20">
        {showInitialConversationsLoader ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("assistant:sidebar.loadingChats")}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/70 text-muted-foreground shadow-sm">
              <MessageCircle className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("assistant:newChat")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("assistant:chat.emptyDescription")}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2 px-3">
            {conversations.map((conversation) =>
              renderConversationHistoryItem(conversation)
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {sidebarHistoryHost
        ? createPortal(historySidebarPanel, sidebarHistoryHost)
        : null}

      <div className="relative flex h-[78vh] max-h-[78vh] min-h-0 flex-col overflow-visible pl-14 [@media(max-height:760px)]:h-[86vh] [@media(max-height:760px)]:max-h-[86vh] md:pl-16">
        <div className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute left-1 top-4 z-20">
          <CustomButton
            type="button"
            onClick={onCreateConversation}
            disabled={
              isCreatingConversation || isLoadingConversations || !currentUserId
            }
            styleType="primary"
            size="icon"
            radius="full"
            className="pointer-events-auto h-11 w-11 shadow-[0_18px_38px_-18px_hsl(var(--primary)/0.8)]"
            aria-label={t("assistant:sidebar.newChat")}
            title={t("assistant:sidebar.newChat")}
          >
            {isCreatingConversation ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </CustomButton>
        </div>
        <div
          ref={chatContainerRef}
          onScroll={handleChatScroll}
          className="flex-1 min-h-0 space-y-3 overflow-y-auto px-1 py-12 md:px-2 md:py-12"
        >
          {showInitialMessagesLoader ? (
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
              {mensajes.map((m) => {
                const assistantTables =
                  m.role === "assistant" && !m.conceptMap
                    ? extractAssistantTables(m.content)
                    : [];

                return (
                  <div
                    key={m.id}
                    className={`max-w-[88%] rounded-2xl p-4 ${
                      m.role === "assistant"
                        ? "border border-border/70 bg-background text-foreground shadow-sm"
                        : "ml-auto bg-primary text-primary-foreground shadow-[0_12px_24px_-18px_hsl(var(--primary)/0.65)]"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      {m.role === "assistant" ? (
                        <MessageCircle className="h-3.5 w-3.5" />
                      ) : (
                        <User className="h-3.5 w-3.5" />
                      )}
                      <span className="text-xs font-medium uppercase tracking-widest opacity-85">
                        {m.role === "assistant"
                          ? t("assistant:chat.assistantLabel")
                          : t("assistant:chat.userLabel")}
                      </span>
                      {m.role === "assistant" && assistantTables.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setTableDialogData(assistantTables[0])}
                          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                          aria-label={t("assistant:chat.openTableDialog", {
                            defaultValue: "Abrir tabla"
                          })}
                        >
                          <Expand className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
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
                      <p className="whitespace-pre-wrap text-[15px] leading-7">
                        {m.content}
                      </p>
                    )}
                  </div>
                );
              })}
              {isSendingChat && (
                <div className="max-w-[88%] rounded-2xl border border-border/70 bg-background p-4 text-foreground shadow-sm">
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
                      <div className="mb-1 flex items-center gap-2">
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase tracking-widest opacity-85">
                          {t("assistant:chat.assistantLabel")}
                        </span>
                        <span className="ml-auto text-xs opacity-80">
                          {t("assistant:chat.writing")}
                        </span>
                      </div>
                      <p className="animate-pulse text-[15px] leading-7 text-muted-foreground">
                        {estadosEscrituraIA[estadoEscrituraIdx]}
                      </p>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="relative mt-3 [@media(max-height:760px)]:mt-2">
          {showScrollToLatestButton ? (
            <CustomButton
              type="button"
              onClick={handleScrollToLatestMessage}
              styleType="subtle"
              size="sm"
              radius="full"
              className="absolute top-0 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 border-border/80 bg-background/95 px-4 shadow-[0_18px_34px_-20px_hsl(var(--foreground)/0.45)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
              aria-label={t("assistant:chat.scrollToLatest")}
              title={t("assistant:chat.scrollToLatest")}
            >
              <ArrowDown className="h-3.5 w-3.5" />
              {t("assistant:chat.scrollToLatest")}
            </CustomButton>
          ) : null}
          <form ref={chatFormRef} onSubmit={onSubmitChat}>
            <div
              className={`rounded-[1.55rem] border px-4 pt-3 pb-2 shadow-sm ${
                isDailyLimitReached
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border/80 bg-background"
              }`}
            >
              <Textarea
                ref={inputTextareaRef}
                value={inputChat}
                onChange={(e) =>
                  setInputChat(
                    sanitizeText(e.target.value, {
                      maxLength: 4000,
                      trim: false,
                      collapseWhitespace: false,
                      preserveNewlines: true
                    })
                  )
                }
                onPointerDown={handleLockedTextareaInteraction}
                onFocus={handleLockedTextareaInteraction}
                onKeyDown={onInputChatKeyDown}
                placeholder={
                  isDailyLimitReached
                    ? t("assistant:input.placeholderLimitReached")
                    : t("assistant:input.placeholder")
                }
                readOnly={isDailyLimitReached && !isCurrentPlanPaid}
                rows={1}
                className="min-h-0 w-full resize-none overflow-x-hidden overflow-y-hidden border-0 bg-transparent px-0 py-2 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {/* TODO: recuperar el boton "+" de acciones rapidas de IA cuando se retome este desarrollo.
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
                        className="pl-2 transition-colors hover:bg-black/10 data-[highlighted]:bg-black/10 data-[highlighted]:text-foreground focus:bg-black/10 focus:text-foreground data-[state=checked]:bg-primary/15 data-[state=checked]:text-primary data-[state=checked]:font-medium [&_span.absolute]:hidden"
                      >
                        <span className="inline-flex items-center gap-2">
                          <GitBranch className="h-4 w-4" />
                          {t("assistant:input.mindMap")}
                        </span>
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  */}

                  {isMindMapEnabled && (
                    <button
                      type="button"
                      onClick={() => setIsMindMapEnabled(false)}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-primary transition-colors hover:bg-primary/20"
                      aria-label={t("assistant:input.disableMindMap", {
                        defaultValue: "Desactivar mapa mental"
                      })}
                    >
                      <span>{t("assistant:input.mindMap")}</span>
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-primary/35 transition-colors group-hover:bg-primary/15">
                        <X className="h-2.5 w-2.5" />
                      </span>
                    </button>
                  )}
                </div>

                <div className="ml-auto flex items-center gap-5">
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
                  <div className="flex shrink-0 items-center gap-4">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("assistant:header.dailyLimit")}
                    </p>
                    <div
                      className="relative grid h-10 w-10 place-items-center rounded-full border border-border/70 shadow-sm transition-[background] duration-300"
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
                      <div className="absolute inset-[4px] rounded-full bg-background/95" />
                      <span
                        className={`relative z-10 text-[9px] font-semibold leading-none ${
                          isDailyLimitReached
                            ? "text-destructive"
                            : "text-foreground"
                        }`}
                      >
                        {isLoadingDailyUsage
                          ? "..."
                          : `${dailyUsedRequests}/${dailyRequestLimit}`}
                      </span>
                    </div>
                  </div>
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
      </div>

      <PlanUpgradeDialog
        open={isUpgradeDialogOpen}
        onOpenChange={setIsUpgradeDialogOpen}
        feature="assistant"
        currentPlanName={t(`plans:plans.${currentPlanKey}.name`)}
        currentLimit={planState?.ai_daily_limit ?? dailyRequestLimit ?? 3}
        targetLimit={20}
      />

      <Dialog
        open={Boolean(tableDialogData)}
        onOpenChange={(open) => {
          if (!open) setTableDialogData(null);
        }}
      >
        <DialogContent className="h-[92vh] w-[96vw] max-w-[1480px] overflow-hidden rounded-2xl border border-border/70 bg-background/95 p-0 shadow-[0_40px_90px_-50px_rgba(0,0,0,0.55)]">
          {tableDialogData && (
            <div className="flex h-full flex-col p-4 md:p-6">
              <DialogHeader className="mb-3 pr-8">
                <DialogTitle className="text-base md:text-lg">
                  {t("assistant:chat.tableDialogTitle", {
                    defaultValue: "Tabla ampliada"
                  })}
                </DialogTitle>
                <DialogDescription>
                  {t("assistant:chat.tableDialogDescription", {
                    defaultValue:
                      "Vista ampliada para revisar la tabla completa con mayor comodidad."
                  })}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1">
                {renderAssistantTable(tableDialogData, "table-dialog", true)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                    onClick={() => fitMindMapToView(250)}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-secondary/70"
                  >
                    {t("assistant:chat.centerMindMap")}
                  </button>
                </div>

                <div
                  ref={mindMapViewportRef}
                  className={`relative h-full overflow-hidden p-5 select-none touch-none ${
                    isMindMapPanning ? "cursor-grabbing" : "cursor-grab"
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
                      "Arrastra para mover. Rueda para acercar/alejar."
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
    </>
  );
};

export default AssistantIA;

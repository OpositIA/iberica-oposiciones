import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Loader2, MessageCircle, Plus, Send, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/auth/AuthProvider";
import { AuthSessionError, secureApiFetch } from "@/lib/secureFetch";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  time: string;
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

const estadosEscrituraIA = [
  "Buscando informacion relevante...",
  "Organizando el contenido por bloques...",
  "Redactando una respuesta clara...",
  "Comprobando detalles finales...",
];
const DAILY_USAGE_TIMEZONE = "Europe/Madrid";

const formatHora = (value?: string | Date) =>
  new Date(value ?? Date.now()).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

const formatFechaHistorial = (value: string) =>
  new Date(value).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });

const truncateTitle = (value: string, max = 42) => {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "Nuevo chat";
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
};

const mapConversation = (row: Tables<"ai_conversations">): ConversationItem => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  lastMessageAt: row.last_message_at,
});

const AssistantIA = () => {
  const { toast } = useToast();
  const { user, isAuthReady } = useAuth();
  const [inputChat, setInputChat] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [estadoEscrituraIdx, setEstadoEscrituraIdx] = useState(0);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [mensajes, setMensajes] = useState<ChatMessage[]>([]);
  const [dailyUsedRequests, setDailyUsedRequests] = useState(0);
  const [dailyRequestLimit, setDailyRequestLimit] = useState(0);
  const [isLoadingDailyUsage, setIsLoadingDailyUsage] = useState(true);
  const remainingDailyRequests = Math.max(dailyRequestLimit - dailyUsedRequests, 0);
  const isDailyLimitReached = Boolean(currentUserId) && !isLoadingDailyUsage && remainingDailyRequests <= 0;
  const dailyUsagePercent = dailyRequestLimit > 0 ? Math.min((dailyUsedRequests / dailyRequestLimit) * 100, 100) : 0;

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
          title: "No se pudo cargar el historial",
          description: error.message,
        });
        return null;
      }

      return (data ?? []).map(mapConversation);
    },
    [toast],
  );

  const createConversationRecord = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from("ai_conversations")
        .insert({ user_id: userId, title: "Nuevo chat" })
        .select("id, title, created_at, last_message_at")
        .single();

      if (error || !data) {
        toast({
          variant: "destructive",
          title: "No se pudo crear el chat",
          description: error?.message ?? "Error inesperado al crear una conversacion.",
        });
        return null;
      }

      return mapConversation(data as Tables<"ai_conversations">);
    },
    [toast],
  );

  const refreshConversations = useCallback(async () => {
    if (!currentUserId) return;
    const data = await getConversations(currentUserId);
    if (data) setConversations(data);
  }, [currentUserId, getConversations]);

  const refreshDailyUsage = useCallback(
    async (userId: string) => {
      setIsLoadingDailyUsage(true);
      const { data, error } = await supabase.rpc("get_ai_daily_quota", {
        p_user_id: userId,
        p_tz: DAILY_USAGE_TIMEZONE,
      });

      const row = data?.[0];
      if (error || !row) {
        setDailyRequestLimit((prev) => (prev > 0 ? prev : 10));
        setIsLoadingDailyUsage(false);
        return;
      }

      const nextLimit =
        typeof row.limit === "number" && Number.isFinite(row.limit) && row.limit > 0 ? Math.floor(row.limit) : 0;
      const nextUsed =
        typeof row.used === "number" && Number.isFinite(row.used) ? Math.max(0, Math.floor(row.used)) : 0;

      setDailyRequestLimit(nextLimit);
      setDailyUsedRequests(nextUsed);
      setIsLoadingDailyUsage(false);
    },
    [],
  );

  const consumeDailyQuota = useCallback(
    async (userId: string): Promise<DailyQuotaResult | null> => {
      const { data, error } = await supabase.rpc("consume_ai_daily_quota", {
        p_user_id: userId,
        p_tz: DAILY_USAGE_TIMEZONE,
      });

      const row = data?.[0];
      if (error || !row) {
        toast({
          variant: "destructive",
          title: "No se pudo validar el limite diario",
          description: error?.message ?? "No se pudo comprobar la cuota de IA.",
        });
        return null;
      }

      const nextLimit =
        typeof row.limit === "number" && Number.isFinite(row.limit) && row.limit > 0
          ? Math.floor(row.limit)
          : 0;
      const nextUsed =
        typeof row.used === "number" && Number.isFinite(row.used) ? Math.max(0, Math.floor(row.used)) : 0;
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
        remaining: nextRemaining,
      };
    },
    [toast],
  );

  const loadMessages = useCallback(
    async (conversationId: string) => {
      setIsLoadingMessages(true);

      const { data, error } = await supabase
        .from("ai_messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) {
        toast({
          variant: "destructive",
          title: "No se pudo cargar la conversacion",
          description: error.message,
        });
        setMensajes([]);
        setIsLoadingMessages(false);
        return;
      }

      const mapped = (data ?? []).map((row) => ({
        id: `db-${row.id}`,
        role: (row.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
        content: row.content,
        time: formatHora(row.created_at),
      }));

      setMensajes(mapped);
      setIsLoadingMessages(false);
    },
    [toast],
  );

  useEffect(() => {
    if (!isAuthReady) return;

    const userId = user?.id ?? null;
    setCurrentUserId(userId);

    if (!userId) {
      setConversations([]);
      setActiveConversationId(null);
      setMensajes([]);
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
  }, [createConversationRecord, getConversations, isAuthReady, refreshDailyUsage, user?.id]);

  useEffect(() => {
    if (!activeConversationId) {
      setMensajes([]);
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
  }, [isSendingChat]);

  useEffect(() => {
    const node = chatContainerRef.current;
    if (!node) return;
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
      if (typeof firstChoice?.message?.content === "string") {
        return firstChoice.message.content.trim();
      }
      if (typeof firstChoice?.text === "string") {
        return firstChoice.text.trim();
      }
    }

    return "";
  };

  const renderInlineMarkdown = (text: string, keyPrefix: string) =>
    text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((segment, index) => {
      const strongMatch = segment.match(/^\*\*(.+)\*\*$/);
      if (strongMatch) {
        return (
          <strong key={`${keyPrefix}-strong-${index}`} className="font-semibold">
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
        <ul key={`${keyPrefix}-list-${lineIndex}`} className="list-disc pl-5 space-y-1">
          {bulletItems.map((item, itemIndex) => (
            <li key={`${keyPrefix}-item-${lineIndex}-${itemIndex}`} className="text-sm leading-relaxed">
              {renderInlineMarkdown(item, `${keyPrefix}-item-content-${lineIndex}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
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
          <h3 key={`${keyPrefix}-h3-${lineIndex}`} className="text-sm font-semibold tracking-wide mt-2">
            {renderInlineMarkdown(h3Match[1], `${keyPrefix}-h3-content-${lineIndex}`)}
          </h3>,
        );
        return;
      }

      const h4Match = line.match(/^####\s+(.+)$/);
      if (h4Match) {
        blocks.push(
          <h4 key={`${keyPrefix}-h4-${lineIndex}`} className="text-sm font-semibold text-muted-foreground">
            {renderInlineMarkdown(h4Match[1], `${keyPrefix}-h4-content-${lineIndex}`)}
          </h4>,
        );
        return;
      }

      blocks.push(
        <p key={`${keyPrefix}-p-${lineIndex}`} className="text-sm leading-relaxed">
          {renderInlineMarkdown(line, `${keyPrefix}-p-content-${lineIndex}`)}
        </p>,
      );
    });

    flushBulletItems(lines.length + 1);

    if (blocks.length === 0) {
      return <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>;
    }

    return <div className="space-y-2">{blocks}</div>;
  };

  const onCreateConversation = async () => {
    if (!currentUserId || isCreatingConversation) return;

    setIsCreatingConversation(true);
    const created = await createConversationRecord(currentUserId);
    setIsCreatingConversation(false);

    if (!created) return;

    setConversations((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
    setActiveConversationId(created.id);
    setInputChat("");
    setMensajes([]);
  };

  const onSelectConversation = (conversationId: string) => {
    if (isSendingChat) return;
    setActiveConversationId(conversationId);
  };

  const onSubmitChat = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const texto = inputChat.trim();
    if (!texto || isSendingChat || !currentUserId) return;
    if (isDailyLimitReached) {
      toast({
        variant: "destructive",
        title: "Limite diario alcanzado",
        description: `Ya has usado ${dailyUsedRequests}/${dailyRequestLimit} peticiones hoy.`,
      });
      return;
    }

    const quota = await consumeDailyQuota(currentUserId);
    if (!quota) return;
    if (!quota.allowed) {
      toast({
        variant: "destructive",
        title: "Limite diario alcanzado",
        description: `Ya has usado ${quota.used}/${quota.limit} peticiones hoy.`,
      });
      return;
    }

    let conversationId = activeConversationId;

    if (!conversationId) {
      const created = await createConversationRecord(currentUserId);
      if (!created) return;
      setConversations((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setActiveConversationId(created.id);
      conversationId = created.id;
    }

    const shouldRenameConversation =
      (conversations.find((conv) => conv.id === conversationId)?.title ?? "Nuevo chat") === "Nuevo chat";

    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: texto,
      time: formatHora(),
    };

    setMensajes((prev) => [...prev, userMessage]);
    setInputChat("");
    setIsSendingChat(true);

    try {
      const { error: userMessageError } = await supabase.from("ai_messages").insert({
        conversation_id: conversationId,
        user_id: currentUserId,
        role: "user",
        content: texto,
      });

      if (userMessageError) {
        throw new Error(`No se pudo guardar tu mensaje: ${userMessageError.message}`);
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
            prev.map((conv) => (conv.id === conversationId ? { ...conv, title: newTitle } : conv)),
          );
        }
      }

      const mensajesConContexto = [...mensajes, userMessage];
      const history: GeminiHistoryItem[] = mensajesConContexto
        .filter((m) => m.content.trim().length > 0)
        .slice(-20)
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      const response = await secureApiFetch("http://localhost:3001/api/gemini-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: texto, history }),
      });

      const payload = await response.json().catch(() => ({}));
      const assistantText = extraerTextoRespuesta(payload);
      const usage = payload as { used?: unknown; limit?: unknown };

      if (typeof usage.used === "number" && Number.isFinite(usage.used)) {
        setDailyUsedRequests(Math.max(0, Math.floor(usage.used)));
      }
      if (typeof usage.limit === "number" && Number.isFinite(usage.limit) && usage.limit > 0) {
        setDailyRequestLimit(Math.floor(usage.limit));
      }

      if (!response.ok) {
        if (response.status === 429) {
          const usedAtLimit =
            typeof usage.used === "number" && Number.isFinite(usage.used)
              ? Math.max(0, Math.floor(usage.used))
              : dailyRequestLimit;
          setDailyUsedRequests(usedAtLimit);
          if (typeof usage.limit === "number" && Number.isFinite(usage.limit) && usage.limit > 0) {
            setDailyRequestLimit(Math.floor(usage.limit));
          }
          throw new Error("Has alcanzado tu limite diario de peticiones IA. Vuelve manana.");
        }
        throw new Error(assistantText || "No se pudo obtener respuesta del asistente.");
      }

      const assistantFinalText =
        assistantText ||
        "No he podido interpretar la respuesta del servidor. Revisa el formato del endpoint.";

      const { error: assistantMessageError } = await supabase.from("ai_messages").insert({
        conversation_id: conversationId,
        user_id: currentUserId,
        role: "assistant",
        content: assistantFinalText,
      });

      if (assistantMessageError) {
        throw new Error(`No se pudo guardar la respuesta de la IA: ${assistantMessageError.message}`);
      }

      setMensajes((prev) => [
        ...prev,
        {
          id: `local-assistant-${Date.now()}`,
          role: "assistant",
          content: assistantFinalText,
          time: formatHora(),
        },
      ]);

      void refreshConversations();
      void refreshDailyUsage(currentUserId);
    } catch (error) {
      const message = (() => {
        if (error instanceof AuthSessionError) {
          return "Sesion expirada o invalida. Debes iniciar sesion de nuevo.";
        }
        if (error instanceof Error) {
          return error.message;
        }
        return "Error de conexion con el endpoint http://localhost:3001/api/gemini-chat";
      })();

      setMensajes((prev) => [
        ...prev,
        {
          id: `local-error-${Date.now()}`,
          role: "assistant",
          content: `Error: ${message}`,
          time: formatHora(),
        },
      ]);
      void refreshDailyUsage(currentUserId);
    } finally {
      setIsSendingChat(false);
    }
  };

  return (
    <div className="grid min-h-[74vh] items-stretch gap-4 lg:-ml-4 lg:grid-cols-[18.5rem_minmax(0,1fr)]">
      <aside className="relative flex h-full min-h-[74vh] flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background/95 shadow-[0_26px_60px_-38px_rgba(0,0,0,0.42)]">
        <div className="pointer-events-none absolute -top-14 -left-14 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="border-b border-border/70 bg-gradient-to-br from-primary/10 via-background to-background px-4 py-4">
          <div className="mb-2">
            <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
              Historial
            </p>
            <h2 className="mt-1 text-sm font-semibold text-foreground">Tus conversaciones</h2>
          </div>
        </div>

        <div className="flex-1 min-h-0 space-y-2 overflow-y-auto p-3">
          {isLoadingConversations ? (
            <p className="py-3 text-sm text-muted-foreground">Cargando chats...</p>
          ) : conversations.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No hay conversaciones todavia.</p>
          ) : (
            conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onSelectConversation(conversation.id)}
                  disabled={isSendingChat}
                  className={`group w-full rounded-2xl border px-3 py-2.5 text-left transition-all ${
                    isActive
                      ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_10px_30px_-25px_rgba(255,119,0,0.95)]"
                      : "border-border/80 bg-background/90 text-foreground hover:-translate-y-[1px] hover:border-primary/30 hover:bg-secondary"
                  } ${isSendingChat ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isActive ? "bg-primary" : "bg-muted-foreground/40"
                      }`}
                    />
                    <p className="truncate text-sm font-medium">{conversation.title || "Nuevo chat"}</p>
                  </div>
                  <p className="mt-1 pl-3.5 text-[11px] text-muted-foreground">
                    {formatFechaHistorial(conversation.lastMessageAt)}
                  </p>
                </button>
              );
            })
          )}
        </div>

        <div className="mt-auto border-t border-border/70 bg-background/85 p-3 backdrop-blur">
          <button
            type="button"
            onClick={onCreateConversation}
            disabled={isCreatingConversation || isLoadingConversations || !currentUserId}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-3 text-xs font-semibold tracking-widest uppercase text-primary-foreground shadow-[0_16px_30px_-20px_rgba(255,119,0,0.95)] transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isCreatingConversation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Nuevo chat
          </button>
        </div>
      </aside>

      <section className="relative flex h-full min-h-[74vh] flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background/95 p-5 shadow-[0_26px_60px_-38px_rgba(0,0,0,0.42)] md:p-6">
        <div className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
        <div className="min-w-0 flex-1 min-h-0 flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="w-full">
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
                Chat IA
              </p>
              <h1 className="text-2xl font-serif text-foreground">Asistente de estudio</h1>
              <div
                className={`mt-3 rounded-2xl border px-3 py-2 ${
                  isDailyLimitReached ? "border-destructive/40 bg-destructive/10" : "border-border/70 bg-secondary/40"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Limite diario IA
                  </p>
                  <p
                    className={`text-xs font-semibold ${
                      isDailyLimitReached ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {isLoadingDailyUsage ? "..." : `${dailyUsedRequests}/${dailyRequestLimit}`}
                  </p>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/70">
                  <div
                    className={`h-full transition-all ${
                      isDailyLimitReached ? "bg-destructive" : "bg-primary"
                    }`}
                    style={{ width: `${dailyUsagePercent}%` }}
                  />
                </div>
                <p className={`mt-2 text-[11px] ${isDailyLimitReached ? "text-destructive" : "text-muted-foreground"}`}>
                  {isLoadingDailyUsage
                    ? "Comprobando peticiones de hoy..."
                    : isDailyLimitReached
                      ? "Has alcanzado el limite diario. Vuelve manana."
                      : `Te quedan ${remainingDailyRequests} peticiones hoy.`}
                </p>
              </div>
            </div>
          </div>

          <div
            ref={chatContainerRef}
            className="flex-1 min-h-[20rem] space-y-3 overflow-y-auto rounded-3xl border border-border/70 bg-gradient-to-b from-secondary/30 via-secondary/15 to-background p-4"
          >
            {isLoadingMessages ? (
              <div className="flex h-full min-h-72 items-center justify-center text-sm text-muted-foreground">
                Cargando conversacion...
              </div>
            ) : (
              <>
                {mensajes.length === 0 && (
                  <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background shadow-sm">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">En que podemos ayudarte hoy?</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      Pide un plan de estudio, un repaso rapido o ayuda para un tema concreto.
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
                        {m.role === "assistant" ? "IA" : "Tu"}
                      </span>
                      <span className="text-[11px] opacity-70 ml-auto">{m.time}</span>
                    </div>
                    {m.role === "assistant" ? (
                      renderAssistantContent(m.content, `assistant-msg-${m.id}`)
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    )}
                  </div>
                ))}
                {isSendingChat && (
                  <div className="max-w-[88%] rounded-3xl border border-border/70 bg-background p-3 text-foreground shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span className="text-[11px] uppercase tracking-widest opacity-70">IA</span>
                      <span className="text-[11px] opacity-70 ml-auto">Escribiendo</span>
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
                    ? "Limite diario alcanzado. Vuelve manana."
                    : "Escribe tu pregunta para la IA..."
                }
                disabled={isDailyLimitReached}
                className="w-full bg-transparent py-3 text-sm focus:outline-none"
              />
              {isDailyLimitReached && <AlertTriangle className="h-4 w-4 text-destructive" />}
            </div>
            <button
              type="submit"
              disabled={isSendingChat || !currentUserId || isDailyLimitReached}
              className="inline-flex items-center gap-2 rounded-3xl bg-primary px-4 py-3 text-xs font-semibold tracking-widest uppercase text-primary-foreground shadow-[0_16px_30px_-20px_rgba(255,119,0,0.95)] transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {isSendingChat ? "Esperando..." : "Enviar"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
};

export default AssistantIA;

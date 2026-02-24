import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Loader2, MessageCircle, Plus, Send, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

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

const respuestasRapidas = [
  "Dame un plan de repaso para 7 dias",
  "En que temas estoy fallando mas",
  "Como subir 1 punto en el proximo simulacro",
];

const estadosEscrituraIA = [
  "Buscando informacion relevante...",
  "Organizando el contenido por bloques...",
  "Redactando una respuesta clara...",
  "Comprobando detalles finales...",
];

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

  const activeConversation = useMemo(
    () => conversations.find((conv) => conv.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
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
    const bootstrap = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        toast({
          variant: "destructive",
          title: "No se pudo iniciar el chat",
          description: error.message,
        });
        setIsLoadingConversations(false);
        return;
      }

      const userId = data.user?.id ?? null;
      setCurrentUserId(userId);

      if (!userId) {
        setIsLoadingConversations(false);
        return;
      }

      const loadedConversations = await getConversations(userId);

      if (!loadedConversations) {
        setIsLoadingConversations(false);
        return;
      }

      if (loadedConversations.length === 0) {
        const created = await createConversationRecord(userId);
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
  }, [createConversationRecord, getConversations, toast]);

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

      const response = await fetch("http://localhost:3001/api/gemini-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: texto, history }),
      });

      const payload = await response.json();
      const assistantText = extraerTextoRespuesta(payload);

      if (!response.ok) {
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
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error de conexion con el endpoint http://localhost:3001/api/gemini-chat";

      setMensajes((prev) => [
        ...prev,
        {
          id: `local-error-${Date.now()}`,
          role: "assistant",
          content: `Error: ${message}`,
          time: formatHora(),
        },
      ]);
    } finally {
      setIsSendingChat(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="border border-border bg-background/90 p-3 h-fit lg:sticky lg:top-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">Historial</p>
          <button
            type="button"
            onClick={onCreateConversation}
            disabled={isCreatingConversation || isLoadingConversations || !currentUserId}
            className="inline-flex items-center gap-1 border border-border px-2.5 py-1.5 text-[11px] font-semibold tracking-widest uppercase text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-60"
          >
            {isCreatingConversation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Nuevo chat
          </button>
        </div>

        <div className="max-h-[58vh] overflow-y-auto space-y-1 pr-1">
          {isLoadingConversations ? (
            <p className="text-sm text-muted-foreground py-3">Cargando chats...</p>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">No hay conversaciones todavia.</p>
          ) : (
            conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onSelectConversation(conversation.id)}
                  disabled={isSendingChat}
                  className={`w-full text-left border px-3 py-2 transition-colors ${
                    isActive
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background hover:bg-secondary text-foreground"
                  } ${isSendingChat ? "opacity-70 cursor-not-allowed" : ""}`}
                >
                  <p className="text-sm font-medium truncate">{conversation.title || "Nuevo chat"}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatFechaHistorial(conversation.lastMessageAt)}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="border border-border bg-background p-6 md:p-8">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
                Chat IA
              </p>
              <h1 className="text-2xl font-serif text-foreground">Asistente de estudio</h1>
              <p className="text-xs text-muted-foreground mt-1">
                {activeConversation?.title ?? "Sin conversacion activa"}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 border border-border px-3 py-1.5">
              <Brain className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                Online
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {respuestasRapidas.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setInputChat(prompt)}
                className="px-3 py-1.5 border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div
            ref={chatContainerRef}
            className="border border-border bg-secondary/20 h-[60vh] min-h-96 overflow-y-auto p-4 space-y-3"
          >
            {isLoadingMessages ? (
              <div className="h-full min-h-72 flex items-center justify-center text-sm text-muted-foreground">
                Cargando conversacion...
              </div>
            ) : (
              <>
                {mensajes.length === 0 && (
                  <div className="h-full min-h-72 flex items-center justify-center text-sm text-muted-foreground">
                    Empieza una conversacion con la IA.
                  </div>
                )}
                {mensajes.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] p-3 ${
                      m.role === "assistant"
                        ? "bg-background border border-border text-foreground"
                        : "ml-auto bg-primary text-primary-foreground"
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
                  <div className="max-w-[85%] p-3 bg-background border border-border text-foreground">
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
            <input
              value={inputChat}
              onChange={(e) => setInputChat(e.target.value)}
              placeholder="Escribe tu pregunta para la IA..."
              className="flex-1 border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-foreground"
            />
            <button
              type="submit"
              disabled={isSendingChat || !currentUserId}
              className="bg-primary text-primary-foreground px-4 py-3 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors inline-flex items-center gap-2 disabled:opacity-60"
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

import { FormEvent, useEffect, useRef, useState } from "react";
import { Brain, MessageCircle, Send, User } from "lucide-react";

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  content: string;
  time: string;
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

const formatHora = () =>
  new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

const AssistantIA = () => {
  const [inputChat, setInputChat] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [estadoEscrituraIdx, setEstadoEscrituraIdx] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [mensajes, setMensajes] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      content:
        "Hola, soy tu asistente IA. Estoy listo para ayudarte con tu plan de estudio.",
      time: formatHora(),
    },
  ]);

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
  }, [mensajes, isSendingChat, estadoEscrituraIdx]);

  const onSubmitChat = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const texto = inputChat.trim();
    if (!texto || isSendingChat) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: texto,
      time: formatHora(),
    };

    setMensajes((prev) => [...prev, userMessage]);
    setInputChat("");
    setIsSendingChat(true);

    try {
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

      setMensajes((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content:
            assistantText ||
            "No he podido interpretar la respuesta del servidor. Revisa el formato del endpoint.",
          time: formatHora(),
        },
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error de conexion con el endpoint http://localhost:3001/api/gemini-chat";

      setMensajes((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
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
    <section className="border border-border bg-background p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
                Chat IA
              </p>
              <h1 className="text-2xl font-serif text-foreground">Asistente de estudio</h1>
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

          <div ref={chatContainerRef} className="border border-border bg-secondary/20 h-[60vh] min-h-96 overflow-y-auto p-4 space-y-3">
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
              disabled={isSendingChat}
              className="bg-primary text-primary-foreground px-4 py-3 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              {isSendingChat ? "Esperando..." : "Enviar"}
            </button>
          </form>
    </section>
  );
};

export default AssistantIA;

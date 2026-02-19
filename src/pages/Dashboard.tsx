import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogOut,
  MessageCircle,
  Minus,
  Send,
  Settings,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";

type TestStatus = "Excelente" | "Aprobado" | "Reforzar";

type TestItem = {
  id: number;
  nombre: string;
  fecha: string;
  nota: number;
  precision: number;
  duracion: string;
  tendencia: "up" | "down" | "flat";
  estado: TestStatus;
};

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  content: string;
  time: string;
};

const historialTests: TestItem[] = [
  {
    id: 1,
    nombre: "Simulacro General #42",
    fecha: "18 Feb 2026",
    nota: 8.7,
    precision: 89,
    duracion: "38 min",
    tendencia: "up",
    estado: "Excelente",
  },
  {
    id: 2,
    nombre: "Bloque Constitucional",
    fecha: "16 Feb 2026",
    nota: 7.4,
    precision: 77,
    duracion: "29 min",
    tendencia: "up",
    estado: "Aprobado",
  },
  {
    id: 3,
    nombre: "Procedimiento Administrativo",
    fecha: "14 Feb 2026",
    nota: 6.1,
    precision: 68,
    duracion: "35 min",
    tendencia: "down",
    estado: "Reforzar",
  },
  {
    id: 4,
    nombre: "Ley Organica y Recursos",
    fecha: "12 Feb 2026",
    nota: 7.9,
    precision: 81,
    duracion: "31 min",
    tendencia: "flat",
    estado: "Aprobado",
  },
];

const respuestasRapidas = [
  "Dame un plan de repaso para 7 dias",
  "En que temas estoy fallando mas",
  "Como subir 1 punto en el proximo simulacro",
];

const formatHora = () =>
  new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

const Dashboard = () => {
  const [metaSemanal, setMetaSemanal] = useState(18);
  const [focusArea, setFocusArea] = useState("Constitucion y procedimiento");
  const [inputChat, setInputChat] = useState("");
  const [mensajes, setMensajes] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      content:
        "Hola, soy tu asistente IA. Te recomiendo priorizar fallos en procedimiento y hacer 2 simulacros esta semana.",
      time: formatHora(),
    },
  ]);

  const horasEstudio = 12.5;
  const progresoMeta = Math.min(100, Math.round((horasEstudio / metaSemanal) * 100));
  const mediaNota = useMemo(
    () =>
      (
        historialTests.reduce((acc, test) => acc + test.nota, 0) /
        historialTests.length
      ).toFixed(1),
    [],
  );

  const crearRespuestaIA = (texto: string) => {
    const prompt = texto.toLowerCase();
    if (prompt.includes("plan")) {
      return "Plan sugerido: 45 min teoria + 35 min test + 20 min correccion cada dia. Domingo: simulacro completo.";
    }
    if (prompt.includes("fall")) {
      return "Tu mayor fuga de puntos esta en preguntas de procedimiento. Dedica 3 bloques cortos a supuestos practicos.";
    }
    if (prompt.includes("simulacro") || prompt.includes("punto")) {
      return "Para subir 1 punto: reduce errores por prisa. Meta: 15% mas tiempo de revision en cada test.";
    }
    return "Buen enfoque. Si quieres, te genero ahora una rutina diaria personalizada segun tu disponibilidad.";
  };

  const onSubmitChat = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const texto = inputChat.trim();
    if (!texto) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: texto,
      time: formatHora(),
    };
    const botMessage: ChatMessage = {
      id: Date.now() + 1,
      role: "assistant",
      content: crearRespuestaIA(texto),
      time: formatHora(),
    };

    setMensajes((prev) => [...prev, userMessage, botMessage]);
    setInputChat("");
  };

  const statusClass: Record<TestStatus, string> = {
    Excelente: "bg-emerald-500/15 text-emerald-700",
    Aprobado: "bg-sky-500/15 text-sky-700",
    Reforzar: "bg-amber-500/15 text-amber-700",
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-charcoal/10 blur-3xl" />

      <header className="border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-sm font-bold tracking-widest uppercase text-foreground">
              OposiTest
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <button className="h-10 w-10 border border-border bg-background hover:bg-secondary transition-colors inline-flex items-center justify-center">
              <Bell className="h-4 w-4 text-muted-foreground" />
            </button>
            <button className="h-10 w-10 border border-border bg-background hover:bg-secondary transition-colors inline-flex items-center justify-center">
              <Settings className="h-4 w-4 text-muted-foreground" />
            </button>
            <Link
              to="/"
              className="h-10 px-4 border border-border hover:bg-secondary transition-colors text-xs font-semibold tracking-widest uppercase inline-flex items-center gap-2"
            >
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 lg:py-10">
        <section className="border border-border bg-background/95 mb-6 p-6 md:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-full bg-secondary border border-border flex items-center justify-center">
                <User className="h-6 w-6 text-foreground" />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
                  Area personal
                </p>
                <h1 className="text-2xl md:text-3xl font-serif text-foreground">
                  Hola, Oscar. Tu cuenta esta activa.
                </h1>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                  Plan Profesional. Ultimo acceso: hoy a las {formatHora()}.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="bg-primary text-primary-foreground px-5 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors">
                Iniciar test rapido
              </button>
              <button className="border border-border px-5 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors">
                Continuar tema
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-4 space-y-6">
            <div className="border border-border bg-background p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-serif text-foreground">Resumen</h2>
                <Sparkles className="h-4 w-4 text-primary" />
              </div>

              <div className="space-y-3">
                <div className="border border-border p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Tests completados</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">148</span>
                </div>
                <div className="border border-border p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Media global</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{mediaNota}/10</span>
                </div>
                <div className="border border-border p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Horas esta semana</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{horasEstudio} h</span>
                </div>
              </div>
            </div>

            <div className="border border-border bg-background p-6">
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-serif text-foreground">Meta semanal</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Ajusta tu objetivo de horas y sigue tu avance de forma visual.
              </p>
              <div className="flex items-center justify-between text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
                <span>Progreso</span>
                <span>{progresoMeta}%</span>
              </div>
              <div className="h-2 bg-secondary overflow-hidden mb-4">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progresoMeta}%` }}
                />
              </div>
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                Objetivo de horas
              </label>
              <input
                type="range"
                min={8}
                max={30}
                value={metaSemanal}
                onChange={(e) => setMetaSemanal(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-sm text-foreground mt-2">{metaSemanal} horas semanales</p>
            </div>

            <div className="border border-border bg-background p-6">
              <h2 className="text-lg font-serif text-foreground mb-4">Foco actual</h2>
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                Tema prioritario
              </label>
              <select
                value={focusArea}
                onChange={(e) => setFocusArea(e.target.value)}
                className="w-full border border-border bg-background text-sm text-foreground px-3 py-2 focus:outline-none focus:border-foreground"
              >
                <option>Constitucion y procedimiento</option>
                <option>Contratacion publica</option>
                <option>Gestion presupuestaria</option>
                <option>Jurisprudencia reciente</option>
              </select>
              <div className="mt-4 p-3 border border-border bg-secondary/40">
                <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
                  Recomendacion IA
                </p>
                <p className="text-sm text-foreground leading-relaxed">
                  Enfoca 2 bloques de 30 min en "{focusArea}" y cierra con un mini test de 15 preguntas.
                </p>
              </div>
            </div>
          </section>

          <section className="lg:col-span-8 space-y-6">
            <div className="border border-border bg-background p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
                    Historico test
                  </p>
                  <h2 className="text-xl font-serif text-foreground">Ultimos resultados</h2>
                </div>
                <button className="border border-border px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors">
                  Ver informe completo
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border border-border">
                  <thead className="bg-secondary/60">
                    <tr className="text-left">
                      <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                        Test
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                        Fecha
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                        Nota
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                        Precision
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                        Duracion
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialTests.map((test) => (
                      <tr key={test.id} className="border-t border-border">
                        <td className="px-4 py-3 text-sm text-foreground">{test.nombre}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {test.fecha}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-foreground">
                          {test.nota}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          <span className="inline-flex items-center gap-1">
                            {test.tendencia === "up" && (
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                            {test.tendencia === "down" && (
                              <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
                            )}
                            {test.tendencia === "flat" && (
                              <Minus className="h-3.5 w-3.5 text-amber-600" />
                            )}
                            {test.precision}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{test.duracion}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold ${statusClass[test.estado]}`}
                          >
                            {test.estado === "Excelente" && (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            {test.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-border bg-background p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
                    Chat IA
                  </p>
                  <h2 className="text-xl font-serif text-foreground">Asistente de estudio</h2>
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

              <div className="border border-border bg-secondary/20 h-80 overflow-y-auto p-4 space-y-3">
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
                    <p className="text-sm leading-relaxed">{m.content}</p>
                  </div>
                ))}
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
                  className="bg-primary text-primary-foreground px-4 py-3 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  Enviar
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;

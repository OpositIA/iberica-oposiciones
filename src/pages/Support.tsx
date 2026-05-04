import { useAuth } from "@/auth/AuthProvider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import CustomButton from "@/components/ui/custom-button";
import CustomInput from "@/components/ui/custom-input";
import CustomSelect from "@/components/ui/custom-select";
import CustomTextarea from "@/components/ui/custom-textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { resolveOppositionNameById } from "@/data/oposicionesDb";
import { useToast } from "@/hooks/use-toast";
import { normalizeLocale, type AppLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeCode, sanitizeSingleLineText } from "@/lib/inputSanitization";
import { isPaidPlan } from "@/lib/plans";
import {
  useOppositionOptionsQuery,
  useProfileDetailsQuery
} from "@/queries/profileQueries";
import {
  createCustomerPortalSession,
  useUserBillingIssueQuery,
  useUserPlanStateQuery
} from "@/queries/subscriptionQueries";
import { fetchQuickTestsDashboardBundle } from "@/queries/testQueries";
import {
  submitSupportContactForm,
  supportChannelAvailability
} from "@/support/supportApi";
import {
  sanitizeSupportContactForm,
  type SupportContactCategory,
  type SupportContactFormValues
} from "@/support/supportForms";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Send,
  Shield,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

type TabName = "help" | "profile" | "contact" | "tickets";
type RouteName =
  | TabName
  | "edit-profile"
  | "change-password"
  | "privacy"
  | "support-chat";
type RouteState = { name: RouteName; ticketId?: string };

// ─── FAQ Data ─────────────────────────────────────────────────────────────────

const FAQ_CATEGORIES = [
  { id: "all", label: "Todas" },
  { id: "account", label: "Cuenta" },
  { id: "billing", label: "Facturación" },
  { id: "tests", label: "Tests" },
  { id: "ia", label: "Asistente IA" },
  { id: "privacy", label: "Privacidad" }
] as const;

type FaqCat = "account" | "billing" | "tests" | "ia" | "privacy";

const FAQS: { cat: FaqCat; q: string; a: string }[] = [
  {
    cat: "account",
    q: "¿Cómo cambio mi correo electrónico?",
    a: "Desde Perfil → Editar perfil puedes actualizar tu nombre y datos básicos. El correo electrónico está vinculado a tu cuenta de acceso y requiere verificación para cambios sensibles."
  },
  {
    cat: "account",
    q: "He olvidado mi contraseña, ¿cómo la recupero?",
    a: 'En la pantalla de inicio de sesión pulsa "¿Olvidaste tu contraseña?". Recibirás un correo con un enlace válido durante 30 minutos para definir una nueva. Si no llega, revisa la carpeta de spam.'
  },
  {
    cat: "account",
    q: "¿Puedo eliminar mi cuenta y mis datos?",
    a: "Sí. En Perfil → Privacidad y datos puedes solicitar el borrado completo. Procesamos la petición en 72 horas y eliminamos progreso, historial y datos personales conforme al RGPD. Las facturas se conservan por obligación fiscal."
  },
  {
    cat: "billing",
    q: "¿Cuándo se renueva mi suscripción?",
    a: "Tu plan se renueva automáticamente el mismo día del mes en que te suscribiste. Recibirás un recordatorio por email 3 días antes. Puedes cancelar en cualquier momento desde el portal de facturación."
  },
  {
    cat: "billing",
    q: "¿Cómo descargo mis facturas?",
    a: "Las facturas en PDF están disponibles en el portal de facturación, accesible desde Perfil → Suscripción y facturación. Cada cargo genera una factura automática con tus datos fiscales."
  },
  {
    cat: "billing",
    q: "¿Puedo cambiar de plan a mitad de mes?",
    a: "Sí. Al subir de plan se aplica de inmediato y solo cobramos la diferencia prorrateada por los días restantes. Al bajar, el cambio es efectivo en el siguiente ciclo."
  },
  {
    cat: "tests",
    q: "¿Por qué un test marca mi respuesta como incorrecta?",
    a: 'Si detectas un error en un enunciado o respuesta, repórtalo desde el botón "Reportar" al finalizar el test. Nuestro equipo lo revisa en menos de 48h.'
  },
  {
    cat: "tests",
    q: "¿Puedo repetir un test y mantener el historial?",
    a: "Sí. Cada intento se guarda como una sesión separada. La nota más alta se considera tu mejor resultado y verás la evolución completa en tus estadísticas."
  },
  {
    cat: "tests",
    q: "¿Cómo se calcula la nota final?",
    a: "Aplicamos el sistema oficial: aciertos suman 1, fallos restan en función del número de opciones (1/3 con 4 opciones), y las preguntas en blanco no restan."
  },
  {
    cat: "ia",
    q: "¿La AsistenteIA tiene información oficial actualizada?",
    a: "Sí. Actualizamos el contenido periódicamente con el BOE y las convocatorias publicadas. La IA cita siempre la fuente legal y la fecha de actualización."
  },
  {
    cat: "ia",
    q: "¿Cuántas consultas puedo hacer al día?",
    a: "En el plan de pago las consultas son ilimitadas. En el plan Gratuito tienes un número limitado de consultas diarias que se reinicia a las 00:00 hora peninsular."
  },
  {
    cat: "privacy",
    q: "¿Qué datos personales guardáis y para qué?",
    a: "Guardamos tu nombre, correo, progreso de estudio y datos de facturación. Los usamos solo para prestarte el servicio y nunca los compartimos con terceros sin tu consentimiento."
  }
];

// ─── Demo tickets ─────────────────────────────────────────────────────────────

type TicketStatus = "open" | "awaiting" | "resolved";

type SupportTicket = {
  id: string;
  subject: string;
  topic: string;
  status: TicketStatus;
  lastUpdate: string;
  messages: number;
  unread?: boolean;
  rating?: number;
};

const DEMO_TICKETS: SupportTicket[] = [
  {
    id: "#OP-2148",
    subject: "Problema con la facturación del mes",
    topic: "Facturación",
    status: "open",
    lastUpdate: "hace 12 min",
    messages: 3,
    unread: true
  },
  {
    id: "#OP-2102",
    subject: "Pregunta marcada incorrectamente en test",
    topic: "Tests",
    status: "awaiting",
    lastUpdate: "hace 2 días",
    messages: 6
  },
  {
    id: "#OP-2087",
    subject: "Cambio de datos de perfil",
    topic: "Cuenta",
    status: "resolved",
    lastUpdate: "hace 5 días",
    messages: 4,
    rating: 5
  }
];

// ─── Small primitives ─────────────────────────────────────────────────────────

const Panel = ({
  children,
  className = "",
  onClick
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    className={`rounded-[1.75rem] border border-border/70 bg-card shadow-[0_22px_50px_-40px_rgba(15,23,42,0.28)] dark:shadow-[0_28px_60px_-46px_rgba(0,0,0,0.5)] ${className}`}
  >
    {children}
  </div>
);

const Overline = ({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <p
    className={`text-[11px] font-bold tracking-[0.3em] uppercase text-primary ${className}`}
  >
    {children}
  </p>
);

const PageHeader = ({
  overline,
  title,
  desc,
  onBack,
  action
}: {
  overline?: string;
  title: string;
  desc?: string;
  onBack: () => void;
  action?: React.ReactNode;
}) => (
  <div className="flex items-start justify-between gap-5 mb-6">
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 mb-3 text-[11px] font-bold tracking-[0.22em] uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Volver
      </button>
      {overline && <Overline className="mb-2">{overline}</Overline>}
      <h1 className="text-[2rem] leading-[1.1] font-serif text-foreground mb-2">
        {title}
      </h1>
      {desc && (
        <p className="text-sm leading-relaxed text-muted-foreground max-w-[600px]">
          {desc}
        </p>
      )}
    </div>
    {action}
  </div>
);

const inputCls =
  "w-full border border-border/70 rounded-xl px-4 py-3 text-sm text-foreground bg-background dark:bg-card outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10 disabled:opacity-60 disabled:cursor-not-allowed";

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const TabBar = ({
  active,
  onChange
}: {
  active: TabName;
  onChange: (t: TabName) => void;
}) => {
  const tabs: { id: TabName; label: string }[] = [
    { id: "profile", label: "Mi perfil" },
    { id: "help", label: "Centro de ayuda" },
    { id: "contact", label: "Contactar" },
    { id: "tickets", label: "Mis consultas" }
  ];
  return (
    <div className="flex flex-wrap gap-x-6 border-b border-border mb-6">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`whitespace-nowrap py-2.5 text-[13px] font-bold transition-colors border-b-2 -mb-px flex-none ${
            active === t.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
};

// ─── HELP CENTER ──────────────────────────────────────────────────────────────

const HelpCenter = ({ go }: { go: (r: RouteName) => void }) => {
  const [cat, setCat] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return FAQS.filter((f) => {
      if (cat !== "all" && f.cat !== cat) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q);
      }
      return true;
    });
  }, [cat, query]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
      <div className="flex flex-col gap-5">
        {/* Hero search */}
        <Panel className="p-7 relative overflow-hidden">
          <div
            className="absolute -top-10 -right-10 w-44 h-44 rounded-full pointer-events-none"
            style={{
              background: "hsl(25 95% 53% / 0.10)",
              filter: "blur(60px)"
            }}
          />
          <div className="relative z-10">
            <Overline className="mb-2.5">Centro de ayuda</Overline>
            <h1 className="text-[2rem] leading-[1.1] font-serif text-foreground mb-1.5">
              ¿En qué podemos ayudarte?
            </h1>
            <p className="text-sm text-muted-foreground mb-4 max-w-[540px]">
              Busca en preguntas frecuentes o escríbenos. Respondemos en menos
              de 24 horas hábiles.
            </p>
            <div className="flex items-center gap-2.5 border border-border/70 rounded-[14px] px-4 py-3 bg-background dark:bg-card/60 max-w-[540px]">
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ej: ¿Cómo cancelo mi suscripción?"
                className="flex-1 border-none outline-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
        </Panel>

        {/* Category chips */}
        <div className="flex flex-wrap gap-2">
          {FAQ_CATEGORIES.map((c) => {
            const active = cat === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-semibold transition-all ${
                  active
                    ? "bg-primary border-primary text-white"
                    : "bg-card border-border/70 text-foreground hover:border-primary/40"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* FAQ accordion */}
        <Panel className="p-2">
          {filtered.length === 0 ? (
            <div className="py-12 px-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3 text-muted-foreground">
                <Search className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-foreground mb-1">
                No encontramos resultados para "{query}"
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Escríbenos y un humano del equipo te ayudará.
              </p>
              <CustomButton
                type="button"
                styleType="primary"
                radius="full"
                size="sm"
                onClick={() => go("contact")}
              >
                <Send className="h-3.5 w-3.5" />
                Contactar
              </CustomButton>
            </div>
          ) : (
            <Accordion type="single" collapsible className="px-2">
              {filtered.map((f, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="border-border/60 last:border-0"
                >
                  <AccordionTrigger className="py-4 text-left text-sm font-semibold text-foreground hover:no-underline gap-3">
                    <span className="flex-1">{f.q}</span>
                    <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground flex-none">
                      {FAQ_CATEGORIES.find((c) => c.id === f.cat)?.label}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pl-1 text-sm text-muted-foreground leading-relaxed">
                    {f.a}
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/60">
                      <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
                        ¿Útil?
                      </span>
                      <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        👍
                      </button>
                      <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        👎
                      </button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </Panel>
      </div>

      {/* Right sidebar */}
      <div className="flex flex-col gap-4 xl:sticky xl:top-6">
        <Panel className="p-5">
          <Overline className="mb-3">¿No encuentras respuesta?</Overline>
          <h3 className="text-[1.2rem] font-serif text-foreground mb-3 leading-snug">
            Habla con una persona.
          </h3>
          <div
            onClick={() => go("contact")}
            className="flex items-center gap-3 py-2.5 border-b border-border/60 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-[10px] bg-secondary flex items-center justify-center text-primary flex-shrink-0">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-foreground flex items-center gap-2">
                Formulario de contacto
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
              </div>
              <div className="text-[11px] text-muted-foreground">
                Respondemos en menos de 24h
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 py-2.5">
            <div className="w-8 h-8 rounded-[10px] bg-secondary flex items-center justify-center text-primary flex-shrink-0">
              <Mail className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-foreground">
                support@ibericaoposiciones.es
              </div>
              <div className="text-[11px] text-muted-foreground">
                Respuesta en menos de 24h
              </div>
            </div>
          </div>
          <CustomButton
            type="button"
            styleType="primary"
            radius="full"
            size="sm"
            className="w-full mt-3"
            onClick={() => go("contact")}
          >
            <Send className="h-3.5 w-3.5" />
            Abrir consulta
          </CustomButton>
        </Panel>

        <Panel className="p-5">
          <Overline className="mb-2">Mis consultas</Overline>
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
            Tienes{" "}
            <strong className="text-foreground">1 conversación abierta</strong>{" "}
            y 2 resueltas.
          </p>
          <button
            onClick={() => go("tickets")}
            className="inline-flex items-center gap-1.5 text-primary text-[11px] font-bold tracking-[0.18em] uppercase hover:opacity-80 transition-opacity"
          >
            Ver historial completo <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              Estado del sistema
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-green-600 dark:text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.2)]" />
              Operativo
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Todos los servicios funcionan con normalidad.
          </p>
        </Panel>
      </div>
    </div>
  );
};

// ─── PROFILE HUB ──────────────────────────────────────────────────────────────

const ProfileHub = ({
  go,
  openDeleteModal
}: {
  go: (r: RouteName) => void;
  openDeleteModal: () => void;
}) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation("profile");
  const shouldLoad = Boolean(user?.id);
  const [isOpeningPaymentPortal, setIsOpeningPaymentPortal] = useState(false);
  const { data: profileDetails } = useProfileDetailsQuery(
    shouldLoad ? user?.id : null
  );
  const { data: planState } = useUserPlanStateQuery(
    shouldLoad ? user?.id : null
  );
  const { data: billingIssue } = useUserBillingIssueQuery(
    shouldLoad ? user?.id : null
  );
  const { data: oppositionOptions = [] } = useOppositionOptionsQuery("es");
  const { data: dashboardBundle, isLoading: isDashboardStatsLoading } =
    useQuery({
      queryKey: user?.id
        ? ["quick-tests", "dashboard-bundle", user.id]
        : ["quick-tests", "dashboard-bundle", "guest"],
      queryFn: () => fetchQuickTestsDashboardBundle(user?.id as string),
      enabled: shouldLoad,
      staleTime: 30_000,
      refetchOnMount: "always",
      refetchOnWindowFocus: "always",
      refetchOnReconnect: true
    });

  const firstName = profile?.firstName ?? "";
  const lastName = profile?.lastName ?? "";
  const email = profile?.email ?? user?.email ?? "";
  const avatarUrl = profileDetails?.avatar_url ?? "";
  const oppositionId = String(profileDetails?.preferred_opposition_id ?? "");
  const oppositionName =
    resolveOppositionNameById(oppositionId, oppositionOptions) ||
    "Sin oposición seleccionada";
  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "U";
  const isPaid = isPaidPlan(planState);
  const hasPaymentMethodManagement = isPaid || Boolean(billingIssue);
  const dashboardStats = dashboardBundle?.stats;
  const hasDashboardStats =
    Boolean(dashboardStats) && dashboardStats.completedTests > 0;
  const activityFallback = isDashboardStatsLoading ? "..." : "-";
  const completedTestsValue = dashboardStats
    ? dashboardStats.completedTests.toString()
    : activityFallback;
  const globalAverageValue = hasDashboardStats
    ? dashboardStats.averageScore.toFixed(1)
    : activityFallback;
  const averageAccuracyValue = dashboardStats
    ? `${dashboardStats.averageAccuracy}%`
    : activityFallback;

  const handleManagePlan = async () => {
    if (!hasPaymentMethodManagement) {
      window.location.assign("/perfil/planes");
      return;
    }

    setIsOpeningPaymentPortal(true);
    try {
      const { portalUrl } = await createCustomerPortalSession({
        returnPath: "/perfil/mi-perfil"
      });

      toast({
        title: t("myProfile.toasts.paymentPortalRedirectTitle"),
        description: t("myProfile.toasts.paymentPortalRedirectDescription")
      });

      window.location.assign(portalUrl);
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("myProfile.toasts.paymentPortalRedirectErrorTitle"),
        description:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : t("myProfile.toasts.paymentPortalRedirectErrorDescription")
      });
    } finally {
      setIsOpeningPaymentPortal(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
      <div className="flex flex-col gap-4">
        {/* Profile card */}
        <Panel className="p-6">
          <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center text-white font-serif text-2xl flex-shrink-0 shadow-[0_14px_30px_-16px_rgba(249,115,22,0.5)] overflow-hidden">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${firstName} ${lastName}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <Overline className="mb-1.5">
                {isPaid ? "Plan profesional" : "Plan gratuito"}
              </Overline>
              <h2 className="text-[1.4rem] font-serif text-foreground mb-1 leading-snug">
                {firstName} {lastName}
              </h2>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
            <CustomButton
              type="button"
              styleType="menu"
              radius="full"
              size="sm"
              className="flex-shrink-0"
              onClick={() => go("edit-profile")}
            >
              Editar
            </CustomButton>
          </div>
        </Panel>

        {/* Field rows */}
        <Panel className="py-1 overflow-hidden">
          <FieldRow
            label="Nombre completo"
            value={`${firstName} ${lastName}`.trim() || "—"}
          />
          <FieldRow label="Correo electrónico" value={email || "—"} />
          <FieldRow label="Oposición objetivo" value={oppositionName} last />
        </Panel>

        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ActionCard
            icon={<Lock className="h-4 w-4" />}
            title="Cambiar contraseña"
            desc="Mantén tu cuenta segura."
            onClick={() => go("change-password")}
          />
          <ActionCard
            icon={<Bell className="h-4 w-4" />}
            title="Notificaciones"
            desc="Configura tus preferencias de email."
          />
          <ActionCard
            icon={<CreditCard className="h-4 w-4" />}
            title="Suscripción y facturación"
            desc={isPaid ? "Plan profesional activo." : "Plan gratuito."}
          />
          <ActionCard
            icon={<Shield className="h-4 w-4" />}
            title="Privacidad y datos"
            desc="Exportar o eliminar tu información."
            onClick={() => go("privacy")}
          />
        </div>
      </div>

      {/* Right sidebar */}
      <div className="flex flex-col gap-4 xl:sticky xl:top-6">
        <Panel className="p-5">
          <Overline className="mb-4">Tu actividad</Overline>
          <StatRow label="Tests completados" value={completedTestsValue} />
          <StatRow label="Media global" value={globalAverageValue} />
          <StatRow label="Precisión media" value={averageAccuracyValue} last />
        </Panel>
        <Panel className="p-5 bg-foreground border-0 dark:bg-card dark:border dark:border-border/70">
          <Overline className="text-white/50 dark:text-primary mb-2.5">
            {isPaid ? "Plan profesional" : "Plan gratuito"}
          </Overline>
          <h3 className="text-[1.2rem] font-serif text-white dark:text-foreground mb-2 leading-snug">
            {isPaid
              ? "Tienes todo desbloqueado."
              : "Actualiza para desbloquear todo."}
          </h3>
          <p className="text-[12px] text-white/60 dark:text-muted-foreground mb-4 leading-relaxed">
            {isPaid
              ? "Tests ilimitados, AsistenteIA y temario completo."
              : "Accede a tests ilimitados y al AsistenteIA."}
          </p>
          <button
            type="button"
            onClick={() => {
              void handleManagePlan();
            }}
            disabled={isOpeningPaymentPortal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 dark:border-border bg-white/6 dark:bg-secondary text-white dark:text-foreground text-[11px] font-bold tracking-[0.22em] uppercase cursor-pointer transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isOpeningPaymentPortal && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            {isOpeningPaymentPortal
              ? t("myProfile.paymentSection.opening")
              : t("myProfile.paymentSection.cta")}
          </button>
        </Panel>
      </div>
    </div>
  );
};

const FieldRow = ({
  label,
  value,
  last,
  onEdit
}: {
  label: string;
  value: string;
  last?: boolean;
  onEdit?: () => void;
}) => (
  <div
    className={`flex items-center px-6 py-4 ${last ? "" : "border-b border-border/60"}`}
  >
    <div className="w-44 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground flex-shrink-0">
      {label}
    </div>
    <div className="flex-1 text-sm text-foreground">{value}</div>
    {onEdit && (
      <button
        onClick={onEdit}
        className="text-[11px] font-bold tracking-[0.18em] uppercase text-primary hover:opacity-70 transition-opacity"
      >
        Editar
      </button>
    )}
  </div>
);

const ActionCard = ({
  icon,
  title,
  desc,
  danger,
  onClick
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  danger?: boolean;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    aria-disabled={onClick ? undefined : true}
    className={`rounded-[1.25rem] border border-border/70 bg-card p-4 flex gap-3 items-start transition-all ${
      onClick
        ? "cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_20px_50px_-28px_rgba(249,115,22,0.25)]"
        : "cursor-default border-border/45 bg-muted/25"
    }`}
  >
    <div
      className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${
        danger
          ? "bg-destructive/10 text-destructive"
          : onClick
            ? "bg-secondary text-primary"
            : "bg-background text-muted-foreground"
      }`}
    >
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div
        className={`text-sm font-bold mb-1 ${
          onClick ? "text-foreground" : "text-foreground/80"
        }`}
      >
        {title}
      </div>
      <div className="text-[12px] text-muted-foreground leading-relaxed">
        {desc}
      </div>
    </div>
    {onClick && (
      <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
    )}
  </div>
);

const StatRow = ({
  label,
  value,
  last
}: {
  label: string;
  value: string;
  last?: boolean;
}) => (
  <div
    className={`flex justify-between items-baseline py-2.5 ${last ? "" : "border-b border-border/60"}`}
  >
    <span className="text-[12px] text-muted-foreground">{label}</span>
    <span className="font-serif text-[1.3rem] text-foreground">{value}</span>
  </div>
);

// ─── EDIT PROFILE ─────────────────────────────────────────────────────────────

const EditProfile = ({
  go,
  showToast
}: {
  go: (r: RouteName) => void;
  showToast: (msg: string) => void;
}) => {
  const { user, profile, locale, applyLocale, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const { data: oppositionOptions = [] } = useOppositionOptionsQuery(locale);
  const { data: profileDetails } = useProfileDetailsQuery(
    user?.id ? user.id : null
  );

  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [lastName, setLastName] = useState(profile?.lastName ?? "");
  const [draftLocale, setDraftLocale] = useState<AppLocale>(
    locale as AppLocale
  );
  const [oppositionId, setOppositionId] = useState(
    String(profileDetails?.preferred_opposition_id ?? "")
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profileDetails?.preferred_opposition_id)
      setOppositionId(String(profileDetails.preferred_opposition_id));
  }, [profileDetails]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "El nombre es obligatorio.";
    if (!lastName.trim()) e.lastName = "El apellido es obligatorio.";
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    if (!user) return;
    setSaving(true);
    try {
      const cleanFirst = sanitizeSingleLineText(firstName, 80);
      const cleanLast = sanitizeSingleLineText(lastName, 120);
      const cleanOpp = sanitizeCode(oppositionId, 120);

      const { error } = await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          first_name: cleanFirst,
          last_name: cleanLast,
          full_name: `${cleanFirst} ${cleanLast}`.trim(),
          preferred_opposition_id: cleanOpp || null,
          locale: draftLocale
        },
        { onConflict: "user_id" }
      );

      if (error) {
        showToast("Error al guardar los cambios.");
        return;
      }

      if (draftLocale !== locale) await applyLocale(draftLocale);
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      await refreshProfile();
      showToast("Perfil actualizado correctamente.");
      go("profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[760px]">
      <PageHeader
        overline="Perfil"
        title="Editar tu información"
        desc="Mantén tus datos al día. Algunos cambios se reflejan de inmediato en toda la aplicación."
        onBack={() => go("profile")}
      />

      <Panel className="p-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
          <div>
            <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
              Nombre
            </label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputCls}
            />
            {errors.firstName && (
              <p className="mt-1.5 text-[12px] text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {errors.firstName}
              </p>
            )}
          </div>
          <div>
            <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
              Apellidos
            </label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputCls}
            />
            {errors.lastName && (
              <p className="mt-1.5 text-[12px] text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {errors.lastName}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
          <div>
            <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
              Correo electrónico
            </label>
            <input
              value={profile?.email ?? ""}
              disabled
              className={`${inputCls} opacity-60 cursor-not-allowed`}
            />
          </div>
          <div>
            <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
              Idioma de la app
            </label>
            <CustomSelect
              value={draftLocale}
              onChange={(e) =>
                setDraftLocale(normalizeLocale(e.target.value) as AppLocale)
              }
              className={`${inputCls} cursor-pointer`}
            >
              <option value="es">Español (España)</option>
              <option value="en">English</option>
            </CustomSelect>
          </div>
        </div>

        <div className="mb-6">
          <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            Oposición objetivo
          </label>
          <CustomSelect
            value={oppositionId}
            onChange={(e) => setOppositionId(e.target.value)}
            className={`${inputCls} cursor-pointer`}
          >
            <option value="">Selecciona una oposición</option>
            {oppositionOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </CustomSelect>
        </div>

        <div className="flex items-center justify-between pt-5 border-t border-border/60">
          <span className="text-[12px] text-muted-foreground">
            Los cambios se guardan en tu cuenta personal.
          </span>
          <div className="flex gap-2.5">
            <CustomButton
              type="button"
              styleType="ghost"
              radius="full"
              size="sm"
              onClick={() => go("profile")}
            >
              Cancelar
            </CustomButton>
            <CustomButton
              type="button"
              styleType="primary"
              radius="full"
              size="sm"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </CustomButton>
          </div>
        </div>
      </Panel>
    </div>
  );
};

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────

const ChangePassword = ({
  go,
  showToast
}: {
  go: (r: RouteName) => void;
  showToast: (msg: string) => void;
}) => {
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const checks = {
    len: pwd.length >= 8,
    upper: /[A-Z]/.test(pwd) && /[a-z]/.test(pwd),
    num: /\d/.test(pwd),
    sym: /[^A-Za-z0-9]/.test(pwd)
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const strength = ["Débil", "Aceptable", "Buena", "Excelente"][
    Math.max(0, passed - 1)
  ];
  const strengthColor = [
    "bg-destructive",
    "bg-amber-400",
    "bg-sky-500",
    "bg-green-500"
  ][Math.max(0, passed - 1)];

  const handleSave = async () => {
    const e: Record<string, string> = {};
    if (passed < 3) e.pwd = "La contraseña no cumple los requisitos mínimos.";
    if (pwd !== confirm) e.confirm = "Las contraseñas no coinciden.";
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) {
        showToast("Error al actualizar la contraseña.");
        return;
      }
      showToast(
        "Contraseña actualizada. Te hemos enviado un email de confirmación."
      );
      go("profile");
    } finally {
      setSaving(false);
    }
  };

  const reqItems = [
    { ok: checks.len, text: "8 caracteres o más" },
    { ok: checks.upper, text: "Mayúsculas y minúsculas" },
    { ok: checks.num, text: "Al menos un número" },
    { ok: checks.sym, text: "Al menos un símbolo" }
  ];

  return (
    <div className="max-w-[560px]">
      <PageHeader
        overline="Seguridad"
        title="Cambiar contraseña"
        desc="Por seguridad, cerraremos las demás sesiones activas tras el cambio."
        onBack={() => go("profile")}
      />

      <Panel className="p-8">
        <div className="mb-5">
          <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              name="new-password"
              autoComplete="new-password"
              autoCapitalize="none"
              spellCheck={false}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className={`${inputCls} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPwd((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              {showPwd ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.pwd && (
            <p className="mt-1.5 text-[12px] text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {errors.pwd}
            </p>
          )}
        </div>

        {pwd && (
          <div className="mb-5">
            <div className="flex gap-1 mb-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full transition-all ${i < passed ? strengthColor : "bg-muted"}`}
                />
              ))}
            </div>
            <span
              className={`text-[11px] font-bold tracking-[0.18em] uppercase ${
                passed >= 4
                  ? "text-green-600 dark:text-green-400"
                  : passed >= 3
                    ? "text-sky-600 dark:text-sky-400"
                    : passed >= 2
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-destructive"
              }`}
            >
              Seguridad: {strength}
            </span>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {reqItems.map((r) => (
                <div
                  key={r.text}
                  className={`flex items-center gap-2 text-[12px] ${r.ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${r.ok ? "bg-green-100 dark:bg-green-900/40" : "bg-muted"}`}
                  >
                    {r.ok ? (
                      <Check className="h-2.5 w-2.5" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                    )}
                  </span>
                  {r.text}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6">
          <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            Confirmar contraseña
          </label>
          <input
            type={showPwd ? "text" : "password"}
            name="confirm-new-password"
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repite la contraseña"
            className={inputCls}
          />
          {errors.confirm && (
            <p className="mt-1.5 text-[12px] text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {errors.confirm}
            </p>
          )}
        </div>

        <div className="p-4 rounded-[14px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/30 flex gap-3 items-start mb-6">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-amber-700 dark:text-amber-300 leading-relaxed">
            Cuando cambies la contraseña, se cerrarán las sesiones en otros
            dispositivos. Tendrás que volver a iniciar sesión donde lo
            necesites.
          </p>
        </div>

        <div className="flex justify-end gap-2.5">
          <CustomButton
            type="button"
            styleType="ghost"
            radius="full"
            size="sm"
            onClick={() => go("profile")}
          >
            Cancelar
          </CustomButton>
          <CustomButton
            type="button"
            styleType="primary"
            radius="full"
            size="sm"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Guardando…" : "Actualizar contraseña"}
          </CustomButton>
        </div>
      </Panel>
    </div>
  );
};

// ─── PRIVACY & DATA ───────────────────────────────────────────────────────────

const Privacy = ({
  go,
  openDeleteModal
}: {
  go: (r: RouteName) => void;
  openDeleteModal: () => void;
}) => {
  const [perms, setPerms] = useState({
    news: true,
    analytics: true,
    personalization: true,
    testimonials: false
  });

  return (
    <div className="max-w-[760px]">
      <PageHeader
        overline="Privacidad y datos"
        title="Tus datos, bajo tu control"
        desc="Cumplimos íntegramente el Reglamento General de Protección de Datos (RGPD). Aquí puedes ejercer todos tus derechos."
        onBack={() => go("profile")}
      />

      {/* Permissions */}
      <Panel className="p-7 mb-4">
        <h3 className="text-base font-bold text-foreground mb-1.5">
          Permisos y comunicaciones
        </h3>
        <p className="text-[13px] text-muted-foreground mb-4 leading-relaxed">
          Controla cómo usamos tus datos. Estos cambios son inmediatos.
        </p>
        <PermToggle
          title="Email de novedades del producto"
          desc="Nuevos tests, mejoras del asistente y cambios importantes."
          on={perms.news}
          onChange={(v) => setPerms((p) => ({ ...p, news: v }))}
        />
        <PermToggle
          title="Análisis de uso anónimo"
          desc="Nos ayuda a mejorar tests y ranking de respuestas."
          on={perms.analytics}
          onChange={(v) => setPerms((p) => ({ ...p, analytics: v }))}
        />
        <PermToggle
          title="Personalización por IA"
          desc="Usar tu historial para sugerirte temario y tests adaptados."
          on={perms.personalization}
          onChange={(v) => setPerms((p) => ({ ...p, personalization: v }))}
        />
        <PermToggle
          title="Compartir mis testimonios"
          desc="Mostrar tus reseñas en la web pública (con tu nombre)."
          on={perms.testimonials}
          onChange={(v) => setPerms((p) => ({ ...p, testimonials: v }))}
          last
        />
      </Panel>

      {/* Danger zone */}
      <Panel className="p-7 border-destructive/25">
        <Overline className="text-destructive mb-2.5">Zona crítica</Overline>
        <div className="flex gap-4 items-start">
          <div className="w-11 h-11 rounded-[12px] bg-destructive/10 flex items-center justify-center text-destructive flex-shrink-0">
            <Trash2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-foreground mb-1.5">
              Eliminar mi cuenta
            </h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-4 max-w-[540px]">
              Borraremos permanentemente tu progreso, historial, conversaciones
              y datos personales en un máximo de 72 horas. Las facturas se
              conservan por obligación fiscal.{" "}
              <strong className="text-foreground">
                Esta acción no se puede deshacer.
              </strong>
            </p>
            <CustomButton
              type="button"
              styleType="destructive"
              radius="full"
              size="sm"
              onClick={openDeleteModal}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar cuenta…
            </CustomButton>
          </div>
        </div>
      </Panel>
    </div>
  );
};

const PermToggle = ({
  title,
  desc,
  on,
  onChange,
  last
}: {
  title: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) => (
  <div
    className={`flex items-center gap-4 py-3.5 ${last ? "" : "border-b border-border/60"}`}
  >
    <div className="flex-1">
      <div className="text-sm font-bold text-foreground mb-0.5">{title}</div>
      <div className="text-[12px] text-muted-foreground leading-relaxed">
        {desc}
      </div>
    </div>
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`w-10 h-6 rounded-full border p-0.5 transition-colors flex-shrink-0 ${
        on
          ? "border-primary bg-primary"
          : "border-border bg-muted-foreground/20 dark:border-border/70 dark:bg-black/45"
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full transition-transform ${
          on
            ? "translate-x-4 bg-primary-foreground shadow-sm"
            : "translate-x-0 bg-background shadow-[0_1px_4px_hsl(var(--foreground)/0.25)] dark:bg-muted-foreground"
        }`}
      />
    </button>
  </div>
);

// ─── CONTACT TAB ──────────────────────────────────────────────────────────────

const ContactTab = ({ go }: { go: (r: RouteName) => void }) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const profileName =
    `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
  const profileEmail = profile?.email ?? user?.email ?? "";

  type Topic = SupportContactCategory;
  const topics: { id: Topic; label: string }[] = [
    { id: "account", label: "Mi cuenta" },
    { id: "billing", label: "Facturación" },
    { id: "tests", label: "Error en un test" },
    { id: "ai", label: "AsistenteIA" },
    { id: "technical", label: "Otro asunto" }
  ];

  const [topic, setTopic] = useState<Topic>("billing");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!subject.trim()) e.subject = "Añade un asunto breve.";
    if (message.trim().length < 20)
      e.message = "Cuéntanos un poco más (mínimo 20 caracteres).";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    setSending(true);
    try {
      const values: SupportContactFormValues = {
        name: profileName,
        email: profileEmail,
        category: topic,
        issueType: "",
        context: sanitizeSupportContactForm({
          name: profileName,
          email: profileEmail,
          category: topic,
          issueType: "",
          context: subject,
          message
        }).context,
        message
      };
      const sanitized = sanitizeSupportContactForm(values);
      const result = await submitSupportContactForm({
        ...sanitized,
        metadata: {
          locale: "es",
          pathname: window.location.pathname,
          submittedAt: new Date().toISOString(),
          userAgent: navigator.userAgent,
          userId: user?.id ?? null
        }
      });

      if (result.status === "unconfigured") {
        toast({
          title: "Formulario recibido",
          description:
            "Hemos recibido tu consulta. Te responderemos en menos de 24 horas hábiles."
        });
      } else {
        toast({
          title: "Consulta enviada",
          description:
            "Hemos recibido tu consulta. Te responderemos en menos de 24 horas hábiles."
        });
      }
      setSent(true);
    } catch {
      toast({
        variant: "destructive",
        title: "Error al enviar",
        description:
          "No se pudo enviar tu consulta. Por favor, inténtalo de nuevo."
      });
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <Panel className="p-14 text-center max-w-[560px] mx-auto mt-10">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 mx-auto mb-4">
          <Check className="h-7 w-7" />
        </div>
        <Overline className="mb-2">Ticket creado</Overline>
        <h2 className="text-[1.6rem] font-serif text-foreground mb-2">
          Mensaje enviado
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Hemos recibido tu consulta. Recibirás respuesta en{" "}
          <strong className="text-foreground">menos de 24 horas hábiles</strong>{" "}
          en {profileEmail}.
        </p>
        <div className="flex gap-2.5 justify-center">
          <CustomButton
            type="button"
            styleType="menu"
            radius="full"
            size="sm"
            onClick={() => {
              setSent(false);
              setSubject("");
              setMessage("");
            }}
          >
            Enviar otra
          </CustomButton>
          <CustomButton
            type="button"
            styleType="primary"
            radius="full"
            size="sm"
            onClick={() => go("tickets")}
          >
            Ver mis consultas
          </CustomButton>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
      <Panel className="p-8">
        <Overline className="mb-2.5">Contactar con soporte</Overline>
        <h2 className="text-[1.6rem] font-serif text-foreground mb-2 leading-snug">
          Cuéntanos qué necesitas.
        </h2>
        <p className="text-[13px] text-muted-foreground mb-7 leading-relaxed max-w-[520px]">
          Cuanto más detalle nos des, antes podremos resolverlo. Respondemos en
          menos de 24 horas hábiles.
        </p>

        <p className="block mb-3 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
          Tema de la consulta
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          {topics.map((t) => (
            <button
              key={t.id}
              onClick={() => setTopic(t.id)}
              className={`px-4 py-2 rounded-full border text-[12px] font-semibold transition-all ${
                topic === t.id
                  ? "bg-secondary border-primary text-primary"
                  : "bg-card border-border/70 text-foreground hover:border-primary/40"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mb-5">
          <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            Asunto
          </label>
          <CustomInput
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Resumen breve de tu consulta"
            className={`min-h-11 rounded-2xl border-border/70 bg-background/80 px-4 shadow-sm transition-all focus-visible:ring-primary/25 focus-visible:ring-offset-2`}
          />
          {errors.subject && (
            <p className="mt-1.5 text-[12px] text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {errors.subject}
            </p>
          )}
        </div>

        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <label className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
              Mensaje
            </label>
            <span className="text-[11px] text-muted-foreground">
              {message.length}/2000
            </span>
          </div>
          <CustomTextarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe lo que ha pasado, cuándo y qué esperabas ver. Si es un error técnico, indica navegador y dispositivo."
            rows={6}
            maxLength={2000}
            className={`min-h-11 rounded-2xl border-border/70 bg-background/80 px-4 shadow-sm transition-all focus-visible:ring-primary/25 focus-visible:ring-offset-2 min-h-[160px] py-3 resize-y`}
          />
          {errors.message && (
            <p className="mt-1.5 text-[12px] text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {errors.message}
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Adjuntaremos datos de tu sesión automáticamente para acelerar la
            respuesta.
          </p>
        </div>

        <div className="flex justify-end gap-2.5">
          <CustomButton
            type="button"
            styleType="ghost"
            radius="full"
            size="sm"
            onClick={() => go("help")}
          >
            Cancelar
          </CustomButton>
          <CustomButton
            type="button"
            styleType="primary"
            radius="full"
            size="sm"
            disabled={sending}
            onClick={handleSubmit}
          >
            {sending ? (
              "Enviando…"
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Enviar consulta
              </>
            )}
          </CustomButton>
        </div>
      </Panel>

      <div className="flex flex-col gap-4 xl:sticky xl:top-6">
        <Panel className="p-5">
          <Overline className="mb-3">Antes de escribirnos</Overline>
          <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">
            Estos artículos resuelven el{" "}
            <strong className="text-foreground">80%</strong> de las consultas
            que recibimos.
          </p>
          {[
            "Renovación y cancelación del plan",
            "Reportar un error en un test",
            "Recuperar la contraseña",
            "Exportar mis datos (RGPD)"
          ].map((item, i, arr) => (
            <div
              key={item}
              onClick={() => go("help")}
              className={`flex items-center justify-between gap-2 py-2.5 cursor-pointer hover:opacity-80 transition-opacity ${
                i < arr.length - 1 ? "border-b border-border/60" : ""
              }`}
            >
              <span className="text-[13px] font-semibold text-foreground">
                {item}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </div>
          ))}
        </Panel>

        <Panel className="p-5">
          <Overline className="mb-2">Disponibilidad</Overline>
          <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
            {supportChannelAvailability.contact
              ? "El formulario de contacto está activo. Respondemos en menos de 24 horas hábiles."
              : "El formulario de contacto no está disponible en este momento. Contáctanos por email."}
          </p>
          <div className="text-[12px] font-semibold text-foreground">
            support@ibericaoposiciones.es
          </div>
        </Panel>
      </div>
    </div>
  );
};

// ─── TICKETS ──────────────────────────────────────────────────────────────────

const Tickets = ({
  go,
  onOpenTicket
}: {
  go: (r: RouteName) => void;
  onOpenTicket: (ticketId: string) => void;
}) => {
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");

  const filters: { id: typeof filter; label: string; count: number }[] = [
    { id: "all", label: "Todos", count: DEMO_TICKETS.length },
    {
      id: "open",
      label: "Abiertos",
      count: DEMO_TICKETS.filter(
        (t) => t.status === "open" || t.status === "awaiting"
      ).length
    },
    {
      id: "resolved",
      label: "Resueltos",
      count: DEMO_TICKETS.filter((t) => t.status === "resolved").length
    }
  ];

  const list = DEMO_TICKETS.filter((t) => {
    if (filter === "all") return true;
    if (filter === "open")
      return t.status === "open" || t.status === "awaiting";
    return t.status === "resolved";
  });

  const STATUS_STYLES: Record<
    TicketStatus,
    { label: string; className: string }
  > = {
    open: {
      label: "En curso",
      className: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
    },
    awaiting: {
      label: "Esperando tu resp.",
      className:
        "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
    },
    resolved: {
      label: "Resuelto",
      className:
        "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
    }
  };

  return (
    <div className="max-w-[980px]">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Overline className="mb-2">Mis consultas</Overline>
          <h1 className="text-[2rem] leading-[1.1] font-serif text-foreground">
            Historial de tickets
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aquí están todas tus conversaciones con soporte.
          </p>
        </div>
        <CustomButton
          type="button"
          styleType="primary"
          radius="full"
          size="sm"
          className="flex-shrink-0 mt-2"
          onClick={() => go("contact")}
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva consulta
        </CustomButton>
      </div>

      <div className="flex gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-full border text-[12px] font-semibold flex items-center gap-2 transition-all ${
              filter === f.id
                ? "bg-primary border-primary text-white"
                : "bg-card border-border/70 text-foreground hover:border-primary/40"
            }`}
          >
            {f.label}
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                filter === f.id
                  ? "bg-white/25 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Panel className="p-14 text-center">
          <div className="w-14 h-14 rounded-[18px] bg-muted flex items-center justify-center mx-auto mb-4 text-muted-foreground">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h3 className="text-[1.3rem] font-serif text-foreground mb-1.5">
            Sin consultas en esta categoría
          </h3>
          <p className="text-[13px] text-muted-foreground mb-4">
            Cuando contactes con soporte, las conversaciones aparecerán aquí.
          </p>
          <CustomButton
            type="button"
            styleType="primary"
            radius="full"
            size="sm"
            onClick={() => go("contact")}
          >
            <Plus className="h-3.5 w-3.5" />
            Abrir consulta
          </CustomButton>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((ticket) => {
            const s = STATUS_STYLES[ticket.status];
            return (
              <Panel
                key={ticket.id}
                onClick={() => onOpenTicket(ticket.id)}
                className="p-5 cursor-pointer hover:-translate-y-0.5 hover:border-primary/30 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-muted-foreground tracking-[0.14em]">
                        {ticket.id}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] ${s.className}`}
                      >
                        {s.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        · {ticket.topic}
                      </span>
                      {ticket.unread && (
                        <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(249,115,22,0.15)]" />
                      )}
                    </div>
                    <div className="text-sm font-bold text-foreground mb-1.5">
                      {ticket.subject}
                    </div>
                    <div className="text-[12px] text-muted-foreground flex gap-3 flex-wrap">
                      <span>{ticket.messages} mensajes</span>
                      <span>·</span>
                      <span>Actualizado {ticket.lastUpdate}</span>
                      {ticket.rating && (
                        <>
                          <span>·</span>
                          <span className="text-primary">
                            {"★".repeat(ticket.rating)}
                            {"☆".repeat(5 - ticket.rating)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── DELETE ACCOUNT MODAL ─────────────────────────────────────────────────────

const SupportChat = ({
  go,
  ticket
}: {
  go: (r: RouteName) => void;
  ticket?: SupportTicket;
}) => {
  const [message, setMessage] = useState("");
  const subject = ticket?.subject ?? "Consulta de soporte";
  const attachmentName = `Soporte_${ticket?.id.replace("#", "") ?? "ticket"}.pdf`;

  return (
    <div className="max-w-[880px]">
      <PageHeader
        overline="Soporte"
        title="Chat con soporte"
        desc={`Conversacion asociada a ${ticket?.id ?? "tu ticket"}. La transcripcion se guarda en tus tickets.`}
        onBack={() => go("tickets")}
      />

      <Panel className="overflow-hidden">
        <header className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              L
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">
                Lucia Hernandez · Soporte nivel 2
              </p>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                En linea · responde en ~2 min
              </p>
            </div>
          </div>
          <CustomButton type="button" styleType="menu" radius="full" size="sm">
            Finalizar
          </CustomButton>
        </header>

        <div className="h-[390px] overflow-y-auto px-5 py-5">
          <div className="mb-5 max-w-[70%] rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm leading-relaxed text-foreground shadow-[0_18px_45px_-34px_rgba(15,23,42,0.45)]">
            Hola, soy Lucia. Estoy revisando el ticket{" "}
            <span className="font-semibold">{ticket?.id}</span> sobre{" "}
            <span className="font-semibold">{subject}</span>. En que puedo
            ayudarte?
            <p className="mt-2 text-[11px] text-muted-foreground">10:32</p>
          </div>

          <div className="mb-6 ml-auto max-w-[78%] rounded-2xl bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-[0_18px_45px_-32px_hsl(var(--primary)/0.8)]">
            Hola, tengo una duda sobre este ticket. Necesito revisar los
            detalles y saber como continuar.
            <p className="mt-2 text-right text-[11px] text-primary-foreground/75">
              10:33
            </p>
          </div>

          <div className="mb-5 flex items-end gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              L
            </span>
            <div className="max-w-[72%] rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm leading-relaxed text-foreground shadow-[0_18px_45px_-34px_rgba(15,23,42,0.45)]">
              Lo reviso ahora. Te dejo aqui la ultima referencia vinculada a la
              consulta para que la tengas a mano.
              <p className="mt-2 text-[11px] text-muted-foreground">10:34</p>
            </div>
          </div>

          <div className="flex items-end gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              L
            </span>
            <div className="max-w-[76%] rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm leading-relaxed text-foreground shadow-[0_18px_45px_-34px_rgba(15,23,42,0.45)]">
              La informacion del ticket esta correctamente registrada. Si
              necesitas ampliar el caso, responde por aqui y quedara guardado en
              la transcripcion.
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/60 p-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-primary">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">
                    {attachmentName}
                  </p>
                  <p className="text-[11px] text-muted-foreground">118 KB</p>
                </div>
                <Download className="h-4 w-4 shrink-0 text-primary" />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">10:35</p>
            </div>
          </div>
        </div>

        <footer className="flex items-center gap-3 border-t border-border/70 px-5 py-4">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Adjuntar archivo"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Escribe un mensaje..."
            className="h-10 min-w-0 flex-1 rounded-full border border-border/70 bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          />
          <CustomButton
            type="button"
            styleType="primary"
            radius="full"
            size="sm"
          >
            <Send className="h-3.5 w-3.5" />
            Enviar
          </CustomButton>
        </footer>
      </Panel>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Adjuntamos automaticamente datos de tu sesion y plan para acelerar la
        respuesta.
      </p>
    </div>
  );
};

const DeleteAccountModal = ({
  open,
  onClose,
  onConfirmed
}: {
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}) => {
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setReason("");
      setConfirm("");
    }
  }, [open]);

  const reasons = [
    "He aprobado mi oposición 🎉",
    "El precio es elevado",
    "Faltan funciones que necesito",
    "He encontrado otra plataforma",
    "No le doy uso suficiente",
    "Otro motivo"
  ];

  const finalize = async () => {
    setWorking(true);
    await new Promise((r) => setTimeout(r, 1200));
    setWorking(false);
    onClose();
    onConfirmed();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[560px] rounded-[1.5rem] p-0 overflow-hidden border border-border/70">
        <DialogTitle className="sr-only">Eliminar cuenta</DialogTitle>

        {step === 1 && (
          <div className="p-9">
            <div className="w-12 h-12 rounded-[14px] bg-destructive/10 text-destructive flex items-center justify-center mb-4">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2 className="text-[1.5rem] font-serif text-foreground mb-2">
              ¿Seguro que quieres eliminar tu cuenta?
            </h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed mb-5">
              Esta acción es{" "}
              <strong className="text-foreground">irreversible</strong>. Antes
              de continuar, queremos asegurarnos de que entiendes lo que
              perderás.
            </p>
            <div className="rounded-[14px] border border-border/60 mb-5 overflow-hidden">
              {[
                {
                  icon: <BookOpen className="h-3.5 w-3.5" />,
                  label: "Tu historial de tests y progreso acumulado"
                },
                {
                  icon: <MessageSquare className="h-3.5 w-3.5" />,
                  label: "Tu historial completo con AsistenteIA"
                },
                {
                  icon: <Clock className="h-3.5 w-3.5" />,
                  label: "Tus sesiones de estudio registradas"
                },
                {
                  icon: <CreditCard className="h-3.5 w-3.5" />,
                  label: "Tu plan activo (no se reembolsa)",
                  last: true
                }
              ].map((item, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    item.last ? "" : "border-b border-border/60"
                  }`}
                >
                  <span className="w-7 h-7 rounded-[8px] bg-destructive/10 text-destructive flex items-center justify-center flex-shrink-0">
                    {item.icon}
                  </span>
                  <span className="text-[13px] text-foreground font-semibold">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="p-3 rounded-[12px] bg-muted text-[12px] text-muted-foreground leading-relaxed mb-6">
              <strong className="text-foreground">¿Solo quieres pausar?</strong>{" "}
              Puedes cancelar la renovación y mantener tu cuenta gratuita con
              todo tu progreso intacto.
            </div>
            <div className="flex gap-2.5 justify-end">
              <CustomButton
                type="button"
                styleType="menu"
                radius="full"
                size="sm"
                onClick={onClose}
              >
                Mantener cuenta
              </CustomButton>
              <CustomButton
                type="button"
                styleType="destructive"
                radius="full"
                size="sm"
                onClick={() => setStep(2)}
              >
                Continuar eliminación
              </CustomButton>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-9">
            <Overline className="text-destructive mb-2.5">Paso 2 de 3</Overline>
            <h2 className="text-[1.4rem] font-serif text-foreground mb-2">
              ¿Por qué te vas?
            </h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
              Tu respuesta nos ayuda a mejorar. Es opcional pero muy valiosa.
            </p>
            <div className="flex flex-col gap-2 mb-6">
              {reasons.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[12px] border cursor-pointer transition-all text-[13px] font-semibold ${
                    reason === r
                      ? "border-primary bg-secondary text-primary"
                      : "border-border/70 bg-card text-foreground hover:border-primary/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="accent-primary"
                  />
                  {r}
                </label>
              ))}
            </div>
            <div className="flex justify-between">
              <CustomButton
                type="button"
                styleType="ghost"
                radius="full"
                size="sm"
                onClick={() => setStep(1)}
              >
                Atrás
              </CustomButton>
              <CustomButton
                type="button"
                styleType="destructive"
                radius="full"
                size="sm"
                onClick={() => setStep(3)}
              >
                Continuar
              </CustomButton>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-9">
            <Overline className="text-destructive mb-2.5">
              Paso 3 de 3 · confirmación final
            </Overline>
            <h2 className="text-[1.4rem] font-serif text-foreground mb-2">
              Última confirmación
            </h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
              Para confirmar, escribe{" "}
              <strong className="text-foreground">ELIMINAR</strong> a
              continuación. Procesaremos la solicitud en las próximas 72 horas.
            </p>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Escribe ELIMINAR"
              className={`${inputCls} mb-2 ${
                confirm === "ELIMINAR" ? "border-destructive" : ""
              } font-mono tracking-[0.18em]`}
            />
            <p className="text-[11px] text-muted-foreground mb-6">
              Mayúsculas, sin espacios.
            </p>
            <div className="flex justify-between">
              <CustomButton
                type="button"
                styleType="ghost"
                radius="full"
                size="sm"
                onClick={() => setStep(2)}
              >
                Atrás
              </CustomButton>
              <CustomButton
                type="button"
                styleType="destructive"
                radius="full"
                size="sm"
                disabled={confirm !== "ELIMINAR" || working}
                onClick={finalize}
              >
                {working ? "Procesando…" : "Eliminar mi cuenta"}
              </CustomButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ─── ROOT COMPONENT ───────────────────────────────────────────────────────────

const TAB_PARAM = "tab";
const VALID_TABS = new Set<TabName>(["help", "profile", "contact", "tickets"]);
const DEFAULT_TAB: TabName = "profile";

const normalizeTab = (v: string | null): TabName => {
  if (!v || !VALID_TABS.has(v as TabName)) return DEFAULT_TAB;
  return v as TabName;
};

const HUB_ROUTES = new Set<RouteName>([
  "help",
  "profile",
  "contact",
  "tickets"
]);

const Support = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = normalizeTab(searchParams.get(TAB_PARAM));
  const [subRoute, setSubRoute] = useState<RouteState | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const go = useCallback(
    (r: RouteName) => {
      if (HUB_ROUTES.has(r)) {
        setSubRoute(null);
        const next = new URLSearchParams(searchParams);
        next.set(TAB_PARAM, r);
        setSearchParams(next, { replace: true });
      } else setSubRoute({ name: r });
    },
    [searchParams, setSearchParams]
  );

  const setTab = useCallback(
    (t: TabName) => {
      setSubRoute(null);
      const next = new URLSearchParams(searchParams);
      next.set(TAB_PARAM, t);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const openTicket = useCallback((ticketId: string) => {
    setSubRoute({ name: "support-chat", ticketId });
  }, []);

  const showToast = useCallback(
    (msg: string) => {
      toast({ title: msg });
    },
    [toast]
  );

  const currentTab: TabName =
    subRoute && !HUB_ROUTES.has(subRoute.name)
      ? activeTab
      : ((subRoute?.name as TabName) ?? activeTab);
  const selectedTicket = useMemo(
    () => DEMO_TICKETS.find((ticket) => ticket.id === subRoute?.ticketId),
    [subRoute?.ticketId]
  );

  const isSubScreen = subRoute !== null;

  return (
    <div className="space-y-0 pb-2">
      {!isSubScreen && <TabBar active={activeTab} onChange={setTab} />}

      {isSubScreen && subRoute.name === "edit-profile" && (
        <EditProfile go={go} showToast={showToast} />
      )}
      {isSubScreen && subRoute.name === "change-password" && (
        <ChangePassword go={go} showToast={showToast} />
      )}
      {isSubScreen && subRoute.name === "privacy" && (
        <Privacy go={go} openDeleteModal={() => setDeleteModalOpen(true)} />
      )}
      {isSubScreen && subRoute.name === "support-chat" && (
        <SupportChat go={go} ticket={selectedTicket} />
      )}

      {!isSubScreen && activeTab === "help" && <HelpCenter go={go} />}
      {!isSubScreen && activeTab === "profile" && (
        <ProfileHub go={go} openDeleteModal={() => setDeleteModalOpen(true)} />
      )}
      {!isSubScreen && activeTab === "contact" && <ContactTab go={go} />}
      {!isSubScreen && activeTab === "tickets" && (
        <Tickets go={go} onOpenTicket={openTicket} />
      )}

      <DeleteAccountModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirmed={() =>
          toast({
            title: "Solicitud recibida",
            description:
              "Tu cuenta se eliminará en 72h. Recibirás confirmación por email."
          })
        }
      />
    </div>
  );
};

export default Support;

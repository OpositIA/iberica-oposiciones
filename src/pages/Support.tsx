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
import { Switch } from "@/components/ui/switch";
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
  sanitizeSupportContactForm,
  type SupportContactCategory,
  type SupportContactFormValues
} from "@/support/supportForms";
import {
  createSupportTicket,
  fetchMySupportTicketDetail,
  fetchMySupportTicketMessages,
  fetchMySupportTickets,
  markSupportTicketRead,
  removeSupportTicketImages,
  replyToSupportTicket,
  resolveMySupportTicket,
  supportTicketsQueryKeys,
  syncSupportTicketToTelegram,
  uploadSupportTicketImages,
  type SupportTicketAttachment,
  type SupportTicketMessage,
  type SupportTicketStatus
} from "@/support/supportTicketsApi";
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
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Send,
  Shield,
  ThumbsDown,
  ThumbsUp,
  Trash2
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

type TabName = "help" | "profile" | "contact" | "tickets";
type RouteName =
  | TabName
  | "edit-profile"
  | "change-password"
  | "notifications"
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

// ─── Support tickets ──────────────────────────────────────────────────────────

type TicketStatus = "open" | "awaiting" | "resolved";

const SUPPORT_TOPIC_LABELS: Record<SupportContactCategory, string> = {
  account: "Cuenta",
  billing: "Facturación",
  tests: "Tests",
  ai: "AsistenteIA",
  technical: "Otro asunto"
};

const mapTicketStatus = (status: SupportTicketStatus): TicketStatus => {
  if (status === "awaiting_user") return "awaiting";
  return status;
};

const formatRelativeDate = (value: string, locale: AppLocale) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";

  const diffMs = timestamp - Date.now();
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  const absMinutes = Math.abs(diffMinutes);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (absMinutes < 60) return rtf.format(diffMinutes, "minute");

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, "day");

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return rtf.format(diffMonths, "month");

  const diffYears = Math.round(diffMonths / 12);
  return rtf.format(diffYears, "year");
};

const formatAttachmentSize = (sizeBytes: number | null) => {
  if (!sizeBytes || sizeBytes <= 0) return "";
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageAttachment = (attachment: SupportTicketAttachment) =>
  attachment.mimeType.startsWith("image/");

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
}) => {
  const { t } = useTranslation("support");

  return (
    <div className="flex items-start justify-between gap-5 mb-6">
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 mb-3 text-[11px] font-bold tracking-[0.22em] uppercase text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t("pageHeader.back")}
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
};

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
  const { t } = useTranslation("profile");
  const tabs: { id: TabName; label: string }[] = [
    { id: "profile", label: t("tabs.profile") },
    { id: "help", label: t("tabs.help") },
    { id: "contact", label: t("tabs.contact") },
    { id: "tickets", label: t("tabs.tickets") }
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

type FaqVote = "up" | "down";

const isFaqVote = (value: unknown): value is FaqVote =>
  value === "up" || value === "down";

const getFaqVoteId = (question: string) =>
  sanitizeCode(question.toLowerCase().replace(/\s+/g, "-"), 120);

const VoteRow = ({ faqId }: { faqId: string }) => {
  const { user } = useAuth();
  const [vote, setVote] = useState<FaqVote | null>(null);
  const [pop, setPop] = useState<FaqVote | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setVote(null);
    setIsLoading(false);

    if (!user || !faqId) return;
    let cancelled = false;

    const loadVote = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("faq_votes")
        .select("vote")
        .eq("user_id", user.id)
        .eq("faq_id", faqId)
        .maybeSingle();

      if (cancelled) return;
      setVote(!error && isFaqVote(data?.vote) ? data.vote : null);
      setIsLoading(false);
    };

    void loadVote();
    return () => {
      cancelled = true;
    };
  }, [user, faqId]);

  const handleVote = async (next: FaqVote) => {
    if (!user || isLoading) return;

    const previousVote = vote;
    const nextVote = vote === next ? null : next;
    setVote(nextVote);
    setPop(next);
    setTimeout(() => setPop(null), 200);

    setIsLoading(true);
    try {
      if (nextVote === null) {
        const { error } = await supabase
          .from("faq_votes")
          .delete()
          .eq("user_id", user.id)
          .eq("faq_id", faqId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("faq_votes").upsert(
          {
            user_id: user.id,
            faq_id: faqId,
            vote: nextVote
          },
          { onConflict: "user_id,faq_id" }
        );
        if (error) throw error;
      }
    } catch {
      setVote(previousVote);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void handleVote("up")}
        disabled={isLoading}
        className={`p-1.5 rounded-full transition-all duration-200 hover:bg-secondary/60 disabled:opacity-60 ${
          vote === "up"
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground"
        } ${pop === "up" ? "scale-125" : "scale-100"}`}
      >
        <ThumbsUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => void handleVote("down")}
        disabled={isLoading}
        className={`p-1.5 rounded-full transition-all duration-200 hover:bg-secondary/60 disabled:opacity-60 ${
          vote === "down"
            ? "text-destructive"
            : "text-muted-foreground hover:text-foreground"
        } ${pop === "down" ? "scale-125" : "scale-100"}`}
      >
        <ThumbsDown className="h-4 w-4" />
      </button>
    </div>
  );
};

const HelpCenter = ({ go }: { go: (r: RouteName) => void }) => {
  const { t } = useTranslation("support");
  const faqGroups = t("faq.groups", { returnObjects: true }) as Array<{
    id: string;
    label: string;
    items: Array<{
      id: string;
      question: string;
      answer: string;
    }>;
  }>;
  const faqCategories = useMemo(
    () => [
      { id: "all", label: t("faq.categories.all") },
      ...faqGroups.map((group) => ({ id: group.id, label: group.label }))
    ],
    [faqGroups, t]
  );
  const faqs = useMemo(
    () =>
      faqGroups.flatMap((group) =>
        group.items.map((item) => ({
          id: item.id,
          cat: group.id,
          categoryLabel: group.label,
          q: item.question,
          a: item.answer
        }))
      ),
    [faqGroups]
  );
  const [cat, setCat] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return faqs.filter((f) => {
      if (cat !== "all" && f.cat !== cat) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q);
      }
      return true;
    });
  }, [cat, faqs, query]);

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
            <Overline className="mb-2.5">
              {t("helpCenter.hero.overline")}
            </Overline>
            <h1 className="text-[2rem] leading-[1.1] font-serif text-foreground mb-1.5">
              {t("helpCenter.hero.title")}
            </h1>
            <p className="text-sm text-muted-foreground mb-4 max-w-[540px]">
              {t("helpCenter.hero.description")}
            </p>
            <div className="flex items-center gap-2.5 border border-border/70 rounded-[14px] px-4 py-3 bg-background dark:bg-card/60 max-w-[540px]">
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("helpCenter.hero.searchPlaceholder")}
                className="flex-1 border-none outline-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("helpCenter.hero.clear")}
                </button>
              )}
            </div>
          </div>
        </Panel>

        {/* Category chips */}
        <div className="flex flex-wrap gap-2">
          {faqCategories.map((c) => {
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
                {t("helpCenter.emptyResults.title", { query })}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {t("helpCenter.emptyResults.description")}
              </p>
              <CustomButton
                type="button"
                styleType="primary"
                radius="full"
                size="sm"
                onClick={() => go("contact")}
              >
                <Send className="h-3.5 w-3.5" />
                {t("helpCenter.emptyResults.cta")}
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
                      {f.categoryLabel}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pl-1 text-sm text-muted-foreground leading-relaxed">
                    {f.a}
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/60">
                      <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
                        {t("helpCenter.usefulQuestion")}
                      </span>
                      <VoteRow faqId={f.id} />
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
          <Overline className="mb-3">
            {t("helpCenter.sidebar.noAnswer")}
          </Overline>
          <h3 className="text-[1.2rem] font-serif text-foreground mb-3 leading-snug">
            {t("helpCenter.sidebar.talkToPerson")}
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
                {t("helpCenter.sidebar.contactForm")}
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t("helpCenter.sidebar.responseTime")}
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
                {t("helpCenter.sidebar.emailResponseTime")}
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
            {t("helpCenter.sidebar.openQuery")}
          </CustomButton>
        </Panel>

        <Panel className="p-5">
          <Overline className="mb-2">
            {t("helpCenter.sidebar.myQueries")}
          </Overline>
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
            <Trans
              i18nKey="helpCenter.sidebar.openConversations"
              ns="support"
              components={[<strong className="text-foreground" />]}
            />
          </p>
          <button
            onClick={() => go("tickets")}
            className="inline-flex items-center gap-1.5 text-primary text-[11px] font-bold tracking-[0.18em] uppercase hover:opacity-80 transition-opacity"
          >
            {t("helpCenter.sidebar.viewFullHistory")}{" "}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              {t("systemStatus.title")}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-green-600 dark:text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.2)]" />
              {t("systemStatus.operational")}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            {t("systemStatus.allServicesNormal")}
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
  const { user, profile, locale } = useAuth();
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
  const { data: oppositionOptions = [] } = useOppositionOptionsQuery(locale);
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
    t("profileView.noOpposition");
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
                {isPaid ? t("profileView.planPro") : t("profileView.planFree")}
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
              {t("profileView.edit")}
            </CustomButton>
          </div>
        </Panel>

        {/* Field rows */}
        <Panel className="py-1 overflow-hidden">
          <FieldRow
            label={t("profileView.fullName")}
            value={`${firstName} ${lastName}`.trim() || "-"}
          />
          <FieldRow label={t("profileView.email")} value={email || "-"} />
          <FieldRow
            label={t("profileView.opposition")}
            value={oppositionName}
            last
          />
        </Panel>

        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ActionCard
            icon={<Lock className="h-4 w-4" />}
            title={t("profileView.actionCards.changePassword")}
            desc={t("profileView.actionCards.changePasswordDesc")}
            onClick={() => go("change-password")}
          />
          <ActionCard
            icon={<Bell className="h-4 w-4" />}
            title={t("myProfile.notifications.cardTitle")}
            desc={t("myProfile.notifications.cardDescription")}
            onClick={() => go("notifications")}
          />
          <ActionCard
            icon={<Shield className="h-4 w-4" />}
            title={t("profileView.actionCards.privacy")}
            desc={t("profileView.actionCards.privacyDesc")}
            onClick={() => go("privacy")}
          />
        </div>
      </div>

      {/* Right sidebar */}
      <div className="flex flex-col gap-4 xl:sticky xl:top-6">
        <Panel className="p-5">
          <Overline className="mb-4">
            {t("profileView.activity.title")}
          </Overline>
          <StatRow
            label={t("profileView.activity.completedTests")}
            value={completedTestsValue}
          />
          <StatRow
            label={t("profileView.activity.globalAverage")}
            value={globalAverageValue}
          />
          <StatRow
            label={t("profileView.activity.averageAccuracy")}
            value={averageAccuracyValue}
            last
          />
        </Panel>
        <Panel className="p-5">
          <Overline className="mb-2.5">
            {isPaid ? t("profileView.planPro") : t("profileView.planFree")}
          </Overline>
          <h3 className="text-[1.2rem] font-serif text-foreground mb-2 leading-snug">
            {isPaid
              ? t("profileView.planPanel.proTitle")
              : t("profileView.planPanel.freeTitle")}
          </h3>
          <p className="text-[12px] text-muted-foreground mb-4 leading-relaxed">
            {isPaid
              ? t("profileView.planPanel.proDesc")
              : t("profileView.planPanel.freeDesc")}
          </p>
          <CustomButton
            type="button"
            styleType="primary"
            radius="full"
            size="sm"
            className="w-full"
            onClick={() => {
              void handleManagePlan();
            }}
            disabled={isOpeningPaymentPortal}
          >
            {isOpeningPaymentPortal && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            {isOpeningPaymentPortal
              ? t("myProfile.paymentSection.opening")
              : t("myProfile.paymentSection.cta")}
          </CustomButton>
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

// ─── NOTIFICATIONS PREFERENCES ────────────────────────────────────────────────

const NotificationsPreferences = ({
  go,
  showToast
}: {
  go: (r: RouteName) => void;
  showToast: (msg: string) => void;
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation("profile");
  const shouldLoad = Boolean(user?.id);
  const { data: profileDetails, isFetching } = useProfileDetailsQuery(
    shouldLoad ? user?.id : null
  );
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setEmailEnabled(
      profileDetails?.support_ticket_reply_email_enabled !== false
    );
  }, [profileDetails?.support_ticket_reply_email_enabled]);

  const handleEmailPreferenceChange = async (checked: boolean) => {
    if (!user?.id || isSaving) return;

    setEmailEnabled(checked);
    setIsSaving(true);

    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        support_ticket_reply_email_enabled: checked
      },
      { onConflict: "user_id" }
    );

    if (error) {
      setEmailEnabled(!checked);
      showToast(t("myProfile.notifications.saveFailed"));
      setIsSaving(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    showToast(t("myProfile.notifications.saved"));
    setIsSaving(false);
  };

  return (
    <div className="max-w-[760px]">
      <PageHeader
        overline={t("myProfile.notifications.overline")}
        title={t("myProfile.notifications.title")}
        desc={t("myProfile.notifications.description")}
        onBack={() => go("profile")}
      />

      <Panel className="overflow-hidden">
        <div className="flex items-start justify-between gap-5 p-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-secondary text-primary">
                <Mail className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {t("myProfile.notifications.emailTitle")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("myProfile.notifications.emailChannel")}
                </p>
              </div>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              {t("myProfile.notifications.supportTicketReplyDescription")}
            </p>
          </div>
          <Switch
            checked={emailEnabled}
            disabled={isFetching || isSaving}
            onCheckedChange={(checked) => {
              void handleEmailPreferenceChange(checked);
            }}
            aria-label={t("myProfile.notifications.supportTicketReplyLabel")}
          />
        </div>
      </Panel>
    </div>
  );
};

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
  const { t } = useTranslation("profile");
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
    if (!firstName.trim()) e.firstName = t("editProfile.toasts.nameRequired");
    if (!lastName.trim()) e.lastName = t("editProfile.toasts.lastNameRequired");
    return e;
  };

  const handleLocaleChange = (value: string) => {
    const nextLocale = normalizeLocale(value) as AppLocale;
    setDraftLocale(nextLocale);
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
        showToast(t("editProfile.toasts.saveFailed"));
        return;
      }

      if (draftLocale !== locale) await applyLocale(draftLocale);

      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      await refreshProfile();
      showToast(t("editProfile.toasts.saved"));
      go("profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[760px]">
      <PageHeader
        overline={t("editProfile.overline")}
        title={t("editProfile.title")}
        desc={t("editProfile.desc")}
        onBack={() => go("profile")}
      />

      <Panel className="p-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
          <div>
            <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
              {t("editProfile.fieldName")}
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
              {t("editProfile.fieldLastName")}
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
              {t("editProfile.fieldEmail")}
            </label>
            <input
              value={profile?.email ?? ""}
              disabled
              className={`${inputCls} opacity-60 cursor-not-allowed`}
            />
          </div>
          <div>
            <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
              {t("editProfile.fieldLocale")}
            </label>
            <CustomSelect
              value={draftLocale}
              onChange={(e) => handleLocaleChange(e.target.value)}
              className={`${inputCls} cursor-pointer`}
            >
              <option value="es">{t("editProfile.locales.es")}</option>
              <option value="en">{t("editProfile.locales.en")}</option>
            </CustomSelect>
          </div>
        </div>

        <div className="mb-6">
          <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            {t("editProfile.fieldOpposition")}
          </label>
          <CustomSelect
            value={oppositionId}
            onChange={(e) => setOppositionId(e.target.value)}
            className={`${inputCls} cursor-pointer`}
          >
            <option value="">{t("editProfile.selectOpposition")}</option>
            {oppositionOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </CustomSelect>
        </div>

        <div className="flex items-center justify-between pt-5 border-t border-border/60">
          <span className="text-[12px] text-muted-foreground">
            {t("editProfile.changesNote")}
          </span>
          <div className="flex gap-2.5">
            <CustomButton
              type="button"
              styleType="ghost"
              radius="full"
              size="sm"
              onClick={() => go("profile")}
            >
              {t("editProfile.cancel")}
            </CustomButton>
            <CustomButton
              type="button"
              styleType="primary"
              radius="full"
              size="sm"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? t("editProfile.saving") : t("editProfile.save")}
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
  const { t } = useTranslation("profile");
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
  const strengthLabels = [
    t("changePassword.strengthWeak"),
    t("changePassword.strengthFair"),
    t("changePassword.strengthGood"),
    t("changePassword.strengthStrong")
  ];
  const strength = strengthLabels[Math.max(0, passed - 1)];
  const strengthColor = [
    "bg-destructive",
    "bg-amber-400",
    "bg-sky-500",
    "bg-green-500"
  ][Math.max(0, passed - 1)];

  const handleSave = async () => {
    const e: Record<string, string> = {};
    if (passed < 3) e.pwd = t("changePassword.errors.minRequirements");
    if (pwd !== confirm) e.confirm = t("changePassword.errors.mismatch");
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) {
        showToast(t("changePassword.toasts.saveFailed"));
        return;
      }
      showToast(t("changePassword.toasts.saved"));
      go("profile");
    } finally {
      setSaving(false);
    }
  };

  const reqItems = [
    { ok: checks.len, text: t("changePassword.reqLength") },
    { ok: checks.upper, text: t("changePassword.reqUpperLower") },
    { ok: checks.num, text: t("changePassword.reqNumber") },
    { ok: checks.sym, text: t("changePassword.reqSymbol") }
  ];

  return (
    <div className="max-w-[560px]">
      <PageHeader
        overline={t("changePassword.overline")}
        title={t("changePassword.title")}
        desc={t("changePassword.desc")}
        onBack={() => go("profile")}
      />

      <Panel className="p-8">
        <div className="mb-5">
          <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            {t("changePassword.fieldNew")}
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
              placeholder={t("changePassword.fieldNewPlaceholder")}
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
              {t("changePassword.strengthPrefix")}: {strength}
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
            {t("changePassword.fieldConfirm")}
          </label>
          <input
            type={showPwd ? "text" : "password"}
            name="confirm-new-password"
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("changePassword.fieldConfirmPlaceholder")}
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
            {t("changePassword.sessionWarning")}
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
            {t("changePassword.cancel")}
          </CustomButton>
          <CustomButton
            type="button"
            styleType="primary"
            radius="full"
            size="sm"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? t("changePassword.saving") : t("changePassword.save")}
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
  const { toast } = useToast();
  const { t } = useTranslation("profile");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: profileDetails } = useProfileDetailsQuery(
    user?.id ? user.id : null
  );
  const [perms, setPerms] = useState({
    news: true,
    analytics: true
  });
  const [savingNewsPreference, setSavingNewsPreference] = useState(false);

  useEffect(() => {
    setPerms((current) => ({
      ...current,
      news: profileDetails?.product_updates_email_enabled ?? true
    }));
  }, [profileDetails?.product_updates_email_enabled]);

  const handleNewsPreferenceChange = async (nextValue: boolean) => {
    if (!user || savingNewsPreference) return;

    const previousValue = perms.news;
    setPerms((current) => ({ ...current, news: nextValue }));
    setSavingNewsPreference(true);

    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        product_updates_email_enabled: nextValue
      },
      { onConflict: "user_id" }
    );

    if (error) {
      setPerms((current) => ({ ...current, news: previousValue }));
      toast({ title: t("privacy.toasts.saveFailed") });
    } else await queryClient.invalidateQueries({ queryKey: ["profiles"] });

    setSavingNewsPreference(false);
  };

  return (
    <div className="max-w-[760px]">
      <PageHeader
        overline={t("privacy.overline")}
        title={t("privacy.title")}
        desc={t("privacy.desc")}
        onBack={() => go("profile")}
      />

      {/* Permissions */}
      <Panel className="p-7 mb-4">
        <h3 className="text-base font-bold text-foreground mb-1.5">
          {t("privacy.permissionsTitle")}
        </h3>
        <p className="text-[13px] text-muted-foreground mb-4 leading-relaxed">
          {t("privacy.permissionsDesc")}
        </p>
        <PermToggle
          title={t("privacy.toggleNews")}
          desc={t("privacy.toggleNewsDesc")}
          on={perms.news}
          onChange={(v) => {
            void handleNewsPreferenceChange(v);
          }}
          disabled={savingNewsPreference || !user}
        />
        <PermToggle
          title={t("privacy.toggleAnalytics")}
          desc={t("privacy.toggleAnalyticsDesc")}
          on={perms.analytics}
          onChange={(v) => setPerms((p) => ({ ...p, analytics: v }))}
        />
      </Panel>

      {/* Danger zone */}
      <Panel className="p-7 border-destructive/25">
        <Overline className="text-destructive mb-2.5">
          {t("privacy.dangerZone")}
        </Overline>
        <div className="flex gap-4 items-start">
          <div className="w-11 h-11 rounded-[12px] bg-destructive/10 flex items-center justify-center text-destructive flex-shrink-0">
            <Trash2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-foreground mb-1.5">
              {t("privacy.deleteTitle")}
            </h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-4 max-w-[540px]">
              {t("privacy.deleteDescription")}{" "}
              <strong className="text-foreground">
                {t("privacy.deleteWarning")}
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
              {t("privacy.deleteCta")}
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
  disabled = false,
  last
}: {
  title: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
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
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`w-10 h-6 rounded-full border p-0.5 transition-colors flex-shrink-0 ${
        on
          ? "border-primary bg-primary"
          : "border-border bg-muted-foreground/20 dark:border-border/70 dark:bg-black/45"
      } disabled:cursor-not-allowed disabled:opacity-60`}
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
  const { user, profile, locale } = useAuth();
  const { t } = useTranslation("profile");
  const queryClient = useQueryClient();
  const profileName =
    `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
  const profileEmail = profile?.email ?? user?.email ?? "";

  type Topic = SupportContactCategory;
  const topics: { id: Topic; label: string }[] = [
    { id: "account", label: t("contactTab.topics.account") },
    { id: "billing", label: t("contactTab.topics.billing") },
    { id: "tests", label: t("contactTab.topics.tests") },
    { id: "ai", label: t("contactTab.topics.ai") },
    { id: "technical", label: t("contactTab.topics.technical") }
  ];
  const sidebarLinks = t("contactTab.sidebarLinks", {
    returnObjects: true
  }) as string[];

  const [topic, setTopic] = useState<Topic>("billing");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!subject.trim()) e.subject = t("contactTab.errors.subject");
    if (message.trim().length < 20) e.message = t("contactTab.errors.message");
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
      const createdTicket = await createSupportTicket({
        category: topic,
        subject: sanitized.context,
        message: sanitized.message,
        requestContext: {
          locale,
          pathname: window.location.pathname,
          submittedAt: new Date().toISOString(),
          userAgent: navigator.userAgent,
          userId: user?.id ?? null,
          email: profileEmail,
          name: profileName
        }
      });
      await syncSupportTicketToTelegram(createdTicket.id).catch(
        () => undefined
      );
      await queryClient.invalidateQueries({
        queryKey: supportTicketsQueryKeys.list(user?.id)
      });
      toast({
        title: t("contactTab.toasts.sentTitle"),
        description: t("contactTab.toasts.sentDesc")
      });
      setSent(true);
    } catch {
      toast({
        variant: "destructive",
        title: t("contactTab.toasts.errorTitle"),
        description: t("contactTab.toasts.errorDesc")
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
        <Overline className="mb-2">{t("contactTab.successOverline")}</Overline>
        <h2 className="text-[1.6rem] font-serif text-foreground mb-2">
          {t("contactTab.successTitle")}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {t("contactTab.successDesc", { email: profileEmail })}
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
            {t("contactTab.sendAnother")}
          </CustomButton>
          <CustomButton
            type="button"
            styleType="primary"
            radius="full"
            size="sm"
            onClick={() => go("tickets")}
          >
            {t("contactTab.viewTickets")}
          </CustomButton>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
      <Panel className="p-8">
        <Overline className="mb-2.5">{t("contactTab.overline")}</Overline>
        <h2 className="text-[1.6rem] font-serif text-foreground mb-2 leading-snug">
          {t("contactTab.title")}
        </h2>
        <p className="text-[13px] text-muted-foreground mb-7 leading-relaxed max-w-[520px]">
          {t("contactTab.desc")}
        </p>

        <p className="block mb-3 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
          {t("contactTab.topicLabel")}
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          {topics.map((item) => (
            <button
              key={item.id}
              onClick={() => setTopic(item.id)}
              className={`px-4 py-2 rounded-full border text-[12px] font-semibold transition-all ${
                topic === item.id
                  ? "bg-secondary border-primary text-primary"
                  : "bg-card border-border/70 text-foreground hover:border-primary/40"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mb-5">
          <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            {t("contactTab.fieldSubject")}
          </label>
          <CustomInput
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("contactTab.fieldSubjectPlaceholder")}
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
              {t("contactTab.fieldMessage")}
            </label>
            <span className="text-[11px] text-muted-foreground">
              {message.length}/2000
            </span>
          </div>
          <CustomTextarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("contactTab.fieldMessagePlaceholder")}
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
            {t("contactTab.autoSession")}
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
            {t("contactTab.cancel")}
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
              t("contactTab.sending")
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                {t("contactTab.send")}
              </>
            )}
          </CustomButton>
        </div>
      </Panel>

      <div className="flex flex-col gap-4 xl:sticky xl:top-6">
        <Panel className="p-5">
          <Overline className="mb-3">
            {t("contactTab.sidebarOverline")}
          </Overline>
          <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">
            {t("contactTab.sidebarDesc", { pct: 80 })}
          </p>
          {sidebarLinks.map((item, i, arr) => (
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
          <Overline className="mb-2">
            {t("contactTab.availabilityTitle")}
          </Overline>
          <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
            {t("contactTab.availabilityActive")}
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
  const { session, user, locale } = useAuth();
  const { t } = useTranslation("support");
  const sessionAccessToken = session?.access_token;
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const queryClient = useQueryClient();
  const ticketNodeRefs = useRef(new Map<string, HTMLDivElement>());
  const ticketLayoutSnapshotRef = useRef(new Map<string, DOMRect>());
  const listRefetchPromiseRef = useRef<Promise<unknown> | null>(null);
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: supportTicketsQueryKeys.list(user?.id),
    queryFn: fetchMySupportTickets,
    enabled: Boolean(user?.id),
    staleTime: 15_000
  });

  useEffect(() => {
    if (!user?.id || !sessionAccessToken) return;

    supabase.realtime.setAuth(sessionAccessToken);
    const refetchTicketList = () => {
      if (listRefetchPromiseRef.current) return;

      listRefetchPromiseRef.current = queryClient
        .refetchQueries({
          queryKey: supportTicketsQueryKeys.list(user.id)
        })
        .finally(() => {
          listRefetchPromiseRef.current = null;
        });
    };

    const channel = supabase
      .channel(`support-tickets:${user.id}`, {
        config: {
          private: true
        }
      })
      .on("broadcast", { event: "INSERT" }, () => {
        refetchTicketList();
      })
      .on("broadcast", { event: "UPDATE" }, () => {
        refetchTicketList();
      })
      .on("broadcast", { event: "DELETE" }, () => {
        refetchTicketList();
      })
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [queryClient, sessionAccessToken, user?.id]);

  const topicLabels: Record<SupportContactCategory, string> = {
    account: t("profile:contactTab.topics.account"),
    billing: t("profile:contactTab.topics.billing"),
    tests: t("profile:contactTab.topics.tests"),
    ai: t("profile:contactTab.topics.ai"),
    technical: t("profile:contactTab.topics.technical")
  };

  const filters: { id: typeof filter; label: string; count: number }[] = [
    { id: "all", label: t("tickets.filters.all"), count: tickets.length },
    {
      id: "open",
      label: t("tickets.filters.open"),
      count: tickets.filter((ticket) => ticket.status !== "resolved").length
    },
    {
      id: "resolved",
      label: t("tickets.filters.resolved"),
      count: tickets.filter((ticket) => ticket.status === "resolved").length
    }
  ];

  const list = tickets.filter((ticket) => {
    if (filter === "all") return true;
    if (filter === "open") return ticket.status !== "resolved";
    return ticket.status === "resolved";
  });
  const ticketListLayoutSignature = list
    .map(
      (ticket) =>
        `${ticket.id}:${ticket.lastMessageAt}:${ticket.messageCount}:${ticket.unread}`
    )
    .join("|");

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const nextSnapshot = new Map<string, DOMRect>();

    ticketNodeRefs.current.forEach((node, ticketId) => {
      const currentRect = node.getBoundingClientRect();
      const previousRect = ticketLayoutSnapshotRef.current.get(ticketId);
      nextSnapshot.set(ticketId, currentRect);

      if (reduceMotion || !previousRect) return;

      const deltaX = previousRect.left - currentRect.left;
      const deltaY = previousRect.top - currentRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

      node.animate(
        [
          {
            transform: `translate(${deltaX}px, ${deltaY}px)`,
            filter: "brightness(1.04)"
          },
          {
            transform: "translate(0, 0)",
            filter: "brightness(1)"
          }
        ],
        {
          duration: 360,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)"
        }
      );
    });

    ticketLayoutSnapshotRef.current = nextSnapshot;
  }, [ticketListLayoutSignature]);

  const STATUS_STYLES: Record<
    TicketStatus,
    { label: string; className: string }
  > = {
    open: {
      label: t("tickets.status.open"),
      className: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
    },
    awaiting: {
      label: t("tickets.status.awaiting"),
      className:
        "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
    },
    resolved: {
      label: t("tickets.status.resolved"),
      className:
        "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
    }
  };

  return (
    <div className="max-w-[980px]">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Overline className="mb-2">{t("tickets.overline")}</Overline>
          <h1 className="text-[2rem] leading-[1.1] font-serif text-foreground">
            {t("tickets.pageTitle")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("tickets.subtitle")}
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
          {t("tickets.newQuery")}
        </CustomButton>
      </div>

      <div className="flex gap-2 mb-4">
        {filters.map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={`px-4 py-2 rounded-full border text-[12px] font-semibold flex items-center gap-2 transition-all ${
              filter === item.id
                ? "bg-primary border-primary text-white"
                : "bg-card border-border/70 text-foreground hover:border-primary/40"
            }`}
          >
            {item.label}
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                filter === item.id
                  ? "bg-white/25 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <Panel className="p-14 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Panel>
      ) : list.length === 0 ? (
        <Panel className="p-14 text-center">
          <div className="w-14 h-14 rounded-[18px] bg-muted flex items-center justify-center mx-auto mb-4 text-muted-foreground">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h3 className="text-[1.3rem] font-serif text-foreground mb-1.5">
            {t("tickets.empty.title")}
          </h3>
          <p className="text-[13px] text-muted-foreground mb-4">
            {t("tickets.empty.description")}
          </p>
          <CustomButton
            type="button"
            styleType="primary"
            radius="full"
            size="sm"
            onClick={() => go("contact")}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("tickets.empty.cta")}
          </CustomButton>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((ticket) => {
            const status = STATUS_STYLES[mapTicketStatus(ticket.status)];
            return (
              <div
                key={ticket.id}
                ref={(node) => {
                  if (node) {
                    ticketNodeRefs.current.set(ticket.id, node);
                    return;
                  }

                  ticketNodeRefs.current.delete(ticket.id);
                }}
              >
                <Panel
                  onClick={() => onOpenTicket(ticket.id)}
                  className="p-5 cursor-pointer hover:-translate-y-0.5 hover:border-primary/30 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                        <span className="text-[11px] font-bold text-muted-foreground tracking-[0.14em]">
                          {ticket.code}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] ${status.className}`}
                        >
                          {status.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          - {topicLabels[ticket.category]}
                        </span>
                        {ticket.unread && (
                          <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(249,115,22,0.15)]" />
                        )}
                      </div>
                      <div className="text-sm font-bold text-foreground mb-1.5">
                        {ticket.subject}
                      </div>
                      <div className="text-[12px] text-muted-foreground flex gap-3 flex-wrap">
                        <span>
                          {t("tickets.meta.messages", {
                            count: ticket.messageCount
                          })}
                        </span>
                        <span>-</span>
                        <span>
                          {t("tickets.meta.updated", {
                            date: formatRelativeDate(
                              ticket.lastMessageAt,
                              locale
                            )
                          })}
                        </span>
                        {ticket.rating && (
                          <>
                            <span>-</span>
                            <span className="text-primary">
                              {"*".repeat(ticket.rating)}
                              {".".repeat(5 - ticket.rating)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </Panel>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

type PendingImageAttachment = {
  id: string;
  file: File;
  previewUrl: string;
};

const TicketMessageAttachments = ({
  attachments,
  align = "left"
}: {
  attachments: SupportTicketAttachment[];
  align?: "left" | "right";
}) => {
  if (!attachments.length) return null;

  return (
    <div
      className={`mt-3 grid gap-2 ${
        attachments.length > 1 ? "grid-cols-2" : "grid-cols-1"
      } ${align === "right" ? "justify-items-end" : ""}`}
    >
      {attachments.map((attachment) => {
        if (isImageAttachment(attachment) && attachment.signedUrl) {
          const isLandscape =
            attachment.imageWidth !== null &&
            attachment.imageHeight !== null &&
            attachment.imageWidth > attachment.imageHeight;

          return (
            <a
              key={attachment.id}
              href={attachment.signedUrl}
              target="_blank"
              rel="noreferrer"
              className={`block max-w-full overflow-hidden rounded-2xl border border-border/60 bg-background/50 ${
                isLandscape ? "w-full sm:max-w-[420px]" : "w-fit max-w-[240px]"
              }`}
            >
              <img
                src={attachment.signedUrl}
                alt={attachment.fileName}
                className="block max-h-[260px] max-w-full object-contain"
                loading="lazy"
              />
            </a>
          );
        }

        return (
          <a
            key={attachment.id}
            href={attachment.signedUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-[180px] items-center gap-3 rounded-2xl border border-border/60 bg-background/60 px-3 py-3"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-primary">
              <Paperclip className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {attachment.fileName}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {formatAttachmentSize(attachment.fileSizeBytes)}
              </span>
            </span>
          </a>
        );
      })}
    </div>
  );
};

const SupportChat = ({
  go,
  ticketId
}: {
  go: (r: RouteName) => void;
  ticketId?: string;
}) => {
  const [message, setMessage] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImageAttachment[]>(
    []
  );
  const { session, user } = useAuth();
  const sessionAccessToken = session?.access_token;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const unreadMarkerRef = useRef<HTMLDivElement | null>(null);
  const pendingImagesRef = useRef<PendingImageAttachment[]>([]);
  const initialScrollTicketRef = useRef<string | null>(null);
  const initialMessageIdsRef = useRef<Set<string | number> | null>(null);
  const markedReadTicketRef = useRef<string | null>(null);
  const optimisticMessageIdRef = useRef(-1);
  const readSyncPromiseRef = useRef<Promise<unknown> | null>(null);
  const ticketRefreshPromiseRef = useRef<Promise<unknown> | null>(null);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [initialReadCursor, setInitialReadCursor] = useState<{
    ticketId: string;
    value: string | null;
  } | null>(null);
  const { t } = useTranslation("support");
  const { data: ticket, isLoading: isTicketLoading } = useQuery({
    queryKey: supportTicketsQueryKeys.detail(ticketId),
    queryFn: () => fetchMySupportTicketDetail(ticketId as string),
    enabled: Boolean(ticketId),
    staleTime: 15_000
  });
  const { data: messages = [], isLoading: isMessagesLoading } = useQuery({
    queryKey: supportTicketsQueryKeys.messages(ticketId),
    queryFn: () => fetchMySupportTicketMessages(ticketId as string),
    enabled: Boolean(ticketId)
  });

  useEffect(() => {
    if (!ticketId) {
      setInitialReadCursor(null);
      return;
    }

    initialScrollTicketRef.current = null;
    initialMessageIdsRef.current = null;
    markedReadTicketRef.current = null;
  }, [ticketId]);

  useEffect(() => {
    if (!ticketId || !ticket) return;
    if (initialReadCursor?.ticketId === ticketId) return;

    setInitialReadCursor({
      ticketId,
      value: ticket.userLastReadAt
    });
  }, [initialReadCursor?.ticketId, ticket, ticketId]);

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(
    () => () => {
      pendingImagesRef.current.forEach((attachment) =>
        URL.revokeObjectURL(attachment.previewUrl)
      );
    },
    []
  );

  const hasInitialReadCursor = initialReadCursor?.ticketId === ticketId;
  const firstUnreadMessageId = useMemo(() => {
    if (!hasInitialReadCursor) return null;

    const readCursor = initialReadCursor.value;
    const initialMessageIds = initialMessageIdsRef.current;
    return (
      messages.find(
        (ticketMessage) =>
          ticketMessage.authorRole === "staff" &&
          (!initialMessageIds || initialMessageIds.has(ticketMessage.id)) &&
          (!readCursor ||
            new Date(ticketMessage.createdAt).getTime() >
              new Date(readCursor).getTime())
      )?.id ?? null
    );
  }, [hasInitialReadCursor, initialReadCursor?.value, messages]);

  useLayoutEffect(() => {
    const node = messagesContainerRef.current;
    if (!node || !ticketId || isMessagesLoading || !hasInitialReadCursor)
      return;

    if (initialScrollTicketRef.current === ticketId) {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
      return;
    }

    const unreadMarker = unreadMarkerRef.current;
    if (unreadMarker) unreadMarker.scrollIntoView({ block: "center" });
    else node.scrollTo({ top: node.scrollHeight, behavior: "auto" });

    initialScrollTicketRef.current = ticketId;
    initialMessageIdsRef.current = new Set(
      messages.map((ticketMessage) => ticketMessage.id)
    );
  }, [
    firstUnreadMessageId,
    hasInitialReadCursor,
    isMessagesLoading,
    messages,
    messages.length,
    ticketId
  ]);

  useEffect(() => {
    if (
      !ticketId ||
      isMessagesLoading ||
      initialScrollTicketRef.current !== ticketId ||
      markedReadTicketRef.current === ticketId
    )
      return;

    markedReadTicketRef.current = ticketId;
    readSyncPromiseRef.current = markSupportTicketRead(ticketId).finally(() => {
      readSyncPromiseRef.current = null;
    });
  }, [isMessagesLoading, messages.length, ticketId]);

  useEffect(() => {
    if (
      !ticketId ||
      isMessagesLoading ||
      initialScrollTicketRef.current !== ticketId ||
      messages.length === 0 ||
      !initialMessageIdsRef.current ||
      readSyncPromiseRef.current
    )
      return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.authorRole !== "staff") return;
    if (initialMessageIdsRef.current.has(lastMessage.id)) return;

    setInitialReadCursor({ ticketId, value: new Date().toISOString() });
    initialMessageIdsRef.current.add(lastMessage.id);
    readSyncPromiseRef.current = markSupportTicketRead(ticketId).finally(() => {
      readSyncPromiseRef.current = null;
    });
  }, [isMessagesLoading, messages, ticketId]);

  useEffect(() => {
    if (!ticketId || !sessionAccessToken) return;

    const refreshTicketState = () => {
      if (ticketRefreshPromiseRef.current) return;

      ticketRefreshPromiseRef.current = Promise.allSettled([
        queryClient.refetchQueries({
          queryKey: supportTicketsQueryKeys.messages(ticketId)
        }),
        queryClient.refetchQueries({
          queryKey: supportTicketsQueryKeys.detail(ticketId)
        }),
        queryClient.refetchQueries({
          queryKey: supportTicketsQueryKeys.list(user?.id)
        })
      ]).finally(() => {
        ticketRefreshPromiseRef.current = null;
      });
    };

    supabase.realtime.setAuth(sessionAccessToken);
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeTimer = window.setTimeout(() => {
      const channelName = `support-ticket:${ticketId}`;

      channel = supabase
        .channel(channelName, {
          config: {
            private: true
          }
        })
        .on("broadcast", { event: "INSERT" }, () => {
          refreshTicketState();
        })
        .on("broadcast", { event: "UPDATE" }, () => {
          refreshTicketState();
        })
        .on("broadcast", { event: "DELETE" }, () => {
          refreshTicketState();
        })
        .subscribe();
    }, 0);

    return () => {
      window.clearTimeout(subscribeTimer);
      if (channel) void channel.unsubscribe();
    };
  }, [queryClient, sessionAccessToken, ticketId, user?.id]);

  const statusStyles: Record<
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

  const currentStatus = ticket ? mapTicketStatus(ticket.status) : "open";

  const clearPendingImages = useCallback(() => {
    setPendingImages((current) => {
      current.forEach((attachment) =>
        URL.revokeObjectURL(attachment.previewUrl)
      );
      return [];
    });
  }, []);

  const handleFilesSelected = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []).filter(
        (file) => file.type.startsWith("image/")
      );

      if (!selectedFiles.length) return;

      setUploadError(null);
      setPendingImages((current) => {
        const next = [...current];
        for (const file of selectedFiles.slice(
          0,
          Math.max(0, 6 - current.length)
        )) {
          next.push({
            id: crypto.randomUUID(),
            file,
            previewUrl: URL.createObjectURL(file)
          });
        }
        return next;
      });

      event.target.value = "";
    },
    []
  );

  const removePendingImage = useCallback((attachmentId: string) => {
    setPendingImages((current) => {
      const target = current.find(
        (attachment) => attachment.id === attachmentId
      );
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((attachment) => attachment.id !== attachmentId);
    });
  }, []);

  const handleSend = async () => {
    const nextMessage = message.trim();
    if (!ticketId || (!nextMessage && pendingImages.length === 0) || !user?.id)
      return;

    const now = new Date().toISOString();
    const optimisticMessage: SupportTicketMessage | null = nextMessage
      ? {
          id: optimisticMessageIdRef.current--,
          ticketId,
          authorRole: "user",
          body: nextMessage,
          sourceChannel: "web",
          createdAt: now,
          attachments: []
        }
      : null;
    const previousMessages = queryClient.getQueryData<SupportTicketMessage[]>(
      supportTicketsQueryKeys.messages(ticketId)
    );

    setSending(true);
    setUploadError(null);
    setInitialReadCursor({ ticketId, value: now });
    markedReadTicketRef.current = ticketId;
    setMessage("");

    if (optimisticMessage) {
      queryClient.setQueryData<SupportTicketMessage[]>(
        supportTicketsQueryKeys.messages(ticketId),
        (current = []) => [...current, optimisticMessage]
      );
    }

    let uploadedAttachments: Awaited<
      ReturnType<typeof uploadSupportTicketImages>
    > = [];
    try {
      uploadedAttachments = await uploadSupportTicketImages({
        userId: user.id,
        ticketId,
        files: pendingImages.map((attachment) => attachment.file)
      });
      await replyToSupportTicket(ticketId, nextMessage, uploadedAttachments);
      await syncSupportTicketToTelegram(ticketId).catch(() => undefined);
      clearPendingImages();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: supportTicketsQueryKeys.messages(ticketId)
        }),
        queryClient.invalidateQueries({
          queryKey: supportTicketsQueryKeys.detail(ticketId)
        }),
        queryClient.invalidateQueries({
          queryKey: supportTicketsQueryKeys.list(user?.id)
        })
      ]);
    } catch (error) {
      if (uploadedAttachments.length) {
        await removeSupportTicketImages(
          uploadedAttachments.map((attachment) => attachment.storagePath)
        ).catch(() => undefined);
      }
      setUploadError(
        error instanceof Error ? error.message : "No se pudo enviar el mensaje."
      );
      queryClient.setQueryData(
        supportTicketsQueryKeys.messages(ticketId),
        previousMessages ?? []
      );
      setMessage(nextMessage);
    } finally {
      setSending(false);
    }
  };
  const canSendMessage =
    Boolean(ticketId) &&
    (message.trim().length > 0 || pendingImages.length > 0);

  const handleMessageKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    if (sending || !canSendMessage) return;
    void handleSend();
  };

  const handleResolve = async () => {
    if (!ticketId || ticket?.status === "resolved") return;

    setResolving(true);
    try {
      await resolveMySupportTicket(ticketId);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: supportTicketsQueryKeys.detail(ticketId)
        }),
        queryClient.invalidateQueries({
          queryKey: supportTicketsQueryKeys.list(user?.id)
        })
      ]);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="max-w-[880px]">
      <PageHeader
        overline="Soporte"
        title="Chat con soporte"
        desc={`Conversacion asociada a ${ticket?.code ?? "tu ticket"}. La transcripcion se guarda en tus tickets.`}
        onBack={() => go("tickets")}
      />

      <Panel className="overflow-hidden">
        <header className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              IO
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">
                support@ibericaoposiciones.es
              </p>
              <p
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] ${statusStyles[currentStatus].className}`}
              >
                {statusStyles[currentStatus].label}
              </p>
            </div>
          </div>
          <CustomButton
            type="button"
            styleType="menu"
            radius="full"
            size="sm"
            disabled={resolving || ticket?.status === "resolved"}
            onClick={() => {
              void handleResolve();
            }}
          >
            {resolving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            Finalizar
          </CustomButton>
        </header>

        <div
          ref={messagesContainerRef}
          className="h-[390px] overflow-y-auto px-5 py-5"
        >
          {isTicketLoading || isMessagesLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            messages.map((ticketMessage) => {
              const timeLabel = new Date(
                ticketMessage.createdAt
              ).toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit"
              });
              const showUnreadMarker =
                ticketMessage.id === firstUnreadMessageId;

              if (ticketMessage.authorRole === "user") {
                return (
                  <Fragment key={ticketMessage.id}>
                    {showUnreadMarker && (
                      <div
                        ref={unreadMarkerRef}
                        className="mb-5 flex items-center gap-3"
                      >
                        <span className="h-px flex-1 bg-border/70" />
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                          {t("tickets.unreadDivider")}
                        </span>
                        <span className="h-px flex-1 bg-border/70" />
                      </div>
                    )}
                    <div className="mb-4 ml-auto flex w-fit min-w-[4.75rem] max-w-[min(78%,34rem)] flex-col rounded-[1.35rem] rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-[0_18px_45px_-32px_hsl(var(--primary)/0.8)]">
                      {ticketMessage.body ? (
                        <p className="whitespace-pre-wrap break-words">
                          {ticketMessage.body}
                        </p>
                      ) : null}
                      <TicketMessageAttachments
                        attachments={ticketMessage.attachments}
                        align="right"
                      />
                      <p className="mt-1.5 self-end text-[11px] leading-none text-primary-foreground/75">
                        {timeLabel}
                      </p>
                    </div>
                  </Fragment>
                );
              }

              return (
                <Fragment key={ticketMessage.id}>
                  {showUnreadMarker && (
                    <div
                      ref={unreadMarkerRef}
                      className="mb-5 flex items-center gap-3"
                    >
                      <span className="h-px flex-1 bg-border/70" />
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                        {t("tickets.unreadDivider")}
                      </span>
                      <span className="h-px flex-1 bg-border/70" />
                    </div>
                  )}
                  <div className="mb-5 flex items-end gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      IO
                    </span>
                    <div className="flex w-fit min-w-[4.75rem] max-w-[min(78%,34rem)] flex-col rounded-[1.35rem] rounded-bl-md border border-border/70 bg-background px-4 py-2.5 text-sm leading-relaxed text-foreground shadow-[0_18px_45px_-34px_rgba(15,23,42,0.45)]">
                      {ticketMessage.body ? (
                        <p className="whitespace-pre-wrap break-words">
                          {ticketMessage.body}
                        </p>
                      ) : null}
                      <TicketMessageAttachments
                        attachments={ticketMessage.attachments}
                      />
                      <p className="mt-1.5 self-start text-[11px] leading-none text-muted-foreground">
                        {timeLabel}
                      </p>
                    </div>
                  </div>
                </Fragment>
              );
            })
          )}
        </div>

        <footer className="border-t border-border/70 px-5 py-4">
          {pendingImages.length > 0 ? (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {pendingImages.map((attachment) => (
                <div
                  key={attachment.id}
                  className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-muted"
                >
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.file.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePendingImage(attachment.id)}
                    className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
                    aria-label="Eliminar imagen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {uploadError ? (
            <p className="mb-3 text-[12px] text-destructive">{uploadError}</p>
          ) : null}

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Adjuntar archivo"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleMessageKeyDown}
              placeholder="Escribe un mensaje..."
              className="h-10 min-w-0 flex-1 rounded-full border border-border/70 bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
            />
            <CustomButton
              type="button"
              styleType="primary"
              radius="full"
              size="sm"
              disabled={sending || !canSendMessage}
              onClick={() => {
                void handleSend();
              }}
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Enviar
            </CustomButton>
          </div>
        </footer>
      </Panel>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Adjuntamos automaticamente datos de tu sesion y plan para acelerar la
        respuesta.
      </p>
    </div>
  );
};

// ─── DELETE ACCOUNT MODAL ─────────────────────────────────────────────────────

const DeleteAccountModal = ({
  open,
  onClose,
  onConfirmed
}: {
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}) => {
  const { t } = useTranslation("support");
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

  const reasons = t("deleteAccount.reasons", {
    returnObjects: true
  }) as string[];
  const confirmWord = t("deleteAccount.confirmWord");

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
        <DialogTitle className="sr-only">
          {t("deleteAccount.title")}
        </DialogTitle>

        {step === 1 && (
          <div className="p-9">
            <div className="w-12 h-12 rounded-[14px] bg-destructive/10 text-destructive flex items-center justify-center mb-4">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2 className="text-[1.5rem] font-serif text-foreground mb-2">
              {t("deleteAccount.description")}
            </h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed mb-5">
              {t("deleteAccount.warning")}
            </p>
            <div className="rounded-[14px] border border-border/60 mb-5 overflow-hidden">
              {[
                {
                  icon: <BookOpen className="h-3.5 w-3.5" />,
                  label: t("deleteAccount.items.0")
                },
                {
                  icon: <MessageSquare className="h-3.5 w-3.5" />,
                  label: t("deleteAccount.items.1")
                },
                {
                  icon: <Clock className="h-3.5 w-3.5" />,
                  label: t("deleteAccount.items.2")
                },
                {
                  icon: <CreditCard className="h-3.5 w-3.5" />,
                  label: t("deleteAccount.items.3"),
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
              {t("deleteAccount.pauseHint")}
            </div>
            <div className="flex gap-2.5 justify-end">
              <CustomButton
                type="button"
                styleType="menu"
                radius="full"
                size="sm"
                onClick={onClose}
              >
                {t("deleteAccount.keepAccount")}
              </CustomButton>
              <CustomButton
                type="button"
                styleType="destructive"
                radius="full"
                size="sm"
                onClick={() => setStep(2)}
              >
                {t("deleteAccount.continueDelete")}
              </CustomButton>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-9">
            <Overline className="text-destructive mb-2.5">
              {t("deleteAccount.step2Overline")}
            </Overline>
            <h2 className="text-[1.4rem] font-serif text-foreground mb-2">
              {t("deleteAccount.step2Title")}
            </h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
              {t("deleteAccount.step2Desc")}
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
                {t("deleteAccount.back")}
              </CustomButton>
              <CustomButton
                type="button"
                styleType="destructive"
                radius="full"
                size="sm"
                onClick={() => setStep(3)}
              >
                {t("deleteAccount.step2Continue")}
              </CustomButton>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-9">
            <Overline className="text-destructive mb-2.5">
              {t("deleteAccount.step3Overline")}
            </Overline>
            <h2 className="text-[1.4rem] font-serif text-foreground mb-2">
              {t("deleteAccount.step3Title")}
            </h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
              {t("accountDeletion.finalConfirmationPrefix")}{" "}
              <strong className="text-foreground">{confirmWord}</strong>
              {t("accountDeletion.finalConfirmationSuffix")}
            </p>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("deleteAccount.placeholder")}
              className={`${inputCls} mb-2 ${
                confirm === confirmWord ? "border-destructive" : ""
              } font-mono tracking-[0.18em]`}
            />
            <p className="text-[11px] text-muted-foreground mb-6">
              {t("deleteAccount.hint")}
            </p>
            <div className="flex justify-between">
              <CustomButton
                type="button"
                styleType="ghost"
                radius="full"
                size="sm"
                onClick={() => setStep(2)}
              >
                {t("deleteAccount.back")}
              </CustomButton>
              <CustomButton
                type="button"
                styleType="destructive"
                radius="full"
                size="sm"
                disabled={confirm !== confirmWord || working}
                onClick={finalize}
              >
                {working
                  ? t("deleteAccount.processing")
                  : t("deleteAccount.confirm")}
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
const TICKET_PARAM = "ticket";
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
  const { t } = useTranslation("support");
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = normalizeTab(searchParams.get(TAB_PARAM));
  const ticketParam = sanitizeCode(searchParams.get(TICKET_PARAM), 80);
  const [subRoute, setSubRoute] = useState<RouteState | null>(() =>
    activeTab === "tickets" && ticketParam
      ? { name: "support-chat", ticketId: ticketParam }
      : null
  );
  const isClearingTicketParamRef = useRef(false);
  const isOpeningTicketParamRef = useRef(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const go = useCallback(
    (r: RouteName) => {
      if (HUB_ROUTES.has(r)) {
        isClearingTicketParamRef.current = true;
        isOpeningTicketParamRef.current = false;
        setSubRoute(null);
        const next = new URLSearchParams(searchParams);
        next.set(TAB_PARAM, r);
        next.delete(TICKET_PARAM);
        setSearchParams(next, { replace: true });
      } else {
        setSubRoute({ name: r });
        const next = new URLSearchParams(searchParams);
        next.delete(TICKET_PARAM);
        setSearchParams(next, { replace: true });
      }
    },
    [searchParams, setSearchParams]
  );

  const setTab = useCallback(
    (t: TabName) => {
      isClearingTicketParamRef.current = true;
      isOpeningTicketParamRef.current = false;
      setSubRoute(null);
      const next = new URLSearchParams(searchParams);
      next.set(TAB_PARAM, t);
      next.delete(TICKET_PARAM);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const openTicket = useCallback(
    (ticketId: string) => {
      isClearingTicketParamRef.current = false;
      isOpeningTicketParamRef.current = true;
      setSubRoute({ name: "support-chat", ticketId });
      const next = new URLSearchParams(searchParams);
      next.set(TAB_PARAM, "tickets");
      next.set(TICKET_PARAM, ticketId);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  useEffect(() => {
    if (!ticketParam) {
      if (isOpeningTicketParamRef.current) return;
      isClearingTicketParamRef.current = false;
      if (subRoute?.name === "support-chat") setSubRoute(null);
      return;
    }

    isOpeningTicketParamRef.current = false;
    if (isClearingTicketParamRef.current) return;

    if (activeTab === "tickets" && ticketParam) {
      setSubRoute((current) =>
        current?.name === "support-chat" && current.ticketId === ticketParam
          ? current
          : { name: "support-chat", ticketId: ticketParam }
      );
      return;
    }

    if (subRoute?.name === "support-chat") setSubRoute(null);
  }, [activeTab, subRoute?.name, ticketParam]);

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
      {isSubScreen && subRoute.name === "notifications" && (
        <NotificationsPreferences go={go} showToast={showToast} />
      )}
      {isSubScreen && subRoute.name === "privacy" && (
        <Privacy go={go} openDeleteModal={() => setDeleteModalOpen(true)} />
      )}
      {isSubScreen && subRoute.name === "support-chat" && (
        <SupportChat go={go} ticketId={subRoute.ticketId} />
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
            title: t("accountDeletion.toasts.successTitle"),
            description: t("accountDeletion.toasts.successDescription")
          })
        }
      />
    </div>
  );
};

export default Support;

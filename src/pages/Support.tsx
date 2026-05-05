import { useAuth } from "@/auth/AuthProvider";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
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
import {
  sanitizeCode,
  sanitizeSingleLineText,
  sanitizeUrl
} from "@/lib/inputSanitization";
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
  softDeleteAccount,
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
  BookOpen,
  Camera,
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
  ThumbsDown,
  ThumbsUp,
  Trash2
} from "lucide-react";
import {
  useCallback,
  useEffect,
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
  | "privacy"
  | "support-chat";
type RouteState = { name: RouteName; ticketId?: string };

const AVATAR_BUCKET = "profile-avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif"
]);

const sanitizeAvatarForMetadata = (value: string) => sanitizeUrl(value);

const extractAvatarStoragePath = (value: string) => {
  const sanitized = sanitizeAvatarForMetadata(value);
  if (!sanitized) return null;

  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const markerIndex = sanitized.indexOf(marker);
  if (markerIndex === -1) return null;

  return decodeURIComponent(sanitized.slice(markerIndex + marker.length));
};

const buildAvatarStoragePath = (userId: string, file: File) => {
  const cleanName = sanitizeSingleLineText(file.name, 120).toLowerCase();
  const extensionFromName = cleanName.includes(".")
    ? cleanName.split(".").pop()
    : "";
  const extensionFromType = file.type.startsWith("image/")
    ? file.type.replace("image/", "")
    : "";
  const extension = extensionFromName || extensionFromType || "jpg";
  const uniqueId = Math.random().toString(36).slice(2, 10);
  return `${sanitizeCode(userId, 120)}/${Date.now()}-${uniqueId}.${sanitizeCode(extension, 12) || "jpg"}`;
};

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
  action,
  backLabel
}: {
  overline?: string;
  title: string;
  desc?: string;
  onBack: () => void;
  action?: React.ReactNode;
  backLabel?: string;
}) => {
  const { t } = useTranslation("support");
  const label = backLabel ?? t("pageHeader.back");
  return (
    <div className="flex items-start justify-between gap-5 mb-6">
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 mb-3 text-[11px] font-bold tracking-[0.22em] uppercase text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {label}
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

type FaqVote = "up" | "down";

const isFaqVote = (value: unknown): value is FaqVote =>
  value === "up" || value === "down";

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

// ─── HELP CENTER ──────────────────────────────────────────────────────────────

type FaqCat = "account" | "billing" | "tests" | "ia" | "incidents";

const GROUP_CAT_MAP: Record<string, FaqCat> = {
  "account-access": "account",
  "subscription-billing": "billing",
  "tests-progress": "tests",
  "ai-explanations": "ia",
  incidents: "incidents"
};

const HelpCenter = ({ go }: { go: (r: RouteName) => void }) => {
  const { t } = useTranslation("support");
  const [cat, setCat] = useState<string>("all");
  const [query, setQuery] = useState("");

  const faqCategories = [
    { id: "all", label: t("faq.categories.all") },
    { id: "account", label: t("faq.categories.account") },
    { id: "billing", label: t("faq.categories.billing") },
    { id: "tests", label: t("faq.categories.tests") },
    { id: "ia", label: t("faq.categories.ai") },
    { id: "incidents", label: t("faq.categories.incidents") }
  ] as const;

  const faqs = useMemo(() => {
    const groups = t("faq.groups", { returnObjects: true }) as Array<{
      id: string;
      label: string;
      items: Array<{ id: string; question: string; answer: string }>;
    }>;
    return groups.flatMap((g) =>
      g.items.map((item) => ({
        faqId: item.id,
        cat: GROUP_CAT_MAP[g.id] ?? "account",
        groupLabel: g.label,
        q: item.question,
        a: item.answer
      }))
    );
  }, [t]);

  const filtered = useMemo(() => {
    return faqs.filter((f) => {
      if (cat !== "all" && f.cat !== cat) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q);
      }
      return true;
    });
  }, [cat, query, faqs]);

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
                      {f.groupLabel}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pl-1 text-sm text-muted-foreground leading-relaxed">
                    {f.a}
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/60">
                      <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
                        {t("helpCenter.usefulQuestion")}
                      </span>
                      <VoteRow faqId={f.faqId} />
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
              i18nKey="support:helpCenter.sidebar.openConversations"
              components={{ 1: <strong className="text-foreground" /> }}
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
            value={`${firstName} ${lastName}`.trim() || "—"}
          />
          <FieldRow label={t("profileView.email")} value={email || "—"} />
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
          <Overline className="text-primary mb-2.5">
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
          <button
            type="button"
            onClick={() => {
              void handleManagePlan();
            }}
            disabled={isOpeningPaymentPortal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-secondary text-foreground text-[11px] font-bold tracking-[0.22em] uppercase cursor-pointer transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
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
}) => {
  const { t } = useTranslation("profile");
  return (
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
          {t("fieldRow.edit")}
        </button>
      )}
    </div>
  );
};

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
  const { t } = useTranslation("profile");
  const queryClient = useQueryClient();
  const { data: oppositionOptions = [] } = useOppositionOptionsQuery(locale);
  const { data: profileDetails } = useProfileDetailsQuery(
    user?.id ? user.id : null
  );
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [lastName, setLastName] = useState(profile?.lastName ?? "");
  const [draftLocale, setDraftLocale] = useState<AppLocale>(
    locale as AppLocale
  );
  const [oppositionId, setOppositionId] = useState(
    String(profileDetails?.preferred_opposition_id ?? "")
  );
  const [savedOppositionId, setSavedOppositionId] = useState(
    String(profileDetails?.preferred_opposition_id ?? "")
  );
  const [avatarUrl, setAvatarUrl] = useState(
    sanitizeAvatarForMetadata(profileDetails?.avatar_url ?? "")
  );
  const [persistedAvatarUrl, setPersistedAvatarUrl] = useState(
    sanitizeAvatarForMetadata(profileDetails?.avatar_url ?? "")
  );
  const [isAvatarUpdating, setIsAvatarUpdating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isOppositionConfirmOpen, setIsOppositionConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const oppositionChangeLocked =
    profileDetails?.has_changed_opposition === true;
  const oppositionIsChanging =
    !oppositionChangeLocked &&
    oppositionId !== savedOppositionId &&
    Boolean(oppositionId);

  useEffect(() => {
    if (profileDetails?.preferred_opposition_id) {
      setOppositionId(String(profileDetails.preferred_opposition_id));
      setSavedOppositionId(String(profileDetails.preferred_opposition_id));
    }
    const nextAvatarUrl = sanitizeAvatarForMetadata(
      profileDetails?.avatar_url ?? ""
    );
    setAvatarUrl(nextAvatarUrl);
    setPersistedAvatarUrl(nextAvatarUrl);
    if (profileDetails?.locale)
      setDraftLocale(profileDetails.locale as AppLocale);
  }, [profileDetails]);

  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "U";
  const hasAvatar = Boolean(sanitizeAvatarForMetadata(avatarUrl));

  const handleOpenAvatarFilePicker = () => {
    if (!avatarInputRef.current || isAvatarUpdating) return;
    avatarInputRef.current.value = "";
    avatarInputRef.current.click();
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      showToast(t("editProfile.toasts.invalidFormat"));
      event.target.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      showToast(t("editProfile.toasts.imageTooLarge"));
      event.target.value = "";
      return;
    }

    if (!user) {
      showToast(t("editProfile.toasts.invalidSession"));
      event.target.value = "";
      return;
    }

    setIsAvatarUpdating(true);
    try {
      const previousAvatarPath = extractAvatarStoragePath(persistedAvatarUrl);
      const uploadedAvatarPath = buildAvatarStoragePath(user.id, file);

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(uploadedAvatarPath, file, {
          cacheControl: "3600",
          contentType: file.type || undefined,
          upsert: false
        });

      if (uploadError) {
        showToast(t("editProfile.toasts.uploadFailed"));
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(uploadedAvatarPath);
      const nextAvatarUrl = sanitizeAvatarForMetadata(publicUrlData.publicUrl);

      const { error: saveError } = await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          avatar_url: nextAvatarUrl,
          locale: draftLocale
        },
        { onConflict: "user_id" }
      );

      if (saveError) {
        await supabase.storage.from(AVATAR_BUCKET).remove([uploadedAvatarPath]);
        showToast(t("editProfile.toasts.avatarSaveFailed"));
        return;
      }

      if (previousAvatarPath && previousAvatarPath !== uploadedAvatarPath)
        await supabase.storage.from(AVATAR_BUCKET).remove([previousAvatarPath]);

      setAvatarUrl(nextAvatarUrl);
      setPersistedAvatarUrl(nextAvatarUrl);
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      await refreshProfile();
      showToast(t("editProfile.toasts.avatarUpdated"));
    } finally {
      setIsAvatarUpdating(false);
      event.target.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user || isAvatarUpdating || !hasAvatar) return;

    setIsAvatarUpdating(true);
    try {
      const previousAvatarPath = extractAvatarStoragePath(persistedAvatarUrl);
      const { error: saveError } = await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          avatar_url: null,
          locale: draftLocale
        },
        { onConflict: "user_id" }
      );

      if (saveError) {
        showToast(t("editProfile.toasts.avatarRemoveFailed"));
        return;
      }

      if (previousAvatarPath)
        await supabase.storage.from(AVATAR_BUCKET).remove([previousAvatarPath]);

      setAvatarUrl("");
      setPersistedAvatarUrl("");
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      await refreshProfile();
      showToast(t("editProfile.toasts.avatarRemoved"));
    } finally {
      setIsAvatarUpdating(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = t("editProfile.toasts.nameRequired");
    if (!lastName.trim()) e.lastName = t("editProfile.toasts.lastNameRequired");
    return e;
  };

  const doSave = async (markOppositionChanged: boolean) => {
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
          avatar_url: sanitizeAvatarForMetadata(avatarUrl) || null,
          locale: draftLocale,
          ...(markOppositionChanged ? { has_changed_opposition: true } : {})
        },
        { onConflict: "user_id" }
      );

      if (error) {
        showToast(t("editProfile.toasts.saveFailed"));
        return;
      }

      await applyLocale(draftLocale);
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      await refreshProfile();
      showToast(t("editProfile.toasts.saved"));
      go("profile");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    if (oppositionIsChanging) {
      setIsOppositionConfirmOpen(true);
      return;
    }

    await doSave(false);
  };

  const handleConfirmOppositionChange = async () => {
    setIsOppositionConfirmOpen(false);
    await doSave(true);
  };

  return (
    <div className="max-w-[760px]">
      <PageHeader
        overline={t("editProfile.overline")}
        title={t("editProfile.title")}
        desc={t("editProfile.desc")}
        backLabel={t("common:actions.cancel")}
        onBack={() => go("profile")}
      />

      <Panel className="p-8">
        <div className="mb-7 flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary text-2xl font-bold text-primary-foreground">
              {hasAvatar ? (
                <img
                  src={avatarUrl}
                  alt={t("editProfile.avatarAlt")}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {t("editProfile.avatarAlt")}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {t("editProfile.avatarFormat")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <CustomButton
              type="button"
              styleType="menu"
              radius="full"
              size="sm"
              disabled={isAvatarUpdating || saving}
              onClick={handleOpenAvatarFilePicker}
            >
              <Camera className="h-4 w-4" />
              {isAvatarUpdating
                ? t("editProfile.changingPhoto")
                : t("editProfile.changePhoto")}
            </CustomButton>
            {hasAvatar && (
              <CustomButton
                type="button"
                styleType="ghost"
                radius="full"
                size="sm"
                disabled={isAvatarUpdating || saving}
                onClick={() => {
                  void handleRemoveAvatar();
                }}
              >
                {t("editProfile.removePhoto")}
              </CustomButton>
            )}
          </div>

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              void handleAvatarChange(event);
            }}
          />
        </div>

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
              onChange={(e) =>
                setDraftLocale(normalizeLocale(e.target.value) as AppLocale)
              }
              className={`${inputCls} cursor-pointer`}
            >
              <option value="es">{t("common:locale.es")}</option>
              <option value="en">{t("common:locale.en")}</option>
            </CustomSelect>
          </div>
        </div>

        <div className="mb-6">
          <label className="block mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            {t("editProfile.fieldOpposition")}
          </label>
          {oppositionChangeLocked ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-secondary/30 px-4 py-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("editProfile.oppositionLocked")}
              </p>
            </div>
          ) : (
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
          )}
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
              onClick={() => {
                void handleSave();
              }}
            >
              {saving ? t("editProfile.saving") : t("editProfile.save")}
            </CustomButton>
          </div>
        </div>
      </Panel>

      <ConfirmActionDialog
        open={isOppositionConfirmOpen}
        onOpenChange={setIsOppositionConfirmOpen}
        title={t("editProfile.dialog.title")}
        description={t("editProfile.dialog.description", {
          name:
            resolveOppositionNameById(oppositionId, oppositionOptions) ||
            oppositionId
        })}
        warning={t("editProfile.dialog.warning")}
        confirmLabel={
          saving
            ? t("editProfile.dialog.changing")
            : t("editProfile.dialog.confirm")
        }
        cancelLabel={t("editProfile.dialog.cancel")}
        confirmStyle="destructive"
        isLoading={saving}
        onConfirm={handleConfirmOppositionChange}
      />
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
  const strength = [
    t("changePassword.strengthWeak"),
    t("changePassword.strengthFair"),
    t("changePassword.strengthGood"),
    t("changePassword.strengthStrong")
  ][Math.max(0, passed - 1)];
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
        backLabel={t("common:actions.cancel")}
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
  const { t } = useTranslation(["profile", "support"]);
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
        backLabel={t("common:actions.cancel")}
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
          last
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
              {t("support:accountDeletion.dangerDescription")}{" "}
              <strong className="text-foreground">
                {t("support:accountDeletion.irreversible")}
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
  const { t } = useTranslation(["profile", "support"]);
  const profileName =
    `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
  const profileEmail = profile?.email ?? user?.email ?? "";

  type Topic = SupportContactCategory;
  const topics: { id: Topic; label: string }[] = [
    { id: "account", label: t("profile:contactTab.topics.account") },
    { id: "billing", label: t("profile:contactTab.topics.billing") },
    { id: "tests", label: t("profile:contactTab.topics.tests") },
    { id: "ai", label: t("profile:contactTab.topics.ai") },
    { id: "technical", label: t("profile:contactTab.topics.technical") }
  ];

  const [topic, setTopic] = useState<Topic>("billing");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!subject.trim()) e.subject = t("profile:contactTab.errors.subject");
    if (message.trim().length < 20)
      e.message = t("profile:contactTab.errors.message");
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
          locale,
          pathname: window.location.pathname,
          submittedAt: new Date().toISOString(),
          userAgent: navigator.userAgent,
          userId: user?.id ?? null
        }
      });

      if (result.status === "unconfigured") {
        toast({
          title: t("profile:contactTab.toasts.receivedTitle"),
          description: t("profile:contactTab.toasts.sentDesc")
        });
      } else {
        toast({
          title: t("profile:contactTab.toasts.sentTitle"),
          description: t("profile:contactTab.toasts.sentDesc")
        });
      }
      setSent(true);
    } catch {
      toast({
        variant: "destructive",
        title: t("profile:contactTab.toasts.errorTitle"),
        description: t("profile:contactTab.toasts.errorDesc")
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
        <Overline className="mb-2">
          {t("profile:contactTab.successOverline")}
        </Overline>
        <h2 className="text-[1.6rem] font-serif text-foreground mb-2">
          {t("profile:contactTab.successTitle")}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {t("profile:contactTab.successDesc", { email: profileEmail })}
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
            {t("profile:contactTab.sendAnother")}
          </CustomButton>
          <CustomButton
            type="button"
            styleType="primary"
            radius="full"
            size="sm"
            onClick={() => go("tickets")}
          >
            {t("profile:contactTab.viewTickets")}
          </CustomButton>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
      <Panel className="p-8">
        <Overline className="mb-2.5">
          {t("profile:contactTab.overline")}
        </Overline>
        <h2 className="text-[1.6rem] font-serif text-foreground mb-2 leading-snug">
          {t("profile:contactTab.title")}
        </h2>
        <p className="text-[13px] text-muted-foreground mb-7 leading-relaxed max-w-[520px]">
          {t("profile:contactTab.desc")}
        </p>

        <p className="block mb-3 text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
          {t("profile:contactTab.topicLabel")}
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
            {t("profile:contactTab.fieldSubject")}
          </label>
          <CustomInput
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("profile:contactTab.fieldSubjectPlaceholder")}
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
              {t("profile:contactTab.fieldMessage")}
            </label>
            <span className="text-[11px] text-muted-foreground">
              {message.length}/2000
            </span>
          </div>
          <CustomTextarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("profile:contactTab.fieldMessagePlaceholder")}
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
            {t("profile:contactTab.autoSession")}
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
            {t("profile:contactTab.cancel")}
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
              t("profile:contactTab.sending")
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                {t("profile:contactTab.send")}
              </>
            )}
          </CustomButton>
        </div>
      </Panel>

      <div className="flex flex-col gap-4 xl:sticky xl:top-6">
        <Panel className="p-5">
          <Overline className="mb-3">
            {t("profile:contactTab.sidebarOverline")}
          </Overline>
          <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">
            {t("profile:contactTab.sidebarDesc", { pct: 80 })}
          </p>
          {(
            t("profile:contactTab.sidebarLinks", {
              returnObjects: true
            }) as string[]
          ).map((item, i, arr) => (
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
            {t("profile:contactTab.availabilityTitle")}
          </Overline>
          <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
            {supportChannelAvailability.contact
              ? t("profile:contactTab.availabilityActive")
              : t("profile:contactTab.availabilityInactive")}
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
  const { t } = useTranslation("support");
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");

  const filters: { id: typeof filter; label: string; count: number }[] = [
    { id: "all", label: t("tickets.filters.all"), count: DEMO_TICKETS.length },
    {
      id: "open",
      label: t("tickets.filters.open"),
      count: DEMO_TICKETS.filter(
        (t) => t.status === "open" || t.status === "awaiting"
      ).length
    },
    {
      id: "resolved",
      label: t("tickets.filters.resolved"),
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
                      <span>
                        {t("tickets.meta.messages", { count: ticket.messages })}
                      </span>
                      <span>·</span>
                      <span>
                        {t("tickets.meta.updated", { date: ticket.lastUpdate })}
                      </span>
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
  const { t } = useTranslation("support");
  const [message, setMessage] = useState("");
  const subject = ticket?.subject ?? t("supportChat.fallbackSubject");
  const attachmentName = `${t("supportChat.attachmentPrefix")}_${ticket?.id.replace("#", "") ?? "ticket"}.pdf`;

  return (
    <div className="max-w-[880px]">
      <PageHeader
        overline={t("supportChat.overline")}
        title={t("supportChat.title")}
        desc={t("supportChat.desc", {
          ticketId: ticket?.id ?? t("supportChat.fallbackTicket")
        })}
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
                Lucia Hernandez · {t("supportChat.level2")}
              </p>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                {t("supportChat.online")}
              </p>
            </div>
          </div>
          <CustomButton type="button" styleType="menu" radius="full" size="sm">
            {t("supportChat.endChat")}
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
            aria-label={t("supportChat.attachFile")}
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("supportChat.placeholder")}
            className="h-10 min-w-0 flex-1 rounded-full border border-border/70 bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          />
          <CustomButton
            type="button"
            styleType="primary"
            radius="full"
            size="sm"
          >
            <Send className="h-3.5 w-3.5" />
            {t("supportChat.send")}
          </CustomButton>
        </footer>
      </Panel>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        {t("supportChat.footerNote")}
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
  onConfirmed: () => Promise<void>;
}) => {
  const { toast } = useToast();
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

  const finalize = async () => {
    setWorking(true);
    try {
      await softDeleteAccount(reason);
      onClose();
      await onConfirmed();
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message.trim()
          : "";
      toast({
        variant: "destructive",
        title: t("accountDeletion.toasts.errorTitle"),
        description:
          errorMessage && errorMessage !== "account_delete_failed"
            ? errorMessage
            : t("accountDeletion.toasts.errorDescription")
      });
    } finally {
      setWorking(false);
    }
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
              {(
                t("deleteAccount.items", { returnObjects: true }) as string[]
              ).map((item, i, arr) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    i === arr.length - 1 ? "" : "border-b border-border/60"
                  }`}
                >
                  <span className="w-7 h-7 rounded-[8px] bg-destructive/10 text-destructive flex items-center justify-center flex-shrink-0">
                    {i === 0 ? (
                      <BookOpen className="h-3.5 w-3.5" />
                    ) : i === 1 ? (
                      <MessageSquare className="h-3.5 w-3.5" />
                    ) : i === 2 ? (
                      <Clock className="h-3.5 w-3.5" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="text-[13px] text-foreground font-semibold">
                    {item}
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
              {(
                t("deleteAccount.reasons", { returnObjects: true }) as string[]
              ).map((r) => (
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
              <strong className="text-foreground">
                {t("deleteAccount.confirmWord")}
              </strong>
              {t("accountDeletion.finalConfirmationSuffix")}
            </p>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("deleteAccount.placeholder")}
              className={`${inputCls} mb-2 ${
                confirm === t("deleteAccount.confirmWord")
                  ? "border-destructive"
                  : ""
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
                disabled={confirm !== t("deleteAccount.confirmWord") || working}
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
  const { forceLogout } = useAuth();
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
        onConfirmed={async () => {
          toast({
            title: t("accountDeletion.toasts.successTitle"),
            description: t("accountDeletion.toasts.successDescription")
          });
          await forceLogout("account_soft_deleted");
        }}
      />
    </div>
  );
};

export default Support;

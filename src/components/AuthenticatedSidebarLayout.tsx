import logoPrincipal from "@/assets/logo-principal.png";
import { useAuth } from "@/auth/AuthProvider";
import BrandLogo from "@/components/BrandLogo";
import WorkspaceTour, {
  type WorkspaceTourHandle
} from "@/components/onboarding/WorkspaceTour";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import CustomButton from "@/components/ui/custom-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import UserActionsDropdown from "@/components/UserActionsDropdown";
import { isPaidPlan } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { WORKSPACE_TOUR_TARGETS } from "@/lib/workspaceTour";
import {
  useUserBillingIssueQuery,
  useUserPlanStateQuery
} from "@/queries/subscriptionQueries";
import { useStudyTimer } from "@/study/StudyTimerProvider";
import {
  AlertTriangle,
  Brain,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  FileText,
  LayoutDashboard,
  Menu,
  NotebookText,
  Pause,
  Play,
  Sparkles,
  TimerReset,
  X
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router-dom";

const SIDEBAR_COLLAPSE_STORAGE_KEY = "iberica-oposiciones:sidebar-collapsed";
const BILLING_ISSUE_DISMISS_PREFIX =
  "iberica-oposiciones:billing-issue-dismissed";
const STUDY_TIMER_BADGE_POSITION_STORAGE_KEY =
  "iberica-oposiciones:study-timer-badge-position-v1";
const STUDY_TIMER_BADGE_WIDTH = 208;
const STUDY_TIMER_BADGE_HEIGHT = 44;
const STUDY_TIMER_BADGE_MARGIN = 38;
const STUDY_TIMER_BADGE_DEFAULT_RIGHT_MARGIN = 80;

type StudyTimerBadgePosition = {
  x: number;
  y: number;
};

const formatPlanEndDate = (value: string | null, locale: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const clampStudyTimerBadgePosition = (
  position: StudyTimerBadgePosition,
  viewportWidth: number,
  viewportHeight: number
): StudyTimerBadgePosition => ({
  x: Math.min(
    Math.max(position.x, STUDY_TIMER_BADGE_MARGIN),
    Math.max(
      STUDY_TIMER_BADGE_MARGIN,
      viewportWidth - STUDY_TIMER_BADGE_WIDTH - STUDY_TIMER_BADGE_MARGIN
    )
  ),
  y: Math.min(
    Math.max(position.y, STUDY_TIMER_BADGE_MARGIN),
    Math.max(
      STUDY_TIMER_BADGE_MARGIN,
      viewportHeight - STUDY_TIMER_BADGE_HEIGHT - STUDY_TIMER_BADGE_MARGIN
    )
  )
});

const getDefaultStudyTimerBadgePosition = () =>
  clampStudyTimerBadgePosition(
    {
      x:
        window.innerWidth -
        STUDY_TIMER_BADGE_WIDTH -
        STUDY_TIMER_BADGE_DEFAULT_RIGHT_MARGIN,
      y: STUDY_TIMER_BADGE_MARGIN
    },
    window.innerWidth,
    window.innerHeight
  );

const getInitialStudyTimerBadgePosition =
  (): StudyTimerBadgePosition | null => {
    if (typeof window === "undefined") return null;

    const rawValue = window.localStorage.getItem(
      STUDY_TIMER_BADGE_POSITION_STORAGE_KEY
    );
    if (!rawValue) return getDefaultStudyTimerBadgePosition();

    try {
      const parsed = JSON.parse(rawValue) as Partial<StudyTimerBadgePosition>;
      if (typeof parsed.x !== "number" || typeof parsed.y !== "number")
        return getDefaultStudyTimerBadgePosition();

      return clampStudyTimerBadgePosition(
        { x: parsed.x, y: parsed.y },
        window.innerWidth,
        window.innerHeight
      );
    } catch {
      return getDefaultStudyTimerBadgePosition();
    }
  };

const AuthenticatedSidebarLayout = () => {
  const location = useLocation();
  const { t, i18n } = useTranslation(["profile", "common", "plans"]);
  const { profile, user } = useAuth();
  const { status, formattedRemaining, pause, restart, resume } =
    useStudyTimer();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === "1";
  });
  const avatarUrl =
    profile?.avatarUrl ||
    (typeof user?.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : "");
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const handleAvatarError = useCallback(() => setAvatarLoadError(true), []);
  const previousAvatarUrlRef = useRef(avatarUrl);
  if (previousAvatarUrlRef.current !== avatarUrl) {
    previousAvatarUrlRef.current = avatarUrl;
    if (avatarLoadError) setAvatarLoadError(false);
  }
  const accountName = useMemo(() => {
    const fullName = `${profile?.firstName ?? ""} ${
      profile?.lastName ?? ""
    }`.trim();
    return fullName || profile?.email || t("profile:layout.defaults.account");
  }, [profile, t]);
  const { data: planState } = useUserPlanStateQuery(user?.id);
  const { data: billingIssue } = useUserBillingIssueQuery(user?.id);
  const isFreePlan = !isPaidPlan(planState);
  const intlLocale = useMemo(
    () =>
      i18n.resolvedLanguage?.toLowerCase().startsWith("en") ? "en-US" : "es-ES",
    [i18n.resolvedLanguage]
  );
  const premiumUntilDateLabel = useMemo(
    () => formatPlanEndDate(planState?.current_period_end ?? null, intlLocale),
    [intlLocale, planState?.current_period_end]
  );
  const showPremiumUntilNotice = Boolean(
    isPaidPlan(planState) &&
    planState?.cancel_at_period_end &&
    premiumUntilDateLabel
  );
  const billingIssueFingerprint = billingIssue
    ? `${billingIssue.subscription_id}:${billingIssue.updated_at ?? ""}:${billingIssue.failed_at ?? ""}`
    : "";
  const [
    dismissedBillingIssueFingerprint,
    setDismissedBillingIssueFingerprint
  ] = useState("");
  const [studyTimerBadgePosition, setStudyTimerBadgePosition] =
    useState<StudyTimerBadgePosition | null>(() =>
      getInitialStudyTimerBadgePosition()
    );
  const studyTimerBadgeDragRef = useRef<{
    offsetX: number;
    offsetY: number;
    pointerId: number;
  } | null>(null);
  const workspaceTourRef = useRef<WorkspaceTourHandle | null>(null);

  const menuGroups = useMemo(
    () => [
      {
        title: t("profile:layout.menuGroups.general"),
        items: [
          {
            label: t("profile:layout.menuItems.dashboard"),
            to: "/dashboard",
            icon: LayoutDashboard
          },
          {
            label: t("profile:layout.menuItems.ia"),
            to: "/perfil/asistente-ia",
            icon: Brain
          }
        ]
      },
      {
        title: t("profile:layout.menuGroups.preparation"),
        items: [
          {
            label: t("profile:layout.menuItems.test"),
            to: "/perfil/test",
            icon: FileText
          },
          {
            label: t("profile:layout.menuItems.syllabus"),
            to: "/perfil/temario",
            icon: NotebookText
          },
          {
            label: t("profile:layout.menuItems.study"),
            to: "/perfil/pomodoro",
            icon: TimerReset
          }
        ]
      }
    ],
    [t]
  );
  const sidebarMenuItems = useMemo(
    () => menuGroups.flatMap((group) => group.items),
    [menuGroups]
  );

  const closeMobileSidebar = () => setIsMobileOpen(false);
  const isPdfViewerRoute = location.pathname.startsWith("/perfil/temario/pdf/");
  const isAssistantRoute = location.pathname === "/perfil/asistente-ia";
  const showTopHeader = !isPdfViewerRoute;
  const desktopSidebarOffsetClass = isPdfViewerRoute
    ? ""
    : isSidebarCollapsed
      ? "lg:pl-[6.75rem] xl:pl-[6.75rem]"
      : "lg:pl-[19rem] xl:pl-[19.5rem]";
  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };
  const showHeaderTimer =
    location.pathname !== "/perfil/pomodoro" && status !== "idle";

  useEffect(() => {
    const updateScrollState = () => {
      setIsHeaderScrolled(window.scrollY > 12);
    };

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      SIDEBAR_COLLAPSE_STORAGE_KEY,
      isSidebarCollapsed ? "1" : "0"
    );
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!isPdfViewerRoute) return;
    setIsMobileOpen(false);
  }, [isPdfViewerRoute]);

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") {
      setDismissedBillingIssueFingerprint("");
      return;
    }

    const stored =
      window.sessionStorage.getItem(
        `${BILLING_ISSUE_DISMISS_PREFIX}:${user.id}`
      ) ?? "";
    setDismissedBillingIssueFingerprint(stored);
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!studyTimerBadgePosition) {
      setStudyTimerBadgePosition(getDefaultStudyTimerBadgePosition());
      return;
    }

    window.localStorage.setItem(
      STUDY_TIMER_BADGE_POSITION_STORAGE_KEY,
      JSON.stringify(studyTimerBadgePosition)
    );
  }, [studyTimerBadgePosition]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setStudyTimerBadgePosition((currentPosition) => {
        const fallbackPosition = getDefaultStudyTimerBadgePosition();
        if (!currentPosition) return fallbackPosition;

        return clampStudyTimerBadgePosition(
          currentPosition,
          window.innerWidth,
          window.innerHeight
        );
      });
    };

    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = studyTimerBadgeDragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      setStudyTimerBadgePosition(
        clampStudyTimerBadgePosition(
          {
            x: event.clientX - dragState.offsetX,
            y: event.clientY - dragState.offsetY
          },
          window.innerWidth,
          window.innerHeight
        )
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dragState = studyTimerBadgeDragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      studyTimerBadgeDragRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const showBillingIssueBanner =
    Boolean(billingIssue) &&
    billingIssue.subscription_status === "past_due" &&
    billingIssueFingerprint.length > 0 &&
    dismissedBillingIssueFingerprint !== billingIssueFingerprint;

  const dismissBillingIssueBanner = () => {
    if (!user?.id || !billingIssueFingerprint || typeof window === "undefined")
      return;

    window.sessionStorage.setItem(
      `${BILLING_ISSUE_DISMISS_PREFIX}:${user.id}`,
      billingIssueFingerprint
    );
    setDismissedBillingIssueFingerprint(billingIssueFingerprint);
  };

  const handleStudyTimerBadgePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (!studyTimerBadgePosition) return;

    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-timer-action]"))
      return;

    studyTimerBadgeDragRef.current = {
      offsetX: event.clientX - studyTimerBadgePosition.x,
      offsetY: event.clientY - studyTimerBadgePosition.y,
      pointerId: event.pointerId
    };
  };

  return (
    <TooltipProvider delayDuration={120}>
      <div
        className={cn(
          "min-h-screen bg-background relative overflow-hidden",
          isAssistantRoute && "h-screen max-h-screen flex flex-col"
        )}
      >
        <div className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-charcoal/10 blur-3xl" />

        {showTopHeader ? (
          <header
            className={cn(
              "sticky top-0 relative z-30 transition-all duration-300",
              isHeaderScrolled
                ? "border-b border-border/70 bg-background/80 backdrop-blur-xl shadow-[0_10px_35px_-20px_rgba(15,23,42,0.65)]"
                : "border-b border-transparent bg-transparent",
              isAssistantRoute && "lg:hidden"
            )}
          >
            <div
              className={cn(
                "w-full max-w-[110rem] mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4 transition-all duration-300",
                desktopSidebarOffsetClass
              )}
            >
              <div className="flex items-center gap-3">
                <CustomButton
                  type="button"
                  onClick={() => setIsMobileOpen(true)}
                  styleType="ghost"
                  size="icon"
                  radius="full"
                  className="h-10 w-10 lg:hidden"
                  aria-label={t("profile:layout.mobileMenuOpen")}
                  data-tour-id={WORKSPACE_TOUR_TARGETS.navigation}
                >
                  <Menu className="h-4 w-4" />
                </CustomButton>

                <Link
                  to="/"
                  className="inline-flex items-center gap-2"
                  onClick={closeMobileSidebar}
                >
                  <BrandLogo className="h-20 w-auto" />
                </Link>
              </div>

              <div className="flex items-center gap-2">
                <ThemeToggleButton />
                <UserActionsDropdown
                  onOpenTour={() => workspaceTourRef.current?.start()}
                  triggerDataTourId={WORKSPACE_TOUR_TARGETS.accountMenu}
                />
              </div>
            </div>
          </header>
        ) : null}

        {showHeaderTimer && studyTimerBadgePosition ? (
          <div
            className="fixed z-[60] inline-flex items-center gap-1 rounded-full border border-primary/35 bg-background/92 p-1 text-primary shadow-[0_18px_45px_-28px_rgba(15,23,42,0.6)] backdrop-blur-xl select-none"
            style={{
              left: studyTimerBadgePosition.x,
              top: studyTimerBadgePosition.y,
              touchAction: "none"
            }}
            onPointerDown={handleStudyTimerBadgePointerDown}
          >
            <span className="cursor-grab rounded-full px-2 text-[11px] font-semibold tracking-widest uppercase active:cursor-grabbing">
              {formattedRemaining}
            </span>
            {status === "running" && (
              <button
                type="button"
                data-timer-action="pause"
                onClick={pause}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/40 bg-background/90 transition-colors hover:bg-primary/10"
                aria-label={t("profile:study.pause")}
                title={t("profile:study.pause")}
              >
                <Pause className="h-3.5 w-3.5" />
              </button>
            )}
            {status === "paused" && (
              <button
                type="button"
                data-timer-action="resume"
                onClick={resume}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/40 bg-background/90 transition-colors hover:bg-primary/10"
                aria-label={t("profile:study.resume")}
                title={t("profile:study.resume")}
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              data-timer-action="restart"
              onClick={restart}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/40 bg-background/90 transition-colors hover:bg-primary/10"
              aria-label={t("profile:study.restart")}
              title={t("profile:study.restart")}
            >
              <TimerReset className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {!isPdfViewerRoute && isMobileOpen && (
          <CustomButton
            type="button"
            aria-label={t("profile:layout.mobileMenuClose")}
            styleType="unstyled"
            size="none"
            radius="none"
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={closeMobileSidebar}
          />
        )}

        {!isPdfViewerRoute ? (
          <aside
            className={cn(
              "fixed top-0 start-0 bottom-0 z-50 w-72 max-[480px]:w-[86vw] border-r border-border/70 bg-background/90 backdrop-blur-xl shadow-2xl transition-[transform,width] duration-300 transform",
              isMobileOpen ? "translate-x-0" : "-translate-x-full",
              isSidebarCollapsed ? "lg:w-[4.1rem]" : "lg:w-72",
              "lg:translate-x-0"
            )}
            role="dialog"
            aria-label={t("profile:layout.sidebarAriaLabel")}
          >
            <div className="relative flex flex-col h-full max-h-full overflow-hidden">
              <div className="pointer-events-none absolute -top-16 -right-12 h-44 w-44 rounded-full bg-primary/20 blur-3xl" />

              <header
                className={cn(
                  "relative h-[86px] min-h-[86px] flex items-center gap-2 border-b border-border/60",
                  isSidebarCollapsed
                    ? "lg:justify-center"
                    : "justify-between px-5"
                )}
              >
                <Link
                  to="/"
                  onClick={closeMobileSidebar}
                  className={cn(
                    "inline-flex items-center gap-2",
                    isSidebarCollapsed && "lg:gap-0"
                  )}
                >
                  {isSidebarCollapsed ? (
                    <img
                      src={logoPrincipal}
                      alt="Iberica Oposiciones"
                      className="hidden h-15 w-15 rounded-xl  p-1 object-contain shadow-sm  lg:block"
                    />
                  ) : (
                    <BrandLogo className="h-14 w-auto" />
                  )}
                </Link>

                <div className="flex items-center gap-1 lg:hidden">
                  <CustomButton
                    type="button"
                    onClick={closeMobileSidebar}
                    styleType="ghost"
                    size="iconSm"
                    radius="full"
                    className="lg:hidden"
                    aria-label={t("profile:layout.closeSidebar")}
                  >
                    <X className="h-4 w-4" />
                  </CustomButton>
                </div>
              </header>

              <nav
                className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-3"
                data-tour-id={WORKSPACE_TOUR_TARGETS.navigation}
              >
                <ul className="space-y-1.5">
                  {sidebarMenuItems.map((item) => {
                    const active = location.pathname === item.to;
                    const Icon = item.icon;

                    return (
                      <li key={item.to}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              to={item.to}
                              onClick={closeMobileSidebar}
                              className={cn(
                                "w-full flex items-center overflow-hidden py-2.5 rounded-xl transition-all",
                                "px-3 gap-3",
                                active
                                  ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-12px_hsl(var(--primary)/0.6)]"
                                  : "text-foreground hover:bg-secondary"
                              )}
                              aria-label={
                                isSidebarCollapsed ? item.label : undefined
                              }
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span
                                className={cn(
                                  "min-w-0 overflow-hidden truncate whitespace-nowrap font-medium text-sm transition-all duration-200",
                                  isSidebarCollapsed
                                    ? "lg:max-w-0 lg:opacity-0"
                                    : "max-w-[14rem] opacity-100"
                                )}
                              >
                                {item.label}
                              </span>
                              {active ? (
                                <span
                                  className={cn(
                                    "ml-auto h-2 w-2 rounded-full bg-primary-foreground/80 transition-opacity duration-200",
                                    isSidebarCollapsed
                                      ? "lg:opacity-0"
                                      : "opacity-100"
                                  )}
                                />
                              ) : null}
                            </Link>
                          </TooltipTrigger>
                          {isSidebarCollapsed ? (
                            <TooltipContent
                              side="right"
                              className="hidden lg:block"
                            >
                              {item.label}
                            </TooltipContent>
                          ) : null}
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
                <div
                  className={cn(
                    "mt-4 -mx-3 min-h-0 flex-1 border-t border-border/60 pt-3",
                    isSidebarCollapsed && "lg:hidden"
                  )}
                >
                  <div
                    id="assistant-sidebar-history-slot"
                    className="h-full min-h-0"
                  />
                </div>
              </nav>

              <footer
                className={cn(
                  "relative mt-auto flex flex-col gap-3 border-t border-border/60 p-3",
                  isSidebarCollapsed && "lg:hidden"
                )}
              >
                <Link
                  to="/perfil/mi-perfil"
                  onClick={closeMobileSidebar}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-3 transition-colors hover:bg-secondary/70"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary">
                    {avatarUrl && !avatarLoadError ? (
                      <img
                        src={avatarUrl}
                        alt={t("profile:myProfile.avatarAlt")}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={handleAvatarError}
                      />
                    ) : (
                      <CircleUserRound className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {accountName}
                    </span>
                    <span className="block text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                      {t("profile:layout.myProfile")}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>

                {showPremiumUntilNotice ? (
                  <div className="rounded-xl border border-primary/25 bg-primary/10 px-2.5 py-2 text-xs text-primary">
                    <p className="font-semibold tracking-wide">
                      {t("profile:layout.premiumUntil", {
                        date: premiumUntilDateLabel
                      })}
                    </p>
                  </div>
                ) : isFreePlan ? (
                  <CustomButton
                    asChild
                    styleType="ghost"
                    className="w-full justify-start"
                  >
                    <Link to="/perfil/planes" onClick={closeMobileSidebar}>
                      <Sparkles className="h-4 w-4" />
                      {t("profile:layout.upgradeToPro")}
                    </Link>
                  </CustomButton>
                ) : null}
              </footer>
            </div>

            <CustomButton
              type="button"
              onClick={handleToggleSidebarCollapse}
              styleType="menu"
              radius="full"
              className="absolute right-0 top-[37%] z-20 hidden h-7 w-7 -translate-y-1/2 translate-x-1/2 border-border/80 p-0 shadow-sm lg:inline-flex"
              aria-label={t(
                isSidebarCollapsed
                  ? "profile:layout.expandSidebar"
                  : "profile:layout.collapseSidebar"
              )}
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronLeft className="h-3 w-3" />
              )}
            </CustomButton>
          </aside>
        ) : null}

        <main
          className={cn(
            isPdfViewerRoute
              ? "h-screen w-full max-w-none mx-0 overflow-hidden px-0 pt-0 pb-0 relative z-10 transition-all duration-300"
              : isAssistantRoute
                ? "flex-1 min-h-0 w-full max-w-none mx-0 overflow-hidden px-0 pt-0 pb-0 relative z-10 transition-all duration-300 flex flex-col"
                : "w-[95%] max-w-[110rem] mx-auto px-4 md:px-6 pt-4 pb-8 lg:pt-5 lg:pb-10 relative z-10 transition-all duration-300",
            desktopSidebarOffsetClass
          )}
        >
          {showBillingIssueBanner && billingIssue && (
            <section className="mb-4 rounded-2xl border border-amber-500/35 bg-gradient-to-r from-amber-500/15 to-background px-4 py-3 shadow-[0_20px_45px_-40px_rgba(217,119,6,0.7)]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {t("plans:billingIssue.bannerTitle")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {billingIssue.error_message}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <CustomButton asChild size="sm" styleType="primary">
                      <Link to="/perfil/pago-fallido">
                        {t("plans:billingIssue.bannerCta")}
                      </Link>
                    </CustomButton>
                    <CustomButton
                      type="button"
                      size="sm"
                      styleType="ghost"
                      onClick={dismissBillingIssueBanner}
                    >
                      {t("plans:billingIssue.bannerDismiss")}
                    </CustomButton>
                  </div>
                </div>
                <CustomButton
                  type="button"
                  size="iconSm"
                  radius="full"
                  styleType="ghost"
                  aria-label={t("plans:billingIssue.bannerDismiss")}
                  onClick={dismissBillingIssueBanner}
                  className="shrink-0"
                >
                  <X className="h-4 w-4" />
                </CustomButton>
              </div>
            </section>
          )}
          {isAssistantRoute ? (
            <div className="min-h-0 flex-1">
              <Outlet />
            </div>
          ) : (
            <Outlet />
          )}
        </main>

        <WorkspaceTour ref={workspaceTourRef} userId={user?.id ?? null} />
      </div>
    </TooltipProvider>
  );
};

export default AuthenticatedSidebarLayout;

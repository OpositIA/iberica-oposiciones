import { useAuth } from "@/auth/AuthProvider";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";
import CustomButton from "@/components/ui/custom-button";
import { isPaidPlan } from "@/lib/plans";
import { WORKSPACE_TOUR_TARGETS } from "@/lib/workspaceTour";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import {
  fetchQuickTestsDashboardBundle,
  type QuickTestHistoryRecord
} from "@/queries/testQueries";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Minus,
  RotateCcw,
  Sparkles,
  Target,
  TimerReset,
  TrendingDown,
  TrendingUp,
  Trophy,
  User
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis
} from "recharts";

type TestStatus = "excellent" | "approved" | "reinforce";
type TestTrend = "up" | "down" | "flat";
type DashboardHistoryRow = QuickTestHistoryRecord & { trend: TestTrend };

type DashboardKpiCardProps = {
  description: string;
  helper: string;
  icon: LucideIcon;
  toneClassName?: string;
  title: string;
  value: string;
};

type DashboardEmptyStateProps = {
  description: string;
  icon: LucideIcon;
  title: string;
};

type DashboardChartStatProps = {
  label: string;
  toneClassName?: string;
  value: string;
};

const HISTORY_PAGE_SIZE = 10;

const performanceChartConfig = {
  score: {
    label: "Score",
    theme: {
      light: "hsl(var(--primary))",
      dark: "hsl(var(--primary))"
    }
  },
  accuracy: {
    label: "Accuracy",
    theme: {
      light: "hsl(var(--primary) / 0.78)",
      dark: "hsl(var(--primary) / 0.84)"
    }
  },
  excellent: {
    label: "Excellent",
    theme: {
      light: "hsl(142 72% 42%)",
      dark: "hsl(142 64% 50%)"
    }
  },
  approved: {
    label: "Approved",
    theme: {
      light: "hsl(199 89% 48%)",
      dark: "hsl(199 92% 58%)"
    }
  },
  reinforce: {
    label: "Reinforce",
    theme: {
      light: "hsl(38 92% 50%)",
      dark: "hsl(38 95% 60%)"
    }
  }
} satisfies ChartConfig;

const basePanelClassName =
  "rounded-[1.75rem] border border-border/70 bg-background/95 shadow-[0_22px_50px_-40px_rgba(15,23,42,0.28)] transition-colors dark:bg-card/95 dark:shadow-[0_28px_56px_-46px_rgba(0,0,0,0.54)]";

const chartSurfaceClassName =
  "rounded-[1.5rem] border border-primary/10 bg-gradient-to-b from-primary/[0.08] via-background to-background p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:from-primary/[0.14] dark:via-card dark:to-secondary/20";

const chartGridColor = "hsl(var(--border) / 0.72)";
const chartTickColor = "hsl(var(--muted-foreground) / 0.86)";
const chartAreaCursorColor = "hsl(var(--primary) / 0.32)";
const chartBarCursorColor = "hsl(var(--primary) / 0.12)";
const distributionSurfaceColor: Record<TestStatus, string> = {
  excellent: "hsl(142 72% 42% / 0.14)",
  approved: "hsl(199 89% 48% / 0.14)",
  reinforce: "hsl(38 92% 50% / 0.16)"
};

const DashboardKpiCard = ({
  description,
  helper,
  icon: Icon,
  title,
  toneClassName,
  value
}: DashboardKpiCardProps) => (
  <article
    className={`${basePanelClassName} group relative h-full overflow-hidden px-5 py-4 md:px-6 md:py-5`}
  >
    <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15" />
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2.5">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground/90">
            {title}
          </p>
          <p
            className={`text-3xl font-serif leading-none tracking-tight text-foreground ${toneClassName ?? ""}`}
          >
            {value}
          </p>
        </div>
        {description !== title ? (
          <p className="text-sm text-foreground/85">{description}</p>
        ) : null}
      </div>

      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[0_18px_30px_-24px_hsl(var(--primary)/0.72)] transition-transform duration-200 group-hover:scale-[1.03] group-hover:bg-primary/15">
        <Icon className="h-5 w-5" />
      </span>
    </div>

    <p className="mt-4 text-xs leading-5 text-muted-foreground">{helper}</p>
  </article>
);

const DashboardEmptyState = ({
  description,
  icon: Icon,
  title
}: DashboardEmptyStateProps) => (
  <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-[1.4rem] border border-dashed border-border/70 bg-secondary/15 px-6 py-10 text-center">
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-muted-foreground">
      <Icon className="h-5 w-5" />
    </span>
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  </div>
);

const DashboardChartStat = ({
  label,
  toneClassName,
  value
}: DashboardChartStatProps) => (
  <div
    className={`rounded-2xl border border-border/70 bg-background/80 px-3.5 py-3 shadow-sm dark:bg-background/60 ${toneClassName ?? ""}`}
  >
    <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
  </div>
);

const Dashboard = () => {
  const { t, i18n } = useTranslation(["dashboard"]);
  const { user, profile } = useAuth();
  const { data: planState } = useUserPlanStateQuery(user?.id);
  const hasQuickTestsAccess = isPaidPlan(planState);
  const [visibleHistoryCount, setVisibleHistoryCount] =
    useState(HISTORY_PAGE_SIZE);
  const { data: dashboardBundle, isLoading: isHistoryLoading } = useQuery({
    queryKey: user?.id
      ? ["quick-tests", "dashboard-bundle", user.id]
      : ["quick-tests", "dashboard-bundle", "guest"],
    queryFn: () => fetchQuickTestsDashboardBundle(user?.id as string),
    enabled: Boolean(user?.id),
    staleTime: 30_000
  });
  const quickTestStats = dashboardBundle?.stats;
  const inProgressQuickTest = dashboardBundle?.inProgress ?? null;

  const accountName = useMemo(() => {
    const fullName = `${profile?.firstName ?? ""} ${
      profile?.lastName ?? ""
    }`.trim();
    return fullName || profile?.email || t("defaults.user");
  }, [profile, t]);

  const historialTests = useMemo<DashboardHistoryRow[]>(() => {
    const historyItems = dashboardBundle?.historyItems ?? [];
    return historyItems.map((item, idx) => {
      const previousItem = historyItems[idx + 1];
      const trend: TestTrend = !previousItem
        ? "flat"
        : item.accuracy > previousItem.accuracy
          ? "up"
          : item.accuracy < previousItem.accuracy
            ? "down"
            : "flat";

      return {
        ...item,
        trend
      };
    });
  }, [dashboardBundle?.historyItems]);

  const visibleHistoryItems = useMemo(
    () => historialTests.slice(0, visibleHistoryCount),
    [historialTests, visibleHistoryCount]
  );
  const canLoadMoreHistory = visibleHistoryCount < historialTests.length;

  useEffect(() => {
    setVisibleHistoryCount(HISTORY_PAGE_SIZE);
  }, [user?.id, historialTests.length]);

  const locale = i18n.resolvedLanguage ?? "es";
  const mediaNota = quickTestStats?.averageScore ?? 0;
  const precisionMedia = quickTestStats?.averageAccuracy ?? 0;
  const completedTestsCount = quickTestStats?.completedTests ?? 0;
  const hasHistoryData = completedTestsCount > 0;

  const bestScore = useMemo(
    () =>
      historialTests.reduce(
        (best, test) => Math.max(best, Number(test.score.toFixed(1))),
        0
      ),
    [historialTests]
  );

  const averageDuration = useMemo(() => {
    if (!hasHistoryData) return 0;

    return Math.round(
      historialTests.reduce((acc, test) => acc + test.durationMinutes, 0) /
        completedTestsCount
    );
  }, [completedTestsCount, hasHistoryData, historialTests]);

  const scoreAxisMax = useMemo(
    () => Math.max(10, Math.ceil(bestScore)),
    [bestScore]
  );

  const latestScoreDelta = useMemo(() => {
    if (historialTests.length < 2) return null;

    return Number(
      (historialTests[0].score - historialTests[1].score).toFixed(1)
    );
  }, [historialTests]);

  const scoreTrendHelper = useMemo(() => {
    if (latestScoreDelta === null) return t("cards.helpers.scoreTrendFirst");
    if (latestScoreDelta > 0)
      return t("cards.helpers.scoreTrendUp", { value: latestScoreDelta });
    if (latestScoreDelta < 0)
      return t("cards.helpers.scoreTrendDown", { value: latestScoreDelta });

    return t("cards.helpers.scoreTrendFlat");
  }, [latestScoreDelta, t]);

  const recentPerformanceData = useMemo(
    () =>
      historialTests
        .slice(0, 6)
        .reverse()
        .map((test, index) => ({
          accuracy: Math.round(test.accuracy),
          duration: test.durationMinutes,
          label: new Date(test.finishedAt).toLocaleDateString(locale, {
            day: "numeric",
            month: "short"
          }),
          score: Number(test.score.toFixed(1)),
          testLabel: `${index + 1}`
        })),
    [historialTests, locale]
  );

  const distributionData = useMemo(() => {
    const statusOrder: TestStatus[] = ["excellent", "approved", "reinforce"];
    return statusOrder
      .map((status) => {
        const value = historialTests.filter(
          (test) => test.status === status
        ).length;

        return {
          fill: `var(--color-${status})`,
          key: status,
          label: t(`history.status.${status}`),
          value
        };
      })
      .filter((item) => item.value > 0);
  }, [historialTests, t]);

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (!Number.isFinite(date.valueOf())) return "-";

    return date.toLocaleDateString(locale);
  };

  const statusClass: Record<TestStatus, string> = {
    excellent:
      "border border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    approved:
      "border border-sky-500/20 bg-sky-500/12 text-sky-700 dark:text-sky-300",
    reinforce:
      "border border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300"
  };

  const kpiCards: DashboardKpiCardProps[] = [
    {
      description: t("cards.completedTests"),
      helper: t("cards.helpers.completedTests"),
      icon: BookOpen,
      title: t("cards.completedTests"),
      value: completedTestsCount.toString()
    },
    {
      description: t("cards.globalAverage"),
      helper: scoreTrendHelper,
      icon: TrendingUp,
      title: t("cards.globalAverage"),
      value: hasHistoryData ? mediaNota.toFixed(1) : "0.0"
    },
    {
      description: t("cards.averageAccuracy"),
      helper: t("cards.helpers.averageAccuracy"),
      icon: Target,
      title: t("cards.averageAccuracy"),
      value: `${precisionMedia}%`
    },
    {
      description: t("cards.bestScore"),
      helper: t("cards.helpers.bestScore"),
      icon: Trophy,
      title: t("cards.bestScore"),
      value: hasHistoryData ? bestScore.toFixed(1) : "0.0"
    },
    {
      description: t("cards.averageDuration"),
      helper: t("cards.helpers.averageDuration"),
      icon: Clock3,
      title: t("cards.averageDuration"),
      value: hasHistoryData ? `${averageDuration} min` : "0 min"
    },
    {
      description: t("cards.inProgress"),
      helper: inProgressQuickTest
        ? t("cards.helpers.inProgress", {
            count: inProgressQuickTest.answeredCount
          })
        : t("cards.helpers.inProgressEmpty"),
      icon: TimerReset,
      title: t("cards.inProgress"),
      value: inProgressQuickTest
        ? inProgressQuickTest.answeredCount.toString()
        : "0"
    }
  ];

  return (
    <div className="space-y-6">
      <section
        className={`${basePanelClassName} relative overflow-hidden bg-gradient-to-br from-primary/[0.08] via-background to-background p-6 md:p-8 dark:from-primary/[0.14] dark:via-card dark:to-card`}
        data-tour-id={WORKSPACE_TOUR_TARGETS.dashboardHero}
      >
        <div className="pointer-events-none absolute -left-12 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl dark:bg-primary/20" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-48 w-48 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15" />
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="mb-2 inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-[0.24em] uppercase text-primary">
              {t("header.badge")}
            </p>
            <h1 className="text-2xl font-serif text-foreground md:text-3xl">
              {t("header.greeting", { name: accountName })}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("header.description")}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <CustomButton asChild radius="full" styleType="menu">
              <Link to="/perfil/mi-perfil">
                <User className="h-4 w-4" />
                {t("actions.profile")}
              </Link>
            </CustomButton>
            {!inProgressQuickTest && hasQuickTestsAccess && (
              <CustomButton asChild radius="full" styleType="primary">
                <Link to="/perfil/test">
                  <BookOpen className="h-4 w-4" />
                  {t("actions.goToTest")}
                </Link>
              </CustomButton>
            )}
            {inProgressQuickTest && hasQuickTestsAccess && (
              <CustomButton asChild radius="full" styleType="primary">
                <Link
                  to={`/perfil/test/${encodeURIComponent(inProgressQuickTest.testId)}`}
                >
                  <RotateCcw className="h-4 w-4" />
                  {t("actions.continueQuickTest")}
                </Link>
              </CustomButton>
            )}
          </div>
        </div>
      </section>

      <section
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        data-tour-id={WORKSPACE_TOUR_TARGETS.dashboardMetrics}
      >
        {kpiCards.map((card) => (
          <DashboardKpiCard key={card.title} {...card} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12 xl:items-start">
        <article
          className={`${basePanelClassName} overflow-hidden p-5 md:p-6 xl:col-span-7`}
          data-tour-id={WORKSPACE_TOUR_TARGETS.dashboardPerformance}
        >
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] uppercase text-primary">
                {t("charts.performance.badge")}
              </p>
              <h2 className="mt-1 text-xl font-serif text-foreground">
                {t("charts.performance.title")}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
              <DashboardChartStat
                label={t("cards.globalAverage")}
                toneClassName="border-primary/15 bg-primary/[0.08] dark:bg-primary/[0.12]"
                value={hasHistoryData ? mediaNota.toFixed(1) : "0.0"}
              />
              <DashboardChartStat
                label={t("cards.bestScore")}
                value={hasHistoryData ? bestScore.toFixed(1) : "0.0"}
              />
            </div>
          </div>

          {recentPerformanceData.length > 0 ? (
            <div className={chartSurfaceClassName}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {t("charts.performance.caption", {
                    count: recentPerformanceData.length
                  })}
                </p>
              </div>
              <ChartContainer
                config={performanceChartConfig}
                className="h-[220px] w-full"
              >
                <AreaChart
                  data={recentPerformanceData}
                  margin={{ left: 6, right: 10, top: 10 }}
                >
                  <defs>
                    <linearGradient
                      id="dashboard-score-fill"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--color-score)"
                        stopOpacity={0.28}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--color-score)"
                        stopOpacity={0.03}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke={chartGridColor}
                    strokeDasharray="4 4"
                    vertical={false}
                  />
                  <XAxis
                    axisLine={false}
                    dataKey="label"
                    tick={{ fill: chartTickColor, fontSize: 11 }}
                    tickLine={false}
                    tickMargin={12}
                  />
                  <YAxis
                    axisLine={false}
                    domain={[0, scoreAxisMax]}
                    tick={{ fill: chartTickColor, fontSize: 11 }}
                    tickLine={false}
                    tickMargin={12}
                    width={34}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        className="border-primary/15 bg-background/95 shadow-[0_18px_40px_-28px_hsl(var(--primary)/0.35)]"
                        formatter={(value, name) => (
                          <>
                            <span className="text-muted-foreground">
                              {name === "score"
                                ? t("history.columns.score")
                                : t("history.columns.accuracy")}
                            </span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {name === "score" ? value : `${value}%`}
                            </span>
                          </>
                        )}
                      />
                    }
                    cursor={{
                      stroke: chartAreaCursorColor,
                      strokeDasharray: "4 4",
                      strokeWidth: 1.5
                    }}
                  />
                  <Area
                    activeDot={{
                      fill: "hsl(var(--background))",
                      r: 5,
                      stroke: "var(--color-score)",
                      strokeWidth: 2.5
                    }}
                    dataKey="score"
                    dot={{
                      fill: "var(--color-score)",
                      r: 3,
                      stroke: "hsl(var(--background))",
                      strokeWidth: 2
                    }}
                    fill="url(#dashboard-score-fill)"
                    fillOpacity={1}
                    stroke="var(--color-score)"
                    strokeWidth={2.75}
                    type="monotone"
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          ) : (
            <DashboardEmptyState
              description={t("charts.performance.emptyDescription")}
              icon={BarChart3}
              title={t("charts.performance.emptyTitle")}
            />
          )}
        </article>

        <article
          className={`${basePanelClassName} overflow-hidden p-5 md:p-6 xl:col-span-5`}
        >
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] uppercase text-primary">
                {t("charts.accuracy.badge")}
              </p>
              <h2 className="mt-1 text-xl font-serif text-foreground">
                {t("charts.accuracy.title")}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:min-w-[250px]">
              <DashboardChartStat
                label={t("cards.averageAccuracy")}
                toneClassName="border-primary/15 bg-primary/[0.08] dark:bg-primary/[0.12]"
                value={`${precisionMedia}%`}
              />
              <DashboardChartStat
                label={t("cards.averageDuration")}
                value={hasHistoryData ? `${averageDuration} min` : "0 min"}
              />
            </div>
          </div>

          {recentPerformanceData.length > 0 ? (
            <div className={chartSurfaceClassName}>
              <ChartContainer
                config={performanceChartConfig}
                className="h-[248px] w-full"
              >
                <BarChart
                  data={recentPerformanceData}
                  margin={{ left: 10, right: 12, top: 10 }}
                >
                  <defs>
                    <linearGradient
                      id="dashboard-accuracy-fill"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.98}
                      />
                      <stop
                        offset="100%"
                        stopColor="hsl(var(--primary) / 0.7)"
                        stopOpacity={0.86}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke={chartGridColor}
                    strokeDasharray="4 4"
                    vertical={false}
                  />
                  <XAxis
                    axisLine={false}
                    dataKey="label"
                    tick={{ fill: chartTickColor, fontSize: 11 }}
                    tickLine={false}
                    tickMargin={12}
                  />
                  <YAxis
                    axisLine={false}
                    domain={[0, 100]}
                    tick={{ fill: chartTickColor, fontSize: 11 }}
                    tickFormatter={(value) => `${value}%`}
                    tickLine={false}
                    tickMargin={12}
                    width={52}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        className="border-primary/15 bg-background/95 shadow-[0_18px_40px_-28px_hsl(var(--primary)/0.35)]"
                        formatter={(value) => (
                          <>
                            <span className="text-muted-foreground">
                              {t("history.columns.accuracy")}
                            </span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {value}%
                            </span>
                          </>
                        )}
                      />
                    }
                    cursor={{ fill: chartBarCursorColor }}
                  />
                  <Bar
                    activeBar={{
                      fill: "hsl(var(--primary))"
                    }}
                    dataKey="accuracy"
                    fill="url(#dashboard-accuracy-fill)"
                    maxBarSize={34}
                    radius={[14, 14, 8, 8]}
                  />
                </BarChart>
              </ChartContainer>
            </div>
          ) : (
            <DashboardEmptyState
              description={t("charts.accuracy.emptyDescription")}
              icon={Target}
              title={t("charts.accuracy.emptyTitle")}
            />
          )}
        </article>

        <article
          className={`${basePanelClassName} overflow-hidden p-5 md:p-6 md:col-span-2 xl:col-span-12`}
        >
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] uppercase text-primary">
                {t("charts.distribution.badge")}
              </p>
              <h2 className="mt-1 text-xl font-serif text-foreground">
                {t("charts.distribution.title")}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
              <DashboardChartStat
                label={t("cards.completedTests")}
                toneClassName="border-primary/15 bg-primary/[0.08] dark:bg-primary/[0.12]"
                value={completedTestsCount.toString()}
              />
              <DashboardChartStat
                label={t("cards.inProgress")}
                value={
                  inProgressQuickTest
                    ? inProgressQuickTest.answeredCount.toString()
                    : "0"
                }
              />
            </div>
          </div>

          {distributionData.length > 0 ? (
            <div
              className={`${chartSurfaceClassName} grid items-center gap-4 lg:grid-cols-[220px_minmax(0,1fr)]`}
            >
              <div className="relative mx-auto w-full max-w-[220px]">
                <ChartContainer
                  config={performanceChartConfig}
                  className="mx-auto h-[220px] w-full"
                >
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          className="border-primary/15 bg-background/95 shadow-[0_18px_40px_-28px_hsl(var(--primary)/0.35)]"
                          formatter={(value, name) => (
                            <>
                              <span className="text-muted-foreground">
                                {name}
                              </span>
                              <span className="font-mono font-medium tabular-nums text-foreground">
                                {value}
                              </span>
                            </>
                          )}
                        />
                      }
                    />
                    <Pie
                      cx="50%"
                      cy="50%"
                      data={distributionData}
                      dataKey="value"
                      innerRadius={58}
                      outerRadius={84}
                      paddingAngle={5}
                      stroke="hsl(var(--background))"
                      strokeWidth={4}
                    >
                      {distributionData.map((entry) => (
                        <Cell fill={entry.fill} key={entry.key} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-serif text-foreground">
                    {completedTestsCount}
                  </span>
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {t("charts.distribution.centerLabel")}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {distributionData.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-[1.35rem] border border-border/70 bg-background/80 p-4 shadow-sm dark:bg-background/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <span
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl"
                          style={{
                            backgroundColor: distributionSurfaceColor[item.key]
                          }}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: item.fill }}
                          />
                        </span>
                        <p className="text-sm font-medium text-foreground">
                          {item.label}
                        </p>
                      </div>
                      <span className="text-2xl font-serif text-foreground">
                        {item.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <DashboardEmptyState
              description={t("charts.distribution.emptyDescription")}
              icon={Sparkles}
              title={t("charts.distribution.emptyTitle")}
            />
          )}
        </article>
      </section>

      <section
        className={`${basePanelClassName} overflow-hidden p-5 md:p-6`}
        data-tour-id={WORKSPACE_TOUR_TARGETS.dashboardHistory}
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] uppercase text-muted-foreground">
              {t("history.badge")}
            </p>
            <h2 className="mt-1 text-xl font-serif text-foreground">
              {t("history.title")}
            </h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/20 px-3 py-1.5">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold tracking-[0.16em] uppercase text-muted-foreground">
              {t("history.performance")}
            </span>
          </div>
        </div>

        {visibleHistoryItems.length > 0 ? (
          <div className="overflow-hidden rounded-[1.35rem] border border-border/70">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-secondary/35">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("history.columns.test")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("history.columns.date")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("history.columns.score")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("history.columns.accuracy")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("history.columns.duration")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("history.columns.status")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("history.columns.open")}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-background/70">
                  {visibleHistoryItems.map((test) => (
                    <tr
                      key={test.testId}
                      className="border-t border-border/60 transition-colors hover:bg-primary/[0.06] dark:hover:bg-primary/[0.1]"
                    >
                      <td className="px-4 py-3 text-sm text-foreground">
                        {`${test.oppositionName} - #${test.testId.slice(0, 8)}`}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDate(test.finishedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">
                        {test.score.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          {test.trend === "up" && (
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          )}
                          {test.trend === "down" && (
                            <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                          )}
                          {test.trend === "flat" && (
                            <Minus className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          )}
                          {Math.round(test.accuracy)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {`${test.durationMinutes} min`}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[test.status]}`}
                        >
                          {test.status === "excellent" && (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          {t(`history.status.${test.status}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <CustomButton
                          asChild
                          radius="full"
                          size="sm"
                          styleType="menu"
                        >
                          <Link
                            to={`/perfil/test/${encodeURIComponent(test.testId)}`}
                          >
                            {t("history.viewTest")}
                          </Link>
                        </CustomButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <DashboardEmptyState
            description={t("history.emptyDescription")}
            icon={BookOpen}
            title={t("history.empty")}
          />
        )}

        {canLoadMoreHistory && (
          <div className="mt-4 flex justify-center">
            <CustomButton
              type="button"
              radius="full"
              styleType="menu"
              onClick={() =>
                setVisibleHistoryCount((prev) => prev + HISTORY_PAGE_SIZE)
              }
            >
              {t("history.loadMore")}
            </CustomButton>
          </div>
        )}

        {isHistoryLoading && visibleHistoryItems.length === 0 ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("history.loadingMore")}
          </p>
        ) : null}
      </section>
    </div>
  );
};

export default Dashboard;

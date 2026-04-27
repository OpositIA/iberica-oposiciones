import { useAuth } from "@/auth/AuthProvider";
import { DashboardPageSkeleton } from "@/components/PageSkeletons";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";
import CustomButton from "@/components/ui/custom-button";
import Reveal from "@/components/ui/reveal";
import { useIsMobile } from "@/hooks/use-mobile";
import { isPaidPlan } from "@/lib/plans";
import { WORKSPACE_TOUR_TARGETS } from "@/lib/workspaceTour";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import { fetchQuickTestsDashboardBundle } from "@/queries/testQueries";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Clock3,
  RotateCcw,
  Target,
  TrendingUp
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis
} from "recharts";

type TestStatus = "excellent" | "approved" | "reinforce";

type DashboardKpiCardProps = {
  icon: LucideIcon;
  title: string;
  value: string;
};

type DashboardEmptyStateProps = {
  description: string;
  icon: LucideIcon;
  title: string;
};

const HISTORY_PAGE_SIZE = 10;

const performanceChartConfig = {
  score: {
    label: "Score",
    theme: {
      light: "hsl(var(--primary))",
      dark: "hsl(var(--accent))"
    }
  }
} satisfies ChartConfig;

const basePanelClassName =
  "rounded-[1.9rem] border border-border/70 bg-background/95 shadow-[0_20px_44px_-36px_rgba(15,23,42,0.18)] transition-colors dark:bg-card/95 dark:shadow-[0_28px_52px_-42px_rgba(0,0,0,0.42)]";

const chartSurfaceClassName =
  "rounded-[1.55rem] border border-border/70 bg-gradient-to-b from-background via-background to-secondary/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] dark:from-card dark:via-card dark:to-secondary/20";

const chartGridColor = "hsl(var(--border) / 0.86)";
const chartTickColor = "hsl(var(--foreground) / 0.72)";
const chartAreaCursorColor = "hsl(var(--accent) / 0.45)";
const chartReferenceLineColor = "hsl(var(--accent) / 0.52)";

const distributionToneClass: Record<TestStatus, string> = {
  excellent: "bg-emerald-500",
  approved: "bg-sky-500",
  reinforce: "bg-amber-500"
};

const DashboardKpiCard = ({
  icon: Icon,
  title,
  value
}: DashboardKpiCardProps) => (
  <Reveal
    as="article"
    className={`${basePanelClassName} group relative h-full overflow-hidden px-4 py-4 md:px-5 md:py-4.5`}
  >
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="block text-[10px] font-semibold tracking-[0.22em] uppercase text-muted-foreground/90 md:text-[11px]">
          {title}
        </span>
        <div className="mt-1.5 text-[1.75rem] font-serif leading-none tracking-tight text-foreground md:text-[2rem]">
          {value}
        </div>
      </div>

      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary transition-transform duration-200 group-hover:scale-[1.04] dark:bg-primary/[0.12]">
        <Icon className="h-3.5 w-3.5" />
      </span>
    </div>
  </Reveal>
);

const DashboardEmptyState = ({
  description,
  icon: Icon,
  title
}: DashboardEmptyStateProps) => (
  <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[1.4rem] border border-dashed border-border/70 bg-secondary/15 px-6 py-10 text-center">
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

const Dashboard = () => {
  const { t, i18n } = useTranslation(["dashboard", "plans"]);
  const { user, profile } = useAuth();
  const isMobile = useIsMobile();
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
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });

  const quickTestStats = dashboardBundle?.stats;
  const inProgressQuickTest = dashboardBundle?.inProgress ?? null;

  const accountName = useMemo(() => {
    const fullName = `${profile?.firstName ?? ""} ${
      profile?.lastName ?? ""
    }`.trim();
    return fullName || profile?.email || t("defaults.user");
  }, [profile, t]);

  const historialTests = useMemo(
    () => dashboardBundle?.historyItems ?? [],
    [dashboardBundle?.historyItems]
  );

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

  const averageDurationPerQuestion = useMemo(() => {
    if (!hasHistoryData) return 0;

    const totalMinutes = historialTests.reduce(
      (acc, test) => acc + test.durationMinutes,
      0
    );
    const totalQuestions = historialTests.reduce(
      (acc, test) => acc + Math.max(0, test.questionCount),
      0
    );

    if (totalQuestions <= 0) return 0;
    return totalMinutes / totalQuestions;
  }, [hasHistoryData, historialTests]);

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
    return statusOrder.map((status) => ({
      key: status,
      label: t(`history.status.${status}`),
      value: historialTests.filter((test) => test.status === status).length
    }));
  }, [historialTests, t]);

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (!Number.isFinite(date.valueOf())) return "-";

    return date.toLocaleDateString(locale);
  };

  const statusClass: Record<TestStatus, string> = {
    excellent: "text-emerald-700 dark:text-emerald-300",
    approved: "text-sky-700 dark:text-sky-300",
    reinforce: "text-amber-700 dark:text-amber-300"
  };

  const kpiCards: DashboardKpiCardProps[] = [
    {
      icon: BookOpen,
      title: t("cards.completedTests"),
      value: completedTestsCount.toString()
    },
    {
      icon: TrendingUp,
      title: t("cards.globalAverage"),
      value: hasHistoryData ? mediaNota.toFixed(1) : "0.0"
    },
    {
      icon: Target,
      title: t("cards.averageAccuracy"),
      value: `${precisionMedia}%`
    },
    {
      icon: Clock3,
      title: t("cards.averageDuration"),
      value: hasHistoryData
        ? `${averageDurationPerQuestion.toFixed(1)} min`
        : "0.0 min"
    }
  ];

  if (isHistoryLoading && !dashboardBundle) return <DashboardPageSkeleton />;

  return (
    <div className="space-y-5 pt-3 md:pt-4">
      <Reveal
        as="section"
        className="px-5 py-5 md:px-7 md:py-6"
        data-tour-id={WORKSPACE_TOUR_TARGETS.dashboardHero}
        duration={820}
        variant="soft"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-[1.95rem] font-serif leading-tight text-foreground md:text-[2.35rem]">
              {t("header.greeting", { name: accountName })}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("header.description")}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-3">
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
            {!hasQuickTestsAccess && (
              <CustomButton asChild radius="full" styleType="primary">
                <Link to="/perfil/planes">{t("plans:upgradeDialog.cta")}</Link>
              </CustomButton>
            )}
          </div>
        </div>
      </Reveal>

      <Reveal
        as="section"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        data-tour-id={WORKSPACE_TOUR_TARGETS.dashboardMetrics}
        delay={80}
        duration={760}
        variant="soft"
      >
        {kpiCards.map((card) => (
          <DashboardKpiCard key={card.title} {...card} />
        ))}
      </Reveal>

      <Reveal
        as="section"
        className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]"
        delay={120}
        duration={780}
        variant="soft"
      >
        <Reveal
          as="article"
          className={`${basePanelClassName} min-w-0 overflow-hidden p-5 md:p-6`}
          data-tour-id={WORKSPACE_TOUR_TARGETS.dashboardPerformance}
          variant="left"
        >
          <div className="mb-4 min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.24em] uppercase text-primary">
              {t("charts.performance.badge")}
            </p>
            <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-serif text-foreground md:text-[1.45rem]">
                  {t("charts.performance.title")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {recentPerformanceData.length > 0
                    ? t("charts.performance.caption", {
                        count: recentPerformanceData.length
                      })
                    : t("charts.performance.emptyDescription")}
                </p>
              </div>
              {hasHistoryData && (
                <div className="flex items-center gap-5 text-sm">
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("cards.globalAverage")}
                    </p>
                    <p className="mt-1 font-semibold text-foreground">
                      {mediaNota.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("cards.bestScore")}
                    </p>
                    <p className="mt-1 font-semibold text-foreground">
                      {bestScore.toFixed(1)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {recentPerformanceData.length > 0 ? (
            <div
              className={`${chartSurfaceClassName} min-w-0 overflow-hidden bg-[radial-gradient(circle_at_18%_18%,hsl(var(--primary)/0.14),transparent_32%),radial-gradient(circle_at_82%_8%,hsl(var(--accent)/0.12),transparent_34%)] px-3 py-4 sm:px-4 sm:py-5 dark:bg-[radial-gradient(circle_at_18%_18%,hsl(var(--primary)/0.18),transparent_34%),radial-gradient(circle_at_82%_8%,hsl(var(--accent)/0.18),transparent_36%)]`}
            >
              <ChartContainer
                config={performanceChartConfig}
                className="h-[220px] w-full sm:h-[240px]"
              >
                <AreaChart
                  data={recentPerformanceData}
                  margin={{
                    left: isMobile ? -10 : -4,
                    right: isMobile ? 2 : 8,
                    top: 8,
                    bottom: 2
                  }}
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
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.34}
                      />
                      <stop
                        offset="46%"
                        stopColor="hsl(var(--accent))"
                        stopOpacity={0.2}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--color-score)"
                        stopOpacity={0.04}
                      />
                    </linearGradient>
                    <linearGradient
                      id="dashboard-score-stroke"
                      x1="0"
                      x2="1"
                      y1="0"
                      y2="0"
                    >
                      <stop offset="0%" stopColor="hsl(var(--primary))" />
                      <stop offset="100%" stopColor="hsl(var(--accent))" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke={chartGridColor}
                    strokeDasharray="4 6"
                    vertical={false}
                  />
                  <YAxis
                    axisLine={false}
                    domain={[0, 10]}
                    tick={{
                      fill: chartTickColor,
                      fontSize: isMobile ? 10 : 11
                    }}
                    tickCount={6}
                    tickLine={false}
                    tickMargin={8}
                    width={isMobile ? 28 : 34}
                  />
                  <XAxis
                    axisLine={false}
                    dataKey="label"
                    interval={isMobile ? "preserveStartEnd" : 0}
                    minTickGap={isMobile ? 24 : 12}
                    tick={{
                      fill: chartTickColor,
                      fontSize: isMobile ? 10 : 11
                    }}
                    tickLine={false}
                    tickMargin={10}
                  />
                  <ReferenceLine
                    stroke={chartReferenceLineColor}
                    strokeDasharray="6 6"
                    strokeWidth={1.35}
                    y={5}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        className="border-primary/25 bg-background/95 shadow-[0_18px_40px_-28px_hsl(var(--accent)/0.45)] backdrop-blur"
                        formatter={(value, name, item) => (
                          <>
                            <span className="text-muted-foreground">
                              {name === "score"
                                ? t("history.columns.score")
                                : t("history.columns.accuracy")}
                            </span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {name === "score"
                                ? value
                                : `${item.payload.accuracy}%`}
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
                      r: isMobile ? 4 : 5,
                      stroke: "hsl(var(--accent))",
                      strokeWidth: 2.75
                    }}
                    dataKey="score"
                    dot={{
                      fill: "var(--color-score)",
                      r: isMobile ? 2.75 : 3.25,
                      stroke: "hsl(var(--background))",
                      strokeWidth: 2.25
                    }}
                    fill="url(#dashboard-score-fill)"
                    fillOpacity={1}
                    stroke="url(#dashboard-score-stroke)"
                    strokeWidth={3}
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
        </Reveal>

        <Reveal
          as="article"
          className={`${basePanelClassName} min-w-0 overflow-hidden p-5 md:p-6`}
          delay={90}
          variant="right"
        >
          <div className="mb-4">
            <p className="text-[10px] font-semibold tracking-[0.24em] uppercase text-primary">
              {t("charts.distribution.badge")}
            </p>
            <h2 className="mt-2 text-xl font-serif text-foreground md:text-[1.4rem]">
              {t("charts.distribution.title")}
            </h2>
          </div>

          {hasHistoryData ? (
            <div
              className={`${chartSurfaceClassName} flex  flex-col px-4 py-4`}
            >
              <div className="mb-5 border-b border-border/60 pb-4">
                <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                  {t("cards.completedTests")}
                </p>
                <p className="mt-1 text-[2rem] font-serif leading-none text-foreground">
                  {completedTestsCount}
                </p>
              </div>

              <div className="space-y-3">
                {distributionData.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/80 px-3 py-3 dark:bg-background/60"
                  >
                    <span className="inline-flex items-center gap-2.5 text-sm text-foreground">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${distributionToneClass[item.key]}`}
                      />
                      {item.label}
                    </span>
                    <span className="font-medium tabular-nums text-foreground">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <DashboardEmptyState
              description={t("charts.distribution.emptyDescription")}
              icon={Target}
              title={t("charts.distribution.emptyTitle")}
            />
          )}
        </Reveal>
      </Reveal>

      <Reveal
        as="section"
        className={`${basePanelClassName} overflow-hidden p-5 md:p-6`}
        data-tour-id={WORKSPACE_TOUR_TARGETS.dashboardHistory}
        delay={180}
        duration={780}
        variant="soft"
      >
        <div className="mb-5">
          <p className="text-[10px] font-semibold tracking-[0.24em] uppercase text-primary">
            {t("history.badge")}
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-xl font-serif text-foreground md:text-[1.45rem]">
              {t("history.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("history.performance")}
            </p>
          </div>
        </div>

        {visibleHistoryItems.length > 0 ? (
          <div className="overflow-hidden rounded-[1.45rem] border border-border/70 bg-background/70">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="border-b border-border/60 bg-secondary/25">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("history.columns.date")}
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("history.columns.score")}
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("history.columns.correctAnswers")}
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("history.columns.duration")}
                    </th>
                    <th className="px-4 py-3 text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      {t("history.columns.status")}
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                      <span className="sr-only">
                        {t("history.columns.open")}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleHistoryItems.map((test) => (
                    <tr
                      key={test.testId}
                      className="border-t border-border/60 transition-colors hover:bg-secondary/20"
                    >
                      <td className="px-4 py-3.5 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDate(test.finishedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-foreground">
                        {test.score.toFixed(1)}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-foreground">
                        {`${test.correctCount}/${test.questionCount}`}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-muted-foreground">
                        {`${test.durationMinutes} min`}
                      </td>
                      <td className="px-4 py-3.5 text-sm">
                        <span
                          className={`inline-flex items-center gap-2 font-medium ${statusClass[test.status]}`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${distributionToneClass[test.status]}`}
                          />
                          {t(`history.status.${test.status}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
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
      </Reveal>
    </div>
  );
};

export default Dashboard;

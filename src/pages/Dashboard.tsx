import { useAuth } from "@/auth/AuthProvider";
import CustomButton from "@/components/ui/custom-button";
import { isPaidPlan } from "@/lib/plans";
import { useProfileBaseQuery } from "@/queries/profileQueries";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import {
  fetchQuickTestsDashboardBundle,
  type QuickTestHistoryRecord
} from "@/queries/testQueries";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Minus,
  RotateCcw,
  Target,
  TrendingDown,
  TrendingUp,
  User
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

type TestStatus = "excellent" | "approved" | "reinforce";
type TestTrend = "up" | "down" | "flat";
type DashboardHistoryRow = QuickTestHistoryRecord & { trend: TestTrend };
const HISTORY_PAGE_SIZE = 10;

const Dashboard = () => {
  const { t, i18n } = useTranslation(["dashboard"]);
  const { user, profile, isAuthReady } = useAuth();
  const shouldLoadProfileBase = isAuthReady && Boolean(user?.id);
  const { data: profileBase } = useProfileBaseQuery(
    shouldLoadProfileBase ? user?.id : null
  );
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
  const weeklyTargetHours = useMemo(() => {
    const weeklyTarget = Number(profileBase?.weekly_target_hours);
    if (Number.isFinite(weeklyTarget) && weeklyTarget > 0) return weeklyTarget;
    return 16;
  }, [profileBase?.weekly_target_hours]);

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

  const horasEstudio = Math.max(
    1,
    Math.round(weeklyTargetHours * 0.72 * 10) / 10
  );
  const progresoMeta = Math.min(
    100,
    Math.round((horasEstudio / weeklyTargetHours) * 100)
  );

  const mediaNota = quickTestStats?.averageScore ?? 0;
  const precisionMedia = quickTestStats?.averageAccuracy ?? 0;
  const completedTestsCount = quickTestStats?.completedTests ?? 0;

  const statusClass: Record<TestStatus, string> = {
    excellent: "bg-emerald-500/15 text-emerald-700",
    approved: "bg-sky-500/15 text-sky-700",
    reinforce: "bg-amber-500/15 text-amber-700"
  };

  return (
    <div className="space-y-6">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              {t("header.badge")}
            </p>
            <h1 className="text-2xl md:text-3xl font-serif text-foreground">
              {t("header.greeting", { name: accountName })}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("header.description")}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <CustomButton asChild styleType="menu">
              <Link to="/perfil/mi-perfil">
                <User className="h-4 w-4" />
                {t("actions.profile")}
              </Link>
            </CustomButton>
            {!inProgressQuickTest && hasQuickTestsAccess && (
              <CustomButton asChild styleType="menu">
                <Link to="/perfil/test">
                  <BookOpen className="h-4 w-4" />
                  {t("actions.goToTest")}
                </Link>
              </CustomButton>
            )}
            {inProgressQuickTest && hasQuickTestsAccess && (
              <CustomButton asChild styleType="menu">
                <Link
                  to={`/perfil/test/${encodeURIComponent(inProgressQuickTest.testId)}`}
                >
                  <RotateCcw className="h-4 w-4" />
                  {t("actions.continueQuickTest")}
                </Link>
              </CustomButton>
            )}
            <CustomButton asChild styleType="primary">
              <Link to="/perfil/opositAI">
                <Brain className="h-4 w-4" />
                {t("actions.openIA")}
              </Link>
            </CustomButton>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="border border-border bg-background p-5">
          <div className="mb-2 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              {t("cards.completedTests")}
            </p>
          </div>
          <p className="text-2xl font-serif text-foreground">
            {completedTestsCount}
          </p>
        </div>

        <div className="border border-border bg-background p-5">
          <div className="mb-2 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              {t("cards.globalAverage")}
            </p>
          </div>
          <p className="text-2xl font-serif text-foreground">
            {mediaNota.toFixed(1)}/10
          </p>
        </div>

        <div className="border border-border bg-background p-5">
          <div className="mb-2 flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              {t("cards.averageAccuracy")}
            </p>
          </div>
          <p className="text-2xl font-serif text-foreground">
            {precisionMedia}%
          </p>
        </div>

        <div className="border border-border bg-background p-5">
          <div className="mb-2 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              {t("cards.hoursThisWeek")}
            </p>
          </div>
          <p className="text-2xl font-serif text-foreground">
            {horasEstudio} h
          </p>
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
              <span>{t("cards.progress")}</span>
              <span>{progresoMeta}%</span>
            </div>
            <div className="h-2 bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${progresoMeta}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border border-border bg-background p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border border-border bg-secondary/30 p-3">
            <p className="mb-1 text-xs text-muted-foreground uppercase tracking-widest">
              {t("insights.trend")}
            </p>
            <p className="inline-flex items-center gap-2 text-sm text-foreground">
              <BarChart3 className="h-4 w-4 text-primary" />
              {t("insights.trendValue")}
            </p>
          </div>
          <div className="border border-border bg-secondary/30 p-3">
            <p className="mb-1 text-xs text-muted-foreground uppercase tracking-widest">
              {t("insights.focus")}
            </p>
            <p className="inline-flex items-center gap-2 text-sm text-foreground">
              <Target className="h-4 w-4 text-primary" />
              {t("insights.focusValue")}
            </p>
          </div>
          <div className="border border-border bg-secondary/30 p-3">
            <p className="mb-1 text-xs text-muted-foreground uppercase tracking-widest">
              {t("insights.averageTime")}
            </p>
            <p className="inline-flex items-center gap-2 text-sm text-foreground">
              <Clock3 className="h-4 w-4 text-primary" />
              {t("insights.averageTimeValue")}
            </p>
          </div>
        </div>
      </section>

      <section className="border border-border bg-background p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
              {t("history.badge")}
            </p>
            <h2 className="text-xl font-serif text-foreground">
              {t("history.title")}
            </h2>
          </div>
          <div className="inline-flex items-center gap-2 border border-border px-3 py-1.5">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              {t("history.performance")}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border border-border">
            <thead className="bg-secondary/60">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                  {t("history.columns.test")}
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                  {t("history.columns.date")}
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                  {t("history.columns.score")}
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                  {t("history.columns.accuracy")}
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                  {t("history.columns.duration")}
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                  {t("history.columns.status")}
                </th>
                <th className="px-4 py-3 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                  {t("history.columns.open")}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleHistoryItems.map((test) => (
                <tr key={test.testId} className="border-t border-border">
                  <td className="px-4 py-3 text-sm text-foreground">
                    {`${test.oppositionName} - #${test.testId.slice(0, 8)}`}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {new Date(test.finishedAt).toLocaleDateString(
                        i18n.resolvedLanguage ?? "es"
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">
                    {test.score.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    <span className="inline-flex items-center gap-1">
                      {test.trend === "up" && (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                      )}
                      {test.trend === "down" && (
                        <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
                      )}
                      {test.trend === "flat" && (
                        <Minus className="h-3.5 w-3.5 text-amber-600" />
                      )}
                      {Math.round(test.accuracy)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {`${test.durationMinutes} min`}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold ${statusClass[test.status]}`}
                    >
                      {test.status === "excellent" && (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {t(`history.status.${test.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <CustomButton asChild size="sm" styleType="menu">
                      <Link
                        to={`/perfil/test/${encodeURIComponent(test.testId)}`}
                      >
                        {t("history.viewTest")}
                      </Link>
                    </CustomButton>
                  </td>
                </tr>
              ))}
              {!isHistoryLoading && visibleHistoryItems.length === 0 && (
                <tr className="border-t border-border">
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-sm text-muted-foreground text-center"
                  >
                    {t("history.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {canLoadMoreHistory && (
          <div className="mt-4 flex justify-center">
            <CustomButton
              type="button"
              styleType="menu"
              onClick={() =>
                setVisibleHistoryCount((prev) => prev + HISTORY_PAGE_SIZE)
              }
            >
              {t("history.loadMore")}
            </CustomButton>
          </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;

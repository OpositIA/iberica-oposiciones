import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
  User
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

type TestStatus = "excellent" | "approved" | "reinforce";

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

const Dashboard = () => {
  const { t } = useTranslation("dashboard");
  const { user } = useAuth();
  const [accountName, setAccountName] = useState(t("defaults.user"));
  const [weeklyTargetHours, setWeeklyTargetHours] = useState(16);

  const historialTests = useMemo<TestItem[]>(
    () => [
      {
        id: 1,
        nombre: t("history.items.mock42.name"),
        fecha: t("history.items.mock42.date"),
        nota: 8.7,
        precision: 89,
        duracion: t("history.items.mock42.duration"),
        tendencia: "up",
        estado: "excellent"
      },
      {
        id: 2,
        nombre: t("history.items.constitutional.name"),
        fecha: t("history.items.constitutional.date"),
        nota: 7.4,
        precision: 77,
        duracion: t("history.items.constitutional.duration"),
        tendencia: "up",
        estado: "approved"
      },
      {
        id: 3,
        nombre: t("history.items.administrativeProcedure.name"),
        fecha: t("history.items.administrativeProcedure.date"),
        nota: 6.1,
        precision: 68,
        duracion: t("history.items.administrativeProcedure.duration"),
        tendencia: "down",
        estado: "reinforce"
      },
      {
        id: 4,
        nombre: t("history.items.organicLaw.name"),
        fecha: t("history.items.organicLaw.date"),
        nota: 7.9,
        precision: 81,
        duracion: t("history.items.organicLaw.duration"),
        tendencia: "flat",
        estado: "approved"
      }
    ],
    [t]
  );

  const horasEstudio = Math.max(
    1,
    Math.round(weeklyTargetHours * 0.72 * 10) / 10
  );
  const progresoMeta = Math.min(
    100,
    Math.round((horasEstudio / weeklyTargetHours) * 100)
  );

  const mediaNota = useMemo(
    () =>
      (
        historialTests.reduce((acc, test) => acc + test.nota, 0) /
        historialTests.length
      ).toFixed(1),
    [historialTests]
  );

  const precisionMedia = useMemo(
    () =>
      Math.round(
        historialTests.reduce((acc, test) => acc + test.precision, 0) /
          historialTests.length
      ),
    [historialTests]
  );

  const statusClass: Record<TestStatus, string> = {
    excellent: "bg-emerald-500/15 text-emerald-700",
    approved: "bg-sky-500/15 text-sky-700",
    reinforce: "bg-amber-500/15 text-amber-700"
  };

  useEffect(() => {
    let isMounted = true;

    const loadProfileSnapshot = async () => {
      if (!user) {
        if (!isMounted) return;
        setAccountName(t("defaults.user"));
        setWeeklyTargetHours(16);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, weekly_target_hours")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!isMounted) return;

      const firstName = String(data?.first_name ?? "").trim();
      const lastName = String(data?.last_name ?? "").trim();
      const fullName = `${firstName} ${lastName}`.trim();
      setAccountName(
        fullName || data?.email || user.email || t("defaults.user")
      );

      const weeklyTarget = Number(data?.weekly_target_hours);
      if (Number.isFinite(weeklyTarget) && weeklyTarget > 0)
        setWeeklyTargetHours(weeklyTarget);
      else setWeeklyTargetHours(16);
    };

    void loadProfileSnapshot();

    return () => {
      isMounted = false;
    };
  }, [t, user]);

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
            <Link
              to="/perfil/mi-perfil"
              className="inline-flex items-center gap-2 border border-border px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors"
            >
              <User className="h-4 w-4" />
              {t("actions.profile")}
            </Link>
            <Link
              to="/perfil/test"
              className="inline-flex items-center gap-2 border border-border px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              {t("actions.goToTest")}
            </Link>
            <Link
              to="/perfil/oposia"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors"
            >
              <Brain className="h-4 w-4" />
              {t("actions.openIA")}
            </Link>
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
          <p className="text-2xl font-serif text-foreground">148</p>
        </div>

        <div className="border border-border bg-background p-5">
          <div className="mb-2 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              {t("cards.globalAverage")}
            </p>
          </div>
          <p className="text-2xl font-serif text-foreground">{mediaNota}/10</p>
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
              </tr>
            </thead>
            <tbody>
              {historialTests.map((test) => (
                <tr key={test.id} className="border-t border-border">
                  <td className="px-4 py-3 text-sm text-foreground">
                    {test.nombre}
                  </td>
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
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {test.duracion}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold ${statusClass[test.estado]}`}
                    >
                      {test.estado === "excellent" && (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {t(`history.status.${test.estado}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;

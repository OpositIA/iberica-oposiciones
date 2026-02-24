import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  User,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";

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

const Dashboard = () => {
  const { user } = useAuth();
  const [accountName, setAccountName] = useState("Usuario");
  const [weeklyTargetHours, setWeeklyTargetHours] = useState(16);

  const horasEstudio = Math.max(1, Math.round(weeklyTargetHours * 0.72 * 10) / 10);
  const progresoMeta = Math.min(100, Math.round((horasEstudio / weeklyTargetHours) * 100));

  const mediaNota = useMemo(
    () =>
      (
        historialTests.reduce((acc, test) => acc + test.nota, 0) /
        historialTests.length
      ).toFixed(1),
    [],
  );

  const precisionMedia = useMemo(
    () =>
      Math.round(
        historialTests.reduce((acc, test) => acc + test.precision, 0) /
          historialTests.length,
      ),
    [],
  );

  const statusClass: Record<TestStatus, string> = {
    Excelente: "bg-emerald-500/15 text-emerald-700",
    Aprobado: "bg-sky-500/15 text-sky-700",
    Reforzar: "bg-amber-500/15 text-amber-700",
  };

  useEffect(() => {
    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const firstName = String(metadata.first_name ?? "").trim();
    const lastName = String(metadata.last_name ?? "").trim();
    const fullName = `${firstName} ${lastName}`.trim();

    setAccountName(fullName || user?.email || "Usuario");
    const weeklyTarget = Number(metadata.weekly_target_hours);
    if (Number.isFinite(weeklyTarget) && weeklyTarget > 0) {
      setWeeklyTargetHours(weeklyTarget);
    }
  }, [user]);

  return (
    <div className="space-y-6">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Dashboard
            </p>
            <h1 className="text-2xl md:text-3xl font-serif text-foreground">Hola, {accountName}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Aqui tienes una vista completa de rendimiento: progreso, metricas clave y tus ultimos tests.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/perfil/mi-perfil"
              className="inline-flex items-center gap-2 border border-border px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors"
            >
              <User className="h-4 w-4" />
              Mi perfil
            </Link>
            <Link
              to="/perfil/test"
              className="inline-flex items-center gap-2 border border-border px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              Ir a test
            </Link>
            <Link
              to="/perfil/oposia"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors"
            >
              <Brain className="h-4 w-4" />
              Abrir IA
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="border border-border bg-background p-5">
          <div className="mb-2 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Tests completados
            </p>
          </div>
          <p className="text-2xl font-serif text-foreground">148</p>
        </div>

        <div className="border border-border bg-background p-5">
          <div className="mb-2 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Media global
            </p>
          </div>
          <p className="text-2xl font-serif text-foreground">{mediaNota}/10</p>
        </div>

        <div className="border border-border bg-background p-5">
          <div className="mb-2 flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Precision media
            </p>
          </div>
          <p className="text-2xl font-serif text-foreground">{precisionMedia}%</p>
        </div>

        <div className="border border-border bg-background p-5">
          <div className="mb-2 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Horas esta semana
            </p>
          </div>
          <p className="text-2xl font-serif text-foreground">{horasEstudio} h</p>
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
              <span>Progreso</span>
              <span>{progresoMeta}%</span>
            </div>
            <div className="h-2 bg-secondary overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${progresoMeta}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="border border-border bg-background p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border border-border bg-secondary/30 p-3">
            <p className="mb-1 text-xs text-muted-foreground uppercase tracking-widest">Tendencia</p>
            <p className="inline-flex items-center gap-2 text-sm text-foreground">
              <BarChart3 className="h-4 w-4 text-primary" />
              Positiva en las ultimas 2 semanas
            </p>
          </div>
          <div className="border border-border bg-secondary/30 p-3">
            <p className="mb-1 text-xs text-muted-foreground uppercase tracking-widest">Foco</p>
            <p className="inline-flex items-center gap-2 text-sm text-foreground">
              <Target className="h-4 w-4 text-primary" />
              Reforzar procedimiento administrativo
            </p>
          </div>
          <div className="border border-border bg-secondary/30 p-3">
            <p className="mb-1 text-xs text-muted-foreground uppercase tracking-widest">Tiempo medio</p>
            <p className="inline-flex items-center gap-2 text-sm text-foreground">
              <Clock3 className="h-4 w-4 text-primary" />
              32 min por test
            </p>
          </div>
        </div>
      </section>

      <section className="border border-border bg-background p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
              Historico test
            </p>
            <h2 className="text-xl font-serif text-foreground">Ultimos resultados</h2>
          </div>
          <div className="inline-flex items-center gap-2 border border-border px-3 py-1.5">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Rendimiento
            </span>
          </div>
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
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">{test.nota}</td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    <span className="inline-flex items-center gap-1">
                      {test.tendencia === "up" && <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />}
                      {test.tendencia === "down" && <TrendingDown className="h-3.5 w-3.5 text-rose-600" />}
                      {test.tendencia === "flat" && <Minus className="h-3.5 w-3.5 text-amber-600" />}
                      {test.precision}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{test.duracion}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold ${statusClass[test.estado]}`}
                    >
                      {test.estado === "Excelente" && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {test.estado}
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

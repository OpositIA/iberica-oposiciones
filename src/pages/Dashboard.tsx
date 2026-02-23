import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  Minus,
  Save,
  Target,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  age: string;
  preferredOpposition: string;
  yearsPreparing: string;
  weeklyTargetHours: string;
  testsPerWeek: string;
  mainChallenge: string;
  avatarUrl: string;
};

const initialProfile: ProfileForm = {
  firstName: "",
  lastName: "",
  email: "",
  age: "",
  preferredOpposition: "",
  yearsPreparing: "",
  weeklyTargetHours: "16",
  testsPerWeek: "",
  mainChallenge: "",
  avatarUrl: "",
};

const oppositionOptions = [
  "Auxiliar administrativo del Estado",
  "Administracion local",
  "Gestion de la Seguridad Social",
  "Tramitacion procesal",
  "Tecnico de Hacienda",
] as const;

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
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileForm>(initialProfile);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const weeklyTarget = Number(profile.weeklyTargetHours) || 16;
  const horasEstudio = Math.max(1, Math.round(weeklyTarget * 0.72 * 10) / 10);
  const progresoMeta = Math.min(100, Math.round((horasEstudio / weeklyTarget) * 100));

  const mediaNota = useMemo(
    () =>
      (
        historialTests.reduce((acc, test) => acc + test.nota, 0) /
        historialTests.length
      ).toFixed(1),
    [],
  );

  const statusClass: Record<TestStatus, string> = {
    Excelente: "bg-emerald-500/15 text-emerald-700",
    Aprobado: "bg-sky-500/15 text-sky-700",
    Reforzar: "bg-amber-500/15 text-amber-700",
  };

  useEffect(() => {
    const loadProfile = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        toast({
          variant: "destructive",
          title: "No se pudo cargar tu perfil",
          description: error.message,
        });
        setIsLoadingProfile(false);
        return;
      }

      const user = data.user;
      const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;

      setProfile({
        firstName: String(metadata.first_name ?? ""),
        lastName: String(metadata.last_name ?? ""),
        email: user?.email ?? "",
        age: metadata.age != null ? String(metadata.age) : "",
        preferredOpposition: String(metadata.preferred_opposition ?? ""),
        yearsPreparing: metadata.years_preparing != null ? String(metadata.years_preparing) : "",
        weeklyTargetHours:
          metadata.weekly_target_hours != null
            ? String(metadata.weekly_target_hours)
            : "16",
        testsPerWeek: metadata.tests_per_week != null ? String(metadata.tests_per_week) : "",
        mainChallenge: String(metadata.main_challenge ?? ""),
        avatarUrl: String(metadata.avatar_url ?? ""),
      });

      setIsLoadingProfile(false);
    };

    void loadProfile();
  }, [toast]);

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Imagen demasiado pesada",
        description: "La imagen debe pesar menos de 2MB.",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setProfile((prev) => ({ ...prev, avatarUrl: result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      toast({
        variant: "destructive",
        title: "Faltan datos",
        description: "Completa nombre y apellidos para guardar el perfil.",
      });
      return;
    }

    setIsSavingProfile(true);

    const { error } = await supabase.auth.updateUser({
      data: {
        first_name: profile.firstName.trim(),
        last_name: profile.lastName.trim(),
        full_name: `${profile.firstName.trim()} ${profile.lastName.trim()}`.trim(),
        age: Number(profile.age) || null,
        preferred_opposition: profile.preferredOpposition,
        years_preparing: Number(profile.yearsPreparing) || null,
        weekly_target_hours: Number(profile.weeklyTargetHours) || 16,
        tests_per_week: Number(profile.testsPerWeek) || null,
        main_challenge: profile.mainChallenge.trim(),
        avatar_url: profile.avatarUrl,
      },
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar el perfil",
        description: error.message,
      });
      setIsSavingProfile(false);
      return;
    }

    toast({
      title: "Perfil actualizado",
      description: "Tus datos de perfil se han guardado correctamente.",
    });
    setIsSavingProfile(false);
  };

  if (isLoadingProfile) {
    return (
      <div className="border border-border bg-background p-6">
        <p className="text-sm text-muted-foreground">Cargando perfil...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="relative h-20 w-20 shrink-0 rounded-full border border-border bg-secondary overflow-hidden">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt="Perfil"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full inline-flex items-center justify-center">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
                Mi perfil
              </p>
              <h1 className="text-2xl md:text-3xl font-serif text-foreground">
                {profile.firstName || "Usuario"} {profile.lastName}
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Gestiona tu informacion personal y de preparacion para mantener coherencia con tu registro.
              </p>
              <label className="mt-3 inline-flex items-center gap-2 border border-border px-3 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors cursor-pointer">
                <Camera className="h-3.5 w-3.5" />
                Cambiar imagen
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/perfil/test"
              className="bg-primary text-primary-foreground px-5 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors"
            >
              Ir a test
            </Link>
            <Link
              to="/perfil/temario"
              className="border border-border px-5 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors"
            >
              Ir a temario
            </Link>
          </div>
        </div>
      </section>

      <section className="border border-border bg-background p-6 md:p-8">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
              Datos de registro
            </p>
            <h2 className="text-xl font-serif text-foreground">Informacion del perfil</h2>
          </div>
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={isSavingProfile}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {isSavingProfile ? "Guardando..." : "Guardar perfil"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Nombre
            </label>
            <input
              type="text"
              value={profile.firstName}
              onChange={(e) => setProfile((prev) => ({ ...prev, firstName: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Apellidos
            </label>
            <input
              type="text"
              value={profile.lastName}
              onChange={(e) => setProfile((prev) => ({ ...prev, lastName: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Email
            </label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Edad
            </label>
            <input
              type="number"
              min={16}
              max={75}
              value={profile.age}
              onChange={(e) => setProfile((prev) => ({ ...prev, age: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Oposicion preferente
            </label>
            <select
              value={profile.preferredOpposition}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  preferredOpposition: e.target.value,
                }))
              }
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            >
              <option value="">Selecciona una opcion</option>
              {oppositionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Anos opositando
            </label>
            <input
              type="number"
              min={0}
              max={40}
              value={profile.yearsPreparing}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, yearsPreparing: e.target.value }))
              }
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Horas objetivo / semana
            </label>
            <input
              type="number"
              min={1}
              max={80}
              value={profile.weeklyTargetHours}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, weeklyTargetHours: e.target.value }))
              }
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              Tests por semana
            </label>
            <input
              type="number"
              min={1}
              max={14}
              value={profile.testsPerWeek}
              onChange={(e) => setProfile((prev) => ({ ...prev, testsPerWeek: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
            Principal reto de estudio
          </label>
          <textarea
            rows={4}
            value={profile.mainChallenge}
            onChange={(e) => setProfile((prev) => ({ ...prev, mainChallenge: e.target.value }))}
            className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
            placeholder="Describe tu principal reto actual..."
          />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-border bg-background p-5">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Tests completados
            </p>
          </div>
          <p className="text-2xl font-serif text-foreground">148</p>
        </div>
        <div className="border border-border bg-background p-5">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Media global
            </p>
          </div>
          <p className="text-2xl font-serif text-foreground">{mediaNota}/10</p>
        </div>
        <div className="border border-border bg-background p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock3 className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Horas esta semana
            </p>
          </div>
          <p className="text-2xl font-serif text-foreground">{horasEstudio} h</p>
          <div className="mt-2">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-1">
              <span>Progreso</span>
              <span>{progresoMeta}%</span>
            </div>
            <div className="h-2 bg-secondary overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${progresoMeta}%` }} />
            </div>
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
              Perfil activo
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
      </section>
    </div>
  );
};

export default Dashboard;

import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { obtenerNombresOposiciones } from "@/data/oposiciones";

type RegisterForm = {
  name: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  age: string;
  preferredOpposition: string;
  yearsPreparing: string;
  weeklyTargetHours: string;
  testsPerWeek: string;
  mainChallenge: string;
  acceptedTerms: boolean;
};

const TOTAL_STEPS = 4;

const initialForm: RegisterForm = {
  name: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
  age: "",
  preferredOpposition: "",
  yearsPreparing: "",
  weeklyTargetHours: "16",
  testsPerWeek: "",
  mainChallenge: "",
  acceptedTerms: false,
};

const stepTitles = [
  "Cuenta",
  "Perfil oposicion",
  "Plan de estudio",
  "Confirmacion",
] as const;

const oppositionOptions = obtenerNombresOposiciones();

const Register = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState<RegisterForm>(initialForm);

  const progress = useMemo(() => Math.round((step / TOTAL_STEPS) * 100), [step]);

  const validateStep = (targetStep: number): string | null => {
    const isEmailValid = /\S+@\S+\.\S+/.test(form.email);
    const age = Number(form.age);
    const yearsPreparing = Number(form.yearsPreparing);
    const weeklyTargetHours = Number(form.weeklyTargetHours);
    const testsPerWeek = Number(form.testsPerWeek);

    if (targetStep === 1) {
      if (!form.name.trim() || !form.lastName.trim()) return "Completa nombre y apellidos.";
      if (!isEmailValid) return "El email no tiene un formato valido.";
      if (form.password.length < 8) return "La contrasena debe tener al menos 8 caracteres.";
      if (form.password !== form.confirmPassword) return "Las contrasenas no coinciden.";
    }

    if (targetStep === 2) {
      if (!form.age || Number.isNaN(age) || age < 16 || age > 75) {
        return "Introduce una edad valida (16-75).";
      }
      if (!form.preferredOpposition) return "Selecciona una oposicion preferente.";
      if (!form.yearsPreparing || Number.isNaN(yearsPreparing) || yearsPreparing < 0 || yearsPreparing > 40) {
        return "Indica cuantos anos llevas opositando (0-40).";
      }
    }

    if (targetStep === 3) {
      if (!form.weeklyTargetHours || Number.isNaN(weeklyTargetHours) || weeklyTargetHours < 1 || weeklyTargetHours > 80) {
        return "Define un objetivo de horas semanales entre 1 y 80.";
      }
      if (!form.testsPerWeek || Number.isNaN(testsPerWeek) || testsPerWeek < 1 || testsPerWeek > 14) {
        return "Indica cuantos tests quieres hacer por semana (1-14).";
      }
    }

    if (targetStep === 4) {
      if (form.mainChallenge.trim().length < 12) {
        return "Describe tu principal reto de estudio con un poco mas de detalle.";
      }
      if (!form.acceptedTerms) return "Debes aceptar terminos y privacidad para crear la cuenta.";
    }

    return null;
  };

  const nextStep = () => {
    const errorMessage = validateStep(step);
    if (errorMessage) {
      toast({
        variant: "destructive",
        title: "Revisa este paso",
        description: errorMessage,
      });
      return;
    }

    setStep((prev) => Math.min(TOTAL_STEPS, prev + 1));
  };

  const previousStep = () => {
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (step < TOTAL_STEPS) {
      nextStep();
      return;
    }

    const errorMessage = validateStep(TOTAL_STEPS);
    if (errorMessage) {
      toast({
        variant: "destructive",
        title: "Faltan datos por completar",
        description: errorMessage,
      });
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          first_name: form.name.trim(),
          last_name: form.lastName.trim(),
          full_name: `${form.name.trim()} ${form.lastName.trim()}`.trim(),
          age: Number(form.age),
          preferred_opposition: form.preferredOpposition,
          years_preparing: Number(form.yearsPreparing),
          weekly_target_hours: Number(form.weeklyTargetHours),
          tests_per_week: Number(form.testsPerWeek),
          main_challenge: form.mainChallenge.trim(),
        },
      },
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "No se pudo crear la cuenta",
        description: error.message,
      });
      setIsLoading(false);
      return;
    }

    if (data.session) {
      toast({
        title: "Cuenta creada",
        description: "Registro completado. Te llevamos al dashboard.",
      });
      navigate("/dashboard", { replace: true });
      setIsLoading(false);
      return;
    }

    toast({
      title: "Revisa tu email",
      description: "Te enviamos un enlace de confirmacion antes de entrar.",
    });
    setIsLoading(false);
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-charcoal flex">
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-16">
        <div className="max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-16">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-sm font-bold tracking-widest uppercase text-slate-100">
              OposiTest
            </span>
          </Link>
          <h1 className="text-5xl font-serif italic text-slate-100 leading-tight mb-6">
            Registro guiado
            <br />
            en 4 pasos.
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Cuanto mejor entendamos tu perfil, mas preciso sera tu plan inicial de estudio.
          </p>
          <div className="mt-12 space-y-3">
            {stepTitles.map((label, index) => {
              const current = index + 1;
              const isActive = current === step;
              const isDone = current < step;

              return (
                <div key={label} className="flex items-center gap-3">
                  <div
                    className={`h-6 w-6 border text-xs inline-flex items-center justify-center ${
                      isDone
                        ? "bg-primary text-primary-foreground border-primary"
                        : isActive
                          ? "border-primary text-primary bg-background/10"
                          : "border-slate-200/25 text-slate-300/70"
                    }`}
                  >
                    {current}
                  </div>
                  <span
                    className={`text-sm ${
                      isActive || isDone ? "text-slate-100" : "text-slate-300/70"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-10">
            <Link to="/" className="flex items-center gap-2 mb-8">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-sm font-bold tracking-widest uppercase text-foreground">
                OposiTest
              </span>
            </Link>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-serif text-foreground">Crear cuenta</h2>
              <p className="text-xs tracking-widest uppercase text-muted-foreground">
                Paso {step} de {TOTAL_STEPS}
              </p>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Configuramos tu onboarding inicial.</p>
            <div className="h-1.5 bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {step === 1 && (
              <>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Laura"
                    className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    Apellidos
                  </label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Ej: Perez Romero"
                    className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="tu@email.com"
                    autoComplete="email"
                    className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                      Contrasena
                    </label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                      placeholder="Minimo 8 caracteres"
                      autoComplete="new-password"
                      className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                      Repetir contrasena
                    </label>
                    <input
                      type="password"
                      value={form.confirmPassword}
                      onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="Repite la clave"
                      autoComplete="new-password"
                      className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                      Edad
                    </label>
                    <input
                      type="number"
                      min={16}
                      max={75}
                      value={form.age}
                      onChange={(e) => setForm((prev) => ({ ...prev, age: e.target.value }))}
                      placeholder="Ej: 29"
                      className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                      Anos opositando
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      value={form.yearsPreparing}
                      onChange={(e) => setForm((prev) => ({ ...prev, yearsPreparing: e.target.value }))}
                      placeholder="Ej: 2"
                      className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    Oposicion preferente
                  </label>
                  <select
                    value={form.preferredOpposition}
                    onChange={(e) => setForm((prev) => ({ ...prev, preferredOpposition: e.target.value }))}
                    className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors"
                  >
                    <option value="">Selecciona una opcion</option>
                    {oppositionOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    Horas objetivo / semana
                  </label>
                  <div className="border border-border p-4">
                    <div className="flex items-center justify-between text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
                      <span>Min 1h</span>
                      <span>{form.weeklyTargetHours || "16"}h</span>
                      <span>Max 80h</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={80}
                      value={form.weeklyTargetHours || "16"}
                      onChange={(e) => setForm((prev) => ({ ...prev, weeklyTargetHours: e.target.value }))}
                      className="w-full accent-primary"
                    />
                    <p className="text-sm text-foreground mt-2">
                      Objetivo: {form.weeklyTargetHours || "16"} horas semanales
                    </p>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    Tests por semana
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={form.testsPerWeek}
                    onChange={(e) => setForm((prev) => ({ ...prev, testsPerWeek: e.target.value }))}
                    placeholder="Ej: 4"
                    className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
                  />
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    Cual es tu mayor reto ahora mismo?
                  </label>
                  <textarea
                    value={form.mainChallenge}
                    onChange={(e) => setForm((prev) => ({ ...prev, mainChallenge: e.target.value }))}
                    placeholder="Ej: Mantener constancia de lunes a jueves y cerrar con simulacro los sabados."
                    rows={4}
                    className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50 resize-none"
                  />
                </div>

                <label className="flex items-start gap-3 border border-border p-4">
                  <input
                    type="checkbox"
                    checked={form.acceptedTerms}
                    onChange={(e) => setForm((prev) => ({ ...prev, acceptedTerms: e.target.checked }))}
                    className="mt-0.5"
                  />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    Acepto los <Link to="/" className="text-primary">Terminos</Link> y la{" "}
                    <Link to="/" className="text-primary">Politica de Privacidad</Link>.
                  </span>
                </label>
              </>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={previousStep}
                disabled={step === 1 || isLoading}
                className="border border-border px-5 py-3 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Atras
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="bg-primary text-primary-foreground px-6 py-3 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {step < TOTAL_STEPS ? "Continuar" : isLoading ? "Creando..." : "Crear cuenta"}
              </button>
            </div>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              Ya tienes cuenta?{" "}
              <Link to="/login" className="text-primary font-semibold hover:text-primary/80 transition-colors">
                Inicia sesion
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;

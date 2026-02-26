import opositaiHorizontalLogo from "@/assets/opositai-horizontal.png";
import CustomInput from "@/components/ui/custom-input";
import CustomSelect from "@/components/ui/custom-select";
import {
  fetchOppositionOptions,
  type OppositionOption
} from "@/data/oposicionesDb";
import { useToast } from "@/hooks/use-toast";
import { normalizeLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

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
  acceptedTerms: false
};

const Register = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(["auth", "common"]);
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState<RegisterForm>(initialForm);
  const [oppositionOptions, setOppositionOptions] = useState<OppositionOption[]>(
    []
  );

  const locale = normalizeLocale(i18n.resolvedLanguage);

  useEffect(() => {
    let isMounted = true;
    const loadOppositions = async () => {
      const options = await fetchOppositionOptions(locale);
      if (!isMounted) return;
      setOppositionOptions(options);
    };

    void loadOppositions();
    return () => {
      isMounted = false;
    };
  }, [locale]);

  const stepTitles = useMemo(
    () => [
      t("auth:register.stepTitles.account"),
      t("auth:register.stepTitles.oppositionProfile"),
      t("auth:register.stepTitles.studyPlan"),
      t("auth:register.stepTitles.confirmation")
    ],
    [t]
  );

  const progress = useMemo(
    () => Math.round((step / TOTAL_STEPS) * 100),
    [step]
  );

  const validateStep = (targetStep: number): string | null => {
    const isEmailValid = /\S+@\S+\.\S+/.test(form.email);
    const age = Number(form.age);
    const yearsPreparing = Number(form.yearsPreparing);
    const weeklyTargetHours = Number(form.weeklyTargetHours);
    const testsPerWeek = Number(form.testsPerWeek);

    if (targetStep === 1) {
      if (!form.name.trim() || !form.lastName.trim())
        return t("auth:register.validation.nameRequired");
      if (!isEmailValid) return t("auth:register.validation.invalidEmail");
      if (form.password.length < 8)
        return t("auth:register.validation.passwordLength");
      if (form.password !== form.confirmPassword)
        return t("auth:register.validation.passwordMatch");
    }

    if (targetStep === 2) {
      if (!form.age || Number.isNaN(age) || age < 16 || age > 75)
        return t("auth:register.validation.invalidAge");

      if (!form.preferredOpposition)
        return t("auth:register.validation.preferredOppositionRequired");
      if (
        !form.yearsPreparing ||
        Number.isNaN(yearsPreparing) ||
        yearsPreparing < 0 ||
        yearsPreparing > 40
      )
        return t("auth:register.validation.invalidYearsPreparing");
    }

    if (targetStep === 3) {
      if (
        !form.weeklyTargetHours ||
        Number.isNaN(weeklyTargetHours) ||
        weeklyTargetHours < 1 ||
        weeklyTargetHours > 80
      )
        return t("auth:register.validation.invalidWeeklyHours");

      if (
        !form.testsPerWeek ||
        Number.isNaN(testsPerWeek) ||
        testsPerWeek < 1 ||
        testsPerWeek > 14
      )
        return t("auth:register.validation.invalidTestsPerWeek");
    }

    if (targetStep === 4) {
      if (form.mainChallenge.trim().length < 12)
        return t("auth:register.validation.mainChallengeLength");

      if (!form.acceptedTerms)
        return t("auth:register.validation.termsRequired");
    }

    return null;
  };

  const nextStep = () => {
    const errorMessage = validateStep(step);
    if (errorMessage) {
      toast({
        variant: "destructive",
        title: t("auth:register.toasts.reviewStepTitle"),
        description: errorMessage
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
        title: t("auth:register.toasts.missingDataTitle"),
        description: errorMessage
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
          preferred_opposition_id: form.preferredOpposition,
          preferred_opposition: form.preferredOpposition || null,
          years_preparing: Number(form.yearsPreparing),
          weekly_target_hours: Number(form.weeklyTargetHours),
          tests_per_week: Number(form.testsPerWeek),
          main_challenge: form.mainChallenge.trim(),
          locale: "es"
        }
      }
    });

    if (error) {
      toast({
        variant: "destructive",
        title: t("auth:register.toasts.createFailedTitle"),
        description: error.message
      });
      setIsLoading(false);
      return;
    }

    if (data.session) {
      toast({
        title: t("auth:register.toasts.createdTitle"),
        description: t("auth:register.toasts.createdDescription")
      });
      navigate("/dashboard", { replace: true });
      setIsLoading(false);
      return;
    }

    toast({
      title: t("auth:register.toasts.checkEmailTitle"),
      description: t("auth:register.toasts.checkEmailDescription")
    });
    setIsLoading(false);
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-charcoal flex">
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-16">
        <div className="max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-5">
            <img
              src={opositaiHorizontalLogo}
              alt="OpositAI"
              className="h-60 w-auto"
            />
          </Link>
          <h1 className="text-5xl font-serif italic text-slate-100 leading-tight mb-6">
            {t("auth:register.heroTitleLine1")}
            <br />
            {t("auth:register.heroTitleLine2")}
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            {t("auth:register.heroDescription")}
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
                    className={`text-sm ${isActive || isDone ? "text-slate-100" : "text-slate-300/70"}`}
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
              <img
                src={opositaiHorizontalLogo}
                alt="OpositAI"
                className="h-4 w-auto"
              />
            </Link>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-serif text-foreground">
                {t("auth:register.title")}
              </h2>
              <p className="text-xs tracking-widest uppercase text-muted-foreground">
                {t("auth:register.stepCounter", { step, total: TOTAL_STEPS })}
              </p>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {t("auth:register.subtitle")}
            </p>
            <div className="h-1.5 bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {step === 1 && (
              <>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    {t("auth:register.fields.name")}
                  </label>
                  <CustomInput
                    type="text"
                    value={form.name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder={t("auth:register.placeholders.name")}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    {t("auth:register.fields.lastName")}
                  </label>
                  <CustomInput
                    type="text"
                    value={form.lastName}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, lastName: e.target.value }))
                    }
                    placeholder={t("auth:register.placeholders.lastName")}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    {t("auth:register.fields.email")}
                  </label>
                  <CustomInput
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder={t("auth:register.placeholders.email")}
                    autoComplete="email"
                    className="w-full"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                      {t("auth:register.fields.password")}
                    </label>
                    <CustomInput
                      type="password"
                      value={form.password}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          password: e.target.value
                        }))
                      }
                      placeholder={t("auth:register.placeholders.password")}
                      autoComplete="new-password"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                      {t("auth:register.fields.confirmPassword")}
                    </label>
                    <CustomInput
                      type="password"
                      value={form.confirmPassword}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          confirmPassword: e.target.value
                        }))
                      }
                      placeholder={t(
                        "auth:register.placeholders.confirmPassword"
                      )}
                      autoComplete="new-password"
                      className="w-full"
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
                      {t("auth:register.fields.age")}
                    </label>
                    <CustomInput
                      type="number"
                      min={16}
                      max={75}
                      value={form.age}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, age: e.target.value }))
                      }
                      placeholder={t("auth:register.placeholders.age")}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                      {t("auth:register.fields.yearsPreparing")}
                    </label>
                    <CustomInput
                      type="number"
                      min={0}
                      max={40}
                      value={form.yearsPreparing}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          yearsPreparing: e.target.value
                        }))
                      }
                      placeholder={t(
                        "auth:register.placeholders.yearsPreparing"
                      )}
                      className="w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    {t("auth:register.fields.preferredOpposition")}
                  </label>
                  <CustomSelect
                    value={form.preferredOpposition}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        preferredOpposition: e.target.value
                      }))
                    }
                    className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors"
                  >
                    <option value="">
                      {t("auth:register.selectOpposition")}
                    </option>
                    {oppositionOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </CustomSelect>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    {t("auth:register.fields.weeklyTargetHours")}
                  </label>
                  <div className="border border-border p-4">
                    <div className="flex items-center justify-between text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
                      <span>{t("auth:register.slider.min")}</span>
                      <span>{form.weeklyTargetHours || "16"}h</span>
                      <span>{t("auth:register.slider.max")}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={80}
                      value={form.weeklyTargetHours || "16"}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          weeklyTargetHours: e.target.value
                        }))
                      }
                      className="w-full accent-primary"
                    />
                    <p className="text-sm text-foreground mt-2">
                      {t("auth:register.slider.target", {
                        hours: form.weeklyTargetHours || "16"
                      })}
                    </p>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    {t("auth:register.fields.testsPerWeek")}
                  </label>
                  <CustomInput
                    type="number"
                    min={1}
                    max={14}
                    value={form.testsPerWeek}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        testsPerWeek: e.target.value
                      }))
                    }
                    placeholder={t("auth:register.placeholders.testsPerWeek")}
                    className="w-full"
                  />
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                    {t("auth:register.fields.mainChallenge")}
                  </label>
                  <textarea
                    value={form.mainChallenge}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        mainChallenge: e.target.value
                      }))
                    }
                    placeholder={t("auth:register.placeholders.mainChallenge")}
                    rows={4}
                    className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50 resize-none"
                  />
                </div>

                <label className="flex items-start gap-3 border border-border p-4">
                  <input
                    type="checkbox"
                    checked={form.acceptedTerms}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        acceptedTerms: e.target.checked
                      }))
                    }
                    className="mt-0.5"
                  />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    <Trans
                      i18nKey="auth:register.fields.acceptedTerms"
                      components={{
                        termsLink: <Link to="/" className="text-primary" />,
                        privacyLink: <Link to="/" className="text-primary" />
                      }}
                    />
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
                {t("auth:register.actions.back")}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="bg-primary text-primary-foreground px-6 py-3 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {step < TOTAL_STEPS
                  ? t("auth:register.actions.continue")
                  : isLoading
                    ? t("auth:register.actions.creating")
                    : t("auth:register.actions.create")}
              </button>
            </div>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t("auth:register.hasAccount")}{" "}
              <Link
                to="/login"
                className="text-primary font-semibold hover:text-primary/80 transition-colors"
              >
                {t("auth:register.signIn")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;

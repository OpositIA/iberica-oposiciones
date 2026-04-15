import { useAuth } from "@/auth/AuthProvider";
import BrandLogo from "@/components/BrandLogo";
import GoogleIcon from "@/components/GoogleIcon";
import CustomButton from "@/components/ui/custom-button";
import CustomDateInput from "@/components/ui/custom-date-input";
import CustomInput from "@/components/ui/custom-input";
import CustomSelect from "@/components/ui/custom-select";
import Reveal from "@/components/ui/reveal";
import {
  fetchOppositionOptions,
  type OppositionOption
} from "@/data/oposicionesDb";
import { useRegisterSubmit } from "@/hooks/use-register-submit";
import { useToast } from "@/hooks/use-toast";
import { normalizeLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeCode } from "@/lib/inputSanitization";
import { formatPlanPriceFromCents, getPlanKey } from "@/lib/plans";
import {
  buildRegisterPlanSelectionPath,
  clampRegisterStep,
  clearGoogleRegisterContext,
  clearGoogleRegisterResolutionPending,
  clearGoogleSignupSessionActive,
  clearRegisterFlowDraft,
  getRegisterAccountStepError,
  getRegisterProfileStepError,
  hasGoogleSignupSessionActive,
  initialRegisterForm,
  markGoogleRegisterResolutionPending,
  markGoogleRegisterSilentExit,
  readGoogleRegisterContext,
  readRegisterFlowDraft,
  sanitizeRegisterForm,
  writeGoogleRegisterContext,
  writeRegisterFlowDraft,
  type RegisterAuthMethod,
  type RegisterForm
} from "@/lib/registerFlow";
import {
  createStripeCheckoutSession,
  usePublicSubscriptionPlansQuery
} from "@/queries/subscriptionQueries";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

const readUserMetadataText = (
  metadata: Record<string, unknown>,
  ...keys: string[]
) => {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0)
      return value.trim();
  }

  return "";
};

const Register = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, i18n } = useTranslation(["auth", "common", "plans"]);
  const { toast } = useToast();
  const { isAuthenticated, profile, user } = useAuth();
  const persistedDraft = useMemo(() => readRegisterFlowDraft(), []);
  const googleRegisterContext = useMemo(() => readGoogleRegisterContext(), []);
  const shouldResumeGoogleRegister = Boolean(googleRegisterContext);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const requestedPlanCode = useMemo(
    () => sanitizeCode(searchParams.get("plan"), 60),
    [searchParams]
  );
  const [authMethod, setAuthMethod] = useState<RegisterAuthMethod>(() =>
    persistedDraft?.authMethod === "google" && shouldResumeGoogleRegister
      ? "google"
      : "credentials"
  );
  const [form, setForm] = useState<RegisterForm>(() =>
    persistedDraft?.authMethod === "google" && !shouldResumeGoogleRegister
      ? initialRegisterForm
      : (persistedDraft?.form ?? initialRegisterForm)
  );
  const [selectedPlanCode, setSelectedPlanCode] = useState(
    () =>
      requestedPlanCode ||
      (persistedDraft?.authMethod === "google" && !shouldResumeGoogleRegister
        ? ""
        : persistedDraft?.selectedPlanCode || "")
  );
  const [oppositionOptions, setOppositionOptions] = useState<
    OppositionOption[]
  >([]);
  const { data: publicPlans = [], isLoading: isLoadingPlans } =
    usePublicSubscriptionPlansQuery();

  const locale = normalizeLocale(i18n.resolvedLanguage);
  const {
    isSubmitting,
    prepareGooglePaidCheckout,
    preparePaidCheckout,
    submitGoogleRegister,
    submitRegister
  } = useRegisterSubmit(locale);
  const availablePlanCodes = useMemo(
    () => new Set(publicPlans.map((plan) => plan.code)),
    [publicPlans]
  );
  const hasRequestedPlan = useMemo(() => {
    if (!requestedPlanCode) return false;
    if (publicPlans.length === 0) return true;
    return availablePlanCodes.has(requestedPlanCode);
  }, [availablePlanCodes, publicPlans.length, requestedPlanCode]);
  const totalSteps = hasRequestedPlan ? 2 : 3;
  const minimumStep = authMethod === "google" ? 2 : 1;
  const step = Math.max(
    minimumStep,
    clampRegisterStep(searchParams.get("step") ?? minimumStep, totalSteps)
  );
  const maxBirthDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isGoogleRegister = authMethod === "google";
  const isLoading = isCheckingEmail || isSubmitting || isGoogleLoading;

  const plans = useMemo(
    () =>
      publicPlans.map((plan) => {
        const planKey = getPlanKey({ code: plan.code, tier: plan.tier });

        return {
          ...plan,
          planKey,
          name: t(`plans:plans.${planKey}.name`),
          description: t(`plans:plans.${planKey}.description`),
          priceLabel:
            plan.price_cents === 0
              ? t("plans:pricing.free")
              : formatPlanPriceFromCents(
                  plan.price_cents,
                  locale === "en" ? "en-US" : "es-ES",
                  plan.currency
                )
        };
      }),
    [locale, publicPlans, t]
  );
  const activePlanCode = hasRequestedPlan
    ? requestedPlanCode
    : selectedPlanCode;
  const activePlan =
    plans.find((plan) => plan.code === activePlanCode) ??
    plans.find((plan) => plan.code === requestedPlanCode) ??
    null;

  useEffect(() => {
    if (publicPlans.length === 0) return;

    if (requestedPlanCode && availablePlanCodes.has(requestedPlanCode)) {
      setSelectedPlanCode(requestedPlanCode);
      return;
    }

    setSelectedPlanCode((prev) => {
      if (prev && availablePlanCodes.has(prev)) return prev;
      return publicPlans[0]?.code ?? "";
    });
  }, [availablePlanCodes, publicPlans, requestedPlanCode]);

  useEffect(() => {
    if (persistedDraft?.authMethod !== "google" || shouldResumeGoogleRegister)
      return;

    clearRegisterFlowDraft();
    setAuthMethod("credentials");
    setForm(initialRegisterForm);
    setSelectedPlanCode(requestedPlanCode || "");
  }, [persistedDraft, requestedPlanCode, shouldResumeGoogleRegister]);

  useEffect(() => {
    if (!isAuthenticated || !googleRegisterContext || !user) return;

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = readUserMetadataText(metadata, "full_name", "name");
    const fullNameParts = fullName.split(" ").filter(Boolean);
    const fallbackFirstName = fullNameParts[0] ?? "";
    const fallbackLastName = fullNameParts.slice(1).join(" ");

    setAuthMethod("google");
    setForm((prev) => ({
      ...prev,
      name:
        profile?.firstName ||
        readUserMetadataText(metadata, "first_name", "given_name") ||
        fallbackFirstName,
      lastName:
        profile?.lastName ||
        readUserMetadataText(metadata, "last_name", "family_name") ||
        fallbackLastName,
      email: user.email?.trim() || prev.email,
      password: "",
      confirmPassword: ""
    }));
    clearGoogleRegisterResolutionPending();
    clearGoogleRegisterContext();
  }, [googleRegisterContext, isAuthenticated, profile, user]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    let hasChanges = false;

    if (nextParams.get("step") !== String(step)) {
      nextParams.set("step", String(step));
      hasChanges = true;
    }

    if (requestedPlanCode && nextParams.get("plan") !== requestedPlanCode) {
      nextParams.set("plan", requestedPlanCode);
      hasChanges = true;
    }

    if (hasChanges) setSearchParams(nextParams, { replace: true });
  }, [requestedPlanCode, searchParams, setSearchParams, step]);

  useEffect(() => {
    writeRegisterFlowDraft({
      form,
      selectedPlanCode,
      step,
      authMethod
    });
  }, [authMethod, form, selectedPlanCode, step]);

  useEffect(() => {
    if (hasRequestedPlan || step !== 3) return;

    navigate(buildRegisterPlanSelectionPath(selectedPlanCode), {
      replace: true
    });
  }, [hasRequestedPlan, navigate, selectedPlanCode, step]);

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

  useEffect(() => {
    return () => {
      const nextPath = window.location.pathname;
      if (nextPath.startsWith("/registro")) return;
      if (nextPath === "/auth/callback") return;
      if (isAuthenticated && hasGoogleSignupSessionActive()) {
        markGoogleRegisterSilentExit();
        void supabase.auth.signOut().finally(() => {
          clearGoogleSignupSessionActive();
          clearRegisterFlowDraft();
          clearGoogleRegisterResolutionPending();
          clearGoogleRegisterContext();
        });
        return;
      }

      clearGoogleSignupSessionActive();
      clearRegisterFlowDraft();
      clearGoogleRegisterResolutionPending();
      clearGoogleRegisterContext();
    };
  }, [isAuthenticated]);

  const stepTitles = useMemo(
    () =>
      hasRequestedPlan
        ? [
            t("auth:register.stepTitles.account"),
            t("auth:register.stepTitles.profile")
          ]
        : [
            t("auth:register.stepTitles.account"),
            t("auth:register.stepTitles.profile"),
            t("auth:register.stepTitles.plan")
          ],
    [hasRequestedPlan, t]
  );

  const progress = useMemo(
    () => Math.round((step / totalSteps) * 100),
    [step, totalSteps]
  );

  useEffect(() => {
    const checkoutState = searchParams.get("checkout");
    if (checkoutState !== "cancel") return;

    toast({
      title: t("plans:toasts.checkoutCancelledTitle"),
      description: t("plans:toasts.checkoutCancelledDescription")
    });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("checkout");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, t, toast]);

  useEffect(() => {
    const googleError = searchParams.get("google_error");
    if (googleError !== "emailAlreadyExists") return;

    toast({
      variant: "destructive",
      title: t("auth:register.googleErrorDialog.emailAlreadyExistsTitle"),
      description: t(
        "auth:register.googleErrorDialog.emailAlreadyExistsDescription"
      )
    });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("google_error");
    nextParams.set("step", "1");
    nextParams.delete("plan");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, t, toast]);

  const validateStep = (targetStep: number): string | null => {
    if (targetStep === 1) {
      const errorKey = getRegisterAccountStepError(form, authMethod);
      if (errorKey) return t(`auth:register.validation.${errorKey}`);
    }

    if (targetStep === 2) {
      const errorKey = getRegisterProfileStepError(form, maxBirthDate);
      if (errorKey) return t(`auth:register.validation.${errorKey}`);
    }

    if (targetStep === 3 && !hasRequestedPlan && !selectedPlanCode)
      return t("auth:register.validation.planRequired");

    return null;
  };

  const validateEmailAvailability = async (email: string) => {
    const { data, error } = await supabase.rpc("is_signup_email_available", {
      p_email: email
    });

    if (error) throw error;
    return data === true;
  };

  const nextStep = async () => {
    const errorMessage = validateStep(step);
    if (errorMessage) {
      toast({
        variant: "destructive",
        title: t("auth:register.toasts.reviewStepTitle"),
        description: errorMessage
      });
      return;
    }

    if (step === 1 && !isGoogleRegister) {
      setIsCheckingEmail(true);
      try {
        const isEmailAvailable = await validateEmailAvailability(
          sanitizeRegisterForm(form).email
        );
        if (!isEmailAvailable) {
          toast({
            variant: "destructive",
            title: t("auth:register.toasts.reviewStepTitle"),
            description: t("auth:register.validation.emailAlreadyExists")
          });
          return;
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: t("auth:register.toasts.reviewStepTitle"),
          description:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : t("auth:register.toasts.emailCheckFailedDescription")
        });
        return;
      } finally {
        setIsCheckingEmail(false);
      }
    }

    const nextStepValue = Math.min(totalSteps, step + 1);

    if (!hasRequestedPlan && nextStepValue === 3) {
      navigate(buildRegisterPlanSelectionPath(selectedPlanCode), {
        replace: true
      });
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("step", String(nextStepValue));
    if (requestedPlanCode) nextParams.set("plan", requestedPlanCode);
    setSearchParams(nextParams, { replace: true });
  };

  const previousStep = () => {
    const previousStepValue = Math.max(minimumStep, step - 1);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("step", String(previousStepValue));
    if (requestedPlanCode) nextParams.set("plan", requestedPlanCode);
    setSearchParams(nextParams, { replace: true });
  };

  const handleGoogleRegister = async () => {
    setIsGoogleLoading(true);

    try {
      markGoogleRegisterResolutionPending();
      writeGoogleRegisterContext(requestedPlanCode);

      const redirectUrl = new URL("/auth/callback", window.location.origin);
      redirectUrl.searchParams.set("intent", "register-google");
      if (requestedPlanCode)
        redirectUrl.searchParams.set("plan", requestedPlanCode);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl.toString()
        }
      });

      if (error) throw error;
    } catch (error) {
      clearGoogleRegisterResolutionPending();
      clearGoogleRegisterContext();
      toast({
        variant: "destructive",
        title: t("auth:login.errors.googleSignInFailedTitle"),
        description:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : t("auth:register.toasts.createFailedTitle")
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (step < totalSteps) {
      await nextStep();
      return;
    }

    const errorMessage = validateStep(totalSteps);
    if (errorMessage) {
      toast({
        variant: "destructive",
        title: t("auth:register.toasts.missingDataTitle"),
        description: errorMessage
      });
      return;
    }

    const sanitizedForm = sanitizeRegisterForm(form);
    setForm(sanitizedForm);

    if (activePlan?.price_cents && activePlan.price_cents > 0) {
      writeRegisterFlowDraft({
        form: sanitizedForm,
        selectedPlanCode: activePlan.code,
        step,
        authMethod
      });

      try {
        const checkoutUrl = isGoogleRegister
          ? (
              await prepareGooglePaidCheckout({
                form: sanitizedForm,
                planCode: activePlan.code
              })
            ).checkoutUrl
          : await (async () => {
              const canContinueToCheckout = await preparePaidCheckout({
                form: sanitizedForm
              });

              if (!canContinueToCheckout) return null;

              return (
                await createStripeCheckoutSession({
                  planCode: activePlan.code,
                  source: "plan_selection"
                })
              ).checkoutUrl;
            })();

        if (!checkoutUrl) return;

        window.location.assign(checkoutUrl);
        return;
      } catch (error) {
        toast({
          variant: "destructive",
          title: t("plans:toasts.checkoutStartErrorTitle"),
          description:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : t("plans:toasts.checkoutStartErrorDescription")
        });
        return;
      }
    }

    await (isGoogleRegister ? submitGoogleRegister : submitRegister)({
      form: sanitizedForm,
      selectedPlan: activePlan
        ? {
            code: activePlan.code,
            name: activePlan.name,
            planKey: activePlan.planKey,
            price_cents: activePlan.price_cents
          }
        : null
    });
  };

  return (
    <div className="flex min-h-screen bg-charcoal">
      <div className="relative hidden items-center justify-center p-16 lg:flex lg:w-1/2">
        <Reveal className="max-w-md" duration={720} variant="gentle">
          <Link to="/" className="mb-5 flex items-center gap-2">
            <BrandLogo className="h-60 w-auto" />
          </Link>
          <h1 className="mb-6 text-5xl font-serif italic leading-tight text-slate-100">
            {t("auth:register.heroTitleLine1")}
            <br />
            {t("auth:register.heroTitleLine2")}
          </h1>
          <p className="text-sm leading-relaxed text-slate-300">
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
                    className={`inline-flex h-6 w-6 items-center justify-center border text-xs ${
                      isDone
                        ? "border-primary bg-primary text-primary-foreground"
                        : isActive
                          ? "border-primary bg-background/10 text-primary"
                          : "border-slate-200/25 text-slate-300/70"
                    }`}
                  >
                    {current}
                  </div>
                  <span
                    className={`text-sm ${
                      isActive || isDone
                        ? "text-slate-100"
                        : "text-slate-300/70"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>

      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-1/2">
        <Reveal
          className="w-full max-w-md"
          delay={80}
          duration={680}
          variant="gentle"
        >
          <div className="mb-10 lg:hidden">
            <Link to="/" className="mb-8 flex items-center gap-2">
              <BrandLogo className="h-4 w-auto" />
            </Link>
          </div>

          <Reveal as="div" className="mb-8" duration={620} variant="gentle">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-2xl font-serif text-foreground">
                {t("auth:register.title")}
              </h2>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {t("auth:register.stepCounter", { step, total: totalSteps })}
              </p>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("auth:register.subtitle")}
            </p>
            <div className="h-1.5 overflow-hidden bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </Reveal>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <Reveal
              key={`register-step-${step}`}
              duration={620}
              variant="gentle"
            >
              {step === 1 && (
                <div className="space-y-5">
                  <CustomButton
                    type="button"
                    styleType="ghost"
                    className="w-full py-3.5"
                    disabled={isLoading}
                    onClick={handleGoogleRegister}
                  >
                    <GoogleIcon className="h-4 w-4" />
                    {isGoogleLoading
                      ? t("auth:login.googleSubmitting")
                      : t("auth:register.actions.continueWithGoogle")}
                  </CustomButton>

                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border/70" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-background px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {t("auth:login.orContinueWith")}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {t("auth:register.fields.lastName")}
                    </label>
                    <CustomInput
                      type="text"
                      value={form.lastName}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          lastName: e.target.value
                        }))
                      }
                      placeholder={t("auth:register.placeholders.lastName")}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {t("auth:register.fields.dateOfBirth")}
                    </label>
                    <CustomDateInput
                      max={maxBirthDate}
                      value={form.dateOfBirth}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          dateOfBirth: e.target.value
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                      className="w-full border border-border bg-background px-4 py-3 text-sm text-foreground transition-colors focus:border-foreground focus:outline-none"
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
                  {hasRequestedPlan && activePlan ? (
                    <div className="rounded-[1.25rem] border border-primary/15 bg-secondary/30 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        {t("auth:register.plan.summaryLabel")}
                      </p>
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-xl font-serif text-foreground">
                            {activePlan.name}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {activePlan.description}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {activePlan.priceLabel}
                          {t("plans:pricing.perMonth")}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <label className="flex items-center gap-3">
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
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      <Trans
                        i18nKey="auth:register.fields.acceptedTerms"
                        components={{
                          termsLink: (
                            <Link
                              to="/terminos"
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary"
                            />
                          ),
                          privacyLink: (
                            <Link
                              to="/privacidad"
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary"
                            />
                          )
                        }}
                      />
                    </span>
                  </label>
                </div>
              )}
            </Reveal>

            <div className="flex items-center justify-between gap-3 pt-2">
              <CustomButton
                type="button"
                onClick={previousStep}
                disabled={step === minimumStep || isLoading}
                styleType="menu"
                className="px-5 py-3 disabled:opacity-50"
              >
                {t("auth:register.actions.back")}
              </CustomButton>
              <CustomButton
                type="submit"
                disabled={isLoading}
                styleType="primary"
                className="px-6 py-3"
              >
                {step < totalSteps
                  ? t("auth:register.actions.continue")
                  : isLoading || isLoadingPlans
                    ? t("auth:register.actions.creating")
                    : activePlan?.price_cents && activePlan.price_cents > 0
                      ? t("auth:register.actions.continueToPayment")
                      : t("auth:register.actions.create")}
              </CustomButton>
            </div>
          </form>

          <Reveal
            className="mt-8 text-center"
            delay={120}
            duration={620}
            variant="gentle"
          >
            <p className="text-sm text-muted-foreground">
              {t("auth:register.hasAccount")}{" "}
              <Link
                to="/login"
                className="font-semibold text-primary transition-colors hover:text-primary/80"
              >
                {t("auth:register.signIn")}
              </Link>
            </p>
          </Reveal>
        </Reveal>
      </div>
    </div>
  );
};

export default Register;

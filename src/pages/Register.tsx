import opositaiHorizontalLogo from "@/assets/opositai-horizontal.png";
import CustomButton from "@/components/ui/custom-button";
import CustomDateInput from "@/components/ui/custom-date-input";
import CustomInput from "@/components/ui/custom-input";
import CustomSelect from "@/components/ui/custom-select";
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
  getRegisterAccountStepError,
  getRegisterProfileStepError,
  initialRegisterForm,
  readRegisterFlowDraft,
  sanitizeRegisterForm,
  writeRegisterFlowDraft,
  type RegisterForm
} from "@/lib/registerFlow";
import {
  createPublicStripeCheckoutSession,
  usePublicSubscriptionPlansQuery
} from "@/queries/subscriptionQueries";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

const Register = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, i18n } = useTranslation(["auth", "common", "plans"]);
  const { toast } = useToast();
  const persistedDraft = useMemo(() => readRegisterFlowDraft(), []);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const requestedPlanCode = useMemo(() => {
    return sanitizeCode(searchParams.get("plan"), 60);
  }, [searchParams]);
  const [form, setForm] = useState<RegisterForm>(
    () => persistedDraft?.form ?? initialRegisterForm
  );
  const [selectedPlanCode, setSelectedPlanCode] = useState(
    () => requestedPlanCode || persistedDraft?.selectedPlanCode || ""
  );
  const [oppositionOptions, setOppositionOptions] = useState<
    OppositionOption[]
  >([]);
  const { data: publicPlans = [], isLoading: isLoadingPlans } =
    usePublicSubscriptionPlansQuery();

  const locale = normalizeLocale(i18n.resolvedLanguage);
  const { isSubmitting, submitRegister } = useRegisterSubmit(locale);
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
  const step = clampRegisterStep(searchParams.get("step") ?? 1, totalSteps);
  const maxBirthDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isLoading = isCheckingEmail || isSubmitting;

  const plans = useMemo(
    () =>
      publicPlans.map((plan) => {
        const planKey = getPlanKey({ code: plan.code, tier: plan.tier });

        return {
          ...plan,
          planKey,
          name: t(`plans:plans.${planKey}.name`),
          eyebrow: t(`plans:plans.${planKey}.eyebrow`),
          description: t(`plans:plans.${planKey}.description`),
          features: t(`plans:plans.${planKey}.features`, {
            returnObjects: true,
            aiLimit: plan.ai_daily_limit,
            quickTestLimit: plan.quick_test_question_limit
          }) as string[],
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
      step
    });
  }, [form, selectedPlanCode, step]);

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

  const validateStep = (targetStep: number): string | null => {
    if (targetStep === 1) {
      const errorKey = getRegisterAccountStepError(form);
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

    if (step === 1) {
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
    const previousStepValue = Math.max(1, step - 1);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("step", String(previousStepValue));
    if (requestedPlanCode) nextParams.set("plan", requestedPlanCode);
    setSearchParams(nextParams, { replace: true });
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
        step
      });

      try {
        const { checkoutUrl } = await createPublicStripeCheckoutSession({
          planCode: activePlan.code,
          email: sanitizedForm.email,
          successPath: `/registro/pago-completado?session_id={CHECKOUT_SESSION_ID}&plan=${encodeURIComponent(activePlan.code)}`,
          cancelPath: `/registro?step=2&plan=${encodeURIComponent(activePlan.code)}&checkout=cancel`
        });

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

    await submitRegister({
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
                {t("auth:register.stepCounter", { step, total: totalSteps })}
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
                <div>
                  <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
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
              <CustomButton
                type="button"
                onClick={previousStep}
                disabled={step === 1 || isLoading}
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
                  : isLoading
                    ? t("auth:register.actions.creating")
                    : isLoadingPlans
                      ? t("auth:register.actions.creating")
                      : activePlan?.price_cents && activePlan.price_cents > 0
                        ? t("auth:register.actions.continueToPayment")
                        : t("auth:register.actions.create")}
              </CustomButton>
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

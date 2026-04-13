import CustomButton from "@/components/ui/custom-button";
import { useRegisterSubmit } from "@/hooks/use-register-submit";
import { useToast } from "@/hooks/use-toast";
import { normalizeLocale } from "@/i18n/locales";
import { sanitizeCode } from "@/lib/inputSanitization";
import { formatPlanPriceFromCents, getPlanKey } from "@/lib/plans";
import {
  getRegisterAccountStepError,
  getRegisterProfileStepError,
  readRegisterFlowDraft,
  sanitizeRegisterForm,
  writeRegisterFlowDraft
} from "@/lib/registerFlow";
import {
  createStripeCheckoutSession,
  usePublicSubscriptionPlansQuery
} from "@/queries/subscriptionQueries";
import { ArrowRight, CheckCircle2, Crown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

const RegisterPlanSelection = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, i18n } = useTranslation(["auth", "plans"]);
  const { toast } = useToast();
  const locale = normalizeLocale(i18n.resolvedLanguage);
  const persistedDraft = useMemo(() => readRegisterFlowDraft(), []);
  const { data: publicPlans = [], isLoading: isLoadingPublicPlans } =
    usePublicSubscriptionPlansQuery();
  const requestedPlanCode = sanitizeCode(searchParams.get("plan"), 60);
  const [selectedPlanCode, setSelectedPlanCode] = useState(
    () => requestedPlanCode || persistedDraft?.selectedPlanCode || ""
  );
  const { isSubmitting, preparePaidCheckout, submitRegister } =
    useRegisterSubmit(locale);
  const maxBirthDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const sanitizedDraft = useMemo(
    () => sanitizeRegisterForm(persistedDraft?.form ?? null),
    [persistedDraft]
  );
  const accountStepError = getRegisterAccountStepError(sanitizedDraft);
  const profileStepError = getRegisterProfileStepError(
    sanitizedDraft,
    maxBirthDate
  );

  const plans = useMemo(
    () =>
      publicPlans.map((plan) => {
        const planKey = getPlanKey({
          code: plan.code,
          tier: plan.tier
        });

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
          ctaGuest: t(`plans:plans.${planKey}.ctaGuest`),
          featured: planKey === "pro",
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

  const selectedPlan =
    plans.find((plan) => plan.code === selectedPlanCode) ?? null;

  useEffect(() => {
    if (publicPlans.length === 0) return;

    setSelectedPlanCode((prev) => {
      const candidate = prev || requestedPlanCode;
      if (candidate && publicPlans.some((plan) => plan.code === candidate))
        return candidate;
      return publicPlans[0]?.code ?? "";
    });
  }, [publicPlans, requestedPlanCode]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    let hasChanges = false;

    if (nextParams.get("step") !== "3") {
      nextParams.set("step", "3");
      hasChanges = true;
    }

    if (selectedPlanCode) {
      if (nextParams.get("plan") !== selectedPlanCode) {
        nextParams.set("plan", selectedPlanCode);
        hasChanges = true;
      }
    } else if (nextParams.has("plan")) {
      nextParams.delete("plan");
      hasChanges = true;
    }

    if (hasChanges) setSearchParams(nextParams, { replace: true });
  }, [searchParams, selectedPlanCode, setSearchParams]);

  useEffect(() => {
    if (!persistedDraft) return;

    writeRegisterFlowDraft({
      form: persistedDraft.form,
      selectedPlanCode,
      step: 3
    });
  }, [persistedDraft, selectedPlanCode]);

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

  if (!persistedDraft || accountStepError)
    return <Navigate replace to="/registro?step=1" />;

  if (profileStepError) return <Navigate replace to="/registro?step=2" />;

  return (
    <div className="min-h-screen bg-background content-center">
      <div className="mx-auto max-w-6xl px-6 pb-16 pt-8 md:px-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {isLoadingPublicPlans &&
            Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className="min-h-[340px] rounded-2xl border border-border/70 bg-background/80 p-6"
              />
            ))}

          {!isLoadingPublicPlans &&
            plans.map((plan) => {
              const isSelected = selectedPlanCode === plan.code;

              return (
                <article
                  key={plan.code}
                  className={`relative flex cursor-pointer flex-col overflow-hidden rounded-[1.5rem] border p-4 transition-all duration-200 md:p-5 ${
                    isSelected
                      ? "border-primary/45 bg-secondary/20 shadow-[0_22px_50px_-40px_rgba(15,23,42,0.18)]"
                      : plan.featured
                        ? "border-primary/45 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.9))] text-primary-foreground shadow-[0_22px_50px_-40px_rgba(15,23,42,0.82)]"
                        : "border-foreground/20 bg-background/80 text-foreground shadow-[0_0_0_1px_hsl(var(--foreground)/0.06),0_18px_44px_-36px_rgba(15,23,42,0.45)]"
                  }`}
                  onClick={() => setSelectedPlanCode(plan.code)}
                >
                  {plan.featured && (
                    <div className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-foreground">
                      <Crown className="h-3 w-3" />
                      {t("plans:featured")}
                    </div>
                  )}

                  <div className="max-w-sm">
                    <h3 className="text-[1.7rem] font-serif leading-none">
                      {plan.name}
                    </h3>
                    <div className="mt-2.5 flex items-end gap-2">
                      <span className="text-[2rem] font-serif leading-none">
                        {plan.priceLabel}
                      </span>
                      <span className="pb-0.5 text-xs opacity-60">
                        {t("plans:pricing.perMonth")}
                      </span>
                    </div>
                    <p
                      className={`mt-3 text-sm leading-6 ${
                        plan.featured && !isSelected
                          ? "text-primary-foreground/72"
                          : "text-muted-foreground"
                      }`}
                    >
                      {plan.description}
                    </p>
                    <p
                      className={`mt-2.5 text-[11px] uppercase tracking-[0.16em] ${
                        plan.featured && !isSelected
                          ? "text-primary-foreground/65"
                          : "text-muted-foreground"
                      }`}
                    >
                      {t("plans:public.bestForLabel")}
                    </p>
                    <p
                      className={`mt-1 text-sm leading-6 ${
                        plan.featured && !isSelected
                          ? "text-primary-foreground/85"
                          : "text-foreground/90"
                      }`}
                    >
                      {plan.planKey === "pro"
                        ? t("plans:public.proBestFor")
                        : t("plans:public.freeBestFor")}
                    </p>
                  </div>

                  <div className="mt-3.5 space-y-2 rounded-xl border border-current/15 bg-black/5 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
                      {t("plans:public.includesLabel")}
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      <li>
                        {t(`plans:public.planHighlights.ai.${plan.planKey}`)}
                      </li>
                      <li>
                        {t(
                          `plans:public.planHighlights.quickTests.${plan.planKey}`
                        )}
                      </li>
                      <li>
                        {t(
                          `plans:public.planHighlights.syllabus.${plan.planKey}`
                        )}
                      </li>
                    </ul>
                  </div>

                  <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
                    <div className="rounded-xl border border-current/15 bg-black/5 px-3.5 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
                        {t("plans:comparison.aiLimit")}
                      </p>
                      <p className="mt-1.5 text-xl font-serif">
                        {plan.ai_daily_limit}
                      </p>
                    </div>
                    <div className="rounded-xl border border-current/15 bg-black/5 px-3.5 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
                        {t("plans:comparison.quickTestLimit")}
                      </p>
                      <p className="mt-1.5 text-xl font-serif">
                        {plan.planKey === "pro"
                          ? plan.quick_test_question_limit
                          : t("plans:comparison.quickTestUnavailable")}
                      </p>
                    </div>
                  </div>

                  <ul className="mt-4 flex-1 space-y-2">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm"
                      >
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span
                          className={
                            plan.featured && !isSelected
                              ? "text-primary-foreground/84"
                              : "text-muted-foreground"
                          }
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
        </div>

        <div className="mt-8 flex flex-col items-stretch justify-between gap-3 sm:flex-row">
          <CustomButton
            type="button"
            styleType="menu"
            className="px-6 py-3"
            onClick={() => navigate("/registro?step=2", { replace: true })}
          >
            {t("auth:register.actions.back")}
          </CustomButton>
          <CustomButton
            type="button"
            styleType="primary"
            className="px-6 py-3"
            disabled={!selectedPlan || isSubmitting}
            onClick={() => {
              if (!selectedPlan) return;

              const sanitizedForm = sanitizeRegisterForm(persistedDraft.form);
              writeRegisterFlowDraft({
                form: sanitizedForm,
                selectedPlanCode: selectedPlan.code,
                step: 3
              });

              if (selectedPlan.price_cents > 0) {
                void preparePaidCheckout({
                  form: sanitizedForm
                })
                  .then((canContinueToCheckout) => {
                    if (!canContinueToCheckout) return null;

                    return createStripeCheckoutSession({
                      planCode: selectedPlan.code,
                      source: "plan_selection"
                    });
                  })
                  .then((checkoutResult) => {
                    if (!checkoutResult) return;
                    window.location.assign(checkoutResult.checkoutUrl);
                  })
                  .catch((error) => {
                    toast({
                      variant: "destructive",
                      title: t("plans:toasts.checkoutStartErrorTitle"),
                      description:
                        error instanceof Error &&
                        error.message.trim().length > 0
                          ? error.message
                          : t("plans:toasts.checkoutStartErrorDescription")
                    });
                  });
                return;
              }

              void submitRegister({
                form: sanitizedForm,
                selectedPlan: {
                  code: selectedPlan.code,
                  name: selectedPlan.name,
                  planKey: selectedPlan.planKey,
                  price_cents: selectedPlan.price_cents
                }
              });
            }}
          >
            {isSubmitting
              ? t("auth:register.actions.creating")
              : selectedPlan?.price_cents && selectedPlan.price_cents > 0
                ? t("auth:register.actions.continueToPayment")
                : t("auth:register.actions.create")}
            {!isSubmitting ? <ArrowRight className="h-4 w-4" /> : null}
          </CustomButton>
        </div>
      </div>
    </div>
  );
};

export default RegisterPlanSelection;

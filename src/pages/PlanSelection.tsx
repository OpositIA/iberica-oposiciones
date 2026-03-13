import opositaiHorizontalLogo from "@/assets/opositai-horizontal.png";
import { useAuth } from "@/auth/AuthProvider";
import CustomButton from "@/components/ui/custom-button";
import CustomInput from "@/components/ui/custom-input";
import { useToast } from "@/hooks/use-toast";
import { normalizeLocale } from "@/i18n/locales";
import { formatPlanPriceFromCents, getPlanKey } from "@/lib/plans";
import {
  applyUserDiscountCode,
  changeUserSubscriptionPlan,
  createStripeCheckoutSession,
  subscriptionQueryKeys,
  usePublicSubscriptionPlansQuery,
  useUserPlanStateQuery
} from "@/queries/subscriptionQueries";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
  TicketPercent
} from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

const PlanSelection = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation("plans");
  const { toast } = useToast();
  const { user, forceLogout } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedPlanCode = searchParams.get("plan")?.trim() ?? "";
  const { data: publicPlans = [], isLoading: isLoadingPlans } =
    usePublicSubscriptionPlansQuery();
  const { data: currentPlan, isLoading: isLoadingCurrentPlan } =
    useUserPlanStateQuery(user?.id);
  const [selectedPlanCode, setSelectedPlanCode] = useState(requestedPlanCode);
  const [pendingPlanCode, setPendingPlanCode] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
  const locale = normalizeLocale(i18n.resolvedLanguage);
  const availablePlanCodes = useMemo(
    () => new Set(publicPlans.map((plan) => plan.code)),
    [publicPlans]
  );

  useEffect(() => {
    if (publicPlans.length === 0) return;

    setSelectedPlanCode((prev) => {
      const candidate = prev || requestedPlanCode;
      if (candidate && availablePlanCodes.has(candidate)) return candidate;
      return publicPlans[0]?.code ?? "";
    });
  }, [availablePlanCodes, publicPlans, requestedPlanCode]);

  const plans = useMemo(
    () =>
      publicPlans.map((plan) => {
        const planKey = getPlanKey({ code: plan.code, tier: plan.tier });
        const features = t(`plans.${planKey}.features`, {
          returnObjects: true,
          aiLimit: plan.ai_daily_limit,
          quickTestLimit: plan.quick_test_question_limit
        }) as string[];

        return {
          ...plan,
          planKey,
          name: t(`plans.${planKey}.name`),
          eyebrow: t(`plans.${planKey}.eyebrow`),
          description: t(`plans.${planKey}.description`),
          features,
          featurePreview: features.slice(0, 3),
          priceLabel:
            plan.price_cents === 0
              ? t("pricing.free")
              : formatPlanPriceFromCents(
                  plan.price_cents,
                  locale === "en" ? "en-US" : "es-ES",
                  plan.currency
                )
        };
      }),
    [locale, publicPlans, t]
  );

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.code === selectedPlanCode) ?? null,
    [plans, selectedPlanCode]
  );
  const isSelectedPlanPaid = selectedPlan?.planKey === "pro";
  const normalizedDiscountCode = discountCode.trim().toUpperCase();

  if (!user) return <Navigate to="/login" replace />;
  if (!isLoadingCurrentPlan && currentPlan)
    return <Navigate to="/dashboard" replace />;

  const handleApplyDiscount = async () => {
    if (!normalizedDiscountCode) return;

    if (!selectedPlan || selectedPlan.planKey !== "pro") {
      toast({
        variant: "destructive",
        title: t("selector.discountRequiresProTitle"),
        description: t("selector.discountRequiresProDescription")
      });
      return;
    }

    if (!currentPlan?.is_paid) {
      toast({
        title: t("selector.discountPendingTitle"),
        description: t("selector.discountPendingDescription")
      });
      return;
    }

    setIsApplyingDiscount(true);

    try {
      const nextPlan = await applyUserDiscountCode(normalizedDiscountCode);
      queryClient.setQueryData(
        subscriptionQueryKeys.userPlan(user.id),
        nextPlan
      );
      setDiscountCode("");
      toast({
        title: t("toasts.discountAppliedTitle"),
        description: t("toasts.discountAppliedDescription")
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("toasts.discountAppliedErrorTitle"),
        description:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : t("toasts.discountAppliedErrorDescription")
      });
    } finally {
      setIsApplyingDiscount(false);
    }
  };

  const handleConfirmPlan = async () => {
    if (!user?.id || !selectedPlanCode || !selectedPlan) return;

    if (isSelectedPlanPaid) {
      setPendingPlanCode(selectedPlanCode);

      try {
        const { checkoutUrl } = await createStripeCheckoutSession({
          planCode: selectedPlanCode,
          source: "plan_selection"
        });

        toast({
          title: t("toasts.paymentRedirectTitle"),
          description: t("toasts.paymentRedirectDescription")
        });

        window.location.assign(checkoutUrl);
      } catch (error) {
        toast({
          variant: "destructive",
          title: t("toasts.checkoutStartErrorTitle"),
          description:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : t("toasts.checkoutStartErrorDescription")
        });
      } finally {
        setPendingPlanCode(null);
      }

      return;
    }

    setPendingPlanCode(selectedPlanCode);

    try {
      const nextPlan = await changeUserSubscriptionPlan(selectedPlanCode);
      queryClient.setQueryData(
        subscriptionQueryKeys.userPlan(user.id),
        nextPlan
      );

      toast({
        title: t("selector.toasts.savedTitle"),
        description: t("selector.toasts.savedDescription", {
          plan: t(
            `plans.${getPlanKey({
              code: nextPlan.plan_code,
              tier: nextPlan.tier
            })}.name`
          )
        })
      });

      startTransition(() => {
        navigate("/dashboard", { replace: true });
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("toasts.planChangedErrorTitle"),
        description:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : t("toasts.planChangedErrorDescription")
      });
    } finally {
      setPendingPlanCode(null);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-charcoal text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(214,138,69,0.2),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(248,244,236,0.08),transparent_18%),radial-gradient(circle_at_bottom_left,rgba(214,138,69,0.14),transparent_26%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(248,244,236,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(248,244,236,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative grid min-h-screen lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <section className="flex flex-col px-6 py-8 md:px-10 lg:px-12">
          <header className="flex items-center justify-between gap-4">
            <Link to="/" className="inline-flex items-center">
              <img
                src={opositaiHorizontalLogo}
                alt="OpositAI"
                className="h-10 w-auto"
              />
            </Link>
            <CustomButton
              type="button"
              styleType="ghost"
              onClick={() => {
                void forceLogout("plan_selection_exit");
              }}
            >
              {t("selector.exit")}
            </CustomButton>
          </header>

          <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-10">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary backdrop-blur">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t("selector.badge")}
              </div>
              <h1 className="mt-6 text-4xl font-serif italic leading-[0.95] text-slate-100 md:text-6xl">
                {t("selector.title")}
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 md:text-[15px]">
                {t("selector.description")}
              </p>
            </div>

            <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/6 p-4 shadow-[0_32px_90px_-56px_rgba(0,0,0,0.72)] backdrop-blur md:p-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                    {t("selector.cardsBadge")}
                  </p>
                  <h2 className="mt-2 text-2xl font-serif text-slate-100">
                    {t("selector.cardsTitle")}
                  </h2>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("header.metrics.billingValue")}
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                {isLoadingPlans &&
                  Array.from({ length: 2 }).map((_, index) => (
                    <div
                      key={index}
                      className="min-h-[170px] rounded-[1.5rem] border border-white/10 bg-white/5"
                    />
                  ))}

                {!isLoadingPlans &&
                  plans.map((plan) => {
                    const isSelected = selectedPlanCode === plan.code;
                    const quickTestValue =
                      plan.planKey === "pro"
                        ? plan.quick_test_question_limit
                        : t("comparison.quickTestUnavailable");

                    return (
                      <button
                        key={plan.code}
                        type="button"
                        onClick={() => setSelectedPlanCode(plan.code)}
                        className={`rounded-[1.5rem] border p-4 text-left transition-all duration-200 ${
                          isSelected
                            ? "border-primary/50 bg-[linear-gradient(180deg,rgba(214,138,69,0.18),rgba(255,255,255,0.08))] shadow-[0_24px_70px_-48px_rgba(214,138,69,0.55)]"
                            : "border-white/10 bg-black/10 hover:border-primary/25 hover:bg-white/8"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                              {plan.eyebrow}
                            </p>
                            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                              <h3 className="text-2xl font-serif text-slate-100">
                                {plan.name}
                              </h3>
                              <span className="text-sm text-slate-300">
                                {plan.priceLabel}
                                {t("pricing.perMonth")}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] ${
                              isSelected
                                ? "border-primary/25 bg-primary/10 text-primary"
                                : "border-white/10 text-slate-400"
                            }`}
                          >
                            {isSelected
                              ? t("selector.selected")
                              : t("selector.choose")}
                          </span>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          {plan.description}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-200">
                            {t("comparison.aiLimit")}: {plan.ai_daily_limit}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-200">
                            {t("comparison.quickTestLimit")}: {quickTestValue}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {plan.featurePreview.map((feature) => (
                            <span
                              key={feature}
                              className="rounded-full bg-white/6 px-3 py-1 text-xs text-slate-300"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
              </div>

              <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/10 p-4">
                <div className="flex items-center gap-2">
                  <TicketPercent className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-slate-100">
                    {t("discounts.title")}
                  </p>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {t("discounts.description")}
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <CustomInput
                    value={discountCode}
                    onChange={(event) => setDiscountCode(event.target.value)}
                    placeholder={t("discounts.placeholder")}
                    className="h-12 rounded-2xl border-white/10 bg-charcoal px-4 text-sm text-slate-100 placeholder:text-slate-500 focus:ring-primary"
                  />
                  <CustomButton
                    type="button"
                    styleType="primary"
                    className="h-12 min-w-[170px] rounded-2xl px-5"
                    disabled={isApplyingDiscount || normalizedDiscountCode.length === 0}
                    onClick={() => {
                      void handleApplyDiscount();
                    }}
                  >
                    {isApplyingDiscount ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("discounts.cta")
                    )}
                  </CustomButton>
                </div>
                <p className="mt-3 text-xs leading-6 text-slate-400">
                  {selectedPlan?.planKey === "pro"
                    ? t("selector.discountHintPro")
                    : t("selector.discountHintFree")}
                </p>
              </div>
            </div>
          </main>
        </section>

        <aside className="border-t border-white/10 bg-[linear-gradient(180deg,#f6f0e7_0%,#f1e8db_100%)] px-6 py-8 text-charcoal lg:border-t-0 lg:border-l lg:border-white/10 md:px-10">
          <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center">
            <div className="rounded-[2rem] border border-charcoal/10 bg-white/72 p-6 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.4)] backdrop-blur">
              <div className="inline-flex items-center gap-2 rounded-full border border-charcoal/10 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-charcoal/70">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {t("selector.summaryBadge")}
              </div>

              <h2 className="mt-4 text-3xl font-serif text-charcoal">
                {t("selector.summaryTitle")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-charcoal/70">
                {t("selector.summaryDescription")}
              </p>

              <div className="mt-6 rounded-[1.5rem] bg-charcoal p-5 text-slate-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                      {selectedPlan?.eyebrow ?? t("selector.cardsBadge")}
                    </p>
                    <h3 className="mt-2 text-3xl font-serif text-slate-100">
                      {selectedPlan?.name ?? "--"}
                    </h3>
                  </div>
                  {selectedPlan && (
                    <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                      {selectedPlan.planKey === "pro"
                        ? t("featured")
                        : t("plans.free.name")}
                    </span>
                  )}
                </div>

                <div className="mt-5 space-y-3 border-t border-white/10 pt-5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">{t("selector.summaryPlan")}</span>
                    <span className="font-medium text-slate-100">
                      {selectedPlan?.name ?? "--"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">{t("selector.summaryBilling")}</span>
                    <span className="font-medium text-slate-100">
                      {t("header.metrics.billingValue")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">{t("selector.summaryAi")}</span>
                    <span className="font-medium text-slate-100">
                      {selectedPlan?.ai_daily_limit ?? "--"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">{t("selector.summaryTests")}</span>
                    <span className="font-medium text-slate-100">
                      {selectedPlan
                        ? selectedPlan.planKey === "pro"
                          ? selectedPlan.quick_test_question_limit
                          : t("comparison.quickTestUnavailable")
                        : "--"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">{t("selector.summaryDiscount")}</span>
                    <span className="font-medium text-slate-100">
                      {normalizedDiscountCode
                        ? t("selector.summaryPendingDiscount", {
                            code: normalizedDiscountCode
                          })
                        : t("selector.summaryNoDiscount")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[1.5rem] bg-primary px-5 py-6 text-primary-foreground shadow-[0_24px_60px_-40px_rgba(214,138,69,0.85)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-foreground/75">
                  {t("selector.summaryDueToday")}
                </p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-4xl font-serif">
                    {selectedPlan?.priceLabel ?? "--"}
                  </span>
                  <span className="pb-1 text-sm text-primary-foreground/70">
                    {t("pricing.perMonth")}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-6 text-primary-foreground/80">
                  {selectedPlan?.planKey === "pro"
                    ? t("selector.summaryCheckoutNote")
                    : t("selector.summaryFreeNote")}
                </p>
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-charcoal/10 bg-white/78 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-charcoal/55">
                  {t("selector.summaryFeaturesTitle")}
                </p>
                <ul className="mt-4 space-y-3">
                  {selectedPlan?.featurePreview.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3 text-sm text-charcoal/78"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <CustomButton
                type="button"
                styleType="primary"
                className="mt-6 w-full rounded-2xl px-6 py-3.5"
                disabled={!selectedPlanCode || pendingPlanCode !== null}
                onClick={() => {
                  void handleConfirmPlan();
                }}
              >
                {pendingPlanCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {isSelectedPlanPaid
                      ? t("actions.goToCheckout")
                      : t("selector.cta")}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </CustomButton>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default PlanSelection;

import { useAuth } from "@/auth/AuthProvider";
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
  Crown,
  Loader2,
  Sparkles,
  TicketPercent
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import CustomButton from "../components/ui/custom-button";

const Plans = () => {
  const { t, i18n } = useTranslation("plans");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: publicPlans = [], isLoading: isLoadingPublicPlans } =
    usePublicSubscriptionPlansQuery();
  const { data: currentPlan } = useUserPlanStateQuery(user?.id);
  const [pendingPlanCode, setPendingPlanCode] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
  const locale = normalizeLocale(i18n.resolvedLanguage);
  const currentPlanKey = getPlanKey({
    code: currentPlan?.plan_code,
    tier: currentPlan?.tier
  });

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
          name: t(`plans.${planKey}.name`),
          eyebrow: t(`plans.${planKey}.eyebrow`),
          description: t(`plans.${planKey}.description`),
          features: t(`plans.${planKey}.features`, {
            returnObjects: true,
            aiLimit: plan.ai_daily_limit,
            quickTestLimit: plan.quick_test_question_limit
          }) as string[],
          ctaGuest: t(`plans.${planKey}.ctaGuest`),
          ctaAuthenticated: t(`plans.${planKey}.ctaAuthenticated`),
          featured: planKey === "pro",
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

  useEffect(() => {
    const checkoutState = searchParams.get("checkout");
    if (!checkoutState) return;

    if (checkoutState === "success") {
      toast({
        title: t("toasts.checkoutSuccessTitle"),
        description: t("toasts.checkoutSuccessDescription")
      });

      if (user?.id) {
        void queryClient.invalidateQueries({
          queryKey: subscriptionQueryKeys.userPlan(user.id)
        });
      }
    }

    if (checkoutState === "cancel") {
      toast({
        title: t("toasts.checkoutCancelledTitle"),
        description: t("toasts.checkoutCancelledDescription")
      });
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("checkout");
    nextParams.delete("session_id");
    setSearchParams(nextParams, { replace: true });
  }, [queryClient, searchParams, setSearchParams, t, toast, user?.id]);

  const handleChangePlan = async ({
    planCode,
    isPaidPlanOption
  }: {
    planCode: string;
    isPaidPlanOption: boolean;
  }) => {
    if (!user?.id) return;

    if (isPaidPlanOption) {
      setPendingPlanCode(planCode);

      try {
        const { checkoutUrl } = await createStripeCheckoutSession({
          planCode,
          source: "app_plans"
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

    setPendingPlanCode(planCode);

    try {
      const nextPlan = await changeUserSubscriptionPlan(planCode);
      queryClient.setQueryData(
        subscriptionQueryKeys.userPlan(user.id),
        nextPlan
      );
      toast({
        title: t("toasts.planChangedTitle"),
        description: t("toasts.planChangedDescription", {
          plan: t(
            `plans.${getPlanKey({ code: nextPlan.plan_code, tier: nextPlan.tier })}.name`
          )
        })
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

  const handleApplyDiscount = async () => {
    if (!user?.id || discountCode.trim().length === 0) return;
    setIsApplyingDiscount(true);

    try {
      const nextPlan = await applyUserDiscountCode(discountCode.trim());
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

  return (
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden bg-charcoal">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(214,138,69,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.06),transparent_28%)]" />
        <Navbar />

        <div className="relative mx-auto max-w-7xl px-8 pb-20 pt-32">
          <div className="max-w-3xl">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
              {t("header.badge")}
            </p>
            <h1 className="mb-4 text-4xl font-serif italic text-primary-foreground md:text-6xl">
              {t("header.title")}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-primary-foreground/70">
              {t("header.description")}
            </p>
          </div>

        </div>
      </div>

      <div className="mx-auto -mt-6 max-w-7xl px-8 pb-20">
        {isAuthenticated && currentPlan && (
          <section className="mb-8 rounded-3xl border border-border/70 bg-background/95 p-6 shadow-[0_24px_60px_-45px_rgba(0,0,0,0.42)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("currentPlan.badge")}
                </div>
                <h2 className="mt-3 text-2xl font-serif text-foreground">
                  {t(`plans.${currentPlanKey}.name`)}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {t("currentPlan.description", {
                    aiLimit: currentPlan.ai_daily_limit,
                    quickTestLimit: currentPlan.quick_test_question_limit
                  })}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {t("currentPlan.aiUsage")}
                  </p>
                  <p className="mt-2 text-xl font-serif text-foreground">
                    {currentPlan.ai_used}/{currentPlan.ai_daily_limit}
                  </p>
                </div>

                <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {t("currentPlan.quickTestLimit")}
                  </p>
                  <p className="mt-2 text-xl font-serif text-foreground">
                    {currentPlan.quick_test_question_limit}
                  </p>
                </div>

                <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {t("currentPlan.billing")}
                  </p>
                  <p className="mt-2 text-xl font-serif text-foreground">
                    {currentPlan.effective_price_cents === 0
                      ? t("pricing.free")
                      : formatPlanPriceFromCents(
                          currentPlan.effective_price_cents,
                          locale === "en" ? "en-US" : "es-ES",
                          currentPlan.currency
                        )}
                  </p>
                </div>
              </div>
            </div>

            {currentPlan.discount_code && (
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary">
                <TicketPercent className="h-4 w-4" />
                {t("currentPlan.discountActive", {
                  code: currentPlan.discount_code,
                  percent: currentPlan.discount_percent ?? 0
                })}
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {isLoadingPublicPlans &&
              Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="min-h-[420px] rounded-3xl border border-border/70 bg-background/80 p-8"
                />
              ))}

            {!isLoadingPublicPlans &&
              plans.map((plan) => {
                const isCurrentPlan = currentPlan?.plan_code === plan.code;
                const isBusy = pendingPlanCode === plan.code;

                return (
                  <article
                    key={plan.code}
                    className={`relative flex flex-col overflow-hidden rounded-3xl border p-8 ${
                      plan.featured
                        ? "border-primary/45 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.9))] text-primary-foreground shadow-[0_28px_70px_-42px_rgba(15,23,42,0.82)]"
                        : "border-border/70 bg-background text-foreground"
                    }`}
                  >
                    {plan.featured && (
                      <div className="absolute right-6 top-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground">
                        <Crown className="h-3.5 w-3.5" />
                        {t("featured")}
                      </div>
                    )}

                    <div className="max-w-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-65">
                        {plan.eyebrow}
                      </p>
                      <h3 className="mt-3 text-3xl font-serif">{plan.name}</h3>
                      <div className="mt-4 flex items-end gap-2">
                        <span className="text-4xl font-serif">
                          {plan.priceLabel}
                        </span>
                        <span className="pb-1 text-sm opacity-60">
                          {t("pricing.perMonth")}
                        </span>
                      </div>
                      <p
                        className={`mt-4 text-sm leading-relaxed ${
                          plan.featured
                            ? "text-primary-foreground/72"
                            : "text-muted-foreground"
                        }`}
                      >
                        {plan.description}
                      </p>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-current/10 bg-black/5 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-60">
                          {t("comparison.aiLimit")}
                        </p>
                        <p className="mt-2 text-2xl font-serif">
                          {plan.ai_daily_limit}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-current/10 bg-black/5 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-60">
                          {t("comparison.quickTestLimit")}
                        </p>
                        <p className="mt-2 text-2xl font-serif">
                          {plan.quick_test_question_limit}
                        </p>
                      </div>
                    </div>

                    <ul className="mt-8 flex-1 space-y-3">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-3 text-sm"
                        >
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span
                            className={
                              plan.featured
                                ? "text-primary-foreground/84"
                                : "text-muted-foreground"
                            }
                          >
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {isAuthenticated ? (
                      <CustomButton
                        type="button"
                        onClick={() =>
                          void handleChangePlan({
                            planCode: plan.code,
                            isPaidPlanOption: plan.planKey === "pro"
                          })
                        }
                        disabled={isCurrentPlan || isBusy}
                        styleType={plan.featured ? "primary" : "menu"}
                        className="mt-8 w-full py-3.5"
                      >
                        {isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isCurrentPlan ? (
                          t("actions.currentPlan")
                        ) : (
                          <>
                            {plan.planKey === "pro"
                              ? t("actions.goToCheckout")
                              : plan.ctaAuthenticated}
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </CustomButton>
                    ) : (
                      <CustomButton
                        asChild
                        styleType={plan.featured ? "primary" : "menu"}
                        className="mt-8 w-full py-3.5"
                      >
                        <Link
                          to={`/registro?plan=${encodeURIComponent(plan.code)}`}
                        >
                          {plan.ctaGuest}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </CustomButton>
                    )}
                  </article>
                );
              })}
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-border/70 bg-background/95 p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t("future.badge")}
              </p>
              <h2 className="mt-3 text-2xl font-serif text-foreground">
                {t("future.title")}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t("future.description")}
              </p>
            </section>

            <section className="rounded-3xl border border-border/70 bg-background/95 p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                  <TicketPercent className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {t("discounts.badge")}
                  </p>
                  <h2 className="text-lg font-serif text-foreground">
                    {t("discounts.title")}
                  </h2>
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {t("discounts.description")}
              </p>

              {isAuthenticated ? (
                <div className="mt-5 space-y-3">
                  <CustomInput
                    type="text"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                    placeholder={t("discounts.placeholder")}
                    className="w-full"
                  />
                  <CustomButton
                    type="button"
                    onClick={() => void handleApplyDiscount()}
                    disabled={
                      isApplyingDiscount || discountCode.trim().length === 0
                    }
                    className="w-full"
                  >
                    {isApplyingDiscount ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("discounts.cta")
                    )}
                  </CustomButton>
                </div>
              ) : (
                <CustomButton asChild className="mt-5 w-full" styleType="menu">
                  <Link to="/login">{t("discounts.loginCta")}</Link>
                </CustomButton>
              )}
            </section>

            <section className="rounded-3xl border border-border/70 bg-secondary/20 p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t("comparison.badge")}
              </p>
              <ul className="mt-4 space-y-4 text-sm text-muted-foreground">
                <li>{t("comparison.items.sameFeatures")}</li>
                <li>{t("comparison.items.aiQuota")}</li>
                <li>{t("comparison.items.quickTestQuota")}</li>
                <li>{t("comparison.items.discounts")}</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Plans;

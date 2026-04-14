import { useAuth } from "@/auth/AuthProvider";
import { PlansPageSkeleton } from "@/components/PageSkeletons";
import Reveal from "@/components/ui/reveal";
import { useToast } from "@/hooks/use-toast";
import { normalizeLocale } from "@/i18n/locales";
import { formatPlanPriceFromCents, getPlanKey, isPaidPlan } from "@/lib/plans";
import {
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
import CustomButton from "../components/ui/custom-button";

const formatPlanEndDate = (value: string | null, locale: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const Plans = () => {
  const { t, i18n } = useTranslation("plans");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data: publicPlans = [],
    isFetching: isFetchingPublicPlans,
    isLoading: isLoadingPublicPlans
  } = usePublicSubscriptionPlansQuery();
  const { data: currentPlan } = useUserPlanStateQuery(user?.id);
  const [pendingPlanCode, setPendingPlanCode] = useState<string | null>(null);
  const [showPlansSkeleton, setShowPlansSkeleton] = useState(true);
  const locale = normalizeLocale(i18n.resolvedLanguage);
  const currentPlanKey = getPlanKey({
    code: currentPlan?.plan_code,
    tier: currentPlan?.tier
  });
  const currentPlanHasQuickTests = isPaidPlan(currentPlan);
  const scheduledDowngradeDate = useMemo(
    () =>
      currentPlan?.cancel_at_period_end
        ? formatPlanEndDate(
            currentPlan.current_period_end,
            locale === "en" ? "en-US" : "es-ES"
          )
        : null,
    [currentPlan?.cancel_at_period_end, currentPlan?.current_period_end, locale]
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
    if (
      isLoadingPublicPlans ||
      (isFetchingPublicPlans && publicPlans.length === 0)
    ) {
      setShowPlansSkeleton(true);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowPlansSkeleton(false);
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [isFetchingPublicPlans, isLoadingPublicPlans, publicPlans.length]);

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

  return (
    <div className="max-w-7xl pb-4">
      {isAuthenticated && currentPlan && (
        <Reveal
          as="section"
          className="mb-8 rounded-3xl border border-border/70 bg-background/95 p-6 shadow-[0_24px_60px_-45px_rgba(0,0,0,0.42)]"
          duration={780}
          variant="soft"
        >
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
                {currentPlanHasQuickTests
                  ? t("currentPlan.descriptionPro", {
                      aiLimit: currentPlan.ai_daily_limit,
                      quickTestLimit: currentPlan.quick_test_question_limit
                    })
                  : t("currentPlan.descriptionFree", {
                      aiLimit: currentPlan.ai_daily_limit
                    })}
              </p>
              {scheduledDowngradeDate && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-xs text-amber-700">
                  {t("currentPlan.cancelScheduled", {
                    date: scheduledDowngradeDate
                  })}
                </div>
              )}
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
                  {currentPlanHasQuickTests
                    ? currentPlan.quick_test_question_limit
                    : t("currentPlan.quickTestUnavailable")}
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
        </Reveal>
      )}

      {showPlansSkeleton ? (
        <PlansPageSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {plans.map((plan, index) => {
            const isCurrentPlan = currentPlan?.plan_code === plan.code;
            const isBusy = pendingPlanCode === plan.code;

            return (
              <Reveal
                as="article"
                key={plan.code}
                delay={index * 90}
                duration={760}
                variant={plan.featured ? "up" : "soft"}
                className={`relative flex h-[390px] flex-col overflow-hidden rounded-[1.6rem] border p-6 ${
                  plan.featured
                    ? "border-primary/45 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.9))] text-primary-foreground shadow-[0_28px_70px_-42px_rgba(15,23,42,0.82)]"
                    : "border-border/70 bg-background text-foreground"
                }`}
              >
                {plan.featured && (
                  <div className="absolute right-6 top-6 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary-foreground">
                    <Crown className="h-3 w-3" />
                    {t("featured")}
                  </div>
                )}

                <div className="max-w-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-65"></p>
                  <h3 className="mt-2 text-[1.8rem] font-serif leading-none">
                    {plan.name}
                  </h3>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-[2rem] font-serif leading-none">
                      {plan.priceLabel}
                    </span>
                    <span className="pb-0.5 text-xs opacity-60">
                      {t("pricing.perMonth")}
                    </span>
                  </div>
                  <p
                    className={`mt-3 text-sm leading-6 ${
                      plan.featured
                        ? "text-primary-foreground/72"
                        : "text-muted-foreground"
                    }`}
                  >
                    {plan.description}
                  </p>
                </div>

                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-xl border border-current/10 bg-black/5 px-3.5 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-60">
                      {t("comparison.aiLimit")}
                    </p>
                    <p className="mt-1.5 text-xl font-serif">
                      {plan.ai_daily_limit}
                    </p>
                  </div>

                  <div className="rounded-xl border border-current/10 bg-black/5 px-3.5 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-60">
                      {t("comparison.quickTestLimit")}
                    </p>
                    <p className="mt-1.5 text-xl font-serif">
                      {plan.planKey === "pro"
                        ? plan.quick_test_question_limit
                        : t("comparison.quickTestUnavailable")}
                    </p>
                  </div>
                </div>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm"
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
                    className="mt-5 w-full py-3"
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
                    className="mt-5 w-full py-3"
                  >
                    <Link
                      to={`/registro?plan=${encodeURIComponent(plan.code)}`}
                    >
                      {plan.ctaGuest}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </CustomButton>
                )}
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Plans;

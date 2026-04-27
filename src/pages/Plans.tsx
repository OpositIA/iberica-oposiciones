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
    <div className="mx-auto max-w-6xl pb-6">
      {isAuthenticated && currentPlan && (
        <Reveal
          as="section"
          className="mb-10 rounded-[1.5rem] border border-border/70 bg-background/92 p-5 shadow-[0_0_0_1px_hsl(var(--foreground)/0.04),0_18px_44px_-38px_rgba(15,23,42,0.2)] md:p-6"
          duration={780}
          variant="gentle"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                {t("currentPlan.badge")}
              </div>
              <h2 className="mt-4 text-2xl font-serif leading-tight text-foreground md:text-[2rem]">
                {t(`plans.${currentPlanKey}.name`)}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {currentPlanHasQuickTests
                  ? t("currentPlan.descriptionPro", {
                      aiLimit: currentPlan.ai_daily_limit,
                      quickTestLimit: currentPlan.quick_test_question_limit
                    })
                  : t("currentPlan.descriptionFree", {
                      aiLimit: currentPlan.ai_daily_limit
                    })}
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {scheduledDowngradeDate && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                    {t("currentPlan.cancelScheduled", {
                      date: scheduledDowngradeDate
                    })}
                  </div>
                )}

                {currentPlan.discount_code && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary">
                    <TicketPercent className="h-3.5 w-3.5" />
                    {t("currentPlan.discountActive", {
                      code: currentPlan.discount_code,
                      percent: currentPlan.discount_percent ?? 0
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:min-w-[22rem]">
              <div className="rounded-[1.1rem] border border-border/70 bg-secondary/20 px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t("currentPlan.quickTestLimit")}
                </p>
                <p className="mt-2 text-xl font-serif text-foreground">
                  {currentPlanHasQuickTests
                    ? currentPlan.quick_test_question_limit
                    : t("currentPlan.quickTestUnavailable")}
                </p>
              </div>

              <div className="rounded-[1.1rem] border border-border/70 bg-secondary/20 px-4 py-3.5">
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
        </Reveal>
      )}

      {showPlansSkeleton ? (
        <PlansPageSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {plans.map((plan, index) => {
            const isCurrentPlan = currentPlan?.plan_code === plan.code;
            const isBusy = pendingPlanCode === plan.code;

            return (
              <Reveal
                as="article"
                key={plan.code}
                delay={index * 90}
                duration={760}
                variant={plan.featured ? "up" : "gentle"}
                className={`relative flex flex-col overflow-hidden rounded-[1.5rem] border p-5 md:p-6 ${
                  plan.featured
                    ? "border-primary/40 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(15,23,42,0.92))] text-primary-foreground shadow-[0_24px_60px_-44px_rgba(15,23,42,0.86)]"
                    : "border-foreground/15 bg-background/88 text-foreground shadow-[0_0_0_1px_hsl(var(--foreground)/0.04),0_18px_44px_-38px_rgba(15,23,42,0.28)]"
                }`}
              >
                {plan.featured && (
                  <div className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/16 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-primary-foreground">
                    <Crown className="h-2.5 w-2.5" />
                    {t("featured")}
                  </div>
                )}

                <div className="max-w-sm">
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      plan.featured
                        ? "text-primary-foreground/58"
                        : "text-muted-foreground"
                    }`}
                  >
                    {plan.eyebrow}
                  </p>
                  <div className="mt-3 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-[1.7rem] font-serif leading-none">
                        {plan.name}
                      </h3>
                      {isCurrentPlan && (
                        <p
                          className={`mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                            plan.featured
                              ? "text-primary-foreground/68"
                              : "text-primary"
                          }`}
                        >
                          {t("actions.currentPlan")}
                        </p>
                      )}
                    </div>

                    <div className="flex items-end gap-2 text-right">
                      <span className="text-[2rem] font-serif leading-none">
                        {plan.priceLabel}
                      </span>
                      <span className="pb-0.5 text-xs opacity-60">
                        {t("pricing.perMonth")}
                      </span>
                    </div>
                  </div>
                  <p
                    className={`mt-4 text-sm leading-6 ${
                      plan.featured
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {plan.description}
                  </p>
                </div>

                <ul className="mt-6 flex-1 space-y-2.5 border-t border-current/12 pt-5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
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
                    className="mt-6 w-full py-2.5"
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
                    className="mt-6 w-full py-2.5"
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

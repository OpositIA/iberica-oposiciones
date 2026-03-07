import opositaiHorizontalLogo from "@/assets/opositai-horizontal.png";
import { useAuth } from "@/auth/AuthProvider";
import CustomButton from "@/components/ui/custom-button";
import { useToast } from "@/hooks/use-toast";
import { normalizeLocale } from "@/i18n/locales";
import { formatPlanPriceFromCents, getPlanKey } from "@/lib/plans";
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
  Loader2,
  ShieldCheck,
  Sparkles
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
  const locale = normalizeLocale(i18n.resolvedLanguage);
  const availablePlanCodes = useMemo(
    () => new Set(publicPlans.map((plan) => plan.code)),
    [publicPlans]
  );

  useEffect(() => {
    if (availablePlanCodes.size === 0) return;

    setSelectedPlanCode((prev) => {
      const candidate = prev || requestedPlanCode;
      if (!candidate) return "";
      return availablePlanCodes.has(candidate) ? candidate : "";
    });
  }, [availablePlanCodes, requestedPlanCode]);

  const plans = useMemo(
    () =>
      publicPlans.map((plan) => {
        const planKey = getPlanKey({ code: plan.code, tier: plan.tier });

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

  if (!user) return <Navigate to="/login" replace />;
  if (!isLoadingCurrentPlan && currentPlan) 
    return <Navigate to="/dashboard" replace />;
  

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
    <div className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f4efe7_0%,#f8f5ef_40%,#fcfbf8_100%)] text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(180,120,58,0.16),transparent_28%),radial-gradient(circle_at_85%_18%,rgba(15,23,42,0.09),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(180,120,58,0.12),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(15,23,42,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 md:px-10 lg:px-12">
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

        <main className="flex flex-1 items-center py-10 md:py-14">
          <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] lg:items-start">
            <section className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/75 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary shadow-sm backdrop-blur">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t("selector.badge")}
              </div>

              <h1 className="mt-6 text-4xl font-serif italic leading-[0.95] text-charcoal md:text-6xl">
                {t("selector.title")}
              </h1>

              <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground md:text-[15px]">
                {t("selector.description")}
              </p>

              <div className="mt-8 space-y-3">
                <div className="rounded-3xl border border-border/70 bg-background/80 p-5 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.28)] backdrop-blur">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {t("selector.highlights.badge")}
                  </p>
                  <ul className="mt-4 space-y-3 text-sm text-foreground/82">
                    <li>{t("selector.highlights.sameFeatures")}</li>
                    <li>{t("selector.highlights.freeLimit")}</li>
                    <li>{t("selector.highlights.proLimit")}</li>
                  </ul>
                </div>

                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  {t("selector.helper")}
                </p>
              </div>
            </section>

            <section className="rounded-[2rem] border border-charcoal/10 bg-background/85 p-5 shadow-[0_34px_90px_-48px_rgba(15,23,42,0.34)] backdrop-blur md:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {t("selector.cardsBadge")}
                  </p>
                  <h2 className="mt-2 text-2xl font-serif text-foreground">
                    {t("selector.cardsTitle")}
                  </h2>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("header.metrics.billingValue")}
                </span>
              </div>

              <div className="grid gap-4">
                {isLoadingPlans &&
                  Array.from({ length: 2 }).map((_, index) => (
                    <div
                      key={index}
                      className="min-h-[260px] rounded-[1.75rem] border border-border/70 bg-secondary/20"
                    />
                  ))}

                {!isLoadingPlans &&
                  plans.map((plan) => {
                    const isSelected = selectedPlanCode === plan.code;

                    return (
                      <button
                        key={plan.code}
                        type="button"
                        onClick={() => setSelectedPlanCode(plan.code)}
                        className={`group relative overflow-hidden rounded-[1.75rem] border p-6 text-left transition-all duration-200 ${
                          isSelected
                            ? "border-primary/45 bg-[linear-gradient(180deg,rgba(180,120,58,0.14),rgba(255,255,255,0.95))] shadow-[0_24px_70px_-42px_rgba(180,120,58,0.55)]"
                            : "border-border/70 bg-background hover:border-primary/25 hover:bg-secondary/15"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                              {plan.eyebrow}
                            </p>
                            <h3 className="mt-3 text-3xl font-serif text-foreground">
                              {plan.name}
                            </h3>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] ${
                              isSelected
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-border/70 text-muted-foreground"
                            }`}
                          >
                            {isSelected
                              ? t("selector.selected")
                              : t("selector.choose")}
                          </span>
                        </div>

                        <div className="mt-5 flex items-end gap-2">
                          <span className="text-4xl font-serif text-foreground">
                            {plan.priceLabel}
                          </span>
                          <span className="pb-1 text-sm text-muted-foreground">
                            {t("pricing.perMonth")}
                          </span>
                        </div>

                        <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
                          {plan.description}
                        </p>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                              {t("comparison.aiLimit")}
                            </p>
                            <p className="mt-2 text-2xl font-serif text-foreground">
                              {plan.ai_daily_limit}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                              {t("comparison.quickTestLimit")}
                            </p>
                            <p className="mt-2 text-2xl font-serif text-foreground">
                              {plan.quick_test_question_limit}
                            </p>
                          </div>
                        </div>

                        <ul className="mt-6 space-y-3">
                          {plan.features.map((feature) => (
                            <li
                              key={feature}
                              className="flex items-start gap-3 text-sm"
                            >
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                              <span className="text-muted-foreground">
                                {feature}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
              </div>

              <div className="mt-6 flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-lg text-xs leading-6 text-muted-foreground">
                  {t("selector.footer")}
                </p>

                <CustomButton
                  type="button"
                  styleType="primary"
                  className="min-w-[220px] px-6 py-3.5"
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
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

export default PlanSelection;

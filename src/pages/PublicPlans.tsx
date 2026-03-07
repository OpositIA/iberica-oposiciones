import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import CustomButton from "@/components/ui/custom-button";
import { normalizeLocale } from "@/i18n/locales";
import { formatPlanPriceFromCents, getPlanKey } from "@/lib/plans";
import { usePublicSubscriptionPlansQuery } from "@/queries/subscriptionQueries";
import { ArrowRight, CheckCircle2, Crown } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const PublicPlans = () => {
  const { t, i18n } = useTranslation("plans");
  const locale = normalizeLocale(i18n.resolvedLanguage);
  const { data: publicPlans = [], isLoading: isLoadingPublicPlans } =
    usePublicSubscriptionPlansQuery();

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

  return (
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden bg-charcoal">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(214,138,69,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.06),transparent_28%)]" />
        <Navbar />

        <div className="relative mx-auto max-w-6xl px-6 pb-10 pt-24 md:px-8">
          <div className="max-w-3xl">
            <p className="inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              {t("public.badge")}
            </p>
            <h1 className="mt-4 text-3xl font-serif text-primary-foreground md:text-5xl">
              {t("public.title")}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-primary-foreground/75 md:text-base">
              {t("public.description")}
            </p>
          </div>
        </div>
      </div>

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
            plans.map((plan) => (
              <article
                key={plan.code}
                className={`relative flex flex-col overflow-hidden rounded-2xl border p-5 md:p-6 ${
                  plan.featured
                    ? "border-primary/45 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.9))] text-primary-foreground shadow-[0_22px_50px_-40px_rgba(15,23,42,0.82)]"
                    : "border-foreground/20 bg-background/80 text-foreground shadow-[0_0_0_1px_hsl(var(--foreground)/0.06),0_18px_44px_-36px_rgba(15,23,42,0.45)]"
                }`}
              >
                {plan.featured && (
                  <div className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-foreground">
                    <Crown className="h-3 w-3" />
                    {t("featured")}
                  </div>
                )}

                <div className="max-w-sm">
                  <h3 className="text-2xl font-serif">{plan.name}</h3>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-3xl font-serif">{plan.priceLabel}</span>
                    <span className="pb-0.5 text-xs opacity-60">
                      {t("pricing.perMonth")}
                    </span>
                  </div>
                  <p
                    className={`mt-3 text-sm leading-relaxed ${
                      plan.featured
                        ? "text-primary-foreground/72"
                        : "text-muted-foreground"
                    }`}
                  >
                    {plan.description}
                  </p>
                  <p
                    className={`mt-3 text-xs uppercase tracking-[0.16em] ${
                      plan.featured ? "text-primary-foreground/65" : "text-muted-foreground"
                    }`}
                  >
                    {t("public.bestForLabel")}
                  </p>
                  <p
                    className={`mt-1 text-sm ${
                      plan.featured ? "text-primary-foreground/85" : "text-foreground/90"
                    }`}
                  >
                    {plan.planKey === "pro"
                      ? t("public.proBestFor")
                      : t("public.freeBestFor")}
                  </p>
                </div>

                <div className="mt-4 space-y-2 rounded-xl border border-current/15 bg-black/5 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
                    {t("public.includesLabel")}
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    <li>
                      {t(`public.planHighlights.ai.${plan.planKey}`)}
                    </li>
                    <li>
                      {t(`public.planHighlights.quickTests.${plan.planKey}`)}
                    </li>
                    <li>
                      {t(`public.planHighlights.syllabus.${plan.planKey}`)}
                    </li>
                  </ul>
                </div>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
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

                <CustomButton
                  asChild
                  styleType={plan.featured ? "primary" : "menu"}
                  className="mt-6 w-full py-3"
                >
                  <Link to={`/registro?plan=${encodeURIComponent(plan.code)}`}>
                    {plan.ctaGuest}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </CustomButton>
              </article>
            ))}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default PublicPlans;

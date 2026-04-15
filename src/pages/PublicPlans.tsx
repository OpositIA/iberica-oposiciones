import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import CustomButton from "@/components/ui/custom-button";
import Reveal from "@/components/ui/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeLocale } from "@/i18n/locales";
import { formatPlanPriceFromCents, getPlanKey } from "@/lib/plans";
import { usePublicSubscriptionPlansQuery } from "@/queries/subscriptionQueries";
import { ArrowRight, CheckCircle2, Crown } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

type PublicPlanSkeletonSpec = {
  featured: boolean;
  id: string;
};

const PublicPlanCardSkeleton = ({
  featured,
  index
}: {
  featured?: boolean;
  index: number;
}) => (
  <article
    className={`relative flex min-h-[430px] flex-col overflow-hidden rounded-[1.5rem] border p-5 md:p-6 ${
      featured
        ? "border-primary/40 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(15,23,42,0.92))] shadow-[0_24px_60px_-44px_rgba(15,23,42,0.86)]"
        : "border-border/70 bg-background shadow-[0_0_0_1px_hsl(var(--foreground)/0.05),0_18px_44px_-38px_rgba(15,23,42,0.28)]"
    }`}
  >
    {featured ? (
      <>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/8 to-transparent" />
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/20 blur-3xl" />
      </>
    ) : (
      <div className="pointer-events-none absolute -left-8 top-0 h-24 w-24 rounded-full bg-primary/10 blur-3xl dark:bg-primary/12" />
    )}

    <div className="absolute right-4 top-4">
      <Skeleton
        className={`h-6 rounded-full ${
          featured ? "app-skeleton-inverse w-24" : "app-skeleton-strong w-16"
        }`}
      />
    </div>

    <div className="max-w-sm">
      <Skeleton
        className={`h-3 w-24 rounded-full ${
          featured ? "app-skeleton-inverse" : "app-skeleton-strong"
        }`}
      />
      <Skeleton
        className={`mt-3 h-9 w-40 rounded-2xl ${
          featured ? "app-skeleton-inverse" : "app-skeleton-strong"
        }`}
      />
      <div className="mt-3 flex items-end gap-2">
        <Skeleton
          className={`h-10 rounded-2xl ${
            index % 3 === 0 ? "w-24" : index % 3 === 1 ? "w-28" : "w-32"
          } ${featured ? "app-skeleton-inverse" : "app-skeleton-strong"}`}
        />
        <Skeleton
          className={`mb-1 h-3 w-16 rounded-full ${
            featured ? "app-skeleton-inverse" : "app-skeleton-soft"
          }`}
        />
      </div>
      <div className="mt-4 space-y-2.5">
        <Skeleton
          className={`h-4 w-full rounded-full ${
            featured ? "app-skeleton-inverse" : "app-skeleton-soft"
          }`}
        />
        <Skeleton
          className={`h-4 ${
            index % 2 === 0 ? "w-10/12" : "w-11/12"
          } rounded-full ${
            featured ? "app-skeleton-inverse" : "app-skeleton-soft"
          }`}
        />
      </div>
    </div>

    <div className="mt-6 flex-1 space-y-2.5 border-t border-current/12 pt-5">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-start gap-2.5">
          <Skeleton
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full ${
              featured ? "app-skeleton-inverse" : "app-skeleton-soft"
            }`}
          />
          <Skeleton
            className={`h-4 rounded-full ${
              index === 3 ? "w-7/12" : index === 2 ? "w-9/12" : "w-11/12"
            } ${featured ? "app-skeleton-inverse" : "app-skeleton-soft"}`}
          />
        </div>
      ))}
    </div>

    <Skeleton
      className={`mt-6 h-10 w-full rounded-xl ${
        featured ? "app-skeleton-inverse" : "app-skeleton-strong"
      }`}
    />
  </article>
);

const PublicPlans = () => {
  const { t, i18n } = useTranslation("plans");
  const locale = normalizeLocale(i18n.resolvedLanguage);
  const { data: publicPlans = [], isLoading: isLoadingPublicPlans } =
    usePublicSubscriptionPlansQuery();
  const planCatalog = t("plans", {
    returnObjects: true
  }) as Record<string, unknown>;
  const skeletonPlans = useMemo<PublicPlanSkeletonSpec[]>(() => {
    const keys = Object.keys(planCatalog);
    const sourceKeys = keys.length > 0 ? keys : ["free", "pro"];

    return sourceKeys.map((planKey) => ({
      id: planKey,
      featured: planKey.toLowerCase() === "pro"
    }));
  }, [planCatalog]);

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

        <div className="relative mx-auto max-w-6xl px-6 pb-8 pt-24 md:px-8">
          <Reveal
            className="max-w-2xl"
            duration={760}
            threshold={0}
            variant="gentle"
          >
            <p className="inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              {t("public.badge")}
            </p>
            <h1 className="mt-4 text-2xl font-serif text-primary-foreground md:text-4xl">
              {t("public.title")}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-primary-foreground/70">
              {t("public.description")}
            </p>
          </Reveal>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16 pt-8 md:px-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {isLoadingPublicPlans &&
            skeletonPlans.map((plan, index) => (
              <PublicPlanCardSkeleton
                key={plan.id}
                featured={plan.featured}
                index={index}
              />
            ))}

          {!isLoadingPublicPlans &&
            plans.map((plan, index) => (
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
                  ></p>
                  <h3 className="text-[1.7rem] font-serif leading-none">
                    {plan.name}
                  </h3>
                  <div className="mt-2.5 flex items-end gap-2">
                    <span className="text-[2rem] font-serif leading-none">
                      {plan.priceLabel}
                    </span>
                    <span className="pb-0.5 text-xs opacity-60">
                      {t("pricing.perMonth")}
                    </span>
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

                <CustomButton
                  asChild
                  styleType={plan.featured ? "primary" : "menu"}
                  className="mt-6 w-full py-2.5"
                >
                  <Link to={`/registro?plan=${encodeURIComponent(plan.code)}`}>
                    {plan.ctaGuest}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </CustomButton>
              </Reveal>
            ))}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default PublicPlans;

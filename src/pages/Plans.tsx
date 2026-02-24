import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";

const Plans = () => {
  const { t } = useTranslation("plans");

  const plans = useMemo(
    () => [
      {
        id: "basic",
        name: t("plans.basic.name"),
        price: "0",
        period: t("plans.basic.period"),
        description: t("plans.basic.description"),
        features: t("plans.basic.features", {
          returnObjects: true
        }) as string[],
        cta: t("plans.basic.cta"),
        featured: false
      },
      {
        id: "pro",
        name: t("plans.pro.name"),
        price: "19",
        period: t("plans.pro.period"),
        description: t("plans.pro.description"),
        features: t("plans.pro.features", { returnObjects: true }) as string[],
        cta: t("plans.pro.cta"),
        featured: true
      },
      {
        id: "elite",
        name: t("plans.elite.name"),
        price: "39",
        period: t("plans.elite.period"),
        description: t("plans.elite.description"),
        features: t("plans.elite.features", {
          returnObjects: true
        }) as string[],
        cta: t("plans.elite.cta"),
        featured: false
      }
    ],
    [t]
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-charcoal">
        <Navbar />
        <div className="pt-32 pb-20 px-8 max-w-7xl mx-auto text-center">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase text-primary mb-4">
            {t("header.badge")}
          </p>
          <h1 className="text-4xl md:text-6xl font-serif italic text-accent-foreground mb-4">
            {t("header.title")}
          </h1>
          <p className="text-sm text-accent-foreground/50 max-w-md mx-auto">
            {t("header.description")}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 -mt-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`border p-8 flex flex-col ${
                plan.featured
                  ? "border-primary bg-charcoal text-accent-foreground relative"
                  : "border-border bg-background text-foreground"
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-8 bg-primary text-primary-foreground px-3 py-1 text-[10px] font-semibold tracking-widest uppercase">
                  {t("featured")}
                </div>
              )}
              <h3 className="text-xs font-semibold tracking-widest uppercase mb-4 opacity-60">
                {plan.name}
              </h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-serif font-bold">
                  {plan.price}€
                </span>
                <span className="text-sm opacity-50">{plan.period}</span>
              </div>
              <p
                className={`text-sm leading-relaxed mb-8 ${plan.featured ? "text-accent-foreground/60" : "text-muted-foreground"}`}
              >
                {plan.description}
              </p>
              <ul className="space-y-3 mb-10 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <span className="text-primary text-xs">✓</span>
                    <span
                      className={
                        plan.featured
                          ? "text-accent-foreground/80"
                          : "text-muted-foreground"
                      }
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                to="/registro"
                className={`text-center py-3.5 text-xs font-semibold tracking-widest uppercase transition-colors ${
                  plan.featured
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-foreground/20 text-foreground hover:border-foreground/50"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Plans;

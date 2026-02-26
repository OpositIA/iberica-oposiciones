import heroImage from "@/assets/hero-image.jpg";
import methodologyImage from "@/assets/methodology-image.jpg";
import CustomButton from "@/components/ui/custom-button";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";

const Index = () => {
  const { t } = useTranslation("landing");

  const stats = useMemo(
    () => [
      { value: "50M+", label: t("stats.solvedQuestions") },
      { value: "12k+", label: t("stats.obtainedPositions") },
      { value: "200+", label: t("stats.calls") },
      { value: "4.9/5", label: t("stats.satisfaction") }
    ],
    [t]
  );

  const sectors = useMemo(
    () => [
      {
        id: "justice",
        num: "01",
        name: t("specializations.items.justice.name"),
        desc: t("specializations.items.justice.description"),
        resources: t("specializations.items.justice.resources")
      },
      {
        id: "treasury",
        num: "02",
        name: t("specializations.items.treasury.name"),
        desc: t("specializations.items.treasury.description"),
        resources: t("specializations.items.treasury.resources")
      },
      {
        id: "health",
        num: "03",
        name: t("specializations.items.health.name"),
        desc: t("specializations.items.health.description"),
        resources: t("specializations.items.health.resources")
      },
      {
        id: "education",
        num: "04",
        name: t("specializations.items.education.name"),
        desc: t("specializations.items.education.description"),
        resources: t("specializations.items.education.resources")
      }
    ],
    [t]
  );

  const testimonials = useMemo(
    () => [
      {
        id: "lucia",
        text: t("testimonials.items.lucia.text"),
        name: t("testimonials.items.lucia.name"),
        role: t("testimonials.items.lucia.role")
      },
      {
        id: "carlos",
        text: t("testimonials.items.carlos.text"),
        name: t("testimonials.items.carlos.name"),
        role: t("testimonials.items.carlos.role")
      },
      {
        id: "marta",
        text: t("testimonials.items.marta.text"),
        name: t("testimonials.items.marta.name"),
        role: t("testimonials.items.marta.role")
      }
    ],
    [t]
  );

  return (
    <div className="min-h-screen bg-background">
      <section className="relative h-[90vh] min-h-[600px]">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt={t("heroImageAlt")}
            className="w-full h-full object-cover"
          />
          <div className="hero-gradient absolute inset-0" />
        </div>
        <Navbar />
        <div className="relative z-10 h-full flex items-center px-8 max-w-7xl mx-auto">
          <div className="max-w-xl">
            <p className="text-xs font-semibold tracking-[0.3em] uppercase text-primary mb-6">
              {t("hero.badge")}
            </p>
            <h1 className="text-5xl md:text-7xl font-serif italic leading-[1.1] text-primary-foreground mb-6">
              {t("hero.titleMain")}{" "}
              <span className="not-italic">{t("hero.titleAccent")}</span>
            </h1>
            <p className="text-sm text-primary-foreground/60 leading-relaxed mb-10 max-w-md">
              {t("hero.description")}
            </p>
            <div className="flex gap-4">
              <CustomButton asChild styleType="primary" className="px-8 py-3.5">
                <Link to="/registro">{t("hero.ctaStart")}</Link>
              </CustomButton>
              <CustomButton
                asChild
                styleType="unstyled"
                className="border border-primary-foreground/30 text-primary-foreground px-8 py-3.5 hover:bg-primary-foreground/10"
              >
                <Link to="/planes">{t("hero.ctaPlans")}</Link>
              </CustomButton>
            </div>
          </div>
        </div>
        <div className="absolute bottom-12 right-12 z-10 bg-charcoal/80 backdrop-blur-sm p-6 max-w-xs hidden lg:block">
          <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-2">
            {t("hero.successTitle")}
          </p>
          <p className="text-sm text-primary-foreground/60 leading-relaxed">{`"${t("hero.successDescription")}"`}</p>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="max-w-7xl mx-auto px-8 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl md:text-4xl font-serif font-bold text-foreground">
                {stat.value}
              </p>
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mt-1">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-8 py-20">
        <div className="flex justify-between items-end mb-12">
          <div>
            <h2 className="text-3xl md:text-4xl font-serif text-foreground">
              {t("specializations.title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-lg">
              {t("specializations.description")}
            </p>
          </div>
          <Link
            to="/"
            className="hidden md:flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("specializations.viewAll")}
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {sectors.map((sector) => (
            <div
              key={sector.id}
              className="border border-border p-8 hover:border-foreground/30 transition-colors group cursor-pointer"
            >
              <p className="text-xs text-muted-foreground tracking-widest uppercase mb-6">
                {t("specializations.sector", { num: sector.num })}
              </p>
              <h3 className="text-2xl font-serif text-foreground mb-3">
                {sector.name}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-8">
                {sector.desc}
              </p>
              <p className="text-xs text-muted-foreground tracking-widest uppercase">
                {sector.resources}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-secondary">
        <div className="max-w-7xl mx-auto px-8 py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.3em] uppercase text-muted-foreground mb-4">
                {t("methodology.badge")}
              </p>
              <h2 className="text-3xl md:text-5xl font-serif italic text-foreground mb-6">
                {t("methodology.titleLine1")}
                <br />
                {t("methodology.titleLine2")}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-10 max-w-md">
                {t("methodology.description")}
              </p>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
                    <span className="text-foreground text-lg">📋</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-1">
                      {t("methodology.rigorTitle")}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t("methodology.rigorDescription")}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
                    <span className="text-foreground text-lg">📊</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-1">
                      {t("methodology.analyticsTitle")}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t("methodology.analyticsDescription")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <img
                src={methodologyImage}
                alt={t("methodology.imageAlt")}
                className="w-full aspect-square object-cover"
              />
              <div className="absolute bottom-6 left-6 right-6 bg-background p-5 shadow-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-primary-foreground text-xs">✓</span>
                  </div>
                </div>
                <p className="text-sm font-serif italic text-foreground">
                  {t("methodology.quote")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("methodology.quoteAuthor")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-8 py-20">
        <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-12">
          {t("testimonials.title")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial) => (
            <div key={testimonial.id} className="border-t border-border pt-8">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="text-primary text-sm">
                    ★
                  </span>
                ))}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-8">
                "{testimonial.text}"
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                  <span className="text-xs font-bold text-foreground">
                    {testimonial.name[0]}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {testimonial.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {testimonial.role}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-charcoal py-24">
        <div className="max-w-7xl mx-auto px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-serif italic text-primary-foreground mb-4">
            {t("cta.title")}
          </h2>
          <p className="text-sm text-primary-foreground/50 mb-10 max-w-md mx-auto">
            {t("cta.description")}
          </p>
          <div className="flex justify-center gap-4">
            <CustomButton asChild styleType="primary" className="px-8 py-3.5">
              <Link to="/registro">{t("cta.register")}</Link>
            </CustomButton>
            <CustomButton
              asChild
              styleType="unstyled"
              className="border border-primary-foreground/30 text-primary-foreground px-8 py-3.5 hover:bg-primary-foreground/10"
            >
              <Link to="/planes">{t("cta.pricing")}</Link>
            </CustomButton>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;

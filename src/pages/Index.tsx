import heroImage from "@/assets/hero-image.jpg";
import methodologyImage from "@/assets/methodology-image.jpg";
import CookieConsentManager from "@/components/CookieConsentManager";
import CustomButton from "@/components/ui/custom-button";
import { ArrowRight, BarChart3, BookOpen, Scale, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";

const Index = () => {
  const { t } = useTranslation("landing");
  const [openCookiePreferencesRequest, setOpenCookiePreferencesRequest] =
    useState(0);

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
        resources: t("specializations.items.justice.resources"),
        icon: Scale
      },
      {
        id: "treasury",
        num: "02",
        name: t("specializations.items.treasury.name"),
        desc: t("specializations.items.treasury.description"),
        resources: t("specializations.items.treasury.resources"),
        icon: BarChart3
      },
      {
        id: "health",
        num: "03",
        name: t("specializations.items.health.name"),
        desc: t("specializations.items.health.description"),
        resources: t("specializations.items.health.resources"),
        icon: Sparkles
      },
      {
        id: "education",
        num: "04",
        name: t("specializations.items.education.name"),
        desc: t("specializations.items.education.description"),
        resources: t("specializations.items.education.resources"),
        icon: BookOpen
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
      {/* ── HERO ── */}
      <section className="relative min-h-screen overflow-hidden">
        {/* Background image with overlay */}
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt={t("heroImageAlt")}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-charcoal/95 via-charcoal/80 to-charcoal/40" />
          {/* Decorative gradient orb */}
          <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
        </div>

        <Navbar />

        <div className="relative z-10 flex flex-col justify-center min-h-screen px-6 md:px-12 lg:px-20 max-w-[1400px] mx-auto">
          <div className="pt-28 pb-20 md:pt-36 md:pb-28">
            {/* Badge */}
            <div className="landing-fade-up mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm text-xs font-semibold tracking-[0.25em] uppercase text-white/70">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {t("hero.badge")}
              </span>
            </div>

            {/* Title */}
            <h1 className="landing-fade-up-delay-1 text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-display leading-[0.95] tracking-tight text-white max-w-5xl">
              {t("hero.titleMain")}
              <br />
              <span className="italic text-primary">
                {t("hero.titleAccent")}
              </span>
            </h1>

            {/* Description */}
            <p className="landing-fade-up-delay-2 mt-8 text-base md:text-lg text-white/50 leading-relaxed max-w-lg">
              {t("hero.description")}
            </p>

            {/* CTAs */}
            <div className="landing-fade-up-delay-3 flex flex-wrap gap-4 mt-10">
              <CustomButton
                asChild
                styleType="primary"
                radius="full"
                className="h-12 px-8 text-sm shadow-[0_20px_50px_-15px_hsl(var(--primary)/0.5)]"
              >
                <Link to="/registro">
                  {t("hero.ctaStart")}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </CustomButton>
              <CustomButton
                asChild
                styleType="unstyled"
                radius="full"
                className="h-12 px-8 text-sm border border-white/20 text-white hover:bg-white/10 hover:border-white/30"
              >
                <Link to="/planes">{t("hero.ctaPlans")}</Link>
              </CustomButton>
            </div>

            {/* Inline stats */}
            <div className="landing-fade-up-delay-4 mt-16 flex flex-wrap gap-x-10 gap-y-4">
              {stats.slice(0, 3).map((stat) => (
                <div key={stat.label} className="flex items-baseline gap-2">
                  <span className="text-2xl md:text-3xl font-display text-white">
                    {stat.value}
                  </span>
                  <span className="text-xs tracking-widest uppercase text-white/40">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ── STATS MARQUEE ── */}
      <section className="border-y border-border bg-background overflow-hidden py-5">
        <div className="flex landing-stats-marquee">
          {[...stats, ...stats, ...stats, ...stats].map((stat, i) => (
            <div
              key={`${stat.label}-${i}`}
              className="flex items-center gap-3 px-10 shrink-0"
            >
              <span className="text-2xl font-display text-foreground">
                {stat.value}
              </span>
              <span className="text-xs tracking-widest uppercase text-muted-foreground whitespace-nowrap">
                {stat.label}
              </span>
              <span className="text-muted-foreground/30 ml-7">•</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── SPECIALIZATIONS ── */}
      <section className="landing-gradient-bg py-24 md:py-32">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16">
            <div>
              <p className="text-xs font-semibold tracking-[0.3em] uppercase text-primary mb-3">
                {t("specializations.sector", { num: "—" })
                  .replace("—", "")
                  .trim()}
              </p>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display text-foreground leading-[1.05]">
                {t("specializations.title")}
              </h2>
              <p className="text-base text-muted-foreground mt-4 max-w-xl leading-relaxed">
                {t("specializations.description")}
              </p>
            </div>
            <Link
              to="/"
              className="hidden md:flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-muted-foreground hover:text-primary transition-colors group shrink-0"
            >
              {t("specializations.viewAll")}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {sectors.map((sector) => {
              const Icon = sector.icon;
              return (
                <div
                  key={sector.id}
                  className="group relative bg-card border border-border rounded-2xl p-8 hover:border-primary/40 hover:shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.15)] transition-all duration-500 cursor-pointer overflow-hidden"
                >
                  {/* Hover glow */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />

                  <div className="relative">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/15 transition-colors">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground tracking-widest uppercase mb-3">
                      {t("specializations.sector", { num: sector.num })}
                    </p>
                    <h3 className="text-2xl font-display text-foreground mb-3">
                      {sector.name}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                      {sector.desc}
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold tracking-wider uppercase text-primary">
                        {sector.resources}
                      </p>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── METHODOLOGY ── */}
      <section className="bg-charcoal text-white overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20 py-24 md:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.3em] uppercase text-primary mb-6">
                {t("methodology.badge")}
              </p>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display italic text-white leading-[1.05] mb-8">
                {t("methodology.titleLine1")}
                <br />
                {t("methodology.titleLine2")}
              </h2>
              <p className="text-base text-white/50 leading-relaxed mb-12 max-w-md">
                {t("methodology.description")}
              </p>

              <div className="space-y-8">
                <div className="flex items-start gap-5">
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <Scale className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1.5">
                      {t("methodology.rigorTitle")}
                    </h4>
                    <p className="text-sm text-white/45 leading-relaxed">
                      {t("methodology.rigorDescription")}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-5">
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1.5">
                      {t("methodology.analyticsTitle")}
                    </h4>
                    <p className="text-sm text-white/45 leading-relaxed">
                      {t("methodology.analyticsDescription")}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden">
                <img
                  src={methodologyImage}
                  alt={t("methodology.imageAlt")}
                  className="w-full aspect-[4/5] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-transparent to-transparent" />
              </div>
              {/* Floating quote card */}
              <div className="absolute -bottom-6 -left-6 right-12 bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                  <span className="text-xs font-semibold tracking-wider uppercase text-white/60">
                    {t("hero.successTitle")}
                  </span>
                </div>
                <p className="text-sm font-display italic text-white leading-relaxed">
                  {t("methodology.quote")}
                </p>
                <p className="text-xs text-white/40 mt-2">
                  {t("methodology.quoteAuthor")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-24 md:py-32 bg-background">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
          <div className="mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-display text-foreground leading-[1.05]">
              {t("testimonials.title")}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, i) => (
              <div
                key={testimonial.id}
                className={`relative rounded-2xl p-8 md:p-10 border transition-all duration-300 hover:-translate-y-1 ${
                  i === 1
                    ? "bg-charcoal text-white border-charcoal"
                    : "bg-card border-border hover:border-primary/30"
                }`}
              >
                {/* Stars */}
                <div className="flex gap-0.5 mb-6">
                  {[...Array(5)].map((_, j) => (
                    <span
                      key={j}
                      className={`text-sm ${i === 1 ? "text-primary" : "text-primary"}`}
                    >
                      ★
                    </span>
                  ))}
                </div>

                <p
                  className={`text-base leading-relaxed mb-8 ${
                    i === 1 ? "text-white/70" : "text-muted-foreground"
                  }`}
                >
                  &ldquo;{testimonial.text}&rdquo;
                </p>

                <div className="flex items-center gap-4">
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold ${
                      i === 1
                        ? "bg-primary text-white"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {testimonial.name[0]}
                  </div>
                  <div>
                    <p
                      className={`text-sm font-bold ${
                        i === 1 ? "text-white" : "text-foreground"
                      }`}
                    >
                      {testimonial.name}
                    </p>
                    <p
                      className={`text-xs ${
                        i === 1 ? "text-white/50" : "text-muted-foreground"
                      }`}
                    >
                      {testimonial.role}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-charcoal via-charcoal to-[hsl(var(--primary)/0.15)]" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[150px] pointer-events-none" />

        <div className="relative max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20 py-28 md:py-36 text-center">
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-display italic text-white mb-6 max-w-3xl mx-auto leading-[1.05]">
            {t("cta.title")}
          </h2>
          <p className="text-base text-white/40 mb-12 max-w-md mx-auto leading-relaxed">
            {t("cta.description")}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <CustomButton
              asChild
              styleType="primary"
              radius="full"
              className="h-13 px-10 text-sm shadow-[0_20px_50px_-15px_hsl(var(--primary)/0.5)]"
            >
              <Link to="/registro">
                {t("cta.register")}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </CustomButton>
            <CustomButton
              asChild
              styleType="unstyled"
              radius="full"
              className="h-13 px-10 text-sm border border-white/20 text-white hover:bg-white/10 hover:border-white/30"
            >
              <Link to="/planes">{t("cta.pricing")}</Link>
            </CustomButton>
          </div>
        </div>
      </section>

      <Footer
        onOpenCookiePreferences={() =>
          setOpenCookiePreferencesRequest((current) => current + 1)
        }
      />
      <CookieConsentManager
        cookiePolicyHref={null}
        openPreferencesRequest={openCookiePreferencesRequest}
      />
    </div>
  );
};

export default Index;

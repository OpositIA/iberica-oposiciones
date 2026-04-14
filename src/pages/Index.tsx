import heroImage from "@/assets/hero-image.jpg";
import methodologyImage from "@/assets/methodology-image.jpg";
import CookieConsentManager from "@/components/CookieConsentManager";
import CustomButton from "@/components/ui/custom-button";
import Reveal from "@/components/ui/reveal";
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
      <section className="relative min-h-[88vh] overflow-hidden">
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

        <div className="relative z-10 mx-auto flex min-h-[88vh] max-w-[1400px] flex-col justify-center px-6 md:px-12 lg:px-20">
          <div className="pb-16 pt-24 md:pb-20 md:pt-28">
            {/* Badge */}
            <Reveal
              className="mb-6"
              delay={40}
              duration={860}
              threshold={0}
              variant="soft"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {t("hero.badge")}
              </span>
            </Reveal>

            {/* Title */}
            <Reveal
              as="h1"
              className="max-w-4xl text-4xl font-display leading-[0.98] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl xl:text-[5.5rem]"
              delay={120}
              duration={940}
              threshold={0}
              variant="up"
            >
              {t("hero.titleMain")}
              <br />
              <span className="italic text-primary">
                {t("hero.titleAccent")}
              </span>
            </Reveal>

            {/* Description */}
            <Reveal
              as="p"
              className="mt-6 max-w-md text-sm leading-7 text-white/52 md:text-[15px]"
              delay={220}
              duration={820}
              threshold={0}
              variant="soft"
            >
              {t("hero.description")}
            </Reveal>

            {/* CTAs */}
            <Reveal
              className="mt-8 flex flex-wrap gap-3"
              delay={320}
              duration={820}
              threshold={0}
              variant="soft"
            >
              <CustomButton
                asChild
                styleType="primary"
                radius="full"
                className="h-11 px-6 text-sm shadow-[0_20px_50px_-15px_hsl(var(--primary)/0.5)]"
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
                className="h-11 border border-white/20 px-6 text-sm text-white hover:border-white/30 hover:bg-white/10"
              >
                <Link to="/planes">{t("hero.ctaPlans")}</Link>
              </CustomButton>
            </Reveal>

            {/* Inline stats */}
            <Reveal
              className="mt-12 flex flex-wrap gap-x-8 gap-y-3"
              delay={400}
              duration={860}
              threshold={0}
              variant="soft"
            >
              {stats.slice(0, 3).map((stat) => (
                <div key={stat.label} className="flex items-baseline gap-2">
                  <span className="text-xl font-display text-white md:text-2xl">
                    {stat.value}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                    {stat.label}
                  </span>
                </div>
              ))}
            </Reveal>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ── STATS MARQUEE ── */}
      <Reveal
        as="section"
        className="overflow-hidden border-y border-border bg-background py-4"
        delay={60}
        duration={720}
        rootMargin="0px 0px -8% 0px"
        variant="soft"
      >
        <div className="flex landing-stats-marquee">
          {[...stats, ...stats, ...stats, ...stats].map((stat, i) => (
            <div
              key={`${stat.label}-${i}`}
              className="flex shrink-0 items-center gap-3 px-8"
            >
              <span className="text-xl font-display text-foreground">
                {stat.value}
              </span>
              <span className="whitespace-nowrap text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {stat.label}
              </span>
              <span className="text-muted-foreground/30 ml-7">•</span>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── SPECIALIZATIONS ── */}
      <section className="landing-gradient-bg py-20 md:py-24">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
          <Reveal
            className="mb-12 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"
            duration={780}
            variant="soft"
          >
            <div>
              <p className="text-xs font-semibold tracking-[0.3em] uppercase text-primary mb-3">
                {t("specializations.sector", { num: "—" })
                  .replace("—", "")
                  .trim()}
              </p>
              <h2 className="text-3xl font-display leading-[1.08] text-foreground md:text-4xl lg:text-5xl">
                {t("specializations.title")}
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-7 text-muted-foreground md:text-[15px]">
                {t("specializations.description")}
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sectors.map((sector, index) => {
              const Icon = sector.icon;
              return (
                <Reveal
                  key={sector.id}
                  delay={index * 90}
                  duration={760}
                  variant="soft"
                  className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-500 hover:border-primary/40 hover:shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.15)]"
                >
                  {/* Hover glow */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />

                  <div className="relative">
                    <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t("specializations.sector", { num: sector.num })}
                    </p>
                    <h3 className="mb-2 text-xl font-display text-foreground">
                      {sector.name}
                    </h3>
                    <p className="mb-5 text-sm leading-6 text-muted-foreground">
                      {sector.desc}
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold tracking-wider uppercase text-primary">
                        {sector.resources}
                      </p>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── METHODOLOGY ── */}
      <section className="overflow-hidden bg-charcoal text-white">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20 py-20 md:py-24">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-18">
            <Reveal variant="left" duration={820}>
              <p className="text-xs font-semibold tracking-[0.3em] uppercase text-primary mb-6">
                {t("methodology.badge")}
              </p>
              <h2 className="mb-6 text-3xl font-display italic leading-[1.08] text-white md:text-4xl lg:text-5xl">
                {t("methodology.titleLine1")}
                <br />
                {t("methodology.titleLine2")}
              </h2>
              <p className="mb-10 max-w-md text-sm leading-7 text-white/50 md:text-[15px]">
                {t("methodology.description")}
              </p>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
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
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
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
            </Reveal>

            <Reveal
              className="relative"
              delay={120}
              duration={860}
              variant="right"
            >
              <div className="relative rounded-2xl overflow-hidden">
                <img
                  src={methodologyImage}
                  alt={t("methodology.imageAlt")}
                  className="w-full aspect-[4/5] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-transparent to-transparent" />
              </div>
              {/* Floating quote card */}
              <div className="absolute -bottom-5 -left-5 right-10 rounded-xl border border-white/10 bg-white/10 p-5 backdrop-blur-xl">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                  <span className="text-xs font-semibold tracking-wider uppercase text-white/60">
                    {t("hero.successTitle")}
                  </span>
                </div>
                <p className="text-sm font-display italic leading-relaxed text-white">
                  {t("methodology.quote")}
                </p>
                <p className="text-xs text-white/40 mt-2">
                  {t("methodology.quoteAuthor")}
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="bg-background py-20 md:py-24">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
          <Reveal as="div" className="mb-12" duration={760} variant="soft">
            <h2 className="text-3xl font-display leading-[1.08] text-foreground md:text-4xl lg:text-5xl">
              {t("testimonials.title")}
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {testimonials.map((testimonial, i) => (
              <Reveal
                key={testimonial.id}
                delay={i * 110}
                duration={760}
                variant="soft"
                className={`relative rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 md:p-7 ${
                  i === 1
                    ? "bg-charcoal text-white border-charcoal"
                    : "bg-card border-border hover:border-primary/30"
                }`}
              >
                {/* Stars */}
                <div className="mb-5 flex gap-0.5">
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
                  className={`mb-6 text-sm leading-7 ${
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
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-charcoal via-charcoal to-[hsl(var(--primary)/0.15)]" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[150px] pointer-events-none" />

        <Reveal
          className="relative mx-auto max-w-[1400px] px-6 py-20 text-center md:px-12 md:py-24 lg:px-20"
          duration={860}
          variant="soft"
        >
          <h2 className="mx-auto mb-5 max-w-3xl text-3xl font-display italic leading-[1.08] text-white md:text-4xl lg:text-5xl">
            {t("cta.title")}
          </h2>
          <p className="mx-auto mb-10 max-w-md text-sm leading-7 text-white/40 md:text-[15px]">
            {t("cta.description")}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <CustomButton
              asChild
              styleType="primary"
              radius="full"
              className="h-11 px-7 text-sm shadow-[0_20px_50px_-15px_hsl(var(--primary)/0.5)]"
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
              className="h-11 border border-white/20 px-7 text-sm text-white hover:border-white/30 hover:bg-white/10"
            >
              <Link to="/planes">{t("cta.pricing")}</Link>
            </CustomButton>
          </div>
        </Reveal>
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

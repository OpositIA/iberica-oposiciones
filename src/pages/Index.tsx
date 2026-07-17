import CookieConsentManager from "@/components/CookieConsentManager";
import CustomButton from "@/components/ui/custom-button";
import { useLandingMotion } from "@/hooks/use-landing-motion";
import {
  ArrowDown,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  FileSearch,
  GraduationCap,
  HeartPulse,
  Landmark,
  Layers3,
  Scale,
  Target,
  TimerReset
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import "./index.css";

const heroImage = "/hero-image.webp";

const signalKeys = [
  "context",
  "tests",
  "simulations",
  "syllabus",
  "rhythm"
] as const;

const oppositionAreas = [
  { icon: Landmark, key: "treasury" },
  { icon: Scale, key: "justice" },
  { icon: Building2, key: "administration" },
  { icon: HeartPulse, key: "health" },
  { icon: GraduationCap, key: "education" }
] as const;

const experienceItems = [
  { icon: Bot, key: "ai" },
  { icon: Target, key: "tests" },
  { icon: TimerReset, key: "focus" }
] as const;

const Index = () => {
  const { i18n, t } = useTranslation("landing");
  const rootRef = useRef<HTMLDivElement>(null);
  const [openCookiePreferencesRequest, setOpenCookiePreferencesRequest] =
    useState(0);

  useLandingMotion(rootRef, i18n.resolvedLanguage ?? i18n.language ?? "es");

  return (
    <div ref={rootRef} className="landing-page min-h-screen bg-background">
      <Navbar variant="landing" />

      <main>
        <section data-hero className="landing-hero">
          <div data-hero-media className="landing-hero__media">
            <img
              src={heroImage}
              alt={t("heroImageAlt")}
              width={2752}
              height={1536}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <div className="landing-hero__veil" />
          <svg
            className="landing-contours landing-contours--hero"
            viewBox="0 0 720 720"
            aria-hidden="true"
          >
            <path d="M108 663C87 559 147 506 129 409c-16-88-93-133-42-239C133 74 251 42 352 66c94 23 124 91 208 112 61 16 94 2 117 31 34 43-20 88-15 157 6 81 88 120 60 196-28 77-137 115-235 96-97-18-130-82-213-74-67 7-116 66-166 79Z" />
            <path d="M160 615c-17-82 31-123 17-200-13-70-75-107-34-192 37-76 131-101 211-82 76 18 99 72 166 89 49 12 75 1 94 24 27 35-16 71-12 126 5 65 71 96 48 157-22 61-109 92-187 77-77-15-104-66-170-59-54 5-93 53-133 60Z" />
            <path d="M218 558c-12-57 22-86 12-140-9-49-52-75-24-134 26-53 92-71 148-57 53 12 70 50 117 62 34 9 52 1 65 17 19 24-11 49-8 88 3 45 49 67 33 110-16 43-77 64-131 54-54-11-73-47-119-42-38 4-65 37-93 42Z" />
          </svg>

          <div data-hero-copy className="landing-shell landing-hero__content">
            <div className="landing-hero__copy">
              <p
                data-hero-intro
                className="landing-eyebrow landing-eyebrow--hero"
              >
                <span aria-hidden="true" className="landing-pulse-dot" />
                {t("hero.eyebrow")}
              </p>

              <h1 className="landing-hero__title">
                <span data-hero-intro>{t("hero.titleLead")}</span>
                <span data-hero-intro>{t("hero.titleMiddle")}</span>
                <span data-hero-intro className="landing-editorial">
                  {t("hero.titleAccent")}
                </span>
              </h1>

              <p data-hero-intro className="landing-hero__description">
                {t("hero.description")}
              </p>

              <div data-hero-intro className="landing-actions">
                <CustomButton
                  asChild
                  styleType="primary"
                  radius="full"
                  className="landing-button landing-button--primary"
                >
                  <Link to="/registro">
                    {t("hero.ctaStart")}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </CustomButton>
                <CustomButton
                  asChild
                  styleType="unstyled"
                  radius="full"
                  className="landing-button landing-button--ghost"
                >
                  <a href="#metodo">
                    {t("hero.ctaExplore")}
                    <ArrowDown aria-hidden="true" />
                  </a>
                </CustomButton>
              </div>
            </div>

            <aside data-hero-intro className="landing-hero__sync">
              <span className="landing-hero__sync-label">
                {t("hero.syncLabel")}
              </span>
              <strong>{t("hero.syncValue")}</strong>
              <span className="landing-hero__sync-line" aria-hidden="true" />
            </aside>

            <a
              data-hero-intro
              href="#manifiesto"
              className="landing-hero__scroll"
            >
              <span>{t("hero.scrollLabel")}</span>
              <ArrowDown aria-hidden="true" />
            </a>
          </div>
        </section>

        <section className="landing-signal" aria-label={t("signal.ariaLabel")}>
          <div className="landing-shell landing-signal__inner">
            {signalKeys.map((key) => (
              <span key={key} data-reveal>
                {t(`signal.items.${key}`)}
              </span>
            ))}
          </div>
        </section>

        <section id="manifiesto" className="landing-manifesto">
          <div className="landing-shell landing-manifesto__grid">
            <p data-reveal className="landing-eyebrow">
              {t("manifesto.eyebrow")}
            </p>
            <div>
              <h2 data-reveal className="landing-manifesto__title">
                {t("manifesto.titleLead")}{" "}
                <span className="landing-editorial">
                  {t("manifesto.titleAccent")}
                </span>
              </h2>
              <div className="landing-manifesto__details">
                <p data-reveal>{t("manifesto.description")}</p>
                <p data-reveal className="landing-manifesto__note">
                  <CheckCircle2 aria-hidden="true" />
                  {t("manifesto.note")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="metodo" data-story className="landing-story">
          <div className="landing-story__sticky">
            <div className="landing-shell landing-story__layout">
              <div className="landing-story__heading">
                <p className="landing-eyebrow landing-eyebrow--light">
                  {t("story.eyebrow")}
                </p>
                <h2>{t("story.title")}</h2>
                <p>{t("story.description")}</p>
              </div>

              <div className="landing-story__rail" aria-hidden="true">
                <span>{t("story.progressLabel")}</span>
                <div>
                  <i data-story-progress />
                </div>
              </div>

              <div className="landing-story__frames">
                <article data-story-frame className="landing-story-frame">
                  <div className="landing-story-frame__copy">
                    <span>{t("story.stages.review.number")}</span>
                    <p>{t("story.stages.review.kicker")}</p>
                    <h3>{t("story.stages.review.title")}</h3>
                    <p>{t("story.stages.review.description")}</p>
                  </div>
                  <div className="landing-story-visual landing-story-visual--document">
                    <div className="landing-document__meta">
                      <FileSearch aria-hidden="true" />
                      <div>
                        <span>{t("story.visuals.review.source")}</span>
                        <strong>
                          {t("story.visuals.review.documentTitle")}
                        </strong>
                      </div>
                      <time>{t("story.visuals.review.date")}</time>
                    </div>
                    <div className="landing-document__body" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <p className="landing-document__status">
                      <CheckCircle2 aria-hidden="true" />
                      {t("story.visuals.review.status")}
                    </p>
                  </div>
                </article>

                <article data-story-frame className="landing-story-frame">
                  <div className="landing-story-frame__copy">
                    <span>{t("story.stages.context.number")}</span>
                    <p>{t("story.stages.context.kicker")}</p>
                    <h3>{t("story.stages.context.title")}</h3>
                    <p>{t("story.stages.context.description")}</p>
                  </div>
                  <div className="landing-story-visual landing-story-visual--context">
                    <div className="landing-context__question">
                      <Bot aria-hidden="true" />
                      <p>{t("story.visuals.context.question")}</p>
                    </div>
                    <div className="landing-context__answer">
                      <span
                        className="landing-context__beam"
                        aria-hidden="true"
                      />
                      <p>{t("story.visuals.context.answer")}</p>
                      <small>
                        <FileSearch aria-hidden="true" />
                        {t("story.visuals.context.source")}
                      </small>
                    </div>
                  </div>
                </article>

                <article data-story-frame className="landing-story-frame">
                  <div className="landing-story-frame__copy">
                    <span>{t("story.stages.practice.number")}</span>
                    <p>{t("story.stages.practice.kicker")}</p>
                    <h3>{t("story.stages.practice.title")}</h3>
                    <p>{t("story.stages.practice.description")}</p>
                  </div>
                  <div className="landing-story-visual landing-story-visual--practice">
                    <div className="landing-practice__topline">
                      <span>{t("story.visuals.practice.mode")}</span>
                      <Target aria-hidden="true" />
                    </div>
                    <p className="landing-practice__question">
                      {t("story.visuals.practice.question")}
                    </p>
                    <div className="landing-practice__options">
                      <span>{t("story.visuals.practice.optionA")}</span>
                      <span className="is-correct">
                        {t("story.visuals.practice.optionB")}
                        <CheckCircle2 aria-hidden="true" />
                      </span>
                      <span>{t("story.visuals.practice.optionC")}</span>
                    </div>
                    <p className="landing-practice__explanation">
                      {t("story.visuals.practice.explanation")}
                    </p>
                  </div>
                </article>

                <article data-story-frame className="landing-story-frame">
                  <div className="landing-story-frame__copy">
                    <span>{t("story.stages.progress.number")}</span>
                    <p>{t("story.stages.progress.kicker")}</p>
                    <h3>{t("story.stages.progress.title")}</h3>
                    <p>{t("story.stages.progress.description")}</p>
                  </div>
                  <div className="landing-story-visual landing-story-visual--progress">
                    <p>{t("story.visuals.progress.eyebrow")}</p>
                    <h4>{t("story.visuals.progress.title")}</h4>
                    <div className="landing-progress__ring" aria-hidden="true">
                      <span />
                    </div>
                    <dl>
                      <div>
                        <dt>{t("story.visuals.progress.focusLabel")}</dt>
                        <dd>{t("story.visuals.progress.focusValue")}</dd>
                      </div>
                      <div>
                        <dt>{t("story.visuals.progress.testsLabel")}</dt>
                        <dd>{t("story.visuals.progress.testsValue")}</dd>
                      </div>
                      <div>
                        <dt>{t("story.visuals.progress.paceLabel")}</dt>
                        <dd>{t("story.visuals.progress.paceValue")}</dd>
                      </div>
                    </dl>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section id="oposiciones" className="landing-oppositions">
          <div className="landing-shell">
            <div className="landing-section-heading">
              <p data-reveal className="landing-eyebrow">
                {t("oppositions.eyebrow")}
              </p>
              <div>
                <h2 data-reveal>
                  {t("oppositions.titleLead")}{" "}
                  <span className="landing-editorial">
                    {t("oppositions.titleAccent")}
                  </span>
                </h2>
                <p data-reveal>{t("oppositions.description")}</p>
              </div>
            </div>

            <ol className="landing-oppositions__list">
              {oppositionAreas.map(({ icon: Icon, key }) => (
                <li key={key} data-reveal>
                  <span className="landing-oppositions__icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{t(`oppositions.items.${key}.name`)}</h3>
                    <p>{t(`oppositions.items.${key}.description`)}</p>
                  </div>
                  <span
                    className="landing-oppositions__line"
                    aria-hidden="true"
                  />
                </li>
              ))}
            </ol>

            <div data-reveal className="landing-oppositions__footer">
              <p>{t("oppositions.catalogNote")}</p>
              <CustomButton
                asChild
                styleType="unstyled"
                radius="full"
                className="landing-text-link"
              >
                <Link to="/registro">
                  {t("oppositions.cta")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </CustomButton>
            </div>
          </div>
        </section>

        <section id="experiencia" className="landing-experience">
          <div className="landing-shell landing-experience__layout">
            <div className="landing-experience__copy">
              <p data-reveal className="landing-eyebrow landing-eyebrow--light">
                {t("experience.eyebrow")}
              </p>
              <h2 data-reveal>
                {t("experience.titleLead")}{" "}
                <span className="landing-editorial">
                  {t("experience.titleAccent")}
                </span>
              </h2>
              <p data-reveal>{t("experience.description")}</p>

              <div className="landing-experience__items">
                {experienceItems.map(({ icon: Icon, key }) => (
                  <article key={key} data-reveal>
                    <Icon aria-hidden="true" />
                    <div>
                      <span>{t(`experience.items.${key}.label`)}</span>
                      <h3>{t(`experience.items.${key}.title`)}</h3>
                      <p>{t(`experience.items.${key}.description`)}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div
              data-reveal
              data-parallax="5"
              className="landing-product-scene"
            >
              <div className="landing-product-scene__orb" aria-hidden="true" />
              <div className="landing-product-window">
                <div className="landing-product-window__topbar">
                  <span />
                  <span />
                  <span />
                  <p>{t("experience.visual.contextBadge")}</p>
                </div>
                <div className="landing-product-window__content">
                  <div className="landing-product-window__mark">
                    <Layers3 aria-hidden="true" />
                  </div>
                  <p className="landing-product-window__question">
                    {t("experience.visual.question")}
                  </p>
                  <div className="landing-product-window__response">
                    <span aria-hidden="true" />
                    <p>{t("experience.visual.response")}</p>
                  </div>
                  <small>
                    <FileSearch aria-hidden="true" />
                    {t("experience.visual.source")}
                  </small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-daily">
          <svg
            className="landing-contours landing-contours--daily"
            viewBox="0 0 720 720"
            aria-hidden="true"
          >
            <path d="M61 454c40-119 151-125 202-216 43-76 10-161 116-205 97-40 201 24 247 116 42 85 11 148 56 224 33 56 71 69 69 107-4 54-73 56-115 113-49 66-19 151-93 183-76 33-174-28-221-116-46-88-16-152-76-211-48-47-124-49-185 5Z" />
            <path d="M124 450c31-93 118-97 158-168 33-60 8-126 90-160 76-31 157 19 193 91 33 66 9 115 44 174 26 44 55 54 53 84-3 42-57 44-89 88-39 51-15 117-73 142-59 26-135-22-172-91-36-69-12-118-59-165-38-36-97-38-145 5Z" />
          </svg>
          <div className="landing-shell landing-daily__content">
            <p data-reveal className="landing-eyebrow landing-eyebrow--ink">
              {t("daily.eyebrow")}
            </p>
            <h2 data-reveal>
              {t("daily.titleLead")}{" "}
              <span className="landing-editorial">
                {t("daily.titleAccent")}
              </span>
            </h2>
            <p data-reveal className="landing-daily__description">
              {t("daily.description")}
            </p>
            <p data-reveal className="landing-daily__note">
              <FileSearch aria-hidden="true" />
              {t("daily.note")}
            </p>
          </div>
          <div
            data-scroll-word
            className="landing-daily__flow"
            aria-hidden="true"
          >
            <span>{t("daily.flow.boe")}</span>
            <i>→</i>
            <span>{t("daily.flow.context")}</span>
            <i>→</i>
            <span>{t("daily.flow.ai")}</span>
            <i>→</i>
            <span>{t("daily.flow.practice")}</span>
            <i>→</i>
            <span>{t("daily.flow.study")}</span>
          </div>
        </section>

        <section className="landing-final">
          <div
            data-parallax="4"
            className="landing-final__halo"
            aria-hidden="true"
          />
          <div className="landing-shell landing-final__content">
            <p data-reveal className="landing-eyebrow landing-eyebrow--light">
              {t("final.eyebrow")}
            </p>
            <h2 data-reveal>
              {t("final.titleLead")}
              <span className="landing-editorial">
                {t("final.titleAccent")}
              </span>
            </h2>
            <p data-reveal>{t("final.description")}</p>
            <div
              data-reveal
              className="landing-actions landing-actions--center"
            >
              <CustomButton
                asChild
                styleType="primary"
                radius="full"
                className="landing-button landing-button--primary"
              >
                <Link to="/registro">
                  {t("final.ctaPrimary")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </CustomButton>
              <CustomButton
                asChild
                styleType="unstyled"
                radius="full"
                className="landing-button landing-button--ghost"
              >
                <Link to="/planes">{t("final.ctaSecondary")}</Link>
              </CustomButton>
            </div>
            <p data-reveal className="landing-final__note">
              <CheckCircle2 aria-hidden="true" />
              {t("final.note")}
            </p>
          </div>
        </section>
      </main>

      <Footer
        showNewsletter={false}
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

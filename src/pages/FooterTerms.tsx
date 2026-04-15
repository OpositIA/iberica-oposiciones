import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Reveal from "@/components/ui/reveal";
import { useTranslation } from "react-i18next";

type LegalSection = {
  body: string;
  id: string;
  title: string;
};

const FooterTerms = () => {
  const { t } = useTranslation("footerPages");
  const sections = t("terms.sections", {
    returnObjects: true
  }) as LegalSection[];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-charcoal">
        <Navbar />
        <div className="h-24 md:h-28" />
      </div>

      <main className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.14),transparent_58%)]" />

        <div className="relative mx-auto max-w-5xl px-6 pb-20 pt-10 md:px-8 md:pb-24 md:pt-14">
          <Reveal
            as="header"
            className="max-w-3xl"
            duration={760}
            threshold={0}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              {t("common.legalEyebrow")}
            </p>
            <h1 className="mt-4 text-3xl font-serif tracking-tight md:text-5xl">
              {t("terms.title")}
            </h1>
            <p className="mt-5 text-sm leading-7 text-muted-foreground md:text-base">
              {t("terms.intro")}
            </p>
            <p className="mt-6 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t("common.lastUpdated")} {t("common.updatedAt")}
            </p>
          </Reveal>

          <section className="mt-14 space-y-12">
            {sections.map((section, index) => (
              <Reveal
                as="article"
                key={section.id}
                delay={index * 70}
                duration={760}
                variant="gentle"
                className="border-t border-border/70 pt-6 first:border-t-0 first:pt-0"
              >
                <div className="grid gap-4 md:grid-cols-[96px_minmax(0,1fr)] md:gap-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
                      {section.title}
                    </h2>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
                      {section.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FooterTerms;

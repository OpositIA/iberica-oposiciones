import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { useTranslation } from "react-i18next";

type PrivacySection = {
  body: string;
  id: string;
  title: string;
};

const FooterPrivacy = () => {
  const { t } = useTranslation("footerPages");
  const sections = t("privacy.sections", {
    returnObjects: true
  }) as PrivacySection[];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-charcoal">
        <Navbar />
        <div className="h-24 md:h-28" />
      </div>

      <main className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_right,hsl(var(--accent)/0.12),transparent_60%)]" />

        <div className="relative mx-auto max-w-5xl px-6 pb-20 pt-10 md:px-8 md:pb-24 md:pt-14">
          <header className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              {t("common.privacyEyebrow")}
            </p>
            <h1 className="mt-4 text-3xl font-serif tracking-tight md:text-5xl">
              {t("privacy.title")}
            </h1>
            <p className="mt-5 text-sm leading-7 text-muted-foreground md:text-base">
              {t("privacy.intro")}
            </p>
            <p className="mt-6 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t("common.lastUpdated")} {t("common.updatedAt")}
            </p>
          </header>

          <section className="mt-14 grid gap-12">
            {sections.map((section) => (
              <article
                key={section.id}
                className="grid gap-4 border-t border-border/70 pt-6 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:gap-8"
              >
                <h2 className="text-lg font-semibold tracking-tight md:text-xl">
                  {section.title}
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
                  {section.body}
                </p>
              </article>
            ))}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FooterPrivacy;
